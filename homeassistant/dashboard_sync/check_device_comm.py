#!/usr/bin/env python3
"""Home Assistant host only — device communication failure alerts.

Runs on a schedule (shell_command + automation). Does not depend on any
dashboard tab being open, and cannot duplicate when multiple dashboards are open.

Edge-triggered: notify once when a watched device goes from fresh → silent
longer than input_number.device_comm_failure_minutes. Reset after recovery.
"""

from __future__ import annotations

import json
import os
import re
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
STATE_PATH = WWW / "device-comm-notify-state.json"
STATUS_PATH = WWW / "device-comm-status.json"
ENTITY_REGISTRY = CONFIG_DIR / ".storage" / "core.entity_registry"
HA_API = os.environ.get("HA_API_URL", "http://127.0.0.1:8123")

MAIN_GARAGE = [
    "cover.gdo_blaq_e67e04_garage_door",
    "binary_sensor.gdo_blaq_e67e04_motor",
    "binary_sensor.gdo_blaq_e67e04_obstruction",
    "binary_sensor.gdo_blaq_e67e04_synced",
]
WORKSHOP_GARAGE = ["cover.garage_door_opener_5172e8_garage_door"]
GATE = [
    "binary_sensor.outside_gate_i_o_input_1",
    "button.doorstation_1ccae375bf98_relay_ghlkha_1",
]
CISTERN = ["sensor.smartwater_tank_1_water_level"]
OUTSIDE_LIGHTS = [
    "switch.gate_switch_2",
    "light.driveway_lights_light_1",
    "switch.gate_switch_1",
    "switch.west_side_switch_1",
    "switch.west_side_switch_2",
    "switch.pond_switch_2",
    "switch.pond_switch_1",
]
RECEIVER = ["media_player.family_room_tv_receiver"]
SHED_POWER = ["switch.shed_power"]
WEATHER_PREF = ["weather.home", "weather.forecast_home", "weather.buienradar"]


def _utc_now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


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
    with urlopen(req, timeout=30) as resp:
        raw = resp.read()
        if not raw:
            return None
        return json.loads(raw.decode("utf-8"))


def parse_iso_ms(value: Any) -> int | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return int(dt.timestamp() * 1000)
    except ValueError:
        return None


def newest_updated_ms(states_by_id: dict[str, JsonDict], entity_ids: list[str]) -> int | None:
    best: int | None = None
    for entity_id in entity_ids:
        state = states_by_id.get(entity_id)
        if not state:
            continue
        stamp = parse_iso_ms(state.get("last_updated")) or parse_iso_ms(state.get("last_changed"))
        if stamp is None:
            continue
        if best is None or stamp > best:
            best = stamp
    return best


def cache_fetched_ms(*paths: Path) -> int | None:
    best: int | None = None
    for path in paths:
        data = _load_json(path)
        if not isinstance(data, dict):
            continue
        for key in ("fetchedAt", "generatedAt", "lastUpdate"):
            stamp = parse_iso_ms(data.get(key))
            if stamp is None:
                continue
            if best is None or stamp > best:
                best = stamp
    return best


def shade_entity_ids() -> list[str]:
    data = _load_json(WWW / "shade-map.json")
    if not isinstance(data, dict):
        return []
    return sorted({str(v) for v in data.values() if isinstance(v, str) and v.strip()})


def irrigation_ids(states: list[JsonDict]) -> list[str]:
    ids: list[str] = []
    for state in states:
        entity_id = str(state.get("entity_id") or "")
        if not entity_id.startswith("switch."):
            continue
        hay = f"{entity_id} {state.get('attributes', {}).get('friendly_name', '')}".lower()
        if "sprinkler" not in hay and "zone" not in hay:
            continue
        m = re.search(r"sprinkler_?(\d+)$", entity_id, re.I)
        if not m:
            continue
        num = int(m.group(1))
        if 1 <= num <= 21:
            ids.append(entity_id)
    return ids


def registry_platform_ids(platform: str, domain_prefix: str) -> list[str]:
    data = _load_json(ENTITY_REGISTRY)
    if not isinstance(data, dict):
        return []
    entities = data.get("data", {}).get("entities", [])
    if not isinstance(entities, list):
        return []
    out: list[str] = []
    for entry in entities:
        if not isinstance(entry, dict):
            continue
        if entry.get("platform") != platform:
            continue
        entity_id = entry.get("entity_id")
        if isinstance(entity_id, str) and entity_id.startswith(domain_prefix):
            out.append(entity_id)
    return out


