"""Sensor platform for Enphase PowerPack cloud."""

from __future__ import annotations

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import PERCENTAGE, UnitOfPower
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import EnphasePowerPackCoordinator

SENSORS = (
    {
        "key": "battery_soc",
        "name": "Battery SOC",
        "unit": PERCENTAGE,
        "device_class": SensorDeviceClass.BATTERY,
        "state_class": SensorStateClass.MEASUREMENT,
        "icon": "mdi:battery",
    },
    {
        "key": "pv_power",
        "name": "PV Production Power",
        "unit": UnitOfPower.WATT,
        "device_class": SensorDeviceClass.POWER,
        "state_class": SensorStateClass.MEASUREMENT,
        "icon": "mdi:solar-power",
    },
    {
        "key": "consumption_power",
        "name": "Load Power",
        "unit": UnitOfPower.WATT,
        "device_class": SensorDeviceClass.POWER,
        "state_class": SensorStateClass.MEASUREMENT,
        "icon": "mdi:home-lightning-bolt",
    },
    {
        "key": "battery_power",
        "name": "Battery Power",
        "unit": UnitOfPower.WATT,
        "device_class": SensorDeviceClass.POWER,
        "state_class": SensorStateClass.MEASUREMENT,
        "icon": "mdi:battery-charging",
    },
    {
        "key": "grid_power",
        "name": "Grid Power",
        "unit": UnitOfPower.WATT,
        "device_class": SensorDeviceClass.POWER,
        "state_class": SensorStateClass.MEASUREMENT,
        "icon": "mdi:transmission-tower",
    },
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up sensors from a config entry."""
    coordinator: EnphasePowerPackCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        EnphasePowerPackSensor(coordinator, entry, meta) for meta in SENSORS
    )


class EnphasePowerPackSensor(CoordinatorEntity[EnphasePowerPackCoordinator], SensorEntity):
    """One Enlighten-derived sensor."""

    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: EnphasePowerPackCoordinator,
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
            "manufacturer": "Enphase",
            "model": "IQ PowerPack (Cloud)",
        }

    @property
    def native_value(self):
        data = self.coordinator.data or {}
        value = data.get(self._key)
        if value is None:
            return None
        if self._key == "battery_soc":
            return round(float(value), 1)
        return round(float(value), 0)

    @property
    def extra_state_attributes(self):
        data = self.coordinator.data or {}
        attrs = {"site_id": data.get("site_id")}
        if self._key == "battery_soc":
            if data.get("soc_source"):
                attrs["soc_source"] = data["soc_source"]
            for key in (
                "operating_mode",
                "unit_status",
                "grid_connection_status",
                "last_report_date",
            ):
                if data.get(key) is not None:
                    attrs[key] = data[key]
        if self._key == "battery_power":
            if data.get("battery_power_source"):
                attrs["source"] = data["battery_power_source"]
            if data.get("storage_w") is not None:
                attrs["storage_w"] = data["storage_w"]
        return attrs

    @property
    def available(self) -> bool:
        data = self.coordinator.data or {}
        return self.coordinator.last_update_success and data.get(self._key) is not None
