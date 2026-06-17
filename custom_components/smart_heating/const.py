"""Constants for the Smart Heating integration."""

DOMAIN = "smart_heating"

PANEL_URL = "smart-heating"
PANEL_TITLE = "Smart Heating"
PANEL_ICON = "mdi:radiator"

STORAGE_KEY = "smart_heating_data"
STORAGE_VERSION = 1

DEFAULT_TEMP_COMFORT = 21.0
DEFAULT_TEMP_ECO = 17.0
DEFAULT_TEMP_SLEEP = 18.0
DEFAULT_TEMP_BOOST = 24.0
DEFAULT_BOOST_DURATION = 60
DEFAULT_WINDOW_DELAY = 5

WS_GET_CONFIG = f"{DOMAIN}/get_config"
WS_SAVE_ROOM = f"{DOMAIN}/save_room"
WS_DELETE_ROOM = f"{DOMAIN}/delete_room"
WS_SAVE_SCHEDULE = f"{DOMAIN}/save_schedule"
WS_DELETE_SCHEDULE_SLOT = f"{DOMAIN}/delete_schedule_slot"
WS_GET_STATES = f"{DOMAIN}/get_states"