def string_list_attr(state: JsonDict, key: str) -> list[str]:
    attrs = state.get("attributes")
    if not isinstance(attrs, dict):
        return []
    raw = attrs.get(key)
    if not isinstance(raw, list):
        return []
    return [str(item) for item in raw if item is not None and str(item).strip()]


def is_mini_split_ac(state: JsonDict) -> bool:
    """Match dashboard `isMiniSplitAc` — attribute heuristics, not name regex."""
    entity_id = str(state.get("entity_id") or "")
    if not entity_id.startswith("climate."):
        return False
    if re.search(r"pentair|screenlogic", entity_id, re.I):
        return False
    attrs = state.get("attributes")
    if not isinstance(attrs, dict):
        attrs = {}
    if isinstance(attrs.get("serial"), str):
        return True
    swing = attrs.get("swing_modes")
    if isinstance(swing, list) and len(swing) > 0:
        return True
    hvac_modes = string_list_attr(state, "hvac_modes")
    if "dry" in hvac_modes:
        return True
    fan_modes = string_list_attr(state, "fan_modes")
    if any(re.search(r"superquiet|superpowerful", mode, re.I) for mode in fan_modes):
        return True
    return False


def climate_ids(states: list[JsonDict], *, kind: str) -> list[str]:
    """Split climates: AC = mini-splits; HVAC = other non-Pentair climates."""
    ids: list[str] = []
    for state in states:
        entity_id = str(state.get("entity_id") or "")
        if not entity_id.startswith("climate."):
            continue
        if re.search(r"pentair|screenlogic", entity_id, re.I):
            continue
        is_ac = is_mini_split_ac(state)
        if kind == "ac" and is_ac:
            ids.append(entity_id)
        elif kind == "hvac" and not is_ac:
            ids.append(entity_id)
    return ids


def weather_ids(states_by_id: dict[str, JsonDict]) -> list[str]:
    for entity_id in WEATHER_PREF:
        if entity_id in states_by_id:
            return [entity_id]
    for entity_id in states_by_id:
        if entity_id.startswith("weather."):
            return [entity_id]
    return []


def helper_on(states_by_id: dict[str, JsonDict], entity_id: str, default: bool = False) -> bool:
    state = states_by_id.get(entity_id)
    if not state:
        return default
    return str(state.get("state", "")).lower() == "on"


def helper_number(states_by_id: dict[str, JsonDict], entity_id: str, default: float) -> float:
    state = states_by_id.get(entity_id)
    if not state:
        return default
    try:
        return float(state.get("state"))
    except (TypeError, ValueError):
        return default


def entity_label(states_by_id: dict[str, JsonDict], entity_id: str, fallback: str) -> str:
    state = states_by_id.get(entity_id)
    if state:
        attrs = state.get("attributes")
        if isinstance(attrs, dict):
            friendly = str(attrs.get("friendly_name") or "").strip()
            if friendly:
                return friendly
    return fallback


def age_min(last_ms: int | None, now: int, threshold_ms: int) -> int:
    if last_ms is None:
        return max(1, int(round(threshold_ms / 60_000)))
    return max(1, int(round((now - last_ms) / 60_000)))


def format_failed_labels(labels: list[str], limit: int = 8) -> str:
    ordered = sorted({label for label in labels if label}, key=str.lower)
    if not ordered:
        return ""
    if len(ordered) <= limit:
        return ", ".join(ordered)
    extra = len(ordered) - limit
    return f"{', '.join(ordered[:limit])}, +{extra} more"


def is_unavailable(state: JsonDict | None) -> bool:
    if not state:
        return True
    raw = str(state.get("state") or "").lower()
    return raw in {"unavailable", "unknown", ""}


