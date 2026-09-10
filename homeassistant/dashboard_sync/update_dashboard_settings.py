#!/usr/bin/env python3
"""Merge patch into www/home-dashboard/dashboard-settings.json."""

from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path

WWW = Path("/config/www/home-dashboard")
SETTINGS_PATH = WWW / "dashboard-settings.json"

DEFAULTS = {
    "poolPumpOffEmailEnabled": True,
    "deviceCommFailureEmailEnabled": False,
    "deviceCommFailureMinutes": 15,
    "commandFailedEmailEnabled": False,
    "notifyEmailEnabled": True,
    "notifyPhoneEnabled": False,
    "notifyEmailOverride": "",
    "notifyPhoneTarget": "notify.holdens_iphone",
    "poolLowWaterEmailEnabled": False,
    "poolLowWaterInches": -1,
    "pondLowWaterEmailEnabled": False,
    "pondLowWaterInches": -2,
    "cisternLowWaterEmailEnabled": False,
    "cisternLowWaterPercent": 50,
    "poolPumpAutoOnEnabled": False,
    "poolPumpAutoOnMinutes": 10,
    "shedPowerOnBelow": 20,
    "shedPowerOffAbove": 80,
}


def decode_b64(raw: str) -> dict:
    text = (raw or "").strip()
    if not text or text in {"-", "none", "null"}:
        return {}
    padded = text + ("=" * (-len(text) % 4))
    for decoder in (base64.urlsafe_b64decode, base64.b64decode):
        try:
            decoded = decoder(padded.encode("ascii")).decode("utf-8")
            parsed = json.loads(decoded)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            continue
    return {}


def load_settings() -> dict:
    data = dict(DEFAULTS)
    if SETTINGS_PATH.is_file():
        try:
            loaded = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                data.update(loaded)
        except (OSError, json.JSONDecodeError) as err:
            print(f"WARN: could not read {SETTINGS_PATH}: {err}", file=sys.stderr)
    return data


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--patch-b64", required=True)
    args = parser.parse_args()
    patch = decode_b64(args.patch_b64)
    data = load_settings()
    data.update(patch)
    WWW.mkdir(parents=True, exist_ok=True)
    tmp = SETTINGS_PATH.with_suffix(SETTINGS_PATH.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    tmp.replace(SETTINGS_PATH)
    print(f"Updated {SETTINGS_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
