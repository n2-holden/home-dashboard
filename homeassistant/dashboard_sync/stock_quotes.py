#!/usr/bin/env python3
"""Run on the Home Assistant host only.

Fetches delayed quotes for dashboard-settings.json `stockSymbols` from Yahoo
Finance and writes /config/www/home-dashboard/stock-quotes.json for the home
page Stocks strip. Called from sync_caches.py every few minutes.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

JsonDict = dict[str, Any]

CONFIG_DIR = Path(os.environ.get("HA_CONFIG", "/config"))
WWW = CONFIG_DIR / "www" / "home-dashboard"
SETTINGS_PATH = WWW / "dashboard-settings.json"
QUOTES_PATH = WWW / "stock-quotes.json"
CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1d&interval=1d"
USER_AGENT = "Mozilla/5.0 (home-dashboard)"
CLOSED_REFRESH_S = 30 * 60
NEW_YORK = ZoneInfo("America/New_York")


def _load_json(path: Path) -> Any:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as err:
        print(f"WARN: could not read {path}: {err}", file=sys.stderr)
        return None


def _write_json(path: Path, payload: JsonDict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


FORMULA_SYMBOL_RE = re.compile(r"\^?[A-Za-z][A-Za-z0-9.=]*")


def configured_symbols() -> list[str]:
    """Display symbols plus any symbols referenced by calculated-value formulas."""
    settings = _load_json(SETTINGS_PATH)
    if not isinstance(settings, dict):
        return []
    out: list[str] = []

    def add(symbol: str) -> None:
        symbol = symbol.strip().upper()
        if symbol and symbol not in out:
            out.append(symbol)

    raw = settings.get("stockSymbols")
    for item in (raw if isinstance(raw, list) else [])[:20]:
        add(str(item or ""))
    formulas = settings.get("stockFormulas")
    for item in formulas if isinstance(formulas, list) else []:
        if isinstance(item, dict):
            for match in FORMULA_SYMBOL_RE.findall(str(item.get("formula") or "")):
                add(match)
    return out[:60]


def us_market_open(now: datetime) -> bool:
    """Regular session with a little margin (holidays still count as open)."""
    local = now.astimezone(NEW_YORK)
    if local.weekday() >= 5:
        return False
    minutes = local.hour * 60 + local.minute
    return 9 * 60 + 25 <= minutes <= 16 * 60 + 10


def fetch_quote(symbol: str) -> JsonDict:
    req = Request(CHART_URL.format(symbol=quote(symbol, safe="")), headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    result = (data.get("chart") or {}).get("result") or []
    if not result:
        raise ValueError("no data")
    meta = result[0].get("meta") or {}
    price = meta.get("regularMarketPrice")
    prev = meta.get("chartPreviousClose") or meta.get("previousClose")
    if not isinstance(price, (int, float)):
        raise ValueError("no price")
    change = price - prev if isinstance(prev, (int, float)) else None
    pct = (change / prev * 100) if change is not None and prev else None
    market_time = meta.get("regularMarketTime")
    return {
        "symbol": symbol,
        "name": meta.get("shortName") or meta.get("longName") or symbol,
        "price": round(float(price), 4),
        "change": round(change, 4) if change is not None else None,
        "changePercent": round(pct, 3) if pct is not None else None,
        "currency": meta.get("currency"),
        "marketTimeMs": int(market_time) * 1000 if isinstance(market_time, (int, float)) else None,
    }


def sync_stock_quotes(force: bool = False) -> bool:
    symbols = configured_symbols()
    now = datetime.now(timezone.utc)
    previous = _load_json(QUOTES_PATH)
    if not symbols:
        if isinstance(previous, dict) and previous.get("symbols"):
            _write_json(QUOTES_PATH, {"fetchedAt": now.isoformat(), "symbols": [], "quotes": []})
        return True

    if not force and isinstance(previous, dict) and previous.get("symbols") == symbols:
        try:
            last = datetime.fromisoformat(str(previous.get("fetchedAt")))
            age_s = (now - last).total_seconds()
        except ValueError:
            age_s = None
        if age_s is not None and not us_market_open(now) and age_s < CLOSED_REFRESH_S:
            return True

    old_quotes = {
        q.get("symbol"): q
        for q in (previous.get("quotes") if isinstance(previous, dict) else None) or []
        if isinstance(q, dict)
    }
    quotes: list[JsonDict] = []
    errors: dict[str, str] = {}
    for symbol in symbols:
        try:
            quotes.append(fetch_quote(symbol))
        except (URLError, HTTPError, TimeoutError, ValueError, json.JSONDecodeError, OSError) as err:
            errors[symbol] = str(err)
            if symbol in old_quotes:
                quotes.append({**old_quotes[symbol], "stale": True})
    _write_json(
        QUOTES_PATH,
        {
            "fetchedAt": now.isoformat(),
            "marketOpen": us_market_open(now),
            "symbols": symbols,
            "quotes": quotes,
            "errors": errors,
        },
    )
    print(f"Wrote {QUOTES_PATH} ({len(quotes)} quotes, {len(errors)} errors)")
    return True


if __name__ == "__main__":
    raise SystemExit(0 if sync_stock_quotes(force="--force" in sys.argv) else 1)