def evaluate_entity_sources(
    states_by_id: dict[str, JsonDict],
    sources: list[tuple[str, str]],
    now: int,
    threshold_ms: int,
    mode: str = "freshness",
) -> tuple[int | None, list[str], int]:
    """Return (newest_ms, failed_labels, worst_age_min)."""
    seen: set[str] = set()
    newest: int | None = None
    failed: list[str] = []
    worst_age = 1
    present = 0
    for entity_id, fallback in sources:
        if not entity_id or entity_id in seen:
            continue
        seen.add(entity_id)
        state = states_by_id.get(entity_id)
        label = entity_label(states_by_id, entity_id, fallback)
        stamp = None
        if state:
            stamp = parse_iso_ms(state.get("last_updated")) or parse_iso_ms(state.get("last_changed"))
            if stamp is not None and (newest is None or stamp > newest):
                newest = stamp
        if not state:
            failed.append(label)
            worst_age = max(worst_age, age_min(None, now, threshold_ms))
            continue
        present += 1
        if mode == "availability":
            # Sticky entities: only fail when unavailable long enough.
            if not is_unavailable(state):
                continue
            if stamp is not None and (now - stamp) < threshold_ms:
                continue
            failed.append(label)
            worst_age = max(worst_age, age_min(stamp, now, threshold_ms))
            continue
        if stamp is None or (now - stamp) >= threshold_ms:
            failed.append(label)
            worst_age = max(worst_age, age_min(stamp, now, threshold_ms))
    if present == 0 and not failed:
        return None, [], 1
    return newest, failed, worst_age


def evaluate_timestamp_sources(
    sources: list[tuple[str, int | None]],
    now: int,
    threshold_ms: int,
) -> tuple[int | None, list[str], int]:
    newest: int | None = None
    failed: list[str] = []
    worst_age = 1
    any_stamp = False
    for label, stamp in sources:
        if stamp is not None:
            any_stamp = True
            if newest is None or stamp > newest:
                newest = stamp
        if stamp is None or (now - stamp) >= threshold_ms:
            failed.append(label)
            worst_age = max(worst_age, age_min(stamp, now, threshold_ms))
    if not any_stamp and not failed:
        return None, [], 1
    return newest, failed, worst_age


def call_script(token: str, script: str, title: str, message: str) -> None:
    _fetch(
        f"{HA_API}/api/services/script/{script}",
        token=token,
        method="POST",
        body={"title": title, "message": message},
    )


