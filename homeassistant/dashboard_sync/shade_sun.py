#!/usr/bin/env python3
"""Sun-driven shade control on the HA host (replaces the Homebridge plugin's auto-sun).

Each window in shade_sun_config.json has the same geometry as the Homebridge
CrestronLutronShades plugin: the shade closes while the sun is inside the
window's azimuth cone and elevation band. Today's close/open intervals are
computed by stepping minute-by-minute from (sunrise - preSunriseMinutes) to
sunset; intervals of minCloseMinutes or less are dropped.

Per-shade edits from the dashboard are stored in shade-sun-overrides.json and
merged over shade_sun_config.json (which deploy overwrites):
  shade_sun.py --window <shadeId> <base64 JSON settings | reset>

Outputs (under /config/www/home-dashboard/):
  shade-schedule-today.json  today's intervals + effective settings per shade
  shade-sun-status.json      enabled flag and manual-hold times

Control runs only while input_boolean.shade_sun_automation is on. Commands are
sent only when the scheduled position changes (close at sun-in, open at sun-out);
a manual move stands until the next scheduled change.
"""

from __future__ import annotations

import base64
import json
import math
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

JsonDict = dict[str, Any]

CONFIG_DIR = Path(os.environ.get("HA_CONFIG", "/config"))
SYNC_DIR = Path(__file__).resolve().parent
WWW = CONFIG_DIR / "www" / "home-dashboard"
HA_CONFIG_PATH = WWW / "ha-config.json"
SHADE_MAP_PATH = WWW / "shade-map.json"
SCHEDULE_PATH = WWW / "shade-schedule-today.json"
STATUS_PATH = WWW / "shade-sun-status.json"
CONFIG_PATH = SYNC_DIR / "shade_sun_config.json"
STATE_PATH = WWW / "shade-sun-state.json"
OVERRIDES_PATH = WWW / "shade-sun-overrides.json"
ENTITY_REGISTRY_PATH = CONFIG_DIR / ".storage" / "core.entity_registry"
CORE_CONFIG_PATH = CONFIG_DIR / ".storage" / "core.config"
HA_API = os.environ.get("HA_API_URL", "http://127.0.0.1:8123")

ENABLED_ENTITY = "input_boolean.shade_sun_automation"
CRESTRON_UNIQUE_PREFIX = "crestron_home_cover_"

# Editable per-shade fields and their allowed ranges (None = boolean).
WINDOW_FIELDS: dict[str, tuple[float, float] | None] = {
    "autoSun": None,
    "windowAzimuth": (0, 360),
    "left": (0, 360),
    "right": (0, 360),
    "minElevation": (-90, 100),
    "maxElevation": (-90, 100),
    "closedPosition": (0, 100),
    "openPosition": (0, 100),
}

# --- SunCalc (https://github.com/mourner/suncalc), same math as the Homebridge plugin ---

RAD = math.pi / 180
DAY_MS = 86_400_000
J1970 = 2440588
J2000 = 2451545
OBLIQUITY = RAD * 23.4397
J0 = 0.0009


def _to_days(moment: datetime) -> float:
    return moment.timestamp() * 1000 / DAY_MS - 0.5 + J1970 - J2000


def _from_julian(j: float) -> datetime:
    return datetime.fromtimestamp((j + 0.5 - J1970) * DAY_MS / 1000, tz=timezone.utc)


def _right_ascension(l: float, b: float) -> float:
    return math.atan2(math.sin(l) * math.cos(OBLIQUITY) - math.tan(b) * math.sin(OBLIQUITY), math.cos(l))


def _declination(l: float, b: float) -> float:
    return math.asin(math.sin(b) * math.cos(OBLIQUITY) + math.cos(b) * math.sin(OBLIQUITY) * math.sin(l))


def _solar_mean_anomaly(d: float) -> float:
    return RAD * (357.5291 + 0.98560028 * d)


def _ecliptic_longitude(m: float) -> float:
    c = RAD * (1.9148 * math.sin(m) + 0.02 * math.sin(2 * m) + 0.0003 * math.sin(3 * m))
    return m + c + RAD * 102.9372 + math.pi


