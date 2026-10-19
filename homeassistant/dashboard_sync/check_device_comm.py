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
SETTINGS_PATH = WWW / "dashboard-settings.json"
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
    "binary_sensor.outside_gate_i_o_input_0",
    "button.doorstation_1ccae375bf98_relay_ghlkha_1",
    "camera.doorstation_1ccae375bf98_live",
]
CISTERN = ["sensor.smartwater_tank_1_water_level"]
HOT_TUB = ["sensor.shellyemg3_dcb4d9d15c90_temperature_2"]
OUTSIDE_LIGHTS = [
    "switch.gate_switch_2",
    "light.lower_driveway",
    "light.center_parking",
    "switch.gate_switch_1",
    "switch.west_side_switch_1",
    "switch.west_side_switch_2",
    "switch.pond_switch_2",
    "switch.pond_switch_1",
]
RECEIVER = ["media_player.family_room_tv_receiver"]
SHED_INVERTER_POWER = "sensor.shed_inverter_total_power"
# The EZ1 powers down without sun; only count outages once it should be awake.
SHED_INVERTER_MIN_ELEVATION = 15.0
SHED_INVERTER_SUNRISE_GRACE_MS = 60 * 60_000
WEATHER_PREF = ["weather.home", "weather.forecast_home", "weather.buienradar"]


def _utc_now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _load_json(path: Path) -> Any:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
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


STATUS_FAIL_MINUTES = 15
# HA's Shelly integration drops and reconnects the gate I/O websocket for ~60 s at a time.
GATE_SENSOR_GRACE_MS = 3 * 60 * 1000
ZYNECT_CONFIG_PATH = WWW / "zynect-config.json"
ZYNECT_CACHE_PATH = WWW / "zynect-comm-cache.json"
ZYNECT_POND_ALIASES = {"pond"}
# Sensors routinely skip 2–6 reports (15–35 min gaps at a 5-min interval).
ZYNECT_MIN_STALE_MS = 40 * 60 * 1000
ZYNECT_STALE_INTERVALS = 5


