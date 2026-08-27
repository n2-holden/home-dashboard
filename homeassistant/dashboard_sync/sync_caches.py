#!/usr/bin/env python3
"""Run on the Home Assistant host only.

Pulls data from LAN devices (Homebridge, local HA API) and writes cache JSON
files under /config/www/home-dashboard/ for dashboards to consume.

Schedule via HA shell_command + automation (see README.md).
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

JsonDict = dict[str, Any]

CONFIG_DIR = Path(os.environ.get("HA_CONFIG", "/config"))
WWW = CONFIG_DIR / "www" / "home-dashboard"
SHADE_MAP_PATH = WWW / "shade-map.json"
HA_CONFIG_PATH = WWW / "ha-config.json"
HOMEBRIDGE_URL = os.environ.get(
    "HOMEBRIDGE_SCHEDULE_URL", "http://homebridge.local:8787/schedule.json"
)
HA_API = os.environ.get("HA_API_URL", "http://127.0.0.1:8123")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_json(path: Path) -> JsonDict | list[Any] | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as err:
        print(f"WARN: could not read {path}: {err}", file=sys.stderr)
        return None


def _write_json(path: Path, payload: JsonDict | list[Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)
    print(f"Wrote {path}")


def _fetch(url: str, *, headers: dict[str, str] | None = None, timeout: float = 20) -> bytes:
    req = Request(url, headers=headers or {})
    with urlopen(req, timeout=timeout) as resp:
        return resp.read()


def sync_homebridge_schedule() -> bool:
    """Fetch Homebridge schedule JSON and write shade-schedule-today.json."""
    try:
        raw = _fetch(HOMEBRIDGE_URL)
        data = json.loads(raw.decode("utf-8"))
    except (URLError, TimeoutError, json.JSONDecodeError) as err:
        print(f"WARN: Homebridge schedule fetch failed: {err}", file=sys.stderr)
        return False

    if not isinstance(data, dict) or not isinstance(data.get("shades"), list):
        print("WARN: Homebridge response missing shades array", file=sys.stderr)
        return False

    payload: JsonDict = {
        "generatedAt": _utc_now(),
        "source": HOMEBRIDGE_URL,
        "shadeCount": len(data["shades"]),
        "shades": data["shades"],
    }
    _write_json(WWW / "shade-schedule-today.json", payload)
    return True


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


def _closed_percent(state: JsonDict) -> int | None:
    attrs = state.get("attributes")
    if not isinstance(attrs, dict):
        attrs = {}
    raw = attrs.get("current_position")
    if isinstance(raw, (int, float)):
        return max(0, min(100, round(100 - float(raw))))
    cover_state = str(state.get("state", "")).lower()
    if cover_state == "closed":
        return 100
    if cover_state == "open":
        return 0
    if cover_state in ("opening", "closing"):
        return 50
    return None


def sync_shades_cache() -> bool:
    """Snapshot cover positions for shade-map entities via local HA API."""
    token = _ha_token()
    if not token:
        print("WARN: no HA token (set HA_TOKEN or ha-config.json token on HA box)", file=sys.stderr)
        return False

    shade_map = _load_json(SHADE_MAP_PATH)
    if not isinstance(shade_map, dict) or not shade_map:
        print("WARN: shade-map.json missing or empty", file=sys.stderr)
        return False

    entity_ids = sorted({str(v) for v in shade_map.values() if v})
    if not entity_ids:
        return False

    try:
        raw = _fetch(
            f"{HA_API}/api/states",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
        states = json.loads(raw.decode("utf-8"))
    except (URLError, TimeoutError, json.JSONDecodeError) as err:
        print(f"WARN: HA states fetch failed: {err}", file=sys.stderr)
        return False

    if not isinstance(states, list):
        print("WARN: HA /api/states returned unexpected payload", file=sys.stderr)
        return False

    by_entity: dict[str, JsonDict] = {}
    for item in states:
        if isinstance(item, dict) and isinstance(item.get("entity_id"), str):
            by_entity[item["entity_id"]] = item

    shades: JsonDict = {}
    for shade_id, entity_id in shade_map.items():
        state = by_entity.get(str(entity_id))
        if not state:
            continue
        position = _closed_percent(state)
        shades[str(shade_id)] = {
            "entityId": str(entity_id),
            "state": state.get("state"),
            "position": position,
        }

    payload: JsonDict = {
        "generatedAt": _utc_now(),
        "shadeCount": len(shades),
        "shades": shades,
    }
    _write_json(WWW / "shades-cache.json", payload)
    return True


def main() -> int:
    print(f"Dashboard cache sync @ {WWW}")
    ok_schedule = sync_homebridge_schedule()
    ok_shades = sync_shades_cache()
    if not ok_schedule and not ok_shades:
        print("ERROR: no caches updated", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