def sun_position(moment: datetime, lat: float, lng: float) -> tuple[float, float]:
    """(azimuth degrees clockwise from north, elevation degrees)."""
    lw = RAD * -lng
    phi = RAD * lat
    d = _to_days(moment)
    m = _solar_mean_anomaly(d)
    l = _ecliptic_longitude(m)
    dec = _declination(l, 0)
    ra = _right_ascension(l, 0)
    h = RAD * (280.16 + 360.9856235 * d) - lw - ra
    azimuth = math.atan2(math.sin(h), math.cos(h) * math.sin(phi) - math.tan(dec) * math.cos(phi))
    altitude = math.asin(math.sin(phi) * math.sin(dec) + math.cos(phi) * math.cos(dec) * math.cos(h))
    return (180 + azimuth / RAD + 360) % 360, altitude / RAD


def sunrise_sunset(noon: datetime, lat: float, lng: float) -> tuple[datetime, datetime]:
    lw = RAD * -lng
    phi = RAD * lat
    d = _to_days(noon)
    n = round(d - J0 - lw / (2 * math.pi))
    ds = J0 + lw / (2 * math.pi) + n
    m = _solar_mean_anomaly(ds)
    l = _ecliptic_longitude(m)
    dec = _declination(l, 0)
    j_noon = J2000 + ds + 0.0053 * math.sin(m) - 0.0069 * math.sin(2 * l)
    h0 = -0.833 * RAD
    w = math.acos((math.sin(h0) - math.sin(phi) * math.sin(dec)) / (math.cos(phi) * math.cos(dec)))
    a = J0 + (w + lw) / (2 * math.pi) + n
    j_set = J2000 + a + 0.0053 * math.sin(m) - 0.0069 * math.sin(2 * l)
    j_rise = j_noon - (j_set - j_noon)
    return _from_julian(j_rise), _from_julian(j_set)


def sun_in_window(azimuth: float, elevation: float, window: JsonDict) -> bool:
    center = float(window["windowAzimuth"])
    left = float(window["left"])
    right = float(window["right"])
    in_azimuth = (center - left <= azimuth <= center + right) or (
        center - left <= azimuth - 360 <= center + right
    )
    in_elevation = float(window["minElevation"]) < elevation <= float(window["maxElevation"])
    return in_azimuth and in_elevation


def day_intervals(
    day: date, tz: ZoneInfo, cfg: JsonDict, windows: list[JsonDict]
) -> tuple[datetime, datetime, dict[int, list[tuple[datetime, datetime]]]]:
    lat = float(cfg["latitude"])
    lng = float(cfg["longitude"])
    noon = datetime(day.year, day.month, day.day, 12, tzinfo=tz)
    sunrise, sunset = sunrise_sunset(noon, lat, lng)
    t = sunrise - timedelta(minutes=float(cfg.get("preSunriseMinutes", 60)))
    min_close = timedelta(minutes=float(cfg.get("minCloseMinutes", 15)))

    raw: dict[int, list[list[datetime | None]]] = {int(w["shadeId"]): [] for w in windows}
    inside: dict[int, bool] = {int(w["shadeId"]): False for w in windows}
    while t <= sunset:
        azimuth, elevation = sun_position(t, lat, lng)
        for w in windows:
            sid = int(w["shadeId"])
            now_in = sun_in_window(azimuth, elevation, w)
            if now_in and not inside[sid]:
                raw[sid].append([t, None])
            elif not now_in and inside[sid] and raw[sid]:
                raw[sid][-1][1] = t
            inside[sid] = now_in
        t += timedelta(minutes=1)

    result: dict[int, list[tuple[datetime, datetime]]] = {}
    for sid, spans in raw.items():
        kept: list[tuple[datetime, datetime]] = []
        for close_at, open_at in spans:
            end = open_at or sunset
            if end - close_at > min_close:
                kept.append((close_at, end))
        result[sid] = kept
    return sunrise, sunset, result


