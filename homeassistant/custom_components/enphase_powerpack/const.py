"""Constants for the Enphase PowerPack cloud integration."""

DOMAIN = "enphase_powerpack"
DEFAULT_NAME = "Enphase PowerPack"
# One Enlighten API poll per 2 minutes (shared cache for all dashboards).
# Polls 24/7 — do NOT add a sunrise/sunset window here. Shed Solar includes
# battery SOC / charge / load / grid which matter at night (unlike PV-only).
DEFAULT_SCAN_INTERVAL = 120

CONF_EMAIL = "email"
CONF_PASSWORD = "password"
CONF_SITE_ID = "site_id"

BASE_URL = "https://enlighten.enphaseenergy.com"

ATTR_SYSTEM_ID = "system_id"
ATTR_LAST_LOGIN = "last_login"

CACHE_FILENAME = "shed-cache.json"
CACHE_MANAGER_KEY = "cache_manager"
