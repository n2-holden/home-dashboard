#!/usr/bin/env python3
"""Auto-off bathroom fans after they stay on too long.

Reads mapped fan entity IDs from dashboard-settings.json (bathroomFanSlots).
Uses input_boolean.bathroom_fan_auto_off_enabled and
input_number.bathroom_fan_auto_off_minutes when available.

Timer starts when a mapped fan is observed on; cleared when it turns off.
After the configured minutes still on → homeassistant.turn_off.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

JsonDict = dict[str, Any]

CONFIG_DIR = Path(os.environ.get("HA_CONFIG", "/config"))
WWW = CONFIG_DIR / "www" / "home-dashboard"
HA_CONFIG_PATH = WWW / "ha-config.json"
SETTINGS_PATH = WWW / "dashboard-settings.json"
TIMER_PATH = WWW / "bathroom-fan-timers.json"
HA_API = os.environ.get("HA_API_URL", "http://127.0.0.1:8123")

LOG_PATH = WWW / "control-log.jsonl"
ENABLED_ENTITY = "input_boolean.bathroom_fan_auto_off_enabled"
MINUTES_ENTITY = "input_number.bathroom_fan_auto_off_minutes"
DEFAULT_MINUTES = 30
SLOT_COUNT = 6


def _utc_now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _append_control_log(
    *,
    actor: str,
    action: str,
    entity_id: str,
    ok: bool = True,
) -> None:
    entry = {
        "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "automation",
        "actor": actor,
        "action": action,
        "entity_id": entity_id,
        "ok": ok,
    }
    try:
        WWW.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, separators=(",", ":")) + "\n")
    except OSError as err:
        print(f"WARN: control log write failed: {err}", file=sys.stderr)


def _load_json(path: Path) -> Any:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as err:
        print(f"WARN: could not read {path}: {err}", file=sys.stderr)
        return None


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


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


def _fetch(url: str, *, token: str, method: str = "GET", body: dict[str, Any] | None = None) -> Any:
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
    with urlopen(req, timeout=30) as res:
        raw = res.read()
        if not raw:
            return None
        return json.loads(raw.decode("utf-8"))


def _state_on(states: dict[str, JsonDict], entity_id: str) -> bool | None:
    state = states.get(entity_id)
    if not state:
        return None
    value = str(state.get("state", "")).lower()
    if value in {"unavailable", "unknown"}:
        return None
    return value in {"on", "open", "true", "1"}


def _helper_bool(states: dict[str, JsonDict], entity_id: str, fallback: bool) -> bool:
    state = states.get(entity_id)
    if not state:
        return fallback
    value = str(state.get("state", "")).lower()
    if value in {"unavailable", "unknown"}:
        return fallback
    return value == "on"


def _helper_minutes(states: dict[str, JsonDict], settings: JsonDict) -> int:
    state = states.get(MINUTES_ENTITY)
    if state:
        try:
            value = int(float(state.get("state")))
            if 1 <= value <= 1440:
                return value
        except (TypeError, ValueError):
            pass
    raw = settings.get("bathroomFanAutoOffMinutes", DEFAULT_MINUTES)
    try:
        value = int(float(raw))
        return max(1, min(1440, value))
    except (TypeError, ValueError):
        return DEFAULT_MINUTES


def _slots_from_settings(settings: JsonDict) -> list[str]:
    raw = settings.get("bathroomFanSlots")
    slots: list[str] = []
    if isinstance(raw, list):
        for item in raw[:SLOT_COUNT]:
            slots.append(str(item).strip() if item else "")
    while len(slots) < SLOT_COUNT:
        slots.append("")
    # Dedupe while preserving order; empty stays.
    seen: set[str] = set()
    out: list[str] = []
    for entity_id in slots:
        if not entity_id:
            out.append("")
            continue
        if entity_id in seen:
            out.append("")
            continue
        seen.add(entity_id)
        out.append(entity_id)
    return out[:SLOT_COUNT]


def main() -> int:
    token = _ha_token()
    if not token:
        print("ERROR: no HA token (ha-config.json or HA_TOKEN)", file=sys.stderr)
        return 1

    settings = _load_json(SETTINGS_PATH)
    if not isinstance(settings, dict):
        settings = {}

    try:
        states_list = _fetch(f"{HA_API}/api/states", token=token)
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as err:
        print(f"ERROR: states fetch failed: {err}", file=sys.stderr)
        return 1
    if not isinstance(states_list, list):
        print("ERROR: unexpected states payload", file=sys.stderr)
        return 1

    states = {str(item.get("entity_id")): item for item in states_list if isinstance(item, dict)}
    enabled = _helper_bool(
        states,
        ENABLED_ENTITY,
        bool(settings.get("bathroomFanAutoOffEnabled", False)),
    )
    minutes = _helper_minutes(states, settings)
    slots = [s for s in _slots_from_settings(settings) if s]

    timers_raw = _load_json(TIMER_PATH)
    timers: dict[str, int] = {}
    if isinstance(timers_raw, dict):
        for key, value in timers_raw.items():
            try:
                timers[str(key)] = int(value)
            except (TypeError, ValueError):
                continue

    now = _utc_now_ms()
    limit_ms = minutes * 60_000
    next_timers: dict[str, int] = {}

    if not enabled or not slots:
        if timers:
            _write_json(TIMER_PATH, {})
            print("Bathroom fan auto-off idle (disabled or unmapped); timers cleared")
        else:
            print("Bathroom fan auto-off idle (disabled or unmapped)")
        return 0

    turned_off: list[str] = []
    for entity_id in slots:
        on = _state_on(states, entity_id)
        if on is None:
            # Unavailable — drop timer so we don't act on stale data.
            continue
        if not on:
            continue

        started = timers.get(entity_id)
        if started is None:
            next_timers[entity_id] = now
            continue

        next_timers[entity_id] = started
        if now - started < limit_ms:
            continue

        try:
            _fetch(
                f"{HA_API}/api/services/homeassistant/turn_off",
                token=token,
                method="POST",
                body={"entity_id": entity_id},
            )
            turned_off.append(entity_id)
            next_timers.pop(entity_id, None)
            _append_control_log(
                actor="bathroom_fan_auto_off",
                action="homeassistant.turn_off",
                entity_id=entity_id,
                ok=True,
            )
            print(f"Turned off {entity_id} after {minutes}m")
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as err:
            _append_control_log(
                actor="bathroom_fan_auto_off",
                action="homeassistant.turn_off",
                entity_id=entity_id,
                ok=False,
            )
            print(f"WARN: failed to turn off {entity_id}: {err}", file=sys.stderr)

    if next_timers != timers:
        _write_json(TIMER_PATH, next_timers)

    print(
        f"Bathroom fan auto-off ok · watching {len(slots)} · active timers {len(next_timers)}"
        + (f" · off {len(turned_off)}" if turned_off else "")
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
