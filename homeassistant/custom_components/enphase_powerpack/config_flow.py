"""Config flow for Enphase PowerPack cloud."""

from __future__ import annotations

import logging

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.const import CONF_NAME
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import EnphaseAuthError, EnphaseCloudClient
from .const import CONF_EMAIL, CONF_PASSWORD, CONF_SITE_ID, DEFAULT_NAME, DOMAIN

_LOGGER = logging.getLogger(__name__)

STEP_USER_DATA_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_EMAIL): str,
        vol.Required(CONF_PASSWORD): str,
        vol.Optional(CONF_SITE_ID): str,
        vol.Optional(CONF_NAME, default=DEFAULT_NAME): str,
    }
)


class EnphasePowerPackConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Enphase PowerPack."""

    VERSION = 1

    async def async_step_user(self, user_input: dict | None = None):
        errors: dict[str, str] = {}
        description_placeholders = {"error_detail": ""}

        if user_input is not None:
            session = async_get_clientsession(self.hass)
            client = EnphaseCloudClient(
                session=session,
                email=user_input[CONF_EMAIL],
                password=user_input[CONF_PASSWORD],
                site_id=user_input.get(CONF_SITE_ID) or None,
            )
            try:
                site_id = await client.async_login()
                # Snapshot failure shouldn't block setup if auth worked —
                # sensors can populate on first poll.
                try:
                    await client.async_fetch_snapshot()
                except Exception as snap_err:  # noqa: BLE001
                    _LOGGER.warning("Initial snapshot failed after login: %s", snap_err)
            except EnphaseAuthError as err:
                _LOGGER.error("Enphase login failed: %s", err)
                errors["base"] = "invalid_auth"
                description_placeholders["error_detail"] = str(err)
            except Exception as err:  # noqa: BLE001
                _LOGGER.exception("Enphase setup failed")
                errors["base"] = "cannot_connect"
                description_placeholders["error_detail"] = str(err)
            else:
                await self.async_set_unique_id(site_id)
                self._abort_if_unique_id_configured()
                data = {
                    CONF_EMAIL: user_input[CONF_EMAIL],
                    CONF_PASSWORD: user_input[CONF_PASSWORD],
                    CONF_SITE_ID: site_id,
                    CONF_NAME: user_input.get(CONF_NAME) or DEFAULT_NAME,
                }
                return self.async_create_entry(
                    title=f"{data[CONF_NAME]} ({site_id})",
                    data=data,
                )

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_DATA_SCHEMA,
            errors=errors,
            description_placeholders=description_placeholders,
        )
