#!/usr/bin/env python3
"""Append one control-event line to www/home-dashboard/control-log.jsonl."""

from __future__ import annotations

import base64
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

WWW = Path("/config/www/home-dashboard")
LOG_PATH = WWW / "control-log.jsonl"
MAX_LINES = 2000
MAX_AGE_DAYS = 15


def decode_detail(raw: str):
    text = (raw or "").strip()
    if not text or text in {"-", "none", "null"}:
        return None
    try:
        padded = text + ("=" * (-len(text) % 4))
        decoded = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
        return json.loads(decoded)
    except Exception:
        return text


def entry_ts(line: str) -> datetime | None:
    try:
        parsed = json.loads(line)
    except Exception:
        return None
    if not isinstance(parsed, dict):
        return None
    raw = parsed.get("ts")
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        return None


def trim_log(path: Path) -> None:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    if not lines:
        return

    cutoff = datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)
    kept: list[str] = []
    for line in lines:
        text = line.strip()
        if not text:
            continue
        ts = entry_ts(text)
        # Keep unparseable lines unless we are over the line cap later.
        if ts is None or ts >= cutoff:
            kept.append(text)

    if len(kept) > MAX_LINES:
        kept = kept[-MAX_LINES:]

    if kept == [line.strip() for line in lines if line.strip()]:
        return

    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(("\n".join(kept) + "\n") if kept else "", encoding="utf-8")
    tmp.replace(path)


def clear_log(path: Path) -> None:
    WWW.mkdir(parents=True, exist_ok=True)
    path.write_text("", encoding="utf-8")


def main() -> int:
    if len(sys.argv) >= 2 and sys.argv[1].strip() in {"--clear", "clear"}:
        clear_log(LOG_PATH)
        print("Cleared control-log.jsonl")
        return 0

    # Preferred: source actor action entity_id ok detail_b64
    if len(sys.argv) < 6:
        print(
            "Usage: append_control_log.py <source> <actor> <action> <entity_id> <ok> [detail_b64]\n"
            "       append_control_log.py --clear",
            file=sys.stderr,
        )
        return 1

    source, actor, action, entity_id, ok_raw = [a.strip().strip('"') for a in sys.argv[1:6]]
    detail_b64 = sys.argv[6].strip().strip('"') if len(sys.argv) > 6 else ""
    ok = str(ok_raw).strip().lower() not in {"0", "false", "no", "off"}

    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "source": (source or "unknown")[:64],
        "actor": (actor or "unknown")[:128],
        "action": (action or "unknown")[:128],
        "entity_id": (entity_id or "")[:128] or None,
        "detail": decode_detail(detail_b64),
        "ok": ok,
    }

    WWW.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n")
    trim_log(LOG_PATH)
    print(f"Logged {entry['action']} ({entry['source']}/{entry['actor']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
