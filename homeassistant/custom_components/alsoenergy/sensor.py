"""Sensor platform for AlsoEnergy PowerTrack."""

from __future__ import annotations

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfEnergy, UnitOfPower
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import AlsoEnergyCoordinator

SENSORS = (
    {
        "key": "power_w",
        "name": "Production Power",
        "unit": UnitOfPower.WATT,
        "device_class": SensorDeviceClass.POWER,
        "state_class": SensorStateClass.MEASUREMENT,
        "icon": "mdi:solar-power",
    },
    {
        "key": "energy_today_kwh",
        "name": "Energy Produced Today",
        "unit": UnitOfEnergy.KILO_WATT_HOUR,
        "device_class": SensorDeviceClass.ENERGY,
        "state_class": SensorStateClass.TOTAL,
        "icon": "mdi:calendar-today",
    },
    {
        "key": "energy_month_kwh",
        "name": "Energy Produced This Month",
        "unit": UnitOfEnergy.KILO_WATT_HOUR,
        "device_class": SensorDeviceClass.ENERGY,
        "state_class": SensorStateClass.TOTAL,
        "icon": "mdi:calendar-month",
    },
    {
        "key": "energy_lifetime_kwh",
        "name": "Lifetime Energy Produced",
        "unit": UnitOfEnergy.KILO_WATT_HOUR,
        "device_class": SensorDeviceClass.ENERGY,
        "state_class": SensorStateClass.TOTAL_INCREASING,
        "icon": "mdi:solar-power-variant",
    },
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up sensors from a config entry."""
    coordinator: AlsoEnergyCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        AlsoEnergySensor(coordinator, entry, meta) for meta in SENSORS
    )


class AlsoEnergySensor(CoordinatorEntity[AlsoEnergyCoordinator], SensorEntity):
    """One PowerTrack production sensor."""

    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: AlsoEnergyCoordinator,
        entry: ConfigEntry,
        meta: dict,
    ) -> None:
        super().__init__(coordinator)
        self._key = meta["key"]
        self._attr_name = meta["name"]
        self._attr_native_unit_of_measurement = meta["unit"]
        self._attr_device_class = meta["device_class"]
        self._attr_state_class = meta["state_class"]
        self._attr_icon = meta["icon"]
        site = entry.data.get("site_id", entry.entry_id)
        self._attr_unique_id = f"{site}_{self._key}"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, str(site))},
            "name": entry.title,
            "manufacturer": "AlsoEnergy",
            "model": "PowerTrack Site",
        }

    @property
    def native_value(self):
        data = self.coordinator.data or {}
        value = data.get(self._key)
        if value is None:
            return None
        if self._key == "power_w":
            return round(float(value), 0)
        return round(float(value), 2)

    @property
    def extra_state_attributes(self):
        data = self.coordinator.data or {}
        attrs = {
            "site_id": data.get("site_id"),
            "site_name": data.get("site_name"),
        }
        if data.get("last_update") is not None:
            attrs["last_update"] = data["last_update"]
        if data.get("time_zone") is not None:
            attrs["time_zone"] = data["time_zone"]
        if self._key == "energy_month_kwh" and data.get("today_kwh") is not None:
            attrs["today_kwh"] = data["today_kwh"]
        if self._key == "energy_lifetime_kwh" and data.get("year_kwh") is not None:
            attrs["year_kwh"] = data["year_kwh"]
        return attrs

    @property
    def available(self) -> bool:
        data = self.coordinator.data or {}
        if not self.coordinator.last_update_success:
            return False
        if self._key in ("energy_today_kwh", "energy_month_kwh", "energy_lifetime_kwh"):
            return True
        return data.get(self._key) is not None
