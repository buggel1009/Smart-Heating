"""Smart Heating Scheduler — evaluates rooms every minute and applies temperatures."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Callable

from homeassistant.core import HomeAssistant, Event, callback
from homeassistant.helpers.event import (
    async_call_later,
    async_track_state_change_event,
    async_track_time_interval,
)

_LOGGER = logging.getLogger(__name__)

TICK_INTERVAL = timedelta(minutes=1)


def _time_to_mins(t: str) -> int:
    h, m = (t or "00:00").split(":")
    return int(h) * 60 + int(m)


class SmartHeatingScheduler:
    """Core scheduler: evaluates time slots and applies temperatures to climate entities."""

    def __init__(
        self,
        hass: HomeAssistant,
        get_data: Callable[[], dict[str, Any]],
        log_func: Callable[[str, str], None] | None = None,
    ) -> None:
        self._hass = hass
        self._get_data = get_data
        self._log = log_func or (lambda level, msg: None)

        # room_id → datetime when boost ends
        self._boost: dict[str, datetime] = {}
        # window entity_id → cancel callback for the open-delay timer
        self._window_timers: dict[str, Callable] = {}

        self._cancel_tick: Callable | None = None
        self._unsub: list[Callable] = []

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def async_start(self) -> None:
        """Start the scheduler: register listeners and run the first evaluation."""
        self._cancel_tick = async_track_time_interval(
            self._hass, self._async_tick, TICK_INTERVAL
        )
        self._register_state_listeners()
        await self._async_evaluate_all()
        _LOGGER.info("Smart Heating scheduler started (tick every %s)", TICK_INTERVAL)

    async def async_stop(self) -> None:
        """Stop the scheduler and unsubscribe all listeners."""
        if self._cancel_tick:
            self._cancel_tick()
            self._cancel_tick = None
        for unsub in self._unsub:
            unsub()
        self._unsub.clear()
        for cancel in self._window_timers.values():
            cancel()
        self._window_timers.clear()
        _LOGGER.info("Smart Heating scheduler stopped")

    def reload_listeners(self) -> None:
        """Re-register state listeners after rooms change."""
        for unsub in self._unsub:
            unsub()
        self._unsub.clear()
        self._register_state_listeners()

    def _register_state_listeners(self) -> None:
        data = self._get_data()
        rooms = data.get("rooms", {})

        window_sensors = [
            r["window_sensor"]
            for r in rooms.values()
            if r.get("window_sensor")
        ]
        if window_sensors:
            self._unsub.append(
                async_track_state_change_event(
                    self._hass, window_sensors, self._handle_window_change
                )
            )
            _LOGGER.debug("Listening to %d window sensor(s)", len(window_sensors))

        # Collect all presence entities: global list + legacy single + per-room lists
        presence_entities: set[str] = set()
        g = data.get("global", {})
        for e in g.get("presence_entities") or []:
            if e:
                presence_entities.add(e)
        if g.get("presence_entity"):  # backward compat
            presence_entities.add(g["presence_entity"])
        for room in data.get("rooms", {}).values():
            for e in room.get("presence_entities") or []:
                if e:
                    presence_entities.add(e)
        if presence_entities:
            self._unsub.append(
                async_track_state_change_event(
                    self._hass, list(presence_entities), self._handle_presence_change
                )
            )
            _LOGGER.debug("Listening to %d presence entity/entities", len(presence_entities))

    # ── Boost API ─────────────────────────────────────────────────────────────

    def activate_boost(self, room_id: str, duration_minutes: int) -> None:
        """Activate boost mode for a room for the given number of minutes."""
        self._boost[room_id] = datetime.now() + timedelta(minutes=duration_minutes)
        room_name = self._get_data().get("rooms", {}).get(room_id, {}).get("name", room_id)
        _LOGGER.info("Boost ON: room=%s, duration=%d min", room_id, duration_minutes)
        self._log("info", f"🔥 Boost AN: {room_name} für {duration_minutes} Min")
        self._hass.async_create_task(self._async_evaluate_room_by_id(room_id))

    def cancel_boost(self, room_id: str) -> None:
        """Cancel boost mode for a room."""
        self._boost.pop(room_id, None)
        room_name = self._get_data().get("rooms", {}).get(room_id, {}).get("name", room_id)
        _LOGGER.info("Boost OFF: room=%s", room_id)
        self._log("info", f"⏹ Boost AUS: {room_name}")
        self._hass.async_create_task(self._async_evaluate_room_by_id(room_id))

    def get_boost_states(self) -> dict[str, str | None]:
        """Return boost end times as ISO strings (active boosts only)."""
        now = datetime.now()
        result: dict[str, str | None] = {}
        for room_id, end in list(self._boost.items()):
            if end > now:
                result[room_id] = end.isoformat()
            else:
                self._boost.pop(room_id, None)
        return result

    # ── Event handlers ────────────────────────────────────────────────────────

    @callback
    def _handle_window_change(self, event: Event) -> None:
        """Handle window sensor state change with configurable delay."""
        entity_id: str = event.data.get("entity_id", "")
        new_state = event.data.get("new_state")
        if new_state is None:
            return

        room_id = self._find_room_by_window_sensor(entity_id)
        if not room_id:
            return

        # Cancel any pending delay timer for this sensor
        cancel = self._window_timers.pop(entity_id, None)
        if cancel:
            cancel()

        if new_state.state == "on":  # window opened
            data = self._get_data()
            room = data.get("rooms", {}).get(room_id, {})
            delay_secs = float(room.get("window_open_delay", 5)) * 60
            room_name = room.get("name", room_id)

            _LOGGER.debug(
                "Window %s opened → heating pause in %.0f s (room=%s)",
                entity_id, delay_secs, room_id,
            )
            self._log("warning", f"🪟 Fenster offen: {room_name} — Heizpause in {int(delay_secs/60)} Min")

            @callback
            def _on_delay_expired(_now, _room_id=room_id) -> None:
                self._hass.async_create_task(self._async_evaluate_room_by_id(_room_id))

            self._window_timers[entity_id] = async_call_later(
                self._hass, delay_secs, _on_delay_expired
            )
        else:  # window closed → restore heating immediately
            room_name = self._get_data().get("rooms", {}).get(room_id, {}).get("name", room_id)
            _LOGGER.debug("Window %s closed → restoring heating (room=%s)", entity_id, room_id)
            self._log("info", f"🪟 Fenster zu: {room_name} — Heizung wiederhergestellt")
            self._hass.async_create_task(self._async_evaluate_room_by_id(room_id))

    @callback
    def _handle_presence_change(self, event: Event) -> None:
        """Re-evaluate all rooms when the presence entity changes."""
        new_state = event.data.get("new_state")
        if new_state:
            entity_id = event.data.get("entity_id", "")
            status = "🏠 zuhause" if new_state.state == "home" else "🏃 weg"
            _LOGGER.debug("Presence changed to %s → full re-evaluation", new_state.state)
            self._log("info", f"👤 Anwesenheit: {entity_id} ist {status}")
        self._hass.async_create_task(self._async_evaluate_all())

    # ── Core evaluation loop ──────────────────────────────────────────────────

    async def _async_tick(self, _now) -> None:
        await self._async_evaluate_all()

    async def _async_evaluate_all(self) -> None:
        data = self._get_data()
        global_mode = self._resolve_global_mode(data)
        outdoor_temp = self._get_outdoor_temp(data)

        for room_id, room in data.get("rooms", {}).items():
            if not room.get("enabled", True):
                continue
            await self._async_apply_temperature(room_id, room, data, global_mode, outdoor_temp)

    async def _async_evaluate_room_by_id(self, room_id: str) -> None:
        data = self._get_data()
        room = data.get("rooms", {}).get(room_id)
        if not room or not room.get("enabled", True):
            return
        global_mode = self._resolve_global_mode(data)
        outdoor_temp = self._get_outdoor_temp(data)
        await self._async_apply_temperature(room_id, room, data, global_mode, outdoor_temp)

    async def _async_apply_temperature(
        self,
        room_id: str,
        room: dict,
        data: dict,
        global_mode: str,
        outdoor_temp: float | None,
    ) -> None:
        climate_entity = room.get("climate_entity")
        if not climate_entity:
            return

        target = self._calculate_target(room_id, room, data, global_mode, outdoor_temp)
        if target is None:
            return

        state = self._hass.states.get(climate_entity)
        if not state:
            _LOGGER.debug("Climate entity not available: %s", climate_entity)
            return

        # Round to 0.5 steps — SONOFF TRVZB precision
        target = round(target * 2) / 2

        current_target = state.attributes.get("temperature")
        if current_target == target:
            return

        _LOGGER.info(
            "[%s] %s → %.1f °C (was %.1f, mode=%s)",
            room.get("name", room_id), climate_entity, target,
            current_target or 0, global_mode,
        )
        self._log("info", f"🌡️ {room.get('name', room_id)}: {current_target or '?'} → {target} °C (Modus: {global_mode})")
        await self._hass.services.async_call(
            "climate",
            "set_temperature",
            {"entity_id": climate_entity, "temperature": target},
            blocking=False,
        )

    # ── Target temperature logic ──────────────────────────────────────────────

    def _calculate_target(
        self,
        room_id: str,
        room: dict,
        data: dict,
        global_mode: str,
        outdoor_temp: float | None,
    ) -> float | None:

        # Priority 1: Boost mode
        boost_end = self._boost.get(room_id)
        if boost_end:
            if datetime.now() < boost_end:
                return float(room.get("temp_boost", 24.0))
            self._boost.pop(room_id, None)  # expired

        # Priority 2: Window open (after delay)
        if self._is_window_currently_heating_paused(room):
            _LOGGER.debug("[%s] Window open → eco temp", room.get("name", room_id))
            return float(room.get("temp_eco", 17.0))

        # Priority 3a: Room-level presence — if defined and all away → eco
        room_entities = [e for e in (room.get("presence_entities") or []) if e]
        if room_entities and not self._is_anyone_home(room_entities):
            _LOGGER.debug("[%s] Room presence: all away → eco", room.get("name", room_id))
            return float(room.get("temp_eco", 17.0))

        # Priority 3b: Global mode override
        if global_mode == "away":
            return float(data.get("global", {}).get("away_temp", room.get("temp_eco", 17.0)))
        if global_mode == "sleep":
            return float(room.get("temp_sleep", 18.0))

        # Priority 4: Active schedule slot
        now  = datetime.now()
        day  = now.weekday()        # 0 = Monday, 6 = Sunday
        mins = now.hour * 60 + now.minute

        for slot in data.get("schedules", {}).get(room_id, []):
            if not slot.get("enabled", True):
                continue
            if day not in slot.get("days", []):
                continue
            if _time_to_mins(slot["start"]) <= mins < _time_to_mins(slot["end"]):
                slot_mode = slot.get("mode", "custom")
                if slot_mode == "comfort":
                    temp = float(room.get("temp_comfort", 21.0))
                elif slot_mode == "eco":
                    temp = float(room.get("temp_eco", 17.0))
                elif slot_mode == "sleep":
                    temp = float(room.get("temp_sleep", 18.0))
                else:  # custom or legacy slots with raw temperature
                    temp = float(slot.get("temperature", 21.0))
                return self._apply_outdoor_compensation(temp, outdoor_temp)

        # Priority 5: Fallback eco temperature
        return float(room.get("temp_eco", 17.0))

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _is_window_currently_heating_paused(self, room: dict) -> bool:
        """Return True if window is open AND the delay has already expired (timer fired)."""
        sensor = room.get("window_sensor")
        if not sensor:
            return False
        state = self._hass.states.get(sensor)
        if not state or state.state != "on":
            return False
        # If there's still a pending delay timer → not paused yet
        return sensor not in self._window_timers

    def _resolve_global_mode(self, data: dict) -> str:
        """Return effective mode; 'auto' falls back to 'away' if all presence entities are away."""
        mode = data.get("global", {}).get("mode", "auto")
        if mode != "auto":
            return mode
        g = data.get("global", {})
        entities: list[str] = [e for e in (g.get("presence_entities") or []) if e]
        if g.get("presence_entity"):  # backward compat
            entities.append(g["presence_entity"])
        if entities and not self._is_anyone_home(entities):
            return "away"
        return "auto"

    def _is_anyone_home(self, entities: list[str]) -> bool:
        """Return True if at least one person entity state is 'home'."""
        for entity_id in entities:
            state = self._hass.states.get(entity_id)
            if state and state.state == "home":
                return True
        return False

    def _find_room_by_window_sensor(self, entity_id: str) -> str | None:
        for room_id, room in self._get_data().get("rooms", {}).items():
            if room.get("window_sensor") == entity_id:
                return room_id
        return None

    def _get_outdoor_temp(self, data: dict) -> float | None:
        g = data.get("global", {})
        # Try weather entity first (reads temperature attribute)
        weather_entity = g.get("weather_entity")
        if weather_entity:
            state = self._hass.states.get(weather_entity)
            if state:
                t = state.attributes.get("temperature")
                if t is not None:
                    return float(t)
        # Fallback: dedicated outdoor temperature sensor (reads state directly)
        sensor_entity = g.get("outdoor_temp_sensor")
        if sensor_entity:
            state = self._hass.states.get(sensor_entity)
            if state and state.state not in ("unavailable", "unknown"):
                try:
                    return float(state.state)
                except ValueError:
                    pass
        return None

    @staticmethod
    def _apply_outdoor_compensation(temp: float, outdoor_temp: float | None) -> float:
        """Adjust target temperature based on outdoor temperature."""
        if outdoor_temp is None:
            return temp
        # Very warm outside → reduce heating target
        if outdoor_temp >= 18.0:
            return max(temp - 2.0, 15.0)
        # Very cold outside → add a little extra
        if outdoor_temp < 0.0:
            return min(temp + 0.5, 30.0)
        return temp
