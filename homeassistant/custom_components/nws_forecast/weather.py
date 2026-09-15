"""Weather entity for NWS Weather Forecast integration."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from homeassistant.components.weather import (
    Forecast,
    WeatherEntity,
    WeatherEntityFeature,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    UnitOfPressure,
    UnitOfSpeed,
    UnitOfTemperature,
    UnitOfLength,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    DOMAIN,
    CONF_ZIP_CODE,
    map_nws_condition,
    degrees_to_compass,
    pair_daily_periods,
    build_hourly_forecasts,
    to_fahrenheit,
    parse_wind_speed_text,
    extract_precip_probability,
)
from .coordinator import NWSForecastCoordinator

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up NWS weather entity from a config entry."""
    coordinator: NWSForecastCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([NWSWeatherEntity(coordinator, entry)])


class NWSWeatherEntity(CoordinatorEntity[NWSForecastCoordinator], WeatherEntity):
    """Representation of NWS weather data as a WeatherEntity."""

    _attr_has_entity_name = True
    _attr_name = None
    _attr_supported_features = (
        WeatherEntityFeature.FORECAST_DAILY
        | WeatherEntityFeature.FORECAST_HOURLY
    )

    # Declare native units — HA handles conversions to user's preferred units
    _attr_native_temperature_unit = UnitOfTemperature.FAHRENHEIT
    _attr_native_pressure_unit = UnitOfPressure.PA
    _attr_native_wind_speed_unit = UnitOfSpeed.KILOMETERS_PER_HOUR
    _attr_native_visibility_unit = UnitOfLength.METERS

    def __init__(
        self,
        coordinator: NWSForecastCoordinator,
        entry: ConfigEntry,
    ) -> None:
        """Initialize the weather entity."""
        super().__init__(coordinator)
        self._entry = entry
        zip_code = entry.data[CONF_ZIP_CODE]
        self._attr_unique_id = f"nws_forecast_{zip_code}"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, zip_code)},
            "name": f"NWS Forecast ({zip_code})",
            "manufacturer": "National Weather Service",
            "model": "Weather API",
        }

    @property
    def native_temperature(self) -> float | None:
        """Return the current temperature."""
        obs = self.coordinator.data.get("observation") if self.coordinator.data else None
        if obs is None:
            return None
        temp = obs.get("temperature")
        if temp is None:
            return None
        # Convert from observation units to our declared native unit (°F)
        unit = obs.get("temperature_unit", "")
        return to_fahrenheit(temp, unit)

    @property
    def native_dew_point(self) -> float | None:
        """Return the current dew point."""
        obs = self._get_observation()
        if obs is None:
            return None
        dew = obs.get("dewpoint")
        if dew is None:
            return None
        unit = obs.get("dewpoint_unit", "")
        return to_fahrenheit(dew, unit)

    @property
    def humidity(self) -> float | None:
        """Return the current humidity."""
        obs = self._get_observation()
        if obs is None:
            return None
        humidity = obs.get("humidity")
        if humidity is not None:
            return round(humidity, 1)
        return None

    @property
    def native_pressure(self) -> float | None:
        """Return the current barometric pressure in Pa."""
        obs = self._get_observation()
        if obs is None:
            return None
        return obs.get("barometric_pressure")

    @property
    def native_visibility(self) -> float | None:
        """Return the current visibility in meters."""
        obs = self._get_observation()
        if obs is None:
            return None
        return obs.get("visibility")

    @property
    def native_wind_speed(self) -> float | None:
        """Return the current wind speed in km/h."""
        obs = self._get_observation()
        if obs is None:
            return None
        return obs.get("wind_speed")

    @property
    def wind_bearing(self) -> str | None:
        """Return the current wind bearing as a compass direction."""
        obs = self._get_observation()
        if obs is None:
            return None
        direction = obs.get("wind_direction")
        if direction is None:
            return None
        return degrees_to_compass(direction)

    @property
    def cloud_coverage(self) -> int | None:
        """Return the current cloud coverage percentage."""
        obs = self._get_observation()
        return self.coordinator.get_cloud_coverage(obs)

    @property
    def condition(self) -> str | None:
        """Return the current weather condition."""
        obs = self._get_observation()
        if obs is None:
            return None

        text = obs.get("text_description", "")
        if not text:
            # Fall back to first forecast period
            forecast = self._get_forecast_data()
            if forecast:
                periods = forecast.get("properties", {}).get("periods", [])
                if periods:
                    text = periods[0].get("shortForecast", "")
                    is_day = periods[0].get("isDaytime", True)
                    return map_nws_condition(text, is_day)
            return None

        # Determine if daytime from forecast or by hour
        is_day = self._is_daytime()
        return map_nws_condition(text, is_day)

    async def async_forecast_daily(self) -> list[Forecast] | None:
        """Return the daily forecast."""
        forecast_data = self._get_forecast_data()
        if forecast_data is None:
            return None

        periods = forecast_data.get("properties", {}).get("periods", [])
        if not periods:
            return None

        return pair_daily_periods(periods)

    async def async_forecast_hourly(self) -> list[Forecast] | None:
        """Return the hourly forecast."""
        data = self.coordinator.data
        if data is None:
            return None

        hourly_data = data.get("hourly")
        if hourly_data is None:
            return None

        periods = hourly_data.get("properties", {}).get("periods", [])
        if not periods:
            return None

        return build_hourly_forecasts(periods)

    async def async_update(self) -> None:
        """Update the entity from the coordinator."""
        await self.coordinator.async_request_refresh()

    @callback
    def _handle_coordinator_update(self) -> None:
        """Handle updated data from the coordinator.

        CoordinatorEntity's default only writes entity state; forecast
        subscribers (the frontend's push-based forecast card) are a separate
        listener list that must be notified explicitly, or the daily/hourly
        forecast shown in the UI goes stale until the card is remounted.
        """
        self.hass.async_create_task(self.async_update_listeners(("daily", "hourly")))
        super()._handle_coordinator_update()

    # --- Helper methods ---

    def _get_observation(self) -> dict[str, Any] | None:
        """Get the current observation from coordinator data."""
        if self.coordinator.data is None:
            return None
        return self.coordinator.data.get("observation")

    def _get_forecast_data(self) -> dict[str, Any] | None:
        """Get the forecast data from coordinator."""
        if self.coordinator.data is None:
            return None
        return self.coordinator.data.get("forecast")

    def _is_daytime(self) -> bool:
        """Determine if it's currently daytime from forecast or clock."""
        forecast = self._get_forecast_data()
        if forecast:
            periods = forecast.get("properties", {}).get("periods", [])
            if periods:
                return periods[0].get("isDaytime", True)
        # Fallback: assume daytime between 6am and 8pm
        hour = datetime.now().hour
        return 6 <= hour < 20

    # _to_fahrenheit and _parse_wind_speed_text are now in const.py
    # as to_fahrenheit() and parse_wind_speed_text()