# --- HA helpers ---


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


def _api(path: str, *, token: str, body: JsonDict | None = None) -> Any:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = Request(
        f"{HA_API}{path}",
        data=data,
        method="GET" if body is None else "POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    with urlopen(req, timeout=30) as res:
        raw = res.read()
        return json.loads(raw.decode("utf-8")) if raw else None


def _time_zone() -> ZoneInfo:
    core = _load_json(CORE_CONFIG_PATH)
    name = None
    if isinstance(core, dict):
        name = (core.get("data") or {}).get("time_zone")
    try:
        return ZoneInfo(name or os.environ.get("TZ") or "America/Denver")
    except Exception:
        return ZoneInfo("America/Denver")


def _crestron_entities() -> dict[int, str]:
    reg = _load_json(ENTITY_REGISTRY_PATH)
    out: dict[int, str] = {}
    if not isinstance(reg, dict):
        return out
    for entry in (reg.get("data") or {}).get("entities", []):
        unique = str(entry.get("unique_id", ""))
        if entry.get("platform") == "crestron_home" and unique.startswith(CRESTRON_UNIQUE_PREFIX):
            try:
                out[int(unique[len(CRESTRON_UNIQUE_PREFIX):])] = entry["entity_id"]
            except ValueError:
                continue
    return out


def _append_control_log(action: str, entity_id: str, ok: bool, detail: Any = None) -> None:
    try:
        from append_control_log import append_entry

        append_entry(
            source="automation",
            actor="Shade schedule",
            action=action,
            entity_id=entity_id,
            ok=ok,
            detail=detail,
        )
    except Exception as err:
        print(f"WARN: control log write failed: {err}", file=sys.stderr)


def _hhmm(moment: datetime, tz: ZoneInfo) -> str:
    return moment.astimezone(tz).strftime("%H:%M")


def _ms(moment: datetime) -> int:
    return int(moment.timestamp() * 1000)


# --- per-shade overrides ---


def _window_settings(window: JsonDict) -> JsonDict:
    return {key: window[key] for key in WINDOW_FIELDS if key in window}


def _load_overrides() -> dict[str, JsonDict]:
    data = _load_json(OVERRIDES_PATH)
    windows = data.get("windows") if isinstance(data, dict) else None
    return {str(k): v for k, v in windows.items() if isinstance(v, dict)} if isinstance(windows, dict) else {}


def apply_overrides(cfg: JsonDict) -> tuple[JsonDict, dict[int, JsonDict]]:
    """Return (config with overrides merged, default settings by shadeId)."""
    overrides = _load_overrides()
    defaults: dict[int, JsonDict] = {}
    windows = []
    for w in cfg.get("windows", []):
        if not w.get("shadeId"):
            continue
        sid = int(w["shadeId"])
        defaults[sid] = _window_settings(w)
        windows.append({**w, **_window_settings(overrides.get(str(sid), {}))})
    return {**cfg, "windows": windows}, defaults


def _validate_settings(raw: Any) -> JsonDict:
    if not isinstance(raw, dict):
        raise ValueError("settings must be an object")
    clean: JsonDict = {}
    for key, bounds in WINDOW_FIELDS.items():
        if key not in raw:
            continue
        value = raw[key]
        if bounds is None:
            if not isinstance(value, bool):
                raise ValueError(f"{key} must be true or false")
            clean[key] = value
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f"{key} must be a number")
        if not bounds[0] <= value <= bounds[1]:
            raise ValueError(f"{key} must be between {bounds[0]} and {bounds[1]}")
        clean[key] = int(value) if float(value).is_integer() else float(value)
    if "minElevation" in clean and "maxElevation" in clean and clean["minElevation"] >= clean["maxElevation"]:
        raise ValueError("minElevation must be below maxElevation")
    return clean


