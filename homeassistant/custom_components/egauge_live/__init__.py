"""Poll eGauge Grid watts every second for the home dashboard."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from pathlib import Path

from aiohttp import ClientTimeout
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.util import dt as dt_util

_LOGGER = logging.getLogger(__name__)

DOMAIN = "egauge_live"
EGAUGE_URL = "http://192.168.5.28/cgi-bin/egauge?inst"
GRID_RE = re.compile(r'n="Grid"[^>]*>.*?<i>(-?[0-9]+)</i>', re.DOTALL)
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
            watts = await _fetch_grid(session, timeout)
            if watts is not None:
                payload = {"gridWatts": watts, "fetchedAt": dt_util.utcnow().isoformat()}
                await hass.async_add_executor_job(_write_cache, path, payload)
                hass.states.async_set(
                    "sensor.egauge_grid_live",
                    str(watts),
                    {
                        "unit_of_measurement": "W",
                        "device_class": "power",
                        "state_class": "measurement",
                        "friendly_name": "eGauge Grid Live",
                    },
                )
        except Exception as err:  # noqa: BLE001 — keep the loop alive
            _LOGGER.debug("eGauge live poll failed: %s", err)

        await asyncio.sleep(1)


async def _fetch_grid(session, timeout: ClientTimeout) -> int | None:
    async with session.get(EGAUGE_URL, timeout=timeout) as resp:
        resp.raise_for_status()
        text = await resp.text()
    match = GRID_RE.search(text)
    return int(match.group(1)) if match else None


def _write_cache(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")
