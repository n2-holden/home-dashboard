#!/usr/bin/env python3
"""Append one control-event line to activity or communication logs.

Writes under www/home-dashboard/:
  - activity-log.jsonl — successful controls / automations
  - communication-log.jsonl — failed commands and connectivity alerts

Legacy control-log.jsonl is migrated into the split files on first write/clear.
"""

from __future__ import annotations

import base64
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

WWW = Path("/config/www/home-dashboard")
LEGACY_LOG_PATH = WWW / "control-log.jsonl"
ACTIVITY_LOG_PATH = WWW / "activity-log.jsonl"
COMMUNICATION_LOG_PATH = WWW / "communication-log.jsonl"
MAX_LINES = 2000
MAX_AGE_DAYS = 15

KIND_ACTIVITY = "activity"
KIND_COMMUNICATION = "communication"
KINDS = (KIND_ACTIVITY, KIND_COMMUNICATION)

_COMM_ACTOR_RE = re.compile(
    r"internet|device[_\s-]?comm|command[_\s-]?failed|communication",
    re.IGNORECASE,
)
_COMM_ACTION_RE = re.compile(
    r"^(device[_\s.-]?comm|internet[_\s.-]|comm[_\s.-])",
    re.IGNORECASE,
)


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


def classify_entry(entry: dict[str, Any]) -> str:
    """Route failed commands and connectivity alerts to the communication log."""
    if entry.get("ok") is False:
        return KIND_COMMUNICATION
    action = str(entry.get("action") or "")
    actor = str(entry.get("actor") or "")
    if _COMM_ACTION_RE.search(action):
        return KIND_COMMUNICATION
    if action.lower() == "notify.alert" and _COMM_ACTOR_RE.search(actor):
        return KIND_COMMUNICATION
    return KIND_ACTIVITY


def log_path_for(kind: str) -> Path:
    if kind == KIND_COMMUNICATION:
        return COMMUNICATION_LOG_PATH
    return ACTIVITY_LOG_PATH


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
        if ts is None or ts >= cutoff:
            kept.append(text)

    if len(kept) > MAX_LINES:
        kept = kept[-MAX_LINES:]

    if kept == [line.strip() for line in lines if line.strip()]:
        return

    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(("\n".join(kept) + "\n") if kept else "", encoding="utf-8")
    tmp.replace(path)


def clear_log(kind: str | None = None) -> None:
    WWW.mkdir(parents=True, exist_ok=True)
    migrate_legacy_log()
    targets = KINDS if kind in (None, "", "all", "both") else (kind,)
    for target in targets:
        if target not in KINDS:
            raise ValueError(f"Unknown log kind: {target}")
        log_path_for(target).write_text("", encoding="utf-8")
    if kind in (None, "", "all", "both") and LEGACY_LOG_PATH.exists():
        LEGACY_LOG_PATH.write_text("", encoding="utf-8")


def _read_lines(path: Path) -> list[str]:
    try:
        return [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    except OSError:
        return []


def migrate_legacy_log() -> None:
    """Split legacy control-log.jsonl into activity/communication once."""
    if not LEGACY_LOG_PATH.exists():
        return
    legacy_lines = _read_lines(LEGACY_LOG_PATH)
    if not legacy_lines:
        try:
            LEGACY_LOG_PATH.unlink()
        except OSError:
            LEGACY_LOG_PATH.write_text("", encoding="utf-8")
        return

    buckets: dict[str, list[str]] = {KIND_ACTIVITY: [], KIND_COMMUNICATION: []}
    for line in legacy_lines:
        try:
            parsed = json.loads(line)
        except Exception:
            buckets[KIND_ACTIVITY].append(line)
            continue
        if not isinstance(parsed, dict):
            buckets[KIND_ACTIVITY].append(line)
            continue
        buckets[classify_entry(parsed)].append(line)

    WWW.mkdir(parents=True, exist_ok=True)
    for kind, lines in buckets.items():
        if not lines:
            continue
        path = log_path_for(kind)
        existing = _read_lines(path)
        merged = existing + lines
        if len(merged) > MAX_LINES:
            merged = merged[-MAX_LINES:]
        path.write_text(("\n".join(merged) + "\n") if merged else "", encoding="utf-8")
        trim_log(path)

    migrated = LEGACY_LOG_PATH.with_suffix(".jsonl.migrated")
    try:
        LEGACY_LOG_PATH.replace(migrated)
    except OSError:
        LEGACY_LOG_PATH.write_text("", encoding="utf-8")


def append_entry(
    *,
    source: str,
    actor: str,
    action: str,
    entity_id: str | None = None,
    ok: bool = True,
    detail: Any = None,
    kind: str | None = None,
) -> dict[str, Any]:
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "source": (source or "unknown")[:64],
        "actor": (actor or "unknown")[:128],
        "action": (action or "unknown")[:128],
        "entity_id": (entity_id or "")[:128] or None,
        "detail": detail,
        "ok": ok,
    }
    resolved = kind if kind in KINDS else classify_entry(entry)
    migrate_legacy_log()
    WWW.mkdir(parents=True, exist_ok=True)
    path = log_path_for(resolved)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n")
    trim_log(path)
    return entry


def main() -> int:
    if len(sys.argv) >= 2 and sys.argv[1].strip() in {"--clear", "clear"}:
        kind = sys.argv[2].strip().lower() if len(sys.argv) > 2 else "all"
        try:
            clear_log(None if kind in {"all", "both", ""} else kind)
        except ValueError as err:
            print(str(err), file=sys.stderr)
            return 1
        label = kind if kind not in {"all", "both", ""} else "activity+communication"
        print(f"Cleared {label} log(s)")
        return 0

    # Preferred: source actor action entity_id ok detail_b64
    if len(sys.argv) < 6:
        print(
            "Usage: append_control_log.py <source> <actor> <action> <entity_id> <ok> [detail_b64]\n"
            "       append_control_log.py --clear [activity|communication|all]",
            file=sys.stderr,
        )
        return 1

    source, actor, action, entity_id, ok_raw = [a.strip().strip('"') for a in sys.argv[1:6]]
    detail_b64 = sys.argv[6].strip().strip('"') if len(sys.argv) > 6 else ""
    ok = str(ok_raw).strip().lower() not in {"0", "false", "no", "off"}

    entry = append_entry(
        source=source,
        actor=actor,
        action=action,
        entity_id=entity_id,
        ok=ok,
        detail=decode_detail(detail_b64),
    )
    kind = classify_entry(entry)
    print(f"Logged {entry['action']} → {kind} ({entry['source']}/{entry['actor']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
