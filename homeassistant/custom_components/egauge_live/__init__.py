"""Poll eGauge power registers every second for the home dashboard."""

from __future__ import annotations

import asyncio
import json
import logging
import xml.etree.ElementTree as ET
from pathlib import Path

from aiohttp import ClientTimeout
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.util import dt as dt_util

_LOGGER = logging.getLogger(__name__)

DOMAIN = "egauge_live"
# The legacy XML API needs no login, unlike the JSON API the core integration uses.
# Host comes from the core eGauge integration when configured, so an IP change only
# needs fixing there; this is the fallback.
DEFAULT_EGAUGE_HOST = "192.168.4.113"
EGAUGE_PATH = "/cgi-bin/egauge?inst"
GRID_REGISTER = "Grid"
CACHE_NAME = "egauge-live.json"


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Start the 1-second eGauge poll loop."""
    try:
        hass.async_create_background_task(_poll_loop(hass), "egauge_live_poll")
    except AttributeError:
        hass.loop.create_task(_poll_loop(hass))
    return True


async def _poll_loop(hass: HomeAssistant) -> None:
    session = async_get_clientsession(hass)
    path = Path(hass.config.path("www", "home-dashboard", CACHE_NAME))
    timeout = ClientTimeout(total=4)

    while True:
        try:
            registers = await _fetch_registers(session, timeout, _egauge_host(hass))
            grid = next((r["watts"] for r in registers if r["name"] == GRID_REGISTER), None)
            if registers:
                payload = {
                    "gridWatts": grid,
                    "registers": registers,
                    "fetchedAt": dt_util.utcnow().isoformat(),
                }
                await hass.async_add_executor_job(_write_cache, path, payload)
            if grid is not None:
                hass.states.async_set(
                    "sensor.egauge_grid_live",
                    str(grid),
                    {
                        "unit_of_measurement": "W",
                        "device_class": "power",
                        "state_class": "measurement",
                        "friendly_name": "eGauge Grid Live",
                        "registers": registers,
                    },
                )
        except Exception as err:  # noqa: BLE001 — keep the loop alive
            _LOGGER.debug("eGauge live poll failed: %s", err)

        await asyncio.sleep(1)


def _egauge_host(hass: HomeAssistant) -> str:
    for entry in hass.config_entries.async_entries("egauge"):
        host = str(entry.data.get("host") or "").strip()
        if host:
            return host
    return DEFAULT_EGAUGE_HOST


async def _fetch_registers(session, timeout: ClientTimeout, host: str) -> list[dict]:
    """Power registers in device order: [{"name": "Grid", "watts": 3816}, ...]."""
    async with session.get(f"http://{host}{EGAUGE_PATH}", timeout=timeout) as resp:
        resp.raise_for_status()
        text = await resp.text()
    registers = []
    for row in ET.fromstring(text).findall("r"):
        if row.get("t") != "P":
            continue
        try:
            watts = int(float(row.findtext("i") or ""))
        except ValueError:
            continue
        registers.append({"name": row.get("n") or "", "watts": watts})
    return registers


def _write_cache(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")
