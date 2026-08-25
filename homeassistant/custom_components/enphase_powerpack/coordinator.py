"""DataUpdateCoordinator for Enphase PowerPack cloud."""

from __future__ import annotations

from datetime import timedelta
import logging
from typing import Any

import aiohttp
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import EnphaseAuthError, EnphaseCloudClient, EnphaseApiError
from .const import CONF_EMAIL, CONF_PASSWORD, CONF_SITE_ID, DEFAULT_SCAN_INTERVAL, DOMAIN

_LOGGER = logging.getLogger(__name__)


class EnphasePowerPackCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Poll Enlighten cloud for PowerPack / site live values."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=DEFAULT_SCAN_INTERVAL),
            config_entry=entry,
        )
        self.entry = entry
        # Private session so HA's shared cookie jar can't poison Enlighten auth.
        self._session = aiohttp.ClientSession(
            cookie_jar=aiohttp.CookieJar(unsafe=True),
            timeout=aiohttp.ClientTimeout(total=45),
        )
        self.client = EnphaseCloudClient(
            session=self._session,
            email=entry.data[CONF_EMAIL],
            password=entry.data[CONF_PASSWORD],
            site_id=entry.data.get(CONF_SITE_ID),
        )

    async def async_shutdown(self) -> None:
        """Close the private HTTP session."""
        parent_shutdown = getattr(super(), "async_shutdown", None)
        if parent_shutdown is not None:
            await parent_shutdown()
        if self._session and not self._session.closed:
            await self._session.close()

    async def _async_update_data(self) -> dict[str, Any]:
        try:
            return await self.client.async_fetch_snapshot()
        except EnphaseAuthError as err:
            raise UpdateFailed(f"Authentication failed: {err}") from err
        except EnphaseApiError as err:
            raise UpdateFailed(f"API error: {err}") from err
        except Exception as err:  # noqa: BLE001
            raise UpdateFailed(f"Unexpected error: {err}") from err
