"""Shared AlsoEnergy snapshot cache — one API caller for all consumers."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .api import AlsoEnergyApiError, AlsoEnergyAuthError, AlsoEnergyClient
from .const import CACHE_FILENAME, CACHE_MANAGER_KEY, DEFAULT_SCAN_INTERVAL, DOMAIN

_LOGGER = logging.getLogger(__name__)

JsonDict = dict[str, Any]


def get_cache_manager(hass: HomeAssistant) -> AlsoEnergyCacheManager:
    """Return the domain-wide cache manager (single API gatekeeper)."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    manager = domain_data.get(CACHE_MANAGER_KEY)
    if manager is None:
        manager = AlsoEnergyCacheManager(hass)
        domain_data[CACHE_MANAGER_KEY] = manager
    return manager


class AlsoEnergyCacheManager:
    """Serialize API access and persist snapshots for dashboard consumers."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._lock = asyncio.Lock()
        self._memory: JsonDict | None = None
        self._last_api_monotonic: float | None = None

    @property
    def cache_path(self) -> Path:
        return Path(self._hass.config.path("www", "home-dashboard", CACHE_FILENAME))

    async def get_snapshot(
        self,
        client: AlsoEnergyClient,
        *,
        force: bool = False,
        allow_api: bool = True,
    ) -> JsonDict:
        """Return cached data; call the API at most once per poll interval."""
        async with self._lock:
            loop = asyncio.get_running_loop()
            now_mono = loop.time()

            if (
                not force
                and self._memory
                and self._last_api_monotonic is not None
                and now_mono - self._last_api_monotonic < DEFAULT_SCAN_INTERVAL
            ):
                return dict(self._memory)

            if not allow_api:
                cached = self._memory or await self.async_load_from_disk()
                if cached:
                    return {**cached, "polling_paused": True, "from_cache": True}
                return _empty_snapshot(client.site_id, polling_paused=True)

            try:
                data = await client.async_fetch_snapshot()
            except (AlsoEnergyAuthError, AlsoEnergyApiError) as err:
                cached = self._memory or await self.async_load_from_disk()
                if cached:
                    _LOGGER.warning("API error (%s); serving cache", err)
                    return {**cached, "from_cache": True, "api_error": str(err)}
                raise

            data["cached_at"] = dt_util.now().isoformat()
            data["from_cache"] = False
            data["polling_paused"] = False
            await self.async_save_to_disk(data)
            self._memory = dict(data)
            self._last_api_monotonic = now_mono
            return dict(data)

    async def async_persist_if_valid(self, data: JsonDict) -> None:
        """Write dashboard cache when coordinator has real readings."""
        if _snapshot_has_data(data):
            await self.async_save_to_disk(data)

    async def async_load_from_disk(self) -> JsonDict | None:
        """Load the last persisted snapshot."""
        path = self.cache_path
        if not path.is_file():
            return None
        try:
            raw = await self._hass.async_add_executor_job(path.read_text, "utf-8")
            payload = json.loads(raw)
            if isinstance(payload, dict):
                internal = _internal_from_public(payload)
                if not _snapshot_has_data(internal):
                    return None
                self._memory = internal
                return internal
        except (OSError, json.JSONDecodeError) as err:
            _LOGGER.warning("Failed to read cache %s: %s", path, err)
        return None

    async def async_save_to_disk(self, data: JsonDict) -> None:
        """Atomically write snapshot for dashboard consumers."""
        path = self.cache_path
        public = _public_cache_payload(data)
        tmp = path.with_suffix(".json.tmp")

        def _write() -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp.write_text(json.dumps(public, indent=2), encoding="utf-8")
            tmp.replace(path)

        await self._hass.async_add_executor_job(_write)
        _LOGGER.debug("Wrote AlsoEnergy cache to %s", path)


def _snapshot_has_data(payload: JsonDict) -> bool:
    """True when snapshot contains at least one production/energy reading."""
    for key in (
        "power_w",
        "powerW",
        "energy_month_kwh",
        "energyMonthKwh",
        "energy_lifetime_kwh",
        "energyLifetimeKwh",
        "today_kwh",
        "todayKwh",
        "energy_today_kwh",
    ):
        if payload.get(key) is not None:
            return True
    return False
def _internal_from_public(payload: JsonDict) -> JsonDict:
    """Restore coordinator field names from dashboard cache JSON."""
    if "power_w" in payload:
        return payload
    return {
        "site_id": payload.get("siteId"),
        "site_name": payload.get("siteName"),
        "power_w": payload.get("powerW"),
        "energy_month_kwh": payload.get("energyMonthKwh"),
        "energy_lifetime_kwh": payload.get("energyLifetimeKwh"),
        "today_kwh": payload.get("todayKwh"),
        "energy_today_kwh": payload.get("todayKwh"),
        "year_kwh": payload.get("yearKwh"),
        "last_update": payload.get("lastUpdate"),
        "time_zone": payload.get("timeZone"),
        "cached_at": payload.get("fetchedAt"),
        "polling_paused": payload.get("pollingPaused"),
    }


def _public_cache_payload(data: JsonDict) -> JsonDict:
    """Dashboard-facing JSON (stable field names)."""
    return {
        "siteId": data.get("site_id"),
        "siteName": data.get("site_name"),
        "powerW": data.get("power_w"),
        "energyMonthKwh": data.get("energy_month_kwh"),
        "energyLifetimeKwh": data.get("energy_lifetime_kwh"),
        "todayKwh": data.get("energy_today_kwh") or data.get("today_kwh"),
        "yearKwh": data.get("year_kwh"),
        "lastUpdate": data.get("last_update"),
        "timeZone": data.get("time_zone"),
        "fetchedAt": data.get("cached_at"),
        "pollingPaused": bool(data.get("polling_paused")),
    }


def _empty_snapshot(site_id: int | None, *, polling_paused: bool) -> JsonDict:
    return {
        "site_id": site_id,
        "site_name": None,
        "power_w": None,
        "energy_month_kwh": None,
        "energy_today_kwh": None,
        "energy_lifetime_kwh": None,
        "last_update": None,
        "time_zone": None,
        "today_kwh": None,
        "year_kwh": None,
        "polling_paused": polling_paused,
        "from_cache": True,
    }
