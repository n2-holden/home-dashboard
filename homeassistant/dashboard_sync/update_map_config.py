#!/usr/bin/env python3
"""Update depthOffset in pool-map.json or pond-map.json on the HA host."""

from __future__ import annotations

import json
import sys
from pathlib import Path

WWW = Path("/config/www/home-dashboard")
MAP_FILES = {
    "pool": WWW / "pool-map.json",
    "pond": WWW / "pond-map.json",
}


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: update_map_config.py <pool|pond> <offset>", file=sys.stderr)
        return 1

    kind = sys.argv[1].strip().lower()
    if kind not in MAP_FILES:
        print(f"Unknown map kind: {kind}", file=sys.stderr)
        return 1

    try:
        offset = float(sys.argv[2])
    except ValueError:
        print(f"Invalid offset: {sys.argv[2]}", file=sys.stderr)
        return 1

    path = MAP_FILES[kind]
    data: dict = {}
    if path.is_file():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                data = loaded
        except (OSError, json.JSONDecodeError) as err:
            print(f"WARN: could not read {path}: {err}", file=sys.stderr)

    data["depthOffset"] = offset
    data["depthOffsetUnit"] = "in"
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)
    print(f"Updated {path} depthOffset={offset}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
