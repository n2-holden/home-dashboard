"""Shared Enphase PowerPack snapshot cache — one API caller for all consumers."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .api import EnphaseApiError, EnphaseAuthError, EnphaseCloudClient
from .const import CACHE_FILENAME, CACHE_MANAGER_KEY, DEFAULT_SCAN_INTERVAL, DOMAIN

_LOGGER = logging.getLogger(__name__)

JsonDict = dict[str, Any]


def get_cache_manager(hass: HomeAssistant) -> EnphaseCacheManager:
    """Return the domain-wide cache manager (single API gatekeeper)."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    manager = domain_data.get(CACHE_MANAGER_KEY)
    if manager is None:
        manager = EnphaseCacheManager(hass)
        domain_data[CACHE_MANAGER_KEY] = manager
    return manager


class EnphaseCacheManager:
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
        client: EnphaseCloudClient,
        *,
        force: bool = False,
    ) -> JsonDict:
        """Return cached data; call Enlighten at most once per poll interval."""
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

            try:
                data = await client.async_fetch_snapshot()
            except (EnphaseAuthError, EnphaseApiError) as err:
                cached = self._memory or await self.async_load_from_disk()
                if cached:
                    _LOGGER.warning("API error (%s); serving cache", err)
                    return {**cached, "from_cache": True, "api_error": str(err)}
                raise

            data["cached_at"] = dt_util.now().isoformat()
            data["from_cache"] = False
            await self.async_save_to_disk(data)
            self._memory = dict(data)
            self._last_api_monotonic = now_mono
            return dict(data)

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
        if not _snapshot_has_data(data):
            return
        path = self.cache_path
        public = _public_cache_payload(data)
        tmp = path.with_suffix(".json.tmp")

        def _write() -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp.write_text(json.dumps(public, indent=2) + "\n", encoding="utf-8")
            tmp.replace(path)

        await self._hass.async_add_executor_job(_write)
        _LOGGER.debug("Wrote Enphase PowerPack cache to %s", path)


def _snapshot_has_data(payload: JsonDict) -> bool:
    """True when snapshot contains at least one shed reading."""
    for key in (
        "pv_power",
        "pvPowerW",
        "consumption_power",
        "loadPowerW",
        "battery_power",
        "batteryPowerW",
        "grid_power",
        "gridPowerW",
        "battery_soc",
        "batterySoc",
    ):
        if payload.get(key) is not None:
            return True
    return False


def _internal_from_public(payload: JsonDict) -> JsonDict:
    """Restore coordinator field names from dashboard cache JSON."""
    if "pv_power" in payload or "battery_soc" in payload:
        return payload
    return {
        "site_id": payload.get("siteId"),
        "pv_power": payload.get("pvPowerW"),
        "consumption_power": payload.get("loadPowerW"),
        "battery_power": payload.get("batteryPowerW"),
        "grid_power": payload.get("gridPowerW"),
        "battery_soc": payload.get("batterySoc"),
        "energy_month_kwh": payload.get("energyMonthKwh"),
        "energy_lifetime_kwh": payload.get("energyLifetimeKwh"),
        "cached_at": payload.get("fetchedAt"),
    }


def _public_cache_payload(data: JsonDict) -> JsonDict:
    """Dashboard-facing JSON (stable field names)."""
    return {
        "siteId": data.get("site_id"),
        "pvPowerW": data.get("pv_power"),
        "loadPowerW": data.get("consumption_power"),
        "batteryPowerW": data.get("battery_power"),
        "gridPowerW": data.get("grid_power"),
        "batterySoc": data.get("battery_soc"),
        "energyMonthKwh": data.get("energy_month_kwh"),
        "energyLifetimeKwh": data.get("energy_lifetime_kwh"),
        "fetchedAt": data.get("cached_at"),
    }
