"""Constants for the AlsoEnergy PowerTrack integration."""

from datetime import timedelta

DOMAIN = "alsoenergy"
DEFAULT_NAME = "PV"
DEFAULT_SCAN_INTERVAL = 600

CONF_USERNAME = "username"
CONF_PASSWORD = "password"
CONF_SITE_ID = "site_id"
CONF_CLIENT_ID = "client_id"
CONF_CLIENT_SECRET = "client_secret"

BASE_URL = "https://api.alsoenergy.com"

CACHE_FILENAME = "pv-cache.json"
CACHE_MANAGER_KEY = "cache_manager"

SOLAR_WINDOW_BEFORE_SUNRISE = timedelta(hours=1)
SOLAR_WINDOW_AFTER_SUNSET = timedelta(hours=1)
