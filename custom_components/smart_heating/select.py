"""Select platform — exposes the global heating mode as a HA select entity."""
from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .scheduler import SmartHeatingScheduler

# Human-readable labels used in the HA UI and automations
MODE_TO_LABEL: dict[str, str] = {
    "auto":  "Zuhause",
    "away":  "Abwesend",
    "sleep": "Nacht",
}
LABEL_TO_MODE: dict[str, str] = {v: k for k, v in MODE_TO_LABEL.items()}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    async_add_entities([SmartHeatingModeSelect(hass)], update_before_add=True)


class SmartHeatingModeSelect(SelectEntity):
    """Select entity that controls the global Smart Heating mode."""

    _attr_name        = "Smart Heating Modus"
    _attr_unique_id   = "smart_heating_global_mode"
    _attr_icon        = "mdi:thermostat-auto"
    _attr_options     = list(MODE_TO_LABEL.values())   # ["Zuhause", "Abwesend", "Nacht"]
    _attr_should_poll = False

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    @property
    def current_option(self) -> str:
        mode = (
            self._hass.data.get(DOMAIN, {})
            .get("data", {})
            .get("global", {})
            .get("mode", "auto")
        )
        return MODE_TO_LABEL.get(mode, "Zuhause")

    async def async_select_option(self, option: str) -> None:
        """Called when the user (or automation) picks a new option."""
        mode = LABEL_TO_MODE.get(option, "auto")

        domain_data = self._hass.data.get(DOMAIN, {})
        g = domain_data.get("data", {}).setdefault("global", {})
        g["mode"] = mode

        store = domain_data.get("store")
        if store:
            await store.async_save(domain_data["data"])

        scheduler: SmartHeatingScheduler | None = domain_data.get("scheduler")
        if scheduler:
            self._hass.async_create_task(scheduler._async_evaluate_all())

        # Notify HA that our state changed
        self.async_write_ha_state()
