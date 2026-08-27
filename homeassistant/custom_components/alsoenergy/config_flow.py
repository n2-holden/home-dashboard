"""Config flow for AlsoEnergy PowerTrack."""

from __future__ import annotations

import logging

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.const import CONF_NAME
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import AlsoEnergyAuthError, AlsoEnergyClient
from .cache import get_cache_manager
from .const import (
    CONF_CLIENT_ID,
    CONF_CLIENT_SECRET,
    CONF_PASSWORD,
    CONF_SITE_ID,
    CONF_USERNAME,
    DEFAULT_NAME,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)

STEP_USER_DATA_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_USERNAME): str,
        vol.Required(CONF_PASSWORD): str,
        vol.Optional(CONF_SITE_ID): str,
        vol.Optional(CONF_NAME, default=DEFAULT_NAME): str,
        vol.Optional(CONF_CLIENT_ID): str,
        vol.Optional(CONF_CLIENT_SECRET): str,
    }
)


class AlsoEnergyConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for AlsoEnergy PowerTrack."""

    VERSION = 1

    async def async_step_user(self, user_input: dict | None = None):
        errors: dict[str, str] = {}
        description_placeholders = {"error_detail": ""}

        if user_input is not None:
            session = async_get_clientsession(self.hass)
            site_raw = (user_input.get(CONF_SITE_ID) or "").strip()
            site_id = int(site_raw) if site_raw.isdigit() else None
            client = AlsoEnergyClient(
                session=session,
                username=user_input[CONF_USERNAME],
                password=user_input[CONF_PASSWORD],
                site_id=site_id,
                client_id=user_input.get(CONF_CLIENT_ID),
                client_secret=user_input.get(CONF_CLIENT_SECRET),
            )
            try:
                resolved_site_id = await client.async_login()
                try:
                    await get_cache_manager(self.hass).get_snapshot(
                        client,
                        force=True,
                        allow_api=True,
                    )
                except Exception as snap_err:  # noqa: BLE001
                    _LOGGER.warning("Initial snapshot failed after login: %s", snap_err)
            except AlsoEnergyAuthError as err:
                _LOGGER.error("AlsoEnergy login failed: %s", err)
                errors["base"] = "invalid_auth"
                description_placeholders["error_detail"] = str(err)
            except ValueError:
                errors["base"] = "invalid_site_id"
                description_placeholders["error_detail"] = "Site ID must be a number."
            except Exception as err:  # noqa: BLE001
                _LOGGER.exception("AlsoEnergy setup failed")
                errors["base"] = "cannot_connect"
                description_placeholders["error_detail"] = str(err)
            else:
                await self.async_set_unique_id(str(resolved_site_id))
                self._abort_if_unique_id_configured()
                data = {
                    CONF_USERNAME: user_input[CONF_USERNAME],
                    CONF_PASSWORD: user_input[CONF_PASSWORD],
                    CONF_SITE_ID: str(resolved_site_id),
                    CONF_NAME: user_input.get(CONF_NAME) or DEFAULT_NAME,
                }
                if user_input.get(CONF_CLIENT_ID):
                    data[CONF_CLIENT_ID] = user_input[CONF_CLIENT_ID]
                if user_input.get(CONF_CLIENT_SECRET):
                    data[CONF_CLIENT_SECRET] = user_input[CONF_CLIENT_SECRET]
                return self.async_create_entry(
                    title=f"{data[CONF_NAME]} ({resolved_site_id})",
                    data=data,
                )

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_DATA_SCHEMA,
            errors=errors,
            description_placeholders=description_placeholders,
        )