def build_devices(
    states: list[JsonDict],
    states_by_id: dict[str, JsonDict],
    now: int,
    threshold_ms: int,
) -> list[tuple[str, str, int | None, list[str], int]]:
    pool_map = _load_json(WWW / "pool-map.json")
    pool_sources: list[tuple[str, str]] = []
    if isinstance(pool_map, dict):
        for key, fallback in (
            ("temperature", "Temperature"),
            ("pumpRpm", "Pump RPM"),
            ("depth", "Water depth"),
        ):
            value = pool_map.get(key)
            if isinstance(value, str) and value.strip():
                pool_sources.append((value.strip(), fallback))
    pool_sources.extend(
        [
            ("climate.pentair_f8_07_0a_spa_heat", "Spa heat"),
            ("sensor.pentair_f8_07_0a_pool_pump_rpm_now", "Pump RPM"),
            ("switch.pentair_f8_07_0a_pool", "Pool circuit"),
        ]
    )

    pond_map = _load_json(WWW / "pond-map.json")
    pond_sources: list[tuple[str, str]] = []
    if isinstance(pond_map, dict):
        for key, fallback in (("level", "Water level"), ("depth", "Depth")):
            value = pond_map.get(key)
            if isinstance(value, str) and value.strip():
                pond_sources.append((value.strip(), fallback))

    energy = _load_json(WWW / "energy-map.json")
    pv_parts: list[tuple[str, int | None]] = [
        ("AlsoEnergy cache", cache_fetched_ms(WWW / "pv-cache.json")),
    ]
    if isinstance(energy, dict):
        for key, label in (
            ("pvOnlyProduction", "Production"),
            ("pvOnlyLoad", "Load"),
            ("pvOnlyGrid", "Grid"),
        ):
            value = energy.get(key)
            if isinstance(value, str) and value.strip():
                pv_parts.append((label, newest_updated_ms(states_by_id, [value.strip()])))

    shade_ids = shade_entity_ids()
    shade_sources = [
        (entity_id, entity_label(states_by_id, entity_id, entity_id.replace("cover.", "")))
        for entity_id in shade_ids
    ]

    sonos_ids = registry_platform_ids("sonos", "media_player.")
    if not sonos_ids:
        sonos_ids = [
            str(s.get("entity_id"))
            for s in states
            if str(s.get("entity_id", "")).startswith("media_player.")
            and "sonos"
            in f"{s.get('entity_id')} {s.get('attributes', {}).get('friendly_name', '')}".lower()
        ]
    crestron_ids = registry_platform_ids("crestron_home", "light.")
    crestron_ids += registry_platform_ids("crestron_home", "switch.")
    crestron_ids += registry_platform_ids("crestron_home", "fan.")
    if not crestron_ids:
        crestron_ids = registry_platform_ids("homekit_controller", "light.")

    gate_sources = [
        (GATE[0], "Closed sensor"),
        (GATE[1], "DoorBird relay"),
    ]
    main_garage_sources = [
        (MAIN_GARAGE[0], "Door"),
        (MAIN_GARAGE[1], "Motor"),
        (MAIN_GARAGE[2], "Obstruction"),
        (MAIN_GARAGE[3], "Synced"),
    ]
    irrigation_sources = [
        (entity_id, entity_label(states_by_id, entity_id, entity_id))
        for entity_id in irrigation_ids(states)
    ]
    sonos_sources = [
        (entity_id, entity_label(states_by_id, entity_id, entity_id)) for entity_id in sonos_ids
    ]
    hvac_sources = [
        (entity_id, entity_label(states_by_id, entity_id, entity_id))
        for entity_id in climate_ids(states, kind="hvac")
    ]
    ac_sources = [
        (entity_id, entity_label(states_by_id, entity_id, entity_id))
        for entity_id in climate_ids(states, kind="ac")
    ]
    outside_sources = [
        (entity_id, entity_label(states_by_id, entity_id, entity_id)) for entity_id in OUTSIDE_LIGHTS
    ]
    crestron_sources = [
        (entity_id, entity_label(states_by_id, entity_id, entity_id)) for entity_id in crestron_ids
    ]

    devices: list[tuple[str, str, int | None, list[str], int]] = []

    def add_single(key: str, label: str, last_ms: int | None) -> None:
        if last_ms is None:
            devices.append((key, label, None, [], 1))
            return
        failing = (now - last_ms) >= threshold_ms
        failed = [label] if failing else []
        devices.append((key, label, last_ms, failed, age_min(last_ms, now, threshold_ms)))

    def add_group(
        key: str,
        label: str,
        sources: list[tuple[str, str]],
        mode: str = "freshness",
    ) -> None:
        newest, failed, worst = evaluate_entity_sources(
            states_by_id, sources, now, threshold_ms, mode=mode
        )
        devices.append((key, label, newest, failed, worst))

    def add_parts(key: str, label: str, parts: list[tuple[str, int | None]]) -> None:
        configured = [(name, stamp) for name, stamp in parts if stamp is not None or name]
        # Keep parts that were intentionally listed; empty configured means unknown.
        if not any(stamp is not None for _, stamp in configured) and not configured:
            devices.append((key, label, None, [], 1))
            return
        newest, failed, worst = evaluate_timestamp_sources(parts, now, threshold_ms)
        devices.append((key, label, newest, failed, worst))

    add_single("shed-powerpack", "Shed PowerPack", cache_fetched_ms(WWW / "shed-cache.json"))
    add_parts("alsoenergy-pv", "PV array (AlsoEnergy)", pv_parts)
    add_single("egauge-grid", "House power (eGauge)", cache_fetched_ms(WWW / "egauge-live.json"))
    add_group("shades", "Shades", shade_sources, mode="availability")
    add_group("pool", "Pool", pool_sources, mode="availability")
    add_group("pond", "Pond", pond_sources, mode="availability")
    add_group("cistern", "Cistern", [(CISTERN[0], "Water level")], mode="availability")
    add_group("garage-main", "Main garage", main_garage_sources, mode="availability")
    add_group(
        "garage-workshop",
        "Detached garage",
        [(WORKSHOP_GARAGE[0], "Door")],
        mode="availability",
    )
    add_group("gate", "Gate", gate_sources, mode="availability")
    weather = weather_ids(states_by_id)
    add_group(
        "weather",
        "Weather",
        [(entity_id, "Weather") for entity_id in weather],
    )
    add_group("irrigation", "Irrigation", irrigation_sources, mode="availability")
    add_group("sonos", "Sonos", sonos_sources, mode="availability")
    add_group("receiver", "AV receiver", [(RECEIVER[0], "AV receiver")], mode="availability")
    add_group("hvac", "HVAC", hvac_sources, mode="availability")
    add_group("ac", "Mini-split AC", ac_sources, mode="availability")
    add_group("outside-lights", "Outside lights", outside_sources, mode="availability")
    add_group("crestron", "Crestron lights", crestron_sources, mode="availability")
    add_group(
        "shed-power-outlet",
        "Shed Power outlet",
        [(SHED_POWER[0], "Shed Power")],
        mode="availability",
    )

    devices.sort(key=lambda item: item[1].lower())
    return devices