def _zynect_get(cfg: JsonDict, path: str) -> Any:
    base = str(cfg.get("baseUrl") or "https://zynect.com/api/v2/")
    if not base.endswith("/"):
        base += "/"
    headers = {"Accept": "application/json"}
    name = str(cfg.get("authHeaderName") or "Authorization")
    value = str(cfg.get("authHeaderValue") or "").strip()
    if value:
        headers[name] = value
    with urlopen(Request(base + path, headers=headers), timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8", "replace"))


_zynect_run_cache: tuple[dict[str, JsonDict], int | None] | None = None


def zynect_sensors(now: int) -> tuple[dict[str, JsonDict], int | None]:
    """Per-sensor {alias, lastReportMs, intervalMin} plus last successful cloud fetch."""
    global _zynect_run_cache
    if _zynect_run_cache is None:
        _zynect_run_cache = _fetch_zynect_sensors(now)
    return _zynect_run_cache


def _fetch_zynect_sensors(now: int) -> tuple[dict[str, JsonDict], int | None]:
    cache = _load_json(ZYNECT_CACHE_PATH)
    cached_sensors = cache.get("sensors") if isinstance(cache, dict) else None
    cached_fetched = cache.get("fetchedAtMs") if isinstance(cache, dict) else None
    cfg = _load_json(ZYNECT_CONFIG_PATH)
    if not isinstance(cfg, dict) or not str(cfg.get("authHeaderValue") or "").strip():
        return {}, None
    try:
        eggs = _zynect_get(cfg, f"authorized-eggs?p={cfg.get('product') or 'thermote'}")
        ids = [e for e in eggs if isinstance(e, str) and e.lower().startswith("egg")]
        payload = _zynect_get(cfg, "zynect-egg/" + ",".join(ids)) if ids else []
    except (URLError, TimeoutError, HTTPError, json.JSONDecodeError, OSError) as err:
        print(f"WARN: Zynect fetch failed: {err}", file=sys.stderr)
        sensors = cached_sensors if isinstance(cached_sensors, dict) else {}
        fetched = int(cached_fetched) if isinstance(cached_fetched, (int, float)) else None
        return sensors, fetched
    sensors: dict[str, JsonDict] = {}
    for egg in payload if isinstance(payload, list) else []:
        if not isinstance(egg, dict) or not egg.get("serial_number"):
            continue
        recent = egg.get("mostRecentData") if isinstance(egg.get("mostRecentData"), dict) else {}
        interval = egg.get("reportingInterval")
        sensors[str(egg["serial_number"])] = {
            "alias": str(egg.get("alias") or egg.get("shortcode") or egg["serial_number"]).strip(),
            "lastReportMs": parse_iso_ms(recent.get("last_report"))
            or parse_iso_ms(egg.get("dataLastUpdated")),
            "intervalMin": interval if isinstance(interval, (int, float)) and interval > 0 else 5,
        }
    _write_json(ZYNECT_CACHE_PATH, {"fetchedAtMs": now, "sensors": sensors})
    return sensors, now


def alsoenergy_polling_paused(states_by_id: dict[str, JsonDict]) -> bool:
    """True when AlsoEnergy intentionally skips API polls (night / solar window).

    The integration only calls the API from ~1h before sunrise through ~1h after
    sunset and sets pollingPaused on pv-cache.json. Without this, device-comm
    treats the stale cache as a failure and notifies overnight.
    """
    cache = _load_json(WWW / "pv-cache.json")
    if isinstance(cache, dict) and cache.get("pollingPaused") is True:
        return True

    # Fallback if the cache flag has not been rewritten yet after sunset.
    # Elevation ≲ −12° is past the ±1h daylight polling margin for mid-latitudes.
    sun = states_by_id.get("sun.sun")
    if isinstance(sun, dict):
        attrs = sun.get("attributes")
        if isinstance(attrs, dict):
            elev = attrs.get("elevation")
            if isinstance(elev, (int, float)) and elev < -12:
                return True
    return False


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


def failure_message(label: str, age_minutes: int, failed_labels: list[str]) -> str:
    base = f"{label} has not communicated for about {age_minutes} minute(s)."
    detail = format_failed_labels(failed_labels)
    if detail and (len(failed_labels) > 1 or failed_labels[0].lower() != label.lower()):
        return f"{base} Failed: {detail}."
    return base


def format_duration(ms: int) -> str:
    minutes = max(1, round(ms / 60_000))
    if minutes < 60:
        return f"{minutes} minute{'s' if minutes != 1 else ''}"
    hours, mins = divmod(minutes, 60)
    if hours < 24:
        return f"{hours}h {mins}m" if mins else f"{hours}h"
    days, hours = divmod(hours, 24)
    return f"{days}d {hours}h" if hours else f"{days}d"


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
    grace_ms: int | None = None,
) -> tuple[int | None, list[str], int]:
    """Return (newest_ms, failed_labels, worst_age_min).

    Modes:
      freshness — fail when last_updated older than threshold
      availability — fail when unavailable longer than threshold (sticky entities)
      availability_immediate — fail as soon as unavailable/missing (matches live UI Xs)

    grace_ms, when set, replaces threshold_ms for availability mode.
    """
    if grace_ms is not None:
        threshold_ms = grace_ms
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
        if mode in {"availability", "availability_immediate"}:
            if not is_unavailable(state):
                continue
            # Wait for threshold unless immediate (dashboard icon Xs are immediate).
            if (
                mode == "availability"
                and stamp is not None
                and (now - stamp) < threshold_ms
            ):
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

    gate_sensor_sources = [
        (GATE[0], "Gate closed"),
        (GATE[1], "Driveway alarm"),
    ]
    gate_doorbird_sources = [
        (GATE[2], "DoorBird relay"),
        (GATE[3], "DoorBird camera"),
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
        grace_ms: int | None = None,
    ) -> None:
        newest, failed, worst = evaluate_entity_sources(
            states_by_id, sources, now, threshold_ms, mode=mode, grace_ms=grace_ms
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

    inverter = states_by_id.get(SHED_INVERTER_POWER)
    if inverter is not None:
        label = "Shed inverter (APsystems)"
        changed = parse_iso_ms(inverter.get("last_changed"))
        if not is_unavailable(inverter):
            updated = parse_iso_ms(inverter.get("last_updated")) or changed
            devices.append(("shed-inverter", label, updated, [], age_min(updated, now, threshold_ms)))
        else:
            sun = (states_by_id.get("sun.sun") or {}).get("attributes") or {}
            try:
                elevation = float(sun.get("elevation"))
            except (TypeError, ValueError):
                elevation = 90.0
            if elevation < SHED_INVERTER_MIN_ELEVATION:
                devices.append(("shed-inverter", label, changed, [], 1))
            else:
                next_rising = parse_iso_ms(sun.get("next_rising"))
                awake_ms = (
                    next_rising - 86_400_000 + SHED_INVERTER_SUNRISE_GRACE_MS
                    if next_rising is not None
                    else None
                )
                start = max(v for v in (changed, awake_ms, 0) if v is not None)
                failed = [label] if now - start >= threshold_ms else []
                devices.append(("shed-inverter", label, changed, failed, age_min(start, now, threshold_ms)))
    if alsoenergy_polling_paused(states_by_id):
        # Night / outside solar window — do not treat stale PV timestamps as failure.
        devices.append(
            (
                "alsoenergy-pv",
                "PV array (AlsoEnergy)",
                cache_fetched_ms(WWW / "pv-cache.json"),
                [],
                1,
            )
        )
    else:
        add_parts("alsoenergy-pv", "PV array (AlsoEnergy)", pv_parts)
    add_single("egauge-grid", "House power (eGauge)", cache_fetched_ms(WWW / "egauge-live.json"))
    add_group("shades", "Shades", shade_sources, mode="availability")
    add_group("pool", "Pool", pool_sources, mode="availability")
    add_group("pond", "Pond", pond_sources, mode="availability")

    zynect, zynect_fetched = zynect_sensors(now)

    def add_zynect(key: str, label: str, pond: bool) -> None:
        picked = [
            s for s in zynect.values() if (s.get("alias", "").lower() in ZYNECT_POND_ALIASES) == pond
        ]
        if not picked:
            return
        newest: int | None = None
        failed: list[str] = []
        worst = 1
        for sensor in sorted(picked, key=lambda s: s.get("alias", "").lower()):
            stamp = sensor.get("lastReportMs")
            stale_ms = max(
                threshold_ms,
                ZYNECT_MIN_STALE_MS,
                int(sensor.get("intervalMin") or 5) * ZYNECT_STALE_INTERVALS * 60_000,
            )
            if isinstance(stamp, (int, float)) and (newest is None or stamp > newest):
                newest = int(stamp)
            if not isinstance(stamp, (int, float)) or (now - stamp) >= stale_ms:
                failed.append(sensor.get("alias") or "Sensor")
                worst = max(worst, age_min(stamp, now, stale_ms))
        if zynect_fetched is not None and (now - zynect_fetched) >= max(threshold_ms, ZYNECT_MIN_STALE_MS):
            failed.append("Zynect cloud")
            worst = max(worst, age_min(zynect_fetched, now, threshold_ms))
        devices.append((key, label, newest, failed, worst))

    add_zynect("solar-thermal", "Solar thermal", pond=False)
    add_zynect("pond-temperature", "Pond temperature", pond=True)
    add_group("cistern", "Cistern", [(CISTERN[0], "Water level")], mode="availability")
    add_group("hot-tub", "Hot tub", [(HOT_TUB[0], "Temperature")], mode="availability")
    add_group("garage-main", "Main garage", main_garage_sources, mode="availability")
    add_group(
        "garage-workshop",
        "Detached garage",
        [(WORKSHOP_GARAGE[0], "Door")],
        mode="availability",
    )
    add_group(
        "gate-doorbird",
        "Gate - Doorbird",
        gate_doorbird_sources,
        mode="availability_immediate",
    )
    add_group(
        "gate-sensor",
        "Gate - Sensor",
        gate_sensor_sources,
        mode="availability",
        grace_ms=GATE_SENSOR_GRACE_MS,
    )
    # Driveway alarm sensor (input 0) Off for ≥ 30 minutes → "Gate - Sensor (driveway blocked)".
    driveway_sensor = states_by_id.get(GATE[1])
    driveway_blocked_ms = 30 * 60 * 1000
    if isinstance(driveway_sensor, dict) and str(driveway_sensor.get("state") or "").lower() == "off":
        since = parse_iso_ms(driveway_sensor.get("last_changed")) or parse_iso_ms(
            driveway_sensor.get("last_updated")
        )
        if since is not None and (now - since) >= driveway_blocked_ms:
            devices.append(
                (
                    "driveway-sensor-blocked",
                    "Gate - Sensor (driveway blocked)",
                    since,
                    ["Off > 30 min"],
                    age_min(since, now, driveway_blocked_ms),
                )
            )
        else:
            devices.append(
                ("driveway-sensor-blocked", "Gate - Sensor (driveway blocked)", since or now, [], 1)
            )
    else:
        # On / unavailable / missing — not blocked (availability is Gate - Sensor).
        stamp = now
        if isinstance(driveway_sensor, dict):
            stamp = (
                parse_iso_ms(driveway_sensor.get("last_changed"))
                or parse_iso_ms(driveway_sensor.get("last_updated"))
                or now
            )
        devices.append(("driveway-sensor-blocked", "Gate - Sensor (driveway blocked)", stamp, [], 1))
    weather = weather_ids(states_by_id)
    add_group(
        "weather",
        "Weather",
        [(entity_id, "Weather") for entity_id in weather],
        mode="availability",
    )
    add_group("irrigation", "Irrigation", irrigation_sources, mode="availability")
    add_group("sonos", "Sonos", sonos_sources, mode="availability")
    add_group("receiver", "AV receiver", [(RECEIVER[0], "AV receiver")], mode="availability")
    add_group("hvac", "HVAC", hvac_sources, mode="availability")
    add_group("ac", "Mini-split AC", ac_sources, mode="availability")
    add_group("outside-lights", "Outside lights", outside_sources, mode="availability")
    add_group("crestron", "Crestron lights", crestron_sources, mode="availability")

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

    settings_raw = _load_json(SETTINGS_PATH)
    notify_map_raw = (
        settings_raw.get("deviceCommNotifyEnabled") if isinstance(settings_raw, dict) else None
    )
    notify_enabled: dict[str, bool] = {}
    if isinstance(notify_map_raw, dict):
        for key, enabled in notify_map_raw.items():
            if isinstance(key, str) and isinstance(enabled, bool):
                notify_enabled[key] = enabled

    prev_raw = _load_json(STATE_PATH)
    previous: dict[str, JsonDict] = prev_raw if isinstance(prev_raw, dict) else {}
    next_state: dict[str, JsonDict] = {}
    to_notify: list[tuple[str, str, str]] = []

    devices = build_devices(states, states_by_id, now, threshold_ms)
    # Status list / icons flag outages sooner; the log + notifications wait for threshold_ms.
    display_threshold_ms = min(threshold_ms, STATUS_FAIL_MINUTES * 60_000)
    display_by_key = {
        item[0]: item
        for item in build_devices(states, states_by_id, now, display_threshold_ms)
    }

    # Weather (and similar) must fail on consecutive checks before we mark / notify.
    soft_fail_keys = {"weather"}
    soft_fail_needed = 2  # more than once

    status_rows: list[JsonDict] = []
    evaluated: list[tuple[str, str, int | None, list[str], int, int, bool]] = []
    for key, label, last_ms, failed_labels, worst_age in devices:
        prior = previous.get(key) if isinstance(previous.get(key), dict) else {}
        streak = int(prior.get("failStreak") or 0)
        raw_failing = len(failed_labels) > 0
        if key in soft_fail_keys:
            streak = streak + 1 if raw_failing else 0
            failing = raw_failing and streak >= soft_fail_needed
            report_failed = failed_labels if failing else []
        else:
            streak = 0
            failing = raw_failing
            report_failed = failed_labels
        evaluated.append((key, label, last_ms, report_failed, worst_age, streak, failing))

        display = display_by_key.get(key)
        if display is not None and key not in soft_fail_keys and not report_failed:
            _, _, last_ms, report_failed, worst_age = display
            raw_failing = len(report_failed) > 0

        if last_ms is None and not report_failed and not raw_failing:
            succeeded: bool | None = None
            failure_started: int | None = None
            failed_sources: list[JsonDict] = []
        elif report_failed:
            succeeded = False
            failure_started = now - worst_age * 60_000
            failed_sources = [
                {
                    "label": name,
                    "ageMin": worst_age,
                    "sinceMs": failure_started,
                }
                for name in sorted(set(report_failed), key=str.lower)
            ]
        else:
            # Healthy, or soft-fail grace period (still treat as succeeded).
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

    # Every "failed" log entry / notification gets exactly one matching "resumed"
    # one: `notified` marks a logged failure, `alertSent` marks a sent notification.
    alerts_active = alert_enabled and (email_on or phone_on)
    to_log: list[JsonDict] = []
    for key, label, last_ms, report_failed, worst_age, streak, failing in evaluated:
        prior = previous.get(key) if isinstance(previous.get(key), dict) else {}
        saw_success = bool(prior.get("sawSuccess"))
        notified = bool(prior.get("notified"))
        alert_sent = bool(prior.get("alertSent"))
        failed_since = prior.get("failedSinceMs")
        failed_since = int(failed_since) if isinstance(failed_since, (int, float)) else None

        if last_ms is None and not report_failed and not failing:
            if prior:
                next_state[key] = {
                    "sawSuccess": saw_success,
                    "notified": notified,
                    "alertSent": alert_sent,
                    "failStreak": streak,
                    "failedSinceMs": failed_since,
                }
            continue

        if not failing:
            if notified:
                duration = format_duration(now - failed_since) if failed_since else None
                message = (
                    f"{label} resumed communication after {duration}."
                    if duration
                    else f"{label} resumed communication."
                )
                print(f"RESUMED {key}: {message}")
                to_log.append(
                    {
                        "action": "device_comm.resumed",
                        "entity_id": key,
                        "detail": {
                            "event": "resumed",
                            "title": "Device communication resumed",
                            "message": message,
                            "outageMs": (now - failed_since) if failed_since else None,
                        },
                    }
                )
                if alert_sent:
                    to_notify.append((key, "Device communication resumed", message))
            next_state[key] = {"sawSuccess": True, "notified": False, "failStreak": streak}
            continue

        if saw_success and not notified:
            since_ms = now - worst_age * 60_000
            message = failure_message(label, worst_age, report_failed)
            to_log.append(
                {
                    "action": "notify.alert",
                    "entity_id": key,
                    "detail": {
                        "event": "failed",
                        "title": "Device communication failure",
                        "message": message,
                    },
                }
            )
            # Missing keys default to enabled; explicit False mutes this device.
            muted = notify_enabled.get(key) is False
            send_alert = alerts_active and not muted
            if send_alert:
                to_notify.append((key, "Device communication failure", message))
            # Mark notified either way so unmute mid-outage does not immediately spam.
            next_state[key] = {
                "sawSuccess": True,
                "notified": True,
                "alertSent": send_alert,
                "failStreak": streak,
                "failedSinceMs": since_ms,
            }
        else:
            next_state[key] = {
                "sawSuccess": saw_success,
                "notified": notified,
                "alertSent": alert_sent,
                "failStreak": streak,
                "failedSinceMs": failed_since,
            }

    # Keep open outages for devices not evaluated this run so they still resume later.
    for key, prior in previous.items():
        if key not in next_state and isinstance(prior, dict) and prior.get("notified"):
            next_state[key] = prior

    _write_json(STATE_PATH, next_state)

    if to_log:
        try:
            from append_control_log import append_entry

            for item in to_log:
                append_entry(
                    source="system",
                    actor="device_comm_check",
                    action=item["action"],
                    entity_id=item["entity_id"],
                    ok=True,
                    detail=item["detail"],
                    kind="communication",
                )
        except Exception as err:
            print(f"WARN: communication log write failed: {err}", file=sys.stderr)

    # Resumed notices go out even if alerts were switched off mid-outage, so each
    # sent failure alert is always paired; failures are only queued when active.
    for key, title, message in to_notify:
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
        f"alerts={'on' if alerts_active else 'off'} notified={len(to_notify)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
