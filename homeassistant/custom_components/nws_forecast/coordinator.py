"""Data coordinator for NWS Weather Forecast integration."""
from __future__ import annotations

import logging
import re
from datetime import timedelta
from typing import Any

import aiohttp

from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import (
    DOMAIN,
    NWS_API_BASE,
    USER_AGENT,
    DEFAULT_SCAN_INTERVAL,
    CLOUD_COVERAGE_MAP,
)

_LOGGER = logging.getLogger(__name__)


class NWSForecastCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Coordinator to fetch NWS weather data."""

    def __init__(
        self,
        hass: HomeAssistant,
        grid_id: str,
        grid_x: int,
        grid_y: int,
    ) -> None:
        """Initialize the coordinator."""
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=DEFAULT_SCAN_INTERVAL),
        )
        self.grid_id = grid_id
        self.grid_x = grid_x
        self.grid_y = grid_y
        self._station_id: str | None = None
        self._headers = {
            "User-Agent": USER_AGENT,
            "Accept": "application/geo+json",
        }

    async def _async_update_data(self) -> dict[str, Any]:
        """Fetch data from NWS API."""
        try:
            async with aiohttp.ClientSession() as session:
                # Get nearest station (cached after first call)
                if self._station_id is None:
                    self._station_id = await self._get_nearest_station(session)

                # Fetch all data concurrently
                import asyncio

                forecast_task = self._fetch_forecast(session)
                hourly_task = self._fetch_hourly_forecast(session)
                observation_task = self._fetch_observation(session)

                forecast, hourly, observation = await asyncio.gather(
                    forecast_task, hourly_task, observation_task,
                    return_exceptions=True,
                )

                # Handle individual failures gracefully
                if isinstance(forecast, Exception):
                    _LOGGER.warning("Failed to fetch forecast: %s", forecast)
                    forecast = None
                if isinstance(hourly, Exception):
                    _LOGGER.warning("Failed to fetch hourly forecast: %s", hourly)
                    hourly = None
                if isinstance(observation, Exception):
                    _LOGGER.warning("Failed to fetch observation: %s", observation)
                    observation = None

                # We need at least the forecast
                if forecast is None:
                    raise UpdateFailed("Could not fetch forecast data from NWS")

                # Parse observation, with METAR fallback for null fields
                parsed_observation = self._parse_observation(observation)

                return {
                    "forecast": forecast,
                    "hourly": hourly,
                    "observation": parsed_observation,
                }

        except UpdateFailed:
            raise
        except Exception as err:
            raise UpdateFailed(f"Error communicating with NWS API: {err}") from err

    async def _get_nearest_station(self, session: aiohttp.ClientSession) -> str:
        """Get the nearest observation station ID. Result is cached."""
        url = (
            f"{NWS_API_BASE}/gridpoints/{self.grid_id}/"
            f"{self.grid_x},{self.grid_y}/stations"
        )
        async with session.get(url, headers=self._headers) as resp:
            resp.raise_for_status()
            data = await resp.json()

        features = data.get("features", [])
        if not features:
            raise UpdateFailed("No observation stations found near location")

        # Return the station ID from the first (nearest) station
        station_url = features[0]["id"]
        station_id = station_url.split("/")[-1]
        _LOGGER.debug("Using nearest station: %s", station_id)
        return station_id

    async def _fetch_forecast(
        self, session: aiohttp.ClientSession
    ) -> dict[str, Any]:
        """Fetch the daily forecast."""
        url = (
            f"{NWS_API_BASE}/gridpoints/{self.grid_id}/"
            f"{self.grid_x},{self.grid_y}/forecast"
        )
        async with session.get(url, headers=self._headers) as resp:
            resp.raise_for_status()
            data = await resp.json()
        return data

    async def _fetch_hourly_forecast(
        self, session: aiohttp.ClientSession
    ) -> dict[str, Any]:
        """Fetch the hourly forecast."""
        url = (
            f"{NWS_API_BASE}/gridpoints/{self.grid_id}/"
            f"{self.grid_x},{self.grid_y}/forecast/hourly"
        )
        async with session.get(url, headers=self._headers) as resp:
            resp.raise_for_status()
            data = await resp.json()
        return data

    async def _fetch_observation(
        self, session: aiohttp.ClientSession
    ) -> dict[str, Any]:
        """Fetch the latest observation from the nearest station."""
        url = (
            f"{NWS_API_BASE}/stations/{self._station_id}/"
            f"observations/latest"
        )
        async with session.get(url, headers=self._headers) as resp:
            resp.raise_for_status()
            data = await resp.json()
        return data

    def _parse_observation(
        self, observation: dict[str, Any] | None
    ) -> dict[str, Any] | None:
        """Parse observation data, falling back to METAR when fields are null."""
        if observation is None:
            return None

        props = observation.get("properties", {})

        # Extract values from nested {value, unitCode} objects
        result = {
            "temperature": self._extract_value(props.get("temperature")),
            "temperature_unit": self._extract_unit(props.get("temperature")),
            "dewpoint": self._extract_value(props.get("dewpoint")),
            "dewpoint_unit": self._extract_unit(props.get("dewpoint")),
            "humidity": self._extract_value(props.get("relativeHumidity")),
            "wind_speed": self._extract_value(props.get("windSpeed")),
            "wind_speed_unit": self._extract_unit(props.get("windSpeed")),
            "wind_direction": self._extract_value(props.get("windDirection")),
            "barometric_pressure": self._extract_value(
                props.get("barometricPressure")
            ),
            "pressure_unit": self._extract_unit(
                props.get("barometricPressure")
            ),
            "visibility": self._extract_value(props.get("visibility")),
            "visibility_unit": self._extract_unit(props.get("visibility")),
            "text_description": props.get("textDescription", ""),
            "cloud_layers": props.get("cloudLayers", []),
            "raw_message": props.get("rawMessage", ""),
            "timestamp": props.get("timestamp", ""),
        }

        # METAR fallback: if key fields are null, parse the raw METAR
        raw = result["raw_message"]
        if raw and result["temperature"] is None:
            metar_data = self._parse_metar(raw)
            if metar_data.get("temperature") is not None:
                result["temperature"] = metar_data["temperature"]
                result["temperature_unit"] = "wmoUnit:degC"
            if metar_data.get("dewpoint") is not None:
                result["dewpoint"] = metar_data["dewpoint"]
                result["dewpoint_unit"] = "wmoUnit:degC"
            if metar_data.get("wind_speed") is not None:
                result["wind_speed"] = metar_data["wind_speed"]
                result["wind_speed_unit"] = "wmoUnit:km_h-1"
            if metar_data.get("wind_direction") is not None:
                result["wind_direction"] = metar_data["wind_direction"]
            if metar_data.get("wind_gust") is not None:
                result["wind_gust"] = metar_data["wind_gust"]
            if metar_data.get("pressure") is not None:
                result["barometric_pressure"] = metar_data["pressure"]
                result["pressure_unit"] = "wmoUnit:Pa"

        return result

    @staticmethod
    def _extract_value(field: dict | None) -> float | None:
        """Extract numeric value from NWS {value, unitCode} object."""
        if field is None:
            return None
        if isinstance(field, dict):
            return field.get("value")
        return field

    @staticmethod
    def _extract_unit(field: dict | None) -> str | None:
        """Extract unit code from NWS {value, unitCode} object."""
        if field is None:
            return None
        if isinstance(field, dict):
            return field.get("unitCode")
        return None

    @staticmethod
    def _parse_metar(raw: str) -> dict[str, Any]:
        """Parse key fields from a raw METAR string.

        Example METAR:
        KBDU 170156Z AUTO 35015G24KT 10SM CLR 07/06 A2981

        Extracts: temperature, dewpoint, wind speed/dir/gust, altimeter.
        """
        result: dict[str, Any] = {}

        # Temperature/Dewpoint: group like 07/06 or M02/M05
        temp_match = re.search(r"\b(M?\d{2})/(M?\d{2})\b", raw)
        if temp_match:
            temp_str = temp_match.group(1)
            dew_str = temp_match.group(2)
            result["temperature"] = (
                -int(temp_str[1:]) if temp_str.startswith("M") else int(temp_str)
            )
            result["dewpoint"] = (
                -int(dew_str[1:]) if dew_str.startswith("M") else int(dew_str)
            )

        # Wind: group like 35015G24KT or 18010KT or VRB05KT
        wind_match = re.search(
            r"\b(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b", raw
        )
        if wind_match:
            direction_str = wind_match.group(1)
            speed_kt = int(wind_match.group(2))
            gust_kt = (
                int(wind_match.group(3)) if wind_match.group(3) else None
            )

            # Convert knots to km/h
            result["wind_speed"] = round(speed_kt * 1.852, 1)
            if gust_kt:
                result["wind_gust"] = round(gust_kt * 1.852, 1)

            if direction_str != "VRB":
                result["wind_direction"] = int(direction_str)

        # Altimeter: A2981 → pressure in Pa
        alt_match = re.search(r"\bA(\d{4})\b", raw)
        if alt_match:
            inhg = int(alt_match.group(1)) / 100.0
            result["pressure"] = round(inhg * 3386.39, 0)  # inHg → Pa

        return result

    def get_cloud_coverage(self, observation: dict[str, Any] | None) -> int | None:
        """Compute cloud coverage percentage from cloud layers."""
        if observation is None:
            return None

        layers = observation.get("cloud_layers", [])
        if not layers:
            return 0

        max_coverage = 0
        for layer in layers:
            if isinstance(layer, dict):
                code = layer.get("amount", "")
                coverage = CLOUD_COVERAGE_MAP.get(code, 0)
                max_coverage = max(max_coverage, coverage)

        return max_coverage
