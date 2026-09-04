#!/usr/bin/env python3
"""Print instantaneous Grid watts from the local eGauge XML API.

The core eGauge integration only refreshes every 10–30s (coordinator debounce).
This script is polled by a command_line sensor every second.
"""

from __future__ import annotations

import urllib.request
import xml.etree.ElementTree as ET

EGAUGE_INST_URL = "http://192.168.5.28/cgi-bin/egauge?inst"


def main() -> int:
    try:
        with urllib.request.urlopen(EGAUGE_INST_URL, timeout=3) as resp:
            root = ET.fromstring(resp.read())
    except Exception:
        print("unavailable")
        return 0

    for row in root.findall("r"):
        if row.get("n") == "Grid":
            print(row.findtext("i") or "unavailable")
            return 0

    print("unavailable")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
