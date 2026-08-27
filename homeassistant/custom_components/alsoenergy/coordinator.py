"""DataUpdateCoordinator for AlsoEnergy PowerTrack."""

from __future__ import annotations

from datetime import timedelta
import logging
from typing import Any

import aiohttp
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import AlsoEnergyApiError, AlsoEnergyAuthError, AlsoEnergyClient
from .cache import get_cache_manager
from .const import (
    CONF_CLIENT_ID,
    CONF_CLIENT_SECRET,
    CONF_PASSWORD,
    CONF_SITE_ID,
    CONF_USERNAME,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
)
from .solar_window import is_within_solar_polling_window

_LOGGER = logging.getLogger(__name__)


class AlsoEnergyCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Poll PowerTrack for site production data."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=DEFAULT_SCAN_INTERVAL),
            config_entry=entry,
        )
        self.entry = entry
        self._session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=45),
        )
        site_raw = entry.data.get(CONF_SITE_ID)
        site_id = int(site_raw) if site_raw not in (None, "") else None
        self.client = AlsoEnergyClient(
            session=self._session,
            username=entry.data[CONF_USERNAME],
            password=entry.data[CONF_PASSWORD],
            site_id=site_id,
            client_id=entry.data.get(CONF_CLIENT_ID),
            client_secret=entry.data.get(CONF_CLIENT_SECRET),
        )

    async def async_shutdown(self) -> None:
        """Close the HTTP session."""
        parent_shutdown = getattr(super(), "async_shutdown", None)
        if parent_shutdown is not None:
            await parent_shutdown()
        if self._session and not self._session.closed:
            await self._session.close()

    async def _async_update_data(self) -> dict[str, Any]:
        cache = get_cache_manager(self.hass)
        allow_api = is_within_solar_polling_window(self.hass)
        try:
            data = await cache.get_snapshot(
                self.client,
                allow_api=allow_api,
            )
            await cache.async_persist_if_valid(data)
            return data
        except AlsoEnergyAuthError as err:
            raise UpdateFailed(f"Authentication failed: {err}") from err
        except AlsoEnergyApiError as err:
            raise UpdateFailed(f"API error: {err}") from err
        except Exception as err:  # noqa: BLE001
            raise UpdateFailed(f"Unexpected error: {err}") from err
