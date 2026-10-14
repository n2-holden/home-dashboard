#!/usr/bin/env python3
"""Driveway alarm / dashboard action runner.

Modes:
  trigger — stamp icon, log, evaluate conditions, run trigger actions +
            email/phone notify, start delayed-reset (dashboard audio is
            played by open browser dashboards, not this script)
  reset   — run reset actions and clear the icon stamp
  action  — legacy: run a single action object at --settings-key
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

WWW = Path("/config/www/home-dashboard")
SETTINGS_PATH = WWW / "dashboard-settings.json"
STATE_PATH = WWW / "driveway-alarm-state.json"
HA_API = os.environ.get("HA_URL", "http://127.0.0.1:8123").rstrip("/")
HA_CONFIG_PATH = Path("/config/www/home-dashboard/ha-config.json")
DRIVEWAY_LAST = "input_datetime.dashboard_driveway_alarm_last"
DELAYED_RESET_SCRIPT = "script.dashboard_driveway_alarm_delayed_reset"
DRIVEWAY_EVENTS_DIR = Path("/config/www/driveway-events")
DRIVEWAY_EVENTS_SCRIPT = Path(__file__).resolve().parent / "driveway_events.py"
DRIVEWAY_SNAPSHOT_WAIT_S = 8.0

POOL_LIGHT_FALLBACKS = [
    "light.pentair_f8_07_0a_pool_sam_1",
    "light.pentair_f8_07_0a_pool_sam_2",
    "light.pentair_f8_07_0a_pool_sam_3",
]
POOL_CIRCUIT_FALLBACK = "switch.pentair_f8_07_0a_pool"


def _load_json(path: Path) -> Any:
    try:
        # utf-8-sig tolerates a BOM (common when Windows tools rewrite the file).
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return None


def _ha_token() -> str | None:
    env_token = os.environ.get("HA_TOKEN", "").strip()
    if env_token:
        return env_token
    cfg = _load_json(HA_CONFIG_PATH)
    if isinstance(cfg, dict):
        token = cfg.get("token")
        if isinstance(token, str) and token.strip():
            return token.strip()
    return None


def _fetch(
    url: str,
    *,
    token: str,
    method: str = "GET",
    body: dict[str, Any] | None = None,
) -> Any:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    with urlopen(req, timeout=60) as resp:
        raw = resp.read()
        if not raw:
            return None
        return json.loads(raw.decode("utf-8"))


def _call_service(
    token: str,
    domain: str,
    service: str,
    entity_ids: list[str] | None = None,
    data: dict[str, Any] | None = None,
) -> None:
    payload: dict[str, Any] = dict(data or {})
    if entity_ids:
        payload["entity_id"] = entity_ids if len(entity_ids) > 1 else entity_ids[0]
    _fetch(
        f"{HA_API}/api/services/{domain}/{service}",
        token=token,
        method="POST",
        body=payload,
    )


def _states_by_id(token: str) -> dict[str, dict[str, Any]]:
    states = _fetch(f"{HA_API}/api/states", token=token) or []
    if not isinstance(states, list):
        return {}
    out: dict[str, dict[str, Any]] = {}
    for state in states:
        if isinstance(state, dict) and isinstance(state.get("entity_id"), str):
            out[state["entity_id"]] = state
    return out


def _discover_pond_fill(states: dict[str, dict[str, Any]]) -> str | None:
    matches: list[str] = []
    for entity_id, state in states.items():
        if not (entity_id.startswith("valve.") or entity_id.startswith("switch.")):
            continue
        name = str((state.get("attributes") or {}).get("friendly_name") or "")
        hay = f"{entity_id} {name}".lower()
        if "pond" in hay and "fill" in hay:
            matches.append(entity_id)
    for entity_id in matches:
        if entity_id.startswith("valve."):
            return entity_id
    return matches[0] if matches else None


def _discover_pool_lights(states: dict[str, dict[str, Any]]) -> list[str]:
    found = sorted(
        entity_id
        for entity_id in states
        if entity_id.startswith("light.")
        and "pentair" in entity_id
        and "pool_sam" in entity_id
    )
    return found or list(POOL_LIGHT_FALLBACKS)


def _discover_pool_circuit(states: dict[str, dict[str, Any]]) -> str:
    if POOL_CIRCUIT_FALLBACK in states:
        return POOL_CIRCUIT_FALLBACK
    matches = sorted(
        entity_id
        for entity_id in states
        if entity_id.startswith("switch.")
        and ("pentair" in entity_id or "screenlogic" in entity_id)
        and entity_id.endswith("_pool")
    )
    return matches[0] if matches else POOL_CIRCUIT_FALLBACK


def _discover_sonos(states: dict[str, dict[str, Any]]) -> list[str]:
    return sorted(
        entity_id
        for entity_id, state in states.items()
        if entity_id.startswith("media_player.")
        and (
            "sonos" in entity_id
            or "sonos"
            in str((state.get("attributes") or {}).get("friendly_name") or "").lower()
        )
    )


def _resolve_named(token: str, named: str) -> list[dict[str, Any]]:
    states = _states_by_id(token)
    if named == "pond_fill_open":
        entity_id = _discover_pond_fill(states)
        if not entity_id:
            return []
        if entity_id.startswith("valve."):
            return [{"domain": "valve", "service": "open_valve", "entityIds": [entity_id]}]
        return [{"domain": "switch", "service": "turn_on", "entityIds": [entity_id]}]
    if named == "pond_fill_close":
        entity_id = _discover_pond_fill(states)
        if not entity_id:
            return []
        if entity_id.startswith("valve."):
            return [{"domain": "valve", "service": "close_valve", "entityIds": [entity_id]}]
        return [{"domain": "switch", "service": "turn_off", "entityIds": [entity_id]}]
    if named == "pool_lights_on":
        return [
            {
                "domain": "light",
                "service": "turn_on",
                "entityIds": _discover_pool_lights(states),
            }
        ]
    if named == "pool_lights_off":
        return [
            {
                "domain": "light",
                "service": "turn_off",
                "entityIds": _discover_pool_lights(states),
            }
        ]
    if named == "pool_pump_on":
        return [
            {
                "domain": "switch",
                "service": "turn_on",
                "entityIds": [_discover_pool_circuit(states)],
            }
        ]
    if named == "sonos_stop_all":
        targets = _discover_sonos(states)
        if not targets:
            return []
        return [{"domain": "media_player", "service": "media_stop", "entityIds": targets}]
    return []


def _normalize_ops(raw_ops: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_ops, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw_ops:
        if not isinstance(item, dict):
            continue
        domain = str(item.get("domain") or "").strip()
        service = str(item.get("service") or "").strip()
        if not domain or not service:
            continue
        entity_ids = item.get("entityIds")
        if not isinstance(entity_ids, list):
            entity_id = item.get("entity_id")
            if isinstance(entity_id, str):
                entity_ids = [entity_id]
            elif isinstance(entity_id, list):
                entity_ids = entity_id
            else:
                entity_ids = []
        ids = [str(x) for x in entity_ids if isinstance(x, str) and x.strip()]
        data = item.get("data") if isinstance(item.get("data"), dict) else {}
        out.append({"domain": domain, "service": service, "entityIds": ids, "data": data})
    return out


def _entity_is_on(state: dict[str, Any] | None) -> bool | None:
    if not state:
        return None
    raw = str(state.get("state") or "").lower()
    if raw in {"unavailable", "unknown", ""}:
        return None
    if raw in {"on", "open", "opening", "home", "playing", "idle"}:
        return True
    if raw in {"off", "closed", "closing", "not_home", "standby"}:
        return False
    return None


def _eval_entity(condition: dict[str, Any], states: dict[str, dict[str, Any]]) -> bool:
    entity_ids = condition.get("entityIds")
    if not isinstance(entity_ids, list) or not entity_ids:
        return False
    expected = "on" if condition.get("expected") == "on" else "off"
    values = [_entity_is_on(states.get(str(eid))) for eid in entity_ids]
    if any(v is None for v in values):
        return False
    if expected == "on":
        return all(v is True for v in values)
    return all(v is False for v in values)


def _eval_select(condition: dict[str, Any], states: dict[str, dict[str, Any]]) -> bool:
    entity_id = str(condition.get("entityId") or "")
    expected = str(condition.get("expected") or "")
    state = states.get(entity_id)
    if not state:
        return False
    return str(state.get("state") or "") == expected


def _parse_hhmmss(raw: str) -> tuple[int, int, int] | None:
    parts = raw.strip().split(":")
    if len(parts) < 2:
        return None
    try:
        hh = int(parts[0])
        mm = int(parts[1])
        ss = int(parts[2]) if len(parts) > 2 else 0
    except ValueError:
        return None
    if not (0 <= hh <= 23 and 0 <= mm <= 59 and 0 <= ss <= 59):
        return None
    return hh, mm, ss


def _ha_timezone(token: str) -> ZoneInfo:
    try:
        cfg = _fetch(f"{HA_API}/api/config", token=token)
        if isinstance(cfg, dict):
            tz_name = str(cfg.get("time_zone") or "UTC")
            return ZoneInfo(tz_name)
    except Exception:
        pass
    return ZoneInfo("UTC")


def _eval_time(condition: dict[str, Any], token: str) -> bool:
    compare = condition.get("compare")
    parsed = _parse_hhmmss(str(condition.get("time") or ""))
    if compare not in {"before", "after"} or not parsed:
        return False
    tz = _ha_timezone(token)
    now = datetime.now(tz)
    target = now.replace(hour=parsed[0], minute=parsed[1], second=parsed[2], microsecond=0)
    if compare == "before":
        return now < target
    return now >= target


def _sun_event_local(token: str, event: str, tz: ZoneInfo) -> datetime | None:
    state = _states_by_id(token).get("sun.sun")
    if not state:
        return None
    attrs = state.get("attributes") or {}
    key = "next_rising" if event == "sunrise" else "next_setting"
    # Prefer today's event; HA exposes next_rising/next_setting which may be tomorrow.
    raw = attrs.get(key) or attrs.get("rising" if event == "sunrise" else "setting")
    if not isinstance(raw, str) or not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return dt.astimezone(tz)
    except ValueError:
        return None


def _eval_sun(condition: dict[str, Any], token: str) -> bool:
    compare = condition.get("compare")
    event = condition.get("event")
    if compare not in {"before", "after"} or event not in {"sunrise", "sunset"}:
        return False
    tz = _ha_timezone(token)
    now = datetime.now(tz)
    event_at = _sun_event_local(token, event, tz)
    if event_at is None:
        return False
    # If next event is tomorrow, treat "after sunrise/sunset" using yesterday's approx:
    # when next_rising is tomorrow, we are after today's sunrise.
    if event_at.date() > now.date():
        if compare == "after":
            return True
        return False
    if compare == "before":
        return now < event_at
    return now >= event_at


def _eval_condition(condition: dict[str, Any], token: str, states: dict[str, dict[str, Any]]) -> bool:
    kind = condition.get("kind")
    if kind == "entity":
        return _eval_entity(condition, states)
    if kind == "select":
        return _eval_select(condition, states)
    if kind == "time":
        return _eval_time(condition, token)
    if kind == "sun":
        return _eval_sun(condition, token)
    return False


def _eval_condition_rows(rows: list[Any], token: str) -> bool:
    if not rows:
        return True
    states = _states_by_id(token)
    result: bool | None = None
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        condition = row.get("condition")
        if not isinstance(condition, dict):
            continue
        current = _eval_condition(condition, token, states)
        if result is None:
            result = current
            continue
        join = str(row.get("join") or "and").lower()
        if join == "or":
            result = result or current
        else:
            result = result and current
    return True if result is None else result


def run_action(action: dict[str, Any], token: str) -> int:
    ops = _normalize_ops(action.get("ops"))
    named = action.get("named")
    if isinstance(named, str) and named.strip():
        resolved = _resolve_named(token, named.strip())
        if resolved:
            ops = resolved
    if not ops:
        print("No executable ops for action", file=sys.stderr)
        return 0

    errors = 0
    for op in ops:
        try:
            _call_service(
                token,
                op["domain"],
                op["service"],
                op["entityIds"],
                op.get("data") or None,
            )
            print(f"OK {op['domain']}.{op['service']} {op['entityIds']}")
        except (HTTPError, URLError, TimeoutError, OSError) as err:
            errors += 1
            print(f"ERR {op['domain']}.{op['service']}: {err}", file=sys.stderr)
    return 1 if errors else 0


def run_action_list(actions: list[Any], token: str) -> int:
    status = 0
    for action in actions:
        if isinstance(action, dict):
            status = run_action(action, token) or status
    return status


def _load_settings() -> dict[str, Any]:
    raw = _load_json(SETTINGS_PATH)
    return raw if isinstance(raw, dict) else {}


def _load_driveway_state() -> dict[str, Any]:
    raw = _load_json(STATE_PATH)
    return raw if isinstance(raw, dict) else {}


def _write_driveway_state(payload: dict[str, Any]) -> None:
    try:
        WWW.mkdir(parents=True, exist_ok=True)
        tmp = STATE_PATH.with_suffix(STATE_PATH.suffix + ".tmp")
        tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        tmp.replace(STATE_PATH)
    except OSError as err:
        print(f"failed to write driveway state: {err}", file=sys.stderr)


def _set_trigger_actions_executed(executed: bool) -> None:
    state = _load_driveway_state()
    state["triggerActionsExecuted"] = bool(executed)
    if not executed:
        state.pop("restoreSnapshots", None)
    _write_driveway_state(state)


def _clear_driveway_state() -> None:
    _write_driveway_state({"triggerActionsExecuted": False})


def _trigger_actions_were_executed() -> bool:
    return bool(_load_driveway_state().get("triggerActionsExecuted"))


SNAPSHOT_ATTR_KEYS = (
    "brightness",
    "brightness_pct",
    "color_temp",
    "color_temp_kelvin",
    "rgb_color",
    "hs_color",
    "current_position",
    "percentage",
    "volume_level",
)


def _ops_for_action(action: dict[str, Any], token: str) -> list[dict[str, Any]]:
    ops = _normalize_ops(action.get("ops"))
    named = action.get("named")
    if isinstance(named, str) and named.strip():
        resolved = _resolve_named(token, named.strip())
        if resolved:
            ops = resolved
    return ops


def _entity_ids_from_actions(actions: list[Any], token: str) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()
    for action in actions:
        if not isinstance(action, dict):
            continue
        for op in _ops_for_action(action, token):
            for entity_id in op.get("entityIds") or []:
                if isinstance(entity_id, str) and entity_id and entity_id not in seen:
                    seen.add(entity_id)
                    ids.append(entity_id)
    return ids


def _snapshot_entities(
    states: dict[str, dict[str, Any]], entity_ids: list[str]
) -> list[dict[str, Any]]:
    snapshots: list[dict[str, Any]] = []
    for entity_id in entity_ids:
        state = states.get(entity_id)
        if not isinstance(state, dict):
            continue
        attrs_in = state.get("attributes") if isinstance(state.get("attributes"), dict) else {}
        attrs: dict[str, Any] = {}
        for key in SNAPSHOT_ATTR_KEYS:
            if key in attrs_in:
                attrs[key] = attrs_in[key]
        snapshots.append(
            {
                "entityId": entity_id,
                "state": str(state.get("state") or ""),
                "attributes": attrs,
            }
        )
    return snapshots


def _domain_of(entity_id: str) -> str:
    dot = entity_id.find(".")
    return entity_id[:dot] if dot > 0 else ""


def _restore_ops_from_snapshots(snapshots: list[Any]) -> list[dict[str, Any]]:
    ops: list[dict[str, Any]] = []
    for snap in snapshots:
        if not isinstance(snap, dict):
            continue
        entity_id = str(snap.get("entityId") or "").strip()
        raw_state = str(snap.get("state") or "").lower()
        domain = _domain_of(entity_id)
        if not entity_id or not domain or raw_state in {"unavailable", "unknown", ""}:
            continue
        attrs = snap.get("attributes") if isinstance(snap.get("attributes"), dict) else {}

        if domain in {"light", "switch", "fan", "input_boolean"}:
            if raw_state == "on":
                data: dict[str, Any] = {}
                if domain == "light":
                    if isinstance(attrs.get("brightness"), (int, float)):
                        data["brightness"] = attrs["brightness"]
                    elif isinstance(attrs.get("brightness_pct"), (int, float)):
                        data["brightness_pct"] = attrs["brightness_pct"]
                    if isinstance(attrs.get("color_temp_kelvin"), (int, float)):
                        data["color_temp_kelvin"] = attrs["color_temp_kelvin"]
                    elif isinstance(attrs.get("color_temp"), (int, float)):
                        data["color_temp"] = attrs["color_temp"]
                if domain == "fan" and isinstance(attrs.get("percentage"), (int, float)):
                    data["percentage"] = attrs["percentage"]
                ops.append(
                    {
                        "domain": domain,
                        "service": "turn_on",
                        "entityIds": [entity_id],
                        "data": data,
                    }
                )
            elif raw_state == "off":
                ops.append(
                    {
                        "domain": domain,
                        "service": "turn_off",
                        "entityIds": [entity_id],
                        "data": {},
                    }
                )
            continue

        if domain == "media_player":
            if raw_state == "off":
                ops.append(
                    {
                        "domain": domain,
                        "service": "turn_off",
                        "entityIds": [entity_id],
                        "data": {},
                    }
                )
            elif raw_state == "playing":
                ops.append(
                    {
                        "domain": domain,
                        "service": "media_play",
                        "entityIds": [entity_id],
                        "data": {},
                    }
                )
            elif raw_state == "paused":
                ops.append(
                    {
                        "domain": domain,
                        "service": "media_pause",
                        "entityIds": [entity_id],
                        "data": {},
                    }
                )
            elif raw_state in {"idle", "standby", "on"}:
                ops.append(
                    {
                        "domain": domain,
                        "service": "turn_on",
                        "entityIds": [entity_id],
                        "data": {},
                    }
                )
            continue

        if domain == "cover":
            if isinstance(attrs.get("current_position"), (int, float)):
                ops.append(
                    {
                        "domain": domain,
                        "service": "set_cover_position",
                        "entityIds": [entity_id],
                        "data": {"position": attrs["current_position"]},
                    }
                )
            elif raw_state in {"open", "opening"}:
                ops.append(
                    {
                        "domain": domain,
                        "service": "open_cover",
                        "entityIds": [entity_id],
                        "data": {},
                    }
                )
            elif raw_state in {"closed", "closing"}:
                ops.append(
                    {
                        "domain": domain,
                        "service": "close_cover",
                        "entityIds": [entity_id],
                        "data": {},
                    }
                )
            continue

        if domain == "valve":
            if raw_state in {"open", "opening"}:
                ops.append(
                    {
                        "domain": domain,
                        "service": "open_valve",
                        "entityIds": [entity_id],
                        "data": {},
                    }
                )
            elif raw_state in {"closed", "closing"}:
                ops.append(
                    {
                        "domain": domain,
                        "service": "close_valve",
                        "entityIds": [entity_id],
                        "data": {},
                    }
                )
            continue

        if domain == "input_select":
            ops.append(
                {
                    "domain": domain,
                    "service": "select_option",
                    "entityIds": [entity_id],
                    "data": {"option": snap.get("state")},
                }
            )
    return ops


def _run_restore_snapshots(token: str, snapshots: list[Any]) -> int:
    status = 0
    for op in _restore_ops_from_snapshots(snapshots):
        try:
            _call_service(
                token,
                op["domain"],
                op["service"],
                op["entityIds"],
                op.get("data") or None,
            )
            print(f"RESTORE OK {op['domain']}.{op['service']} {op['entityIds']}")
        except (HTTPError, URLError, TimeoutError, OSError) as err:
            status = 1
            print(f"RESTORE ERR {op['domain']}.{op['service']}: {err}", file=sys.stderr)
    return status


def _stamp_now(token: str) -> None:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    _call_service(
        token,
        "input_datetime",
        "set_datetime",
        [DRIVEWAY_LAST],
        {"datetime": now},
    )


def _clear_stamp(token: str) -> None:
    _call_service(
        token,
        "input_datetime",
        "set_datetime",
        [DRIVEWAY_LAST],
        {"datetime": "1970-01-01 00:00:00"},
    )


def _append_control_log(
    *,
    actor: str,
    action: str,
    entity_id: str,
    ok: bool = True,
    detail: Any = None,
) -> None:
    try:
        from append_control_log import append_entry

        append_entry(
            source="automation",
            actor=actor,
            action=action,
            entity_id=entity_id,
            ok=ok,
            detail=detail,
        )
    except Exception as err:
        print(f"WARN: control log write failed: {err}", file=sys.stderr)


def _start_driveway_capture() -> None:
    """DoorBird snapshots + clip in a detached process so the shell_command returns promptly."""
    if not DRIVEWAY_EVENTS_SCRIPT.exists():
        return
    try:
        subprocess.Popen(
            [sys.executable, str(DRIVEWAY_EVENTS_SCRIPT), "--capture"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception as err:
        print(f"WARN: driveway capture failed to start: {err}", file=sys.stderr)


def _wait_for_trigger_snapshot(started_at: float) -> Path | None:
    """First snapshot written by driveway_events.py --capture for this trigger."""
    deadline = started_at + DRIVEWAY_SNAPSHOT_WAIT_S
    while True:
        try:
            candidates = [
                p
                for p in DRIVEWAY_EVENTS_DIR.glob("*-1.jpg")
                if p.stat().st_mtime >= started_at - 5 and p.stat().st_size > 0
            ]
        except OSError:
            candidates = []
        if candidates:
            return max(candidates, key=lambda p: p.stat().st_mtime)
        if time.time() >= deadline:
            return None
        time.sleep(0.5)


def _send_email_with_snapshot(
    token: str, states: dict[str, dict[str, Any]], title: str, message: str, snapshot: Path
) -> None:
    from send_notify_email import send_email

    recipient = str((states.get("input_text.dashboard_notify_email") or {}).get("state") or "")
    if recipient.lower() in {"unknown", "unavailable"}:
        recipient = ""
    send_email(title=title, message=message, recipient=recipient.strip(), attachments=[snapshot])


def _send_phone_with_snapshot(
    token: str, states: dict[str, dict[str, Any]], title: str, message: str, snapshot: Path
) -> bool:
    """Companion-app push with the snapshot; False when no mobile_app service matches."""
    target = str((states.get("input_text.dashboard_notify_phone") or {}).get("state") or "").strip()
    if not target.startswith("notify."):
        target = "notify.holdens_iphone"
    name = target.split(".", 1)[1]
    service = name if name.startswith("mobile_app_") else f"mobile_app_{name}"
    services = _fetch(f"{HA_API}/api/services", token=token) or []
    notify = next((s for s in services if isinstance(s, dict) and s.get("domain") == "notify"), {})
    if service not in (notify.get("services") or {}):
        return False
    _call_service(
        token,
        "notify",
        service,
        data={
            "title": title,
            "message": message,
            "data": {"image": f"/local/driveway-events/{snapshot.name}"},
        },
    )
    return True


def _maybe_notify(settings: dict[str, Any], token: str, started_at: float) -> None:
    if not settings.get("drivewayAlarmEmailEnabled"):
        return
    email_on = settings.get("notifyEmailEnabled")
    phone_on = settings.get("notifyPhoneEnabled")
    # Prefer live helper states when available.
    states = _states_by_id(token)
    email_state = states.get("input_boolean.dashboard_notify_email_enabled")
    phone_state = states.get("input_boolean.dashboard_notify_phone_enabled")
    if email_state:
        email_on = email_state.get("state") == "on"
    if phone_state:
        phone_on = phone_state.get("state") == "on"
    if not email_on and not phone_on:
        return
    title = "Driveway alarm"
    message = "The driveway alarm sensor was triggered."
    snapshot = _wait_for_trigger_snapshot(started_at)
    if email_on:
        try:
            if snapshot is not None:
                _send_email_with_snapshot(token, states, title, message, snapshot)
            else:
                _call_service(
                    token,
                    "script",
                    "dashboard_notify_email",
                    data={"title": title, "message": message},
                )
        except Exception as err:
            print(f"notify email failed: {err}", file=sys.stderr)
    if phone_on:
        try:
            sent = False
            if snapshot is not None:
                sent = _send_phone_with_snapshot(token, states, title, message, snapshot)
            if not sent:
                _call_service(
                    token,
                    "script",
                    "dashboard_notify_phone",
                    data={"title": title, "message": message},
                )
        except Exception as err:
            print(f"notify phone failed: {err}", file=sys.stderr)


def _start_delayed_reset(token: str) -> None:
    try:
        _call_service(token, "script", "turn_off", [DELAYED_RESET_SCRIPT])
    except Exception:
        pass
    try:
        _call_service(token, "script", "turn_on", [DELAYED_RESET_SCRIPT])
    except Exception as err:
        print(f"failed to start delayed reset: {err}", file=sys.stderr)


def mode_trigger(token: str, *, skip_conditions: bool = False) -> int:
    started_at = time.time()
    settings = _load_settings()
    enabled = settings.get("drivewayAlarmEnabled", True)
    states = _states_by_id(token)
    helper = states.get("input_boolean.driveway_alarm_enabled")
    if helper and helper.get("state") in {"on", "off"}:
        enabled = helper.get("state") == "on"
    if not enabled:
        print("Driveway alarm disabled")
        return 0

    # Always light the icon and (re)start the reset timer on a matching edge.
    # Retriggers restart the delayed-reset script so the icon stays active until
    # a full quiet period elapses after the latest trigger.
    _start_driveway_capture()
    _stamp_now(token)
    _start_delayed_reset(token)

    # Log always runs on every trigger (not gated by conditions). Dashboard
    # browser tabs play audio themselves when drivewayAlarmAudioEnabled is on.
    _append_control_log(
        actor="dashboard_driveway_alarm_triggered",
        action="alarm.trigger",
        entity_id="binary_sensor.outside_gate_i_o_input_0",
        ok=True,
    )

    rows = settings.get("drivewayAlarmConditions")
    if not skip_conditions and isinstance(rows, list) and rows:
        if not _eval_condition_rows(rows, token):
            print("Driveway alarm conditions not met — icon stamped; actions skipped")
            return 0

    actions = settings.get("drivewayAlarmActions")
    if not isinstance(actions, list) or not actions:
        legacy = settings.get("drivewayAlarmAction")
        actions = [legacy] if isinstance(legacy, dict) else []

    status = 0
    if actions:
        restore = bool(settings.get("drivewayAlarmRestore"))
        state = _load_driveway_state()
        # Capture once per active window so retriggers keep the original pre-trigger levels.
        if restore and not state.get("restoreSnapshots"):
            entity_ids = _entity_ids_from_actions(actions, token)
            snapshots = _snapshot_entities(states, entity_ids)
            state["restoreSnapshots"] = snapshots
            print(f"Captured {len(snapshots)} entity snapshot(s) for restore")
        status = run_action_list(actions, token)
        # Sticky for this active window: retriggers that skip actions must not
        # clear the flag, or reset actions would be dropped incorrectly.
        state["triggerActionsExecuted"] = True
        _write_driveway_state(state)
        _maybe_notify(settings, token, started_at)
    print("Driveway alarm trigger complete")
    return status


def mode_reset(token: str) -> int:
    settings = _load_settings()
    status = 0
    if _trigger_actions_were_executed():
        if settings.get("drivewayAlarmRestore"):
            snapshots = _load_driveway_state().get("restoreSnapshots")
            if isinstance(snapshots, list) and snapshots:
                status = _run_restore_snapshots(token, snapshots) or status
        actions = settings.get("drivewayAlarmResetActions")
        if not isinstance(actions, list):
            actions = []
        status = run_action_list(actions, token) or status
    else:
        print("Skipping reset actions — trigger actions did not run")
    _clear_stamp(token)
    _clear_driveway_state()
    print("Driveway alarm reset complete")
    return status


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mode",
        choices=("trigger", "reset", "action"),
        default="action",
    )
    parser.add_argument(
        "--settings-key",
        default="drivewayAlarmAction",
        help="Legacy single-action key when --mode action",
    )
    parser.add_argument(
        "--skip-conditions",
        action="store_true",
        help="Used by manual icon click if needed (default still evaluates conditions)",
    )
    args = parser.parse_args()

    token = _ha_token()
    if not token:
        print("Missing HA token", file=sys.stderr)
        return 1

    if args.mode == "trigger":
        return mode_trigger(token, skip_conditions=args.skip_conditions)
    if args.mode == "reset":
        return mode_reset(token)

    settings = _load_settings()
    action = settings.get(args.settings_key)
    if not isinstance(action, dict):
        print(f"No action configured for {args.settings_key}")
        return 0
    labels = action.get("labels")
    label = " › ".join(str(x) for x in labels) if isinstance(labels, list) else args.settings_key
    print(f"Running action: {label}")
    return run_action(action, token)


if __name__ == "__main__":
    raise SystemExit(main())
