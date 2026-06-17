"""Smart Heating integration for Home Assistant – SONOFF TRVZB."""
from __future__ import annotations

import logging
import os
import uuid
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.components.frontend import async_register_built_in_panel, async_remove_panel
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.websocket_api import async_register_command
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import (
    DEFAULT_BOOST_DURATION,
    DEFAULT_TEMP_BOOST,
    DEFAULT_TEMP_COMFORT,
    DEFAULT_TEMP_ECO,
    DEFAULT_TEMP_SLEEP,
    DEFAULT_WINDOW_DELAY,
    DOMAIN,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL,
    STORAGE_KEY,
    STORAGE_VERSION,
)
from .scheduler import SmartHeatingScheduler

_LOGGER = logging.getLogger(__name__)

_DEFAULT_DATA: dict[str, Any] = {
    "rooms": {},
    "schedules": {},
    "global": {
        "mode": "auto",
        "presence_entity": None,
        "weather_entity": None,
        "away_temp": 16.0,
    },
}


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Smart Heating from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    # ── Storage ───────────────────────────────────────────────────────────────
    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    raw = await store.async_load()
    data: dict[str, Any] = _DEFAULT_DATA.copy()
    if raw:
        data.update(raw)
        data.setdefault("global", dict(_DEFAULT_DATA["global"]))

    hass.data[DOMAIN] = {"store": store, "data": data}

    # ── Static files ──────────────────────────────────────────────────────────
    www_path = os.path.join(os.path.dirname(__file__), "www")
    await hass.http.async_register_static_paths([
        StaticPathConfig(
            url_path=f"/{DOMAIN}-panel",
            path=www_path,
            cache_headers=False,
        )
    ])

    # ── Sidebar panel ─────────────────────────────────────────────────────────
    async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        frontend_url_path=PANEL_URL,
        config={
            "_panel_custom": {
                "name": "smart-heating-panel",
                "embed_iframe": False,
                "trust_external": False,
                "js_url": f"/{DOMAIN}-panel/smart-heating-panel.js?v=0.1.4",
            }
        },
        require_admin=False,
    )

    # ── Scheduler ─────────────────────────────────────────────────────────────
    scheduler = SmartHeatingScheduler(hass, lambda: hass.data[DOMAIN]["data"])
    hass.data[DOMAIN]["scheduler"] = scheduler
    await scheduler.async_start()

    # ── Select platform (global mode entity for automations) ─────────────────
    await hass.config_entries.async_forward_entry_setups(entry, ["select"])

    # ── WebSocket API ─────────────────────────────────────────────────────────
    _register_ws_api(hass)

    _LOGGER.info("Smart Heating loaded")
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload the integration."""
    scheduler: SmartHeatingScheduler | None = hass.data[DOMAIN].get("scheduler")
    if scheduler:
        await scheduler.async_stop()
    await hass.config_entries.async_unload_platforms(entry, ["select"])
    async_remove_panel(hass, PANEL_URL)
    hass.data.pop(DOMAIN, None)
    return True


# ── Helpers ───────────────────────────────────────────────────────────────────

def _store(hass: HomeAssistant) -> Store:
    return hass.data[DOMAIN]["store"]


def _data(hass: HomeAssistant) -> dict[str, Any]:
    return hass.data[DOMAIN]["data"]


def _scheduler(hass: HomeAssistant) -> SmartHeatingScheduler:
    return hass.data[DOMAIN]["scheduler"]


async def _save(hass: HomeAssistant) -> None:
    await _store(hass).async_save(_data(hass))


# ── WebSocket API ─────────────────────────────────────────────────────────────

def _register_ws_api(hass: HomeAssistant) -> None:

    # ── get_config ─────────────────────────────────────────────────────────

    @websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/get_config"})
    @websocket_api.async_response
    async def ws_get_config(hass, connection, msg):
        d = _data(hass)
        result = dict(d)
        result["boost_states"] = _scheduler(hass).get_boost_states()
        connection.send_result(msg["id"], result)

    # ── save_room ──────────────────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): f"{DOMAIN}/save_room",
        vol.Required("room"): dict,
    })
    @websocket_api.async_response
    async def ws_save_room(hass, connection, msg):
        room: dict = msg["room"]
        if not room.get("id"):
            room["id"] = uuid.uuid4().hex[:8]
        room.setdefault("temp_comfort", DEFAULT_TEMP_COMFORT)
        room.setdefault("temp_eco", DEFAULT_TEMP_ECO)
        room.setdefault("temp_sleep", DEFAULT_TEMP_SLEEP)
        room.setdefault("temp_boost", DEFAULT_TEMP_BOOST)
        room.setdefault("boost_duration", DEFAULT_BOOST_DURATION)
        room.setdefault("window_open_delay", DEFAULT_WINDOW_DELAY)
        room.setdefault("enabled", True)

        _data(hass)["rooms"][room["id"]] = room
        await _save(hass)

        # Reload listeners so new window/presence entities are tracked
        _scheduler(hass).reload_listeners()

        connection.send_result(msg["id"], {"success": True, "room": room})

    # ── delete_room ────────────────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): f"{DOMAIN}/delete_room",
        vol.Required("room_id"): str,
    })
    @websocket_api.async_response
    async def ws_delete_room(hass, connection, msg):
        room_id: str = msg["room_id"]
        _data(hass)["rooms"].pop(room_id, None)
        _data(hass)["schedules"].pop(room_id, None)
        await _save(hass)
        _scheduler(hass).reload_listeners()
        connection.send_result(msg["id"], {"success": True})

    # ── save_schedule ──────────────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): f"{DOMAIN}/save_schedule",
        vol.Required("room_id"): str,
        vol.Required("slots"): list,
    })
    @websocket_api.async_response
    async def ws_save_schedule(hass, connection, msg):
        room_id: str = msg["room_id"]
        slots: list = msg["slots"]
        for slot in slots:
            if not slot.get("id"):
                slot["id"] = uuid.uuid4().hex[:8]
        _data(hass)["schedules"][room_id] = slots
        await _save(hass)
        connection.send_result(msg["id"], {"success": True, "slots": slots})

    # ── delete_schedule_slot ───────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): f"{DOMAIN}/delete_schedule_slot",
        vol.Required("room_id"): str,
        vol.Required("slot_id"): str,
    })
    @websocket_api.async_response
    async def ws_delete_schedule_slot(hass, connection, msg):
        room_id: str = msg["room_id"]
        slot_id: str = msg["slot_id"]
        slots = _data(hass)["schedules"].get(room_id, [])
        _data(hass)["schedules"][room_id] = [s for s in slots if s.get("id") != slot_id]
        await _save(hass)
        connection.send_result(msg["id"], {"success": True})

    # ── set_global_mode ────────────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): f"{DOMAIN}/set_global_mode",
        vol.Required("mode"): str,
        vol.Optional("presence_entity"): vol.Any(str, None),
        vol.Optional("weather_entity"): vol.Any(str, None),
        vol.Optional("away_temp"): float,
    })
    @websocket_api.async_response
    async def ws_set_global_mode(hass, connection, msg):
        g = _data(hass).setdefault("global", {})
        g["mode"] = msg["mode"]
        if "presence_entity" in msg:
            g["presence_entity"] = msg["presence_entity"]
        if "weather_entity" in msg:
            g["weather_entity"] = msg["weather_entity"]
        if "away_temp" in msg:
            g["away_temp"] = msg["away_temp"]
        await _save(hass)
        _scheduler(hass).reload_listeners()
        # Evaluate immediately so mode change takes effect at once
        hass.async_create_task(_scheduler(hass)._async_evaluate_all())
        connection.send_result(msg["id"], {"success": True, "global": g})

    # ── set_boost ──────────────────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): f"{DOMAIN}/set_boost",
        vol.Required("room_id"): str,
        vol.Optional("duration_minutes", default=DEFAULT_BOOST_DURATION): int,
    })
    @websocket_api.async_response
    async def ws_set_boost(hass, connection, msg):
        room_id: str = msg["room_id"]
        duration: int = msg["duration_minutes"]
        _scheduler(hass).activate_boost(room_id, duration)
        boost_states = _scheduler(hass).get_boost_states()
        connection.send_result(msg["id"], {"success": True, "boost_states": boost_states})

    # ── cancel_boost ───────────────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): f"{DOMAIN}/cancel_boost",
        vol.Required("room_id"): str,
    })
    @websocket_api.async_response
    async def ws_cancel_boost(hass, connection, msg):
        _scheduler(hass).cancel_boost(msg["room_id"])
        boost_states = _scheduler(hass).get_boost_states()
        connection.send_result(msg["id"], {"success": True, "boost_states": boost_states})

    # ── get_boost_states ───────────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): f"{DOMAIN}/get_boost_states",
    })
    @websocket_api.async_response
    async def ws_get_boost_states(hass, connection, msg):
        connection.send_result(msg["id"], _scheduler(hass).get_boost_states())

    # ── get_states ─────────────────────────────────────────────────────────

    @websocket_api.websocket_command({
        vol.Required("type"): f"{DOMAIN}/get_states",
        vol.Required("entity_ids"): list,
    })
    @websocket_api.async_response
    async def ws_get_states(hass, connection, msg):
        states = {}
        for eid in msg["entity_ids"]:
            state = hass.states.get(eid)
            if state:
                states[eid] = {
                    "state": state.state,
                    "attributes": dict(state.attributes),
                }
        connection.send_result(msg["id"], states)

    # ── Register all ──────────────────────────────────────────────────────

    for handler in (
        ws_get_config,
        ws_save_room,
        ws_delete_room,
        ws_save_schedule,
        ws_delete_schedule_slot,
        ws_set_global_mode,
        ws_set_boost,
        ws_cancel_boost,
        ws_get_boost_states,
        ws_get_states,
    ):
        async_register_command(hass, handler)