def main() -> int:
    token = _ha_token()
    if not token:
        print("ERROR: no HA token", file=sys.stderr)
        return 1

    try:
        states = _fetch(f"{HA_API}/api/states", token=token)
    except (URLError, TimeoutError, HTTPError, json.JSONDecodeError) as err:
        print(f"ERROR: HA states fetch failed: {err}", file=sys.stderr)
        return 1
    if not isinstance(states, list):
        print("ERROR: unexpected /api/states payload", file=sys.stderr)
        return 1

    states_by_id: dict[str, JsonDict] = {}
    for item in states:
        if isinstance(item, dict) and isinstance(item.get("entity_id"), str):
            states_by_id[item["entity_id"]] = item

    alert_enabled = helper_on(states_by_id, "input_boolean.device_comm_failure_email_enabled")
    email_on = helper_on(states_by_id, "input_boolean.dashboard_notify_email_enabled", True)
    phone_on = helper_on(states_by_id, "input_boolean.dashboard_notify_phone_enabled")
    minutes = max(1, int(helper_number(states_by_id, "input_number.device_comm_failure_minutes", 15)))
    threshold_ms = minutes * 60 * 1000
    now = _utc_now_ms()

    prev_raw = _load_json(STATE_PATH)
    previous: dict[str, JsonDict] = prev_raw if isinstance(prev_raw, dict) else {}
    next_state: dict[str, JsonDict] = {}
    to_notify: list[tuple[str, str, int, list[str]]] = []

    devices = build_devices(states, states_by_id, now, threshold_ms)

    status_rows: list[JsonDict] = []
    for key, label, last_ms, failed_labels, worst_age in devices:
        if last_ms is None and not failed_labels:
            succeeded: bool | None = None
            failure_started: int | None = None
            failed_sources: list[JsonDict] = []
        elif failed_labels:
            succeeded = False
            failure_started = now - worst_age * 60_000
            failed_sources = [
                {
                    "label": name,
                    "ageMin": worst_age,
                    "sinceMs": failure_started,
                }
                for name in sorted(set(failed_labels), key=str.lower)
            ]
        else:
            succeeded = True
            failure_started = None
            failed_sources = []
        status_rows.append(
            {
                "key": key,
                "label": label,
                "succeeded": succeeded,
                "failedSources": failed_sources,
                "failureStartedAtMs": failure_started,
            }
        )

    _write_json(
        STATUS_PATH,
        {
            "checkedAt": datetime.now(timezone.utc).isoformat(),
            "checkedAtMs": now,
            "thresholdMinutes": minutes,
            "rows": status_rows,
        },
    )

    for key, label, last_ms, failed_labels, worst_age in devices:
        prior = previous.get(key) if isinstance(previous.get(key), dict) else {}
        saw_success = bool(prior.get("sawSuccess"))
        notified = bool(prior.get("notified"))

        if last_ms is None and not failed_labels:
            if prior:
                next_state[key] = {"sawSuccess": saw_success, "notified": notified}
            continue

        failing = len(failed_labels) > 0
        if not failing:
            next_state[key] = {"sawSuccess": True, "notified": False}
            continue

        if saw_success and not notified:
            to_notify.append((key, label, worst_age, failed_labels))
            next_state[key] = {"sawSuccess": True, "notified": True}
        else:
            next_state[key] = {"sawSuccess": saw_success, "notified": notified}

    _write_json(STATE_PATH, next_state)

    if not alert_enabled or (not email_on and not phone_on):
        print(
            f"device-comm check ok (alerts off); watched={len(status_rows)} "
            f"minutes={minutes}"
        )
        return 0

    for key, label, age_min_value, failed_labels in to_notify:
        title = "Device communication failure"
        detail = format_failed_labels(failed_labels)
        if detail and (len(failed_labels) > 1 or failed_labels[0].lower() != label.lower()):
            message = (
                f"{label} has not communicated for about {age_min_value} minute(s). "
                f"Failed: {detail}."
            )
        else:
            message = f"{label} has not communicated for about {age_min_value} minute(s)."
        print(f"NOTIFY {key}: {message}")
        try:
            if email_on:
                call_script(token, "dashboard_notify_email", title, message)
            if phone_on:
                call_script(token, "dashboard_notify_phone", title, message)
        except (URLError, TimeoutError, HTTPError, json.JSONDecodeError) as err:
            print(f"WARN: notify failed for {key}: {err}", file=sys.stderr)

    print(
        f"device-comm check ok; watched={len(status_rows)} minutes={minutes} "
        f"notified={len(to_notify)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
