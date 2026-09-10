#!/usr/bin/env python3
"""Send a dashboard notification email via HA's SMTP config entry."""

from __future__ import annotations

import argparse
import base64
import json
import re
import smtplib
import ssl
import sys
from email.message import EmailMessage
from pathlib import Path

STORAGE = Path("/config/.storage/core.config_entries")
ENTITY_REGISTRY = Path("/config/.storage/core.entity_registry")
DEFAULT_RECIPIENT = "holdencaine@hotmail.com"
DEFAULT_NOTIFY_ENTITY = "notify.stoneridge_holden_caine"


def decode_b64(raw: str) -> str:
    text = (raw or "").strip()
    if not text or text in {"-", "none", "null"}:
        return ""
    padded = text + ("=" * (-len(text) % 4))
    for decoder in (base64.urlsafe_b64decode, base64.b64decode):
        try:
            return decoder(padded.encode("ascii")).decode("utf-8")
        except Exception:
            continue
    return text

def load_smtp() -> dict:
    data = json.loads(STORAGE.read_text(encoding="utf-8"))
    for entry in data.get("data", {}).get("entries", []):
        if entry.get("domain") == "smtp":
            return dict(entry.get("data") or {})
    raise SystemExit("No SMTP config entry found")


def default_recipient_from_registry() -> str:
    try:
        data = json.loads(ENTITY_REGISTRY.read_text(encoding="utf-8"))
    except OSError:
        return DEFAULT_RECIPIENT
    for ent in data.get("data", {}).get("entities", []):
        if ent.get("entity_id") != DEFAULT_NOTIFY_ENTITY:
            continue
        unique = str(ent.get("unique_id") or "")
        # unique_id ends with _email@domain for UI SMTP recipients
        match = re.search(r"_([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})$", unique, re.I)
        if match:
            return match.group(1)
    return DEFAULT_RECIPIENT


def send_email(*, title: str, message: str, recipient: str) -> None:
    smtp = load_smtp()
    to_addr = (recipient or "").strip() or default_recipient_from_registry()
    if not to_addr or "@" not in to_addr:
        raise SystemExit(f"Invalid recipient: {to_addr!r}")

    msg = EmailMessage()
    msg["Subject"] = title or "Home dashboard"
    msg["From"] = (
        f'{smtp.get("sender_name", "Home Assistant")} <{smtp.get("sender")}>'
        if smtp.get("sender_name")
        else str(smtp.get("sender"))
    )
    msg["To"] = to_addr
    msg.set_content(message or "")

    host = str(smtp.get("server") or "localhost")
    port = int(smtp.get("port") or 587)
    username = smtp.get("username")
    password = smtp.get("password")
    encryption = str(smtp.get("encryption") or "starttls").lower()
    verify_ssl = bool(smtp.get("verify_ssl", True))

    context = ssl.create_default_context() if verify_ssl else ssl._create_unverified_context()

    if encryption == "tls" or port == 465:
        with smtplib.SMTP_SSL(host, port, context=context) as server:
            if username and password:
                server.login(str(username), str(password))
            server.send_message(msg)
        return

    with smtplib.SMTP(host, port, timeout=60) as server:
        server.ehlo()
        if encryption == "starttls":
            server.starttls(context=context)
            server.ehlo()
        if username and password:
            server.login(str(username), str(password))
        server.send_message(msg)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--title", default="")
    parser.add_argument("--message-b64", default="")
    parser.add_argument("--recipient", default="")
    args = parser.parse_args(argv)
    message = decode_b64(args.message_b64)
    send_email(title=args.title, message=message, recipient=args.recipient)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except SystemExit:
        raise
    except Exception as err:
        print(f"send_notify_email failed: {err}", file=sys.stderr)
        raise SystemExit(1)