def set_window(cfg: JsonDict, shade_arg: str, payload: str) -> str:
    """Save (or reset with payload 'reset') one shade's settings. Returns a log message."""
    sid = int(shade_arg)
    base = next((w for w in cfg.get("windows", []) if int(w.get("shadeId") or 0) == sid), None)
    if base is None:
        raise ValueError(f"unknown shade {sid}")
    data = _load_json(OVERRIDES_PATH)
    if not isinstance(data, dict) or not isinstance(data.get("windows"), dict):
        data = {"windows": {}}
    if payload.strip().lower() == "reset":
        data["windows"].pop(str(sid), None)
        message = f"Reset {base.get('name', sid)} to defaults"
    else:
        settings = _validate_settings(json.loads(base64.b64decode(payload).decode("utf-8")))
        defaults = _window_settings(base)
        changed = {k: v for k, v in settings.items() if defaults.get(k) != v}
        if changed:
            data["windows"][str(sid)] = changed
        else:
            data["windows"].pop(str(sid), None)
        message = f"Updated {base.get('name', sid)} settings"
    data["updatedAt"] = datetime.now(timezone.utc).isoformat()
    _write_json(OVERRIDES_PATH, data)
    return message


# --- main ---


def build_schedule(
    cfg: JsonDict,
    tz: ZoneInfo,
    today: date,
    entities: dict[int, str],
    shade_keys: dict[str, str],
    defaults: dict[int, JsonDict],
) -> JsonDict:
    windows = [w for w in cfg.get("windows", []) if w.get("shadeId")]
    auto = [w for w in windows if w.get("autoSun", True)]
    sunrise, sunset, intervals = day_intervals(today, tz, cfg, auto)
    shades = []
    for w in windows:
        sid = int(w["shadeId"])
        entity_id = entities.get(sid)
        spans = intervals.get(sid, []) if w.get("autoSun", True) else []
        settings = _window_settings(w)
        row: JsonDict = {
            "shadeId": sid,
            "shadeKey": shade_keys.get(entity_id or ""),
            "entityId": entity_id,
            "name": w.get("name") or str(sid),
            "autoSun": bool(w.get("autoSun", True)),
            "closes": [_hhmm(a, tz) for a, _ in spans],
            "opens": [_hhmm(b, tz) for _, b in spans],
            "intervals": [{"closeMs": _ms(a), "openMs": _ms(b)} for a, b in spans],
            "settings": settings,
            "defaults": defaults.get(sid, settings),
            "customized": settings != defaults.get(sid, settings),
        }
        if not row["autoSun"]:
            row["note"] = "automatic control off"
        elif not spans:
            row["note"] = "no sun through window today"
        shades.append(row)
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "home-assistant",
        "date": today.isoformat(),
        "timeZone": str(tz),
        "latitude": cfg["latitude"],
        "longitude": cfg["longitude"],
        "sunrise": _hhmm(sunrise, tz),
        "sunset": _hhmm(sunset, tz),
        "sunriseMs": _ms(sunrise),
        "sunsetMs": _ms(sunset),
        "preSunriseMinutes": cfg.get("preSunriseMinutes", 60),
        "minCloseMinutes": cfg.get("minCloseMinutes", 15),
        "shadeCount": len(shades),
        "shades": shades,
    }


def schedule_is_current(schedule: Any, today: date) -> bool:
    if not isinstance(schedule, dict) or schedule.get("source") != "home-assistant":
        return False
    if schedule.get("date") != today.isoformat():
        return False
    generated = SCHEDULE_PATH.stat().st_mtime
    if "settings" not in (schedule.get("shades") or [{}])[0]:
        return False
    for dep in (CONFIG_PATH, OVERRIDES_PATH, SHADE_MAP_PATH, ENTITY_REGISTRY_PATH):
        if dep.is_file() and dep.stat().st_mtime > generated:
            return False
    return True


