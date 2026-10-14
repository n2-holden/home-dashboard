#!/usr/bin/env python3
"""Capture, index and prune DoorBird media for driveway alarm triggers.

Per event, in /config/www/driveway-events (served at /local/driveway-events/):
  <YYYYmmdd-HHMMSS>-1.jpg, -2.jpg, -3.jpg   snapshots ~2 s apart
  <YYYYmmdd-HHMMSS>.mp4                     10 s clip via camera.record

Snapshots come straight from the DoorBird (bha-api/image.cgi): HA's DoorBird
camera entity caches its still image for ~45 s, so camera.snapshot would
return a stale frame.

  (no args)            prune events older than RETENTION_DAYS, rewrite index.json
  --capture            take snapshots + clip, then keep re-indexing until the
                       clip lands (run detached by run_dashboard_action.py)
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import threading
import time
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen

EVENTS_DIR = Path("/config/www/driveway-events")
INDEX_PATH = EVENTS_DIR / "index.json"
LOCK_PATH = EVENTS_DIR / ".capture.lock"
CONFIG_ENTRIES = Path("/config/.storage/core.config_entries")
HA_CONFIG_PATH = Path("/config/www/home-dashboard/ha-config.json")
HA_API = os.environ.get("HA_URL", "http://127.0.0.1:8123").rstrip("/")
CAMERA_ENTITY = "camera.doorstation_1ccae375bf98_live"
RETENTION_DAYS = 7
MAX_EVENTS = 200
SNAPSHOT_COUNT = 3
SNAPSHOT_SPACING_S = 2.0
CLIP_SECONDS = 10
CAPTURE_COOLDOWN_S = CLIP_SECONDS + 5
CLIP_WAIT_S = 40
FILE_RE = re.compile(r"^(\d{8}-\d{6})(?:-(\d))?\.(jpg|mp4)$")


def _scan() -> dict[str, dict]:
    groups: dict[str, dict] = {}
    if not EVENTS_DIR.is_dir():
        return groups
    for path in EVENTS_DIR.iterdir():
        match = FILE_RE.match(path.name)
        if not match or not path.is_file():
            continue
        try:
            stat = path.stat()
        except OSError:
            continue
        if stat.st_size <= 0:
            continue
        stamp, idx, ext = match.groups()
        group = groups.setdefault(
            stamp, {"files": [], "snapshots": {}, "video": None, "mtimes": []}
        )
        group["files"].append(path)
        group["mtimes"].append(stat.st_mtime)
        if ext == "mp4":
            group["video"] = path.name
        else:
            group["snapshots"][int(idx or 1)] = path.name
    return groups


def prune_and_index() -> dict:
    cutoff = time.time() - RETENTION_DAYS * 86400
    groups = _scan()
    events = []
    for stamp, group in groups.items():
        if max(group["mtimes"]) < cutoff:
            for path in group["files"]:
                try:
                    path.unlink()
                except OSError as err:
                    print(f"WARN: could not delete {path}: {err}", file=sys.stderr)
            continue
        events.append(
            {
                "id": stamp,
                "timeMs": int(min(group["mtimes"]) * 1000),
                "snapshots": [group["snapshots"][k] for k in sorted(group["snapshots"])],
                "video": group["video"],
            }
        )
    events.sort(key=lambda e: e["id"], reverse=True)
    payload = {"updatedAtMs": int(time.time() * 1000), "events": events[:MAX_EVENTS]}
    EVENTS_DIR.mkdir(parents=True, exist_ok=True)
    tmp = INDEX_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    tmp.replace(INDEX_PATH)
    return payload


def _ha_token() -> str | None:
    env_token = os.environ.get("HA_TOKEN", "").strip()
    if env_token:
        return env_token
    try:
        token = json.loads(HA_CONFIG_PATH.read_text(encoding="utf-8-sig")).get("token")
    except (OSError, ValueError, AttributeError):
        return None
    return token.strip() if isinstance(token, str) and token.strip() else None


def _doorbird_entry() -> dict | None:
    try:
        data = json.loads(CONFIG_ENTRIES.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    for entry in data.get("data", {}).get("entries", []):
        if entry.get("domain") == "doorbird" and not entry.get("disabled_by"):
            info = entry.get("data") or {}
            if info.get("host"):
                return info
    return None


def _fetch_snapshot(doorbird: dict | None, token: str | None) -> bytes | None:
    if doorbird:
        auth = base64.b64encode(
            f"{doorbird.get('username', '')}:{doorbird.get('password', '')}".encode()
        ).decode()
        req = Request(
            f"http://{doorbird['host']}/bha-api/image.cgi",
            headers={"Authorization": f"Basic {auth}"},
        )
        try:
            with urlopen(req, timeout=8) as resp:
                body = resp.read()
            if body:
                return body
        except Exception as err:
            print(f"WARN: DoorBird image.cgi failed: {err}", file=sys.stderr)
    if token:
        req = Request(
            f"{HA_API}/api/camera_proxy/{CAMERA_ENTITY}",
            headers={"Authorization": f"Bearer {token}"},
        )
        try:
            with urlopen(req, timeout=10) as resp:
                return resp.read() or None
        except Exception as err:
            print(f"WARN: camera_proxy failed: {err}", file=sys.stderr)
    return None


def _record_clip(token: str, filename: Path) -> None:
    body = json.dumps(
        {"entity_id": CAMERA_ENTITY, "filename": str(filename), "duration": CLIP_SECONDS}
    ).encode("utf-8")
    req = Request(
        f"{HA_API}/api/services/camera/record",
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urlopen(req, timeout=CLIP_SECONDS + 30) as resp:
            resp.read()
    except Exception as err:
        print(f"WARN: camera.record failed: {err}", file=sys.stderr)


def _claim_capture_slot() -> bool:
    """Skip overlapping captures when the alarm retriggers mid-clip."""
    EVENTS_DIR.mkdir(parents=True, exist_ok=True)
    try:
        if time.time() - LOCK_PATH.stat().st_mtime < CAPTURE_COOLDOWN_S:
            return False
    except OSError:
        pass
    LOCK_PATH.write_text(str(time.time()), encoding="utf-8")
    return True


def capture() -> None:
    if not _claim_capture_slot():
        prune_and_index()
        return
    token = _ha_token()
    doorbird = _doorbird_entry()
    base = EVENTS_DIR / datetime.now().strftime("%Y%m%d-%H%M%S")
    clip = base.with_suffix(".mp4")
    recorder = None
    if token:
        recorder = threading.Thread(target=_record_clip, args=(token, clip), daemon=True)
        recorder.start()
    for i in range(1, SNAPSHOT_COUNT + 1):
        shot_at = time.time()
        image = _fetch_snapshot(doorbird, token)
        if image:
            target = base.parent / f"{base.name}-{i}.jpg"
            tmp = target.with_suffix(".part")
            tmp.write_bytes(image)
            tmp.replace(target)
        if i == 1:
            prune_and_index()
        if i < SNAPSHOT_COUNT:
            time.sleep(max(0.0, SNAPSHOT_SPACING_S - (time.time() - shot_at)))
    prune_and_index()
    if recorder is not None:
        recorder.join(timeout=CLIP_WAIT_S)
        deadline = time.time() + 10
        while not clip.exists() and time.time() < deadline:
            time.sleep(1)
        # Let the recorder finish flushing before the final index pass.
        time.sleep(2)
    prune_and_index()


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--capture", action="store_true")
    args = parser.parse_args(argv)
    if args.capture:
        capture()
    else:
        prune_and_index()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
