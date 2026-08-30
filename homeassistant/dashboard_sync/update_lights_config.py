#!/usr/bin/env python3
"""Update the room assigned to a Crestron light entity."""

from __future__ import annotations

import json
import sys
from pathlib import Path

WWW = Path("/config/www/home-dashboard")
CONFIG = WWW / "lights-map.json"


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: update_lights_config.py <light.entity_id> <room>", file=sys.stderr)
        return 1

    entity_id = sys.argv[1].strip()
    room = sys.argv[2].strip()
    if not entity_id.startswith("light."):
        print(f"Invalid light entity: {entity_id}", file=sys.stderr)
        return 1
    if not room:
        print("Room name cannot be empty", file=sys.stderr)
        return 1

    data: dict[str, str] = {}
    if CONFIG.is_file():
        try:
            loaded = json.loads(CONFIG.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                data = {
                    str(key): str(value)
                    for key, value in loaded.items()
                    if isinstance(key, str) and isinstance(value, str)
                }
        except (OSError, json.JSONDecodeError) as err:
            print(f"WARN: could not read {CONFIG}: {err}", file=sys.stderr)

    data[entity_id] = room
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    tmp = CONFIG.with_suffix(CONFIG.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    tmp.replace(CONFIG)
    print(f"Updated {CONFIG}: {entity_id} → {room}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