def run_control(schedule: JsonDict, cfg: JsonDict, token: str, state: JsonDict, now_ms: int) -> bool:
    states = {s["entity_id"]: s for s in _api("/api/states", token=token) or []}
    enabled = str((states.get(ENABLED_ENTITY) or {}).get("state", "")).lower() == "on"
    if not enabled:
        state["entities"] = {}
        return False

    tracked: JsonDict = state.setdefault("entities", {})
    windows = {int(w["shadeId"]): w for w in cfg.get("windows", []) if w.get("shadeId")}

    for row in schedule["shades"]:
        entity_id = row.get("entityId")
        window = windows.get(int(row["shadeId"]))
        if not row.get("autoSun") or not entity_id or not window:
            continue
        cover = states.get(entity_id)
        position = (cover or {}).get("attributes", {}).get("current_position")
        if not isinstance(position, (int, float)):
            continue
        position = float(position)
        closed = any(iv["closeMs"] <= now_ms < iv["openMs"] for iv in row["intervals"])
        target = float(window.get("closedPosition", 0) if closed else window.get("openPosition", 100))

        entry = tracked.setdefault(entity_id, {})
        last_target = entry.get("lastAutoTarget")
        if not isinstance(last_target, (int, float)):
            # Take over without moving anything; act from the next scheduled change.
            tracked[entity_id] = {"lastAutoTarget": target, "lastCommandMs": 0}
            continue
        # Only a scheduled change moves a shade; manual moves stand until then.
        if abs(last_target - target) <= 1:
            continue
        if abs(position - target) <= 1:
            entry["lastAutoTarget"] = target
            continue

        verb = "Close" if closed else "Open"
        try:
            _api(
                "/api/services/cover/set_cover_position",
                token=token,
                body={"entity_id": entity_id, "position": int(target)},
            )
            ok = True
        except (HTTPError, URLError, TimeoutError) as err:
            print(f"WARN: {verb} {entity_id} failed: {err}", file=sys.stderr)
            ok = False
        _append_control_log(
            f"{verb} {row['name']}",
            entity_id,
            ok,
            {"reason": "sun in window" if closed else "sun left window", "position": int(target)},
        )
        if ok:
            entry["lastAutoTarget"] = target
            entry["lastCommandMs"] = now_ms
    return True


def main() -> int:
    base_cfg = _load_json(CONFIG_PATH)
    if not isinstance(base_cfg, dict) or not base_cfg.get("windows"):
        print(f"ERROR: {CONFIG_PATH} missing or has no windows", file=sys.stderr)
        return 1

    edit_only = False
    if "--window" in sys.argv:
        idx = sys.argv.index("--window")
        try:
            message = set_window(base_cfg, sys.argv[idx + 1], sys.argv[idx + 2])
        except (IndexError, ValueError, json.JSONDecodeError) as err:
            print(f"ERROR: {err}", file=sys.stderr)
            return 1
        print(message)
        edit_only = True

    cfg, defaults = apply_overrides(base_cfg)
    tz = _time_zone()
    now = datetime.now(tz)
    today = now.date()
    shade_map = _load_json(SHADE_MAP_PATH)
    shade_keys = {str(v): str(k) for k, v in shade_map.items()} if isinstance(shade_map, dict) else {}

    schedule = _load_json(SCHEDULE_PATH)
    schedule_only = edit_only or "--schedule-only" in sys.argv
    if schedule_only or not schedule_is_current(schedule, today):
        schedule = build_schedule(cfg, tz, today, _crestron_entities(), shade_keys, defaults)
        _write_json(SCHEDULE_PATH, schedule)
        print(f"Wrote {SCHEDULE_PATH}")
    if schedule_only:
        return 0

    token = _ha_token()
    if not token:
        print("ERROR: no HA token (ha-config.json)", file=sys.stderr)
        return 1

    state = _load_json(STATE_PATH)
    if not isinstance(state, dict):
        state = {}
    now_ms = _ms(now)
    try:
        enabled = run_control(schedule, cfg, token, state, now_ms)
    except (HTTPError, URLError, TimeoutError) as err:
        print(f"ERROR: HA API failed: {err}", file=sys.stderr)
        return 1
    _write_json(STATE_PATH, state)

    _write_json(
        STATUS_PATH,
        {"updatedAt": datetime.now(timezone.utc).isoformat(), "enabled": enabled},
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
