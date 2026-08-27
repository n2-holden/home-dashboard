"""Daylight polling window based on Home Assistant location."""

from __future__ import annotations

from datetime import datetime, timedelta

from homeassistant.core import HomeAssistant
from homeassistant.helpers.sun import get_astral_event_date
from homeassistant.util import dt as dt_util

from .const import SOLAR_WINDOW_AFTER_SUNSET, SOLAR_WINDOW_BEFORE_SUNRISE


def is_within_solar_polling_window(hass: HomeAssistant, now: datetime | None = None) -> bool:
    """Return True between (sunrise - 1h) and (sunset + 1h) at HA home location."""
    now = dt_util.as_local(now or dt_util.now())
    sunrise = get_astral_event_date(hass, "sunrise", now.date())
    sunset = get_astral_event_date(hass, "sunset", now.date())

    if sunrise is None or sunset is None:
        # Polar day/night — fall back to allowing polls.
        return True

    window_start = dt_util.as_local(sunrise) - SOLAR_WINDOW_BEFORE_SUNRISE
    window_end = dt_util.as_local(sunset) + SOLAR_WINDOW_AFTER_SUNSET
    return window_start <= now <= window_end
