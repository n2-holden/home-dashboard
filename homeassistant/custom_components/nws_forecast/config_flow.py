"""Config flow for NWS Weather Forecast integration."""
from __future__ import annotations

import logging
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResult

from .const import (
    DOMAIN,
    CONF_ZIP_CODE,
    CONF_LATITUDE,
    CONF_LONGITUDE,
    CONF_GRID_ID,
    CONF_GRID_X,
    CONF_GRID_Y,
    NWS_API_BASE,
    ZIP_API_BASE,
    USER_AGENT,
)

_LOGGER = logging.getLogger(__name__)

STEP_USER_DATA_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_ZIP_CODE): str,
    }
)


class NWSForecastConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for NWS Weather Forecast."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial step — user enters a zip code."""
        errors: dict[str, str] = {}

        if user_input is not None:
            zip_code = user_input[CONF_ZIP_CODE].strip()

            # Validate zip code format
            if not zip_code.isdigit() or len(zip_code) != 5:
                errors["base"] = "invalid_zip"
            else:
                # Resolve zip to lat/lon
                try:
                    lat, lon, place_name = await self._resolve_zip(zip_code)
                except ValueError:
                    errors["base"] = "cannot_resolve_zip"
                except Exception:
                    _LOGGER.exception("Failed to resolve zip code %s", zip_code)
                    errors["base"] = "cannot_reach_nws"
                else:
                    # Get NWS grid from lat/lon
                    try:
                        grid_id, grid_x, grid_y = await self._get_nws_grid(lat, lon)
                    except Exception:
                        errors["base"] = "cannot_reach_nws"
                    else:
                        # Check for duplicate entries
                        await self.async_set_unique_id(f"nws_{zip_code}")
                        self._abort_if_unique_id_configured()

                        return self.async_create_entry(
                            title=f"NWS Forecast ({place_name})",
                            data={
                                CONF_ZIP_CODE: zip_code,
                                CONF_LATITUDE: lat,
                                CONF_LONGITUDE: lon,
                                CONF_GRID_ID: grid_id,
                                CONF_GRID_X: grid_x,
                                CONF_GRID_Y: grid_y,
                            },
                        )

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_DATA_SCHEMA,
            errors=errors,
        )

    async def _resolve_zip(self, zip_code: str) -> tuple[float, float, str]:
        """Resolve a US zip code to lat/lon."""
        url = f"{ZIP_API_BASE}/{zip_code}"

        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers={"User-Agent": USER_AGENT}) as resp:
                if resp.status == 404:
                    raise ValueError(f"Could not resolve zip code {zip_code}")
                resp.raise_for_status()
                data = await resp.json()

        places = data.get("places")
        if not places:
            raise ValueError(f"Could not resolve zip code {zip_code}")

        place = places[0]
        lat = float(place["latitude"])
        lon = float(place["longitude"])
        place_name = place.get("place name", zip_code)
        state = place.get("state abbreviation")
        if state:
            place_name = f"{place_name}, {state}"
        return lat, lon, place_name

    async def _get_nws_grid(self, lat: float, lon: float) -> tuple[str, int, int]:
        """Get NWS grid coordinates from lat/lon."""
        url = f"{NWS_API_BASE}/points/{lat:.4f},{lon:.4f}"
        headers = {
            "User-Agent": USER_AGENT,
            "Accept": "application/geo+json",
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as resp:
                resp.raise_for_status()
                data = await resp.json()

        props = data["properties"]
        return props["gridId"], props["gridX"], props["gridY"]
