/**
 * Smart Heating Panel for Home Assistant
 * Designed for SONOFF TRVZB Zigbee thermostats via Zigbee2MQTT
 */

const DOMAIN = 'smart_heating';
const DAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAYS_FULL  = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

// ── Utilities ─────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

function fmtTemp(t) {
  return t != null ? `${Number(t).toFixed(1)} °C` : '—';
}

function timeToMins(t) {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return h * 60 + m;
}

function minsToTime(m) {
  return `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
}

function slotLabel(slot) {
  const days = (slot.days || []).map(d => DAYS_SHORT[d]).join(', ');
  return `${days} · ${slot.start}–${slot.end} · ${fmtTemp(slot.temperature)}`;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--primary-background-color);
    color: var(--primary-text-color);
    font-family: var(--paper-font-body1_-_font-family, sans-serif);
    font-size: 14px;
    box-sizing: border-box;
  }
  * { box-sizing: border-box; }

  /* ── Header ── */
  .sh-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
    height: 56px;
    background: var(--app-header-background-color, var(--primary-color));
    color: var(--app-header-text-color, #fff);
    flex-shrink: 0;
    box-shadow: 0 2px 4px rgba(0,0,0,.2);
    z-index: 10;
  }
  .sh-header h1 {
    flex: 1;
    margin: 0;
    font-size: 18px;
    font-weight: 500;
  }
  .sh-header button {
    background: none;
    border: none;
    cursor: pointer;
    color: inherit;
    padding: 6px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .sh-header button:hover { background: rgba(255,255,255,.15); }
  .sh-back { margin-right: 4px; }

  /* ── Mode bar ── */
  .mode-bar {
    display: flex;
    gap: 8px;
    padding: 10px 16px;
    background: var(--card-background-color, #fff);
    border-bottom: 1px solid var(--divider-color, #e0e0e0);
    flex-shrink: 0;
  }
  .mode-btn {
    flex: 1;
    padding: 6px 0;
    border: 1px solid var(--divider-color, #e0e0e0);
    border-radius: 20px;
    background: none;
    cursor: pointer;
    font-size: 13px;
    color: var(--secondary-text-color);
    transition: all .15s;
  }
  .mode-btn.active {
    background: var(--primary-color);
    color: #fff;
    border-color: var(--primary-color);
  }

  /* ── Scrollable content ── */
  .sh-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  /* ── Room cards grid ── */
  .rooms-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
  }
  .room-card {
    background: var(--card-background-color, #fff);
    border-radius: 12px;
    padding: 16px;
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0,0,0,.1);
    transition: box-shadow .15s, transform .1s;
    position: relative;
    overflow: hidden;
  }
  .room-card:hover { box-shadow: 0 3px 10px rgba(0,0,0,.18); transform: translateY(-1px); }
  .room-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .room-name { font-weight: 600; font-size: 15px; }
  .room-badges { display: flex; gap: 4px; }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 7px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 500;
  }
  .badge-window  { background: #e3f2fd; color: #1565c0; }
  .badge-boost   { background: #fff3e0; color: #e65100; }
  .badge-off     { background: #f5f5f5; color: #757575; }
  .badge-heating { background: #fff3e0; color: #e65100; }
  .badge-idle    { background: #e8f5e9; color: #2e7d32; }

  .temp-row {
    display: flex;
    align-items: baseline;
    gap: 16px;
    margin-bottom: 10px;
  }
  .temp-current { font-size: 28px; font-weight: 300; }
  .temp-sep { color: var(--secondary-text-color); }
  .temp-target { font-size: 18px; color: var(--primary-color); }

  /* color bar showing heating intensity */
  .heat-bar {
    height: 4px;
    border-radius: 2px;
    background: var(--divider-color, #eee);
    overflow: hidden;
    margin-bottom: 6px;
  }
  .heat-bar-fill {
    height: 100%;
    border-radius: 2px;
    background: linear-gradient(to right, #ff9800, #f44336);
    transition: width .3s;
  }

  /* valve bar */
  .valve-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .valve-label { font-size: 11px; color: var(--secondary-text-color); min-width: 42px; }
  .valve-bar {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: var(--divider-color, #eee);
    overflow: hidden;
  }
  .valve-bar-fill {
    height: 100%;
    border-radius: 2px;
    background: linear-gradient(to right, #4fc3f7, #0288d1);
    transition: width .4s;
  }
  .valve-pct { font-size: 11px; color: var(--secondary-text-color); min-width: 28px; text-align: right; }

  /* valve gauge in detail view */
  .valve-gauge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 0 12px;
  }
  .valve-gauge-ring {
    position: relative;
    width: 72px; height: 72px;
  }
  .valve-gauge-ring svg { transform: rotate(-90deg); }
  .valve-gauge-pct {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 300;
  }
  .valve-gauge-label { font-size: 12px; color: var(--secondary-text-color); }

  .schedule-hint {
    font-size: 12px;
    color: var(--secondary-text-color);
  }

  /* ── Empty state ── */
  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--secondary-text-color);
  }
  .empty-state svg { opacity: .3; margin-bottom: 16px; }
  .empty-state p { font-size: 15px; margin: 0 0 20px; }

  /* ── FAB ── */
  .fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 56px;
    height: 56px;
    border-radius: 28px;
    background: var(--primary-color);
    color: #fff;
    border: none;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,.3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    z-index: 20;
    transition: transform .15s;
  }
  .fab:hover { transform: scale(1.08); }

  /* ── Room Detail ── */
  .detail-section { margin-bottom: 20px; }
  .detail-section h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--secondary-text-color);
    margin: 0 0 8px;
    font-weight: 500;
  }
  .detail-card {
    background: var(--card-background-color, #fff);
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 1px 4px rgba(0,0,0,.08);
  }
  .temp-hero {
    display: flex;
    align-items: center;
    justify-content: space-around;
    padding: 20px 0;
  }
  .temp-hero-item { text-align: center; }
  .temp-hero-value { font-size: 36px; font-weight: 200; }
  .temp-hero-label { font-size: 12px; color: var(--secondary-text-color); margin-top: 4px; }
  .temp-hero-arrow { font-size: 24px; color: var(--primary-color); }

  .entity-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--divider-color, #f0f0f0);
    font-size: 13px;
  }
  .entity-row:last-child { border-bottom: none; }
  .entity-label { color: var(--secondary-text-color); min-width: 120px; }
  .entity-value { flex: 1; font-family: monospace; font-size: 12px; }
  .entity-state { margin-left: auto; font-weight: 500; }

  /* ── Schedule timeline ── */
  .timeline-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
    font-size: 12px;
  }
  .timeline-day { width: 22px; color: var(--secondary-text-color); text-align: right; flex-shrink: 0; }
  .timeline-bar {
    flex: 1;
    height: 16px;
    background: var(--divider-color, #f0f0f0);
    border-radius: 4px;
    position: relative;
    overflow: hidden;
  }
  .timeline-slot {
    position: absolute;
    top: 0;
    height: 100%;
    border-radius: 3px;
    background: linear-gradient(135deg, #ff9800, #f44336);
    opacity: .85;
    cursor: pointer;
    transition: opacity .1s;
  }
  .timeline-slot:hover { opacity: 1; }
  .timeline-ticks {
    display: flex;
    gap: 0;
    margin-left: 30px;
    padding-top: 2px;
  }
  .timeline-tick {
    flex: 1;
    font-size: 10px;
    color: var(--secondary-text-color);
    text-align: left;
  }

  /* ── Slots list ── */
  .slot-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--card-background-color, #fff);
    border-radius: 8px;
    margin-bottom: 6px;
    cursor: pointer;
    transition: background .1s;
    border: 1px solid var(--divider-color, #eee);
  }
  .slot-item:hover { background: var(--secondary-background-color, #f5f5f5); }
  .slot-days { display: flex; gap: 3px; }
  .slot-day-chip {
    width: 22px; height: 22px;
    border-radius: 11px;
    background: var(--primary-color);
    color: #fff;
    font-size: 10px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 600;
  }
  .slot-day-chip.inactive { background: var(--divider-color, #e0e0e0); color: var(--secondary-text-color); }
  .slot-info { flex: 1; }
  .slot-time { font-weight: 500; font-size: 13px; }
  .slot-temp { font-size: 12px; color: var(--secondary-text-color); }
  .slot-delete {
    background: none; border: none; cursor: pointer;
    color: var(--error-color, #f44336);
    padding: 4px; border-radius: 4px; opacity: .6;
  }
  .slot-delete:hover { opacity: 1; background: rgba(244,67,54,.1); }

  /* ── Modal ── */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,.5);
    z-index: 100;
    display: flex; align-items: flex-end; justify-content: center;
  }
  .modal-overlay.center { align-items: center; }
  .modal-sheet {
    background: var(--card-background-color, #fff);
    border-radius: 20px 20px 0 0;
    padding: 24px 20px;
    width: 100%; max-width: 560px;
    max-height: 90vh;
    overflow-y: auto;
    animation: slideUp .2s ease;
  }
  .modal-overlay.center .modal-sheet {
    border-radius: 16px;
    max-height: 80vh;
  }
  @keyframes slideUp {
    from { transform: translateY(40px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
  .modal-title {
    font-size: 17px; font-weight: 600;
    margin: 0 0 20px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .modal-close {
    background: none; border: none; cursor: pointer;
    font-size: 20px; color: var(--secondary-text-color);
    padding: 2px 6px; border-radius: 4px;
  }
  .modal-close:hover { background: var(--secondary-background-color, #f0f0f0); }

  /* ── Form controls ── */
  .form-group { margin-bottom: 16px; }
  .form-group label {
    display: block;
    font-size: 12px;
    color: var(--secondary-text-color);
    margin-bottom: 6px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  .form-group input,
  .form-group select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--divider-color, #e0e0e0);
    border-radius: 8px;
    background: var(--primary-background-color);
    color: var(--primary-text-color);
    font-size: 14px;
    outline: none;
    transition: border-color .15s;
  }
  .form-group input:focus,
  .form-group select:focus { border-color: var(--primary-color); }
  .form-row { display: flex; gap: 12px; }
  .form-row .form-group { flex: 1; }

  .day-picker { display: flex; gap: 6px; flex-wrap: wrap; }
  .day-toggle {
    width: 36px; height: 36px;
    border-radius: 18px;
    border: 1px solid var(--divider-color, #e0e0e0);
    background: none; cursor: pointer;
    font-size: 12px; font-weight: 500;
    color: var(--secondary-text-color);
    transition: all .15s;
  }
  .day-toggle.active {
    background: var(--primary-color);
    border-color: var(--primary-color);
    color: #fff;
  }

  .modal-actions {
    display: flex; gap: 10px; margin-top: 20px;
    justify-content: flex-end;
  }
  .btn {
    padding: 10px 20px;
    border-radius: 8px;
    border: none; cursor: pointer;
    font-size: 14px; font-weight: 500;
    transition: opacity .15s;
  }
  .btn:hover { opacity: .85; }
  .btn-primary { background: var(--primary-color); color: #fff; }
  .btn-secondary { background: var(--secondary-background-color, #f0f0f0); color: var(--primary-text-color); }
  .btn-danger { background: var(--error-color, #f44336); color: #fff; }
  .btn-add {
    width: 100%;
    padding: 10px;
    background: none;
    border: 1px dashed var(--divider-color, #ccc);
    border-radius: 8px;
    cursor: pointer;
    color: var(--primary-color);
    font-size: 13px;
    font-weight: 500;
    margin-top: 4px;
    transition: background .1s;
  }
  .btn-add:hover { background: var(--secondary-background-color, #f5f5f5); }

  .divider { height: 1px; background: var(--divider-color, #eee); margin: 16px 0; }
  .section-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 10px;
  }
  .loading {
    display: flex; align-items: center; justify-content: center;
    height: 200px; color: var(--secondary-text-color);
    flex-direction: column; gap: 12px;
  }
  .spinner {
    width: 32px; height: 32px;
    border: 3px solid var(--divider-color);
    border-top-color: var(--primary-color);
    border-radius: 50%;
    animation: spin .7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

// ── Icons (inline SVG strings) ────────────────────────────────────────────────

const ICON = {
  back:     `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`,
  add:      `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
  settings: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`,
  edit:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,
  delete:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
  radiator: `<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M4 19H2v-2h2V7H2V5h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h-2v12h2v2h-2v2h-2v-2h-2v2h-2v-2h-2v2h-2v-2H8v2H6v-2H4v0zm2-2h2V7H6v10zm4 0h2V7h-2v10zm4 0h2V7h-2v10z"/></svg>`,
  window:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-1 17H5V5h14v14zm-6-2v-5h-2v5H7v-2h2v-1H7v-2h2V9h2v1h2V9h2v2h-2v1h2v2h-2v1h2v2h-6z"/></svg>`,
  boost:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 .67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>`,
};

// ── Main Panel Element ─────────────────────────────────────────────────────────

class SmartHeatingPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass    = null;
    this._loaded  = false;
    this._rooms   = {};
    this._schedules = {};
    this._global  = { mode: 'auto', presence_entity: null, weather_entity: null, away_temp: 16 };
    this._view    = 'dashboard';   // 'dashboard' | 'room'
    this._roomId  = null;
    this._modal   = null;          // 'room-edit' | 'slot-edit' | null
    this._editRoom   = null;       // room being edited
    this._editSlot   = null;       // slot being edited
    this._editSlotRoomId = null;
    this._boostStates = {};        // room_id → ISO end datetime string
    this._boostTimer  = null;      // setInterval for countdown updates
  }

  // ── HA lifecycle ──────────────────────────────────────────────────────────

  set hass(hass) {
    this._hass = hass;
    if (!this._loaded) {
      this._loaded = true;
      this._init();
    } else {
      this._updateLiveTemps();
    }
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = CSS;
    this.shadowRoot.appendChild(style);
    if (this._loaded) this._render();
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  async _init() {
    try {
      const data = await this._ws(DOMAIN + '/get_config');
      this._rooms       = data.rooms       || {};
      this._schedules   = data.schedules   || {};
      this._global      = data.global      || this._global;
      this._boostStates = data.boost_states || {};
    } catch (e) {
      console.error('[SmartHeating] init error', e);
    }
    this._startBoostCountdown();
    this._render();
  }

  async _ws(type, params = {}) {
    return await this._hass.callWS({ type, ...params });
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  _goRoom(roomId) {
    this._view   = 'room';
    this._roomId = roomId;
    this._render();
  }

  _goDashboard() {
    this._view   = 'dashboard';
    this._roomId = null;
    this._render();
  }

  _openRoomEditor(room = null) {
    this._editRoom = room ? { ...room } : {
      id: null, name: '', climate_entity: '', temp_sensor: '',
      window_sensor: '', valve_entity: '', temp_comfort: 21, temp_eco: 17,
      temp_sleep: 18, temp_boost: 24, boost_duration: 60,
      window_open_delay: 5, enabled: true,
    };
    this._modal = 'room-edit';
    this._renderModal();
  }

  _openSlotEditor(roomId, slot = null) {
    this._editSlotRoomId = roomId;
    this._editSlot = slot ? { ...slot, days: [...(slot.days || [])] } : {
      id: null, days: [0, 1, 2, 3, 4], start: '06:00', end: '08:00', temperature: 21,
    };
    this._modal = 'slot-edit';
    this._renderModal();
  }

  _closeModal() {
    this._modal = null;
    const el = this.shadowRoot.querySelector('.modal-overlay');
    if (el) el.remove();
  }

  // ── Save / Delete actions ─────────────────────────────────────────────────

  async _saveRoom(room) {
    try {
      const res = await this._ws(DOMAIN + '/save_room', { room });
      this._rooms[res.room.id] = res.room;
      this._closeModal();
      this._render();
    } catch(e) { alert('Fehler beim Speichern: ' + e.message); }
  }

  async _deleteRoom(roomId) {
    if (!confirm('Raum wirklich löschen?')) return;
    await this._ws(DOMAIN + '/delete_room', { room_id: roomId });
    delete this._rooms[roomId];
    delete this._schedules[roomId];
    this._goDashboard();
  }

  async _saveSlot(roomId, slot) {
    const slots = [...(this._schedules[roomId] || [])];
    const idx = slots.findIndex(s => s.id === slot.id);
    if (idx >= 0) slots[idx] = slot; else slots.push(slot);
    try {
      const res = await this._ws(DOMAIN + '/save_schedule', { room_id: roomId, slots });
      this._schedules[roomId] = res.slots;
      this._closeModal();
      this._render();
    } catch(e) { alert('Fehler: ' + e.message); }
  }

  async _deleteSlot(roomId, slotId) {
    await this._ws(DOMAIN + '/delete_schedule_slot', { room_id: roomId, slot_id: slotId });
    this._schedules[roomId] = (this._schedules[roomId] || []).filter(s => s.id !== slotId);
    this._render();
  }

  async _setGlobalMode(mode) {
    try {
      const res = await this._ws(DOMAIN + '/set_global_mode', { mode });
      this._global = res.global;
    } catch(e) {
      this._global.mode = mode; // optimistic fallback
    }
    this._render();
  }

  async _setBoost(roomId, durationMinutes) {
    try {
      const res = await this._ws(DOMAIN + '/set_boost', {
        room_id: roomId, duration_minutes: durationMinutes
      });
      this._boostStates = res.boost_states || {};
      this._render();
    } catch(e) { alert('Boost-Fehler: ' + e.message); }
  }

  async _cancelBoost(roomId) {
    try {
      const res = await this._ws(DOMAIN + '/cancel_boost', { room_id: roomId });
      this._boostStates = res.boost_states || {};
      this._render();
    } catch(e) { alert('Fehler: ' + e.message); }
  }

  _boostRemainingMins(roomId) {
    const end = this._boostStates[roomId];
    if (!end) return null;
    const diff = Math.round((new Date(end) - Date.now()) / 60000);
    return diff > 0 ? diff : null;
  }

  _startBoostCountdown() {
    if (this._boostTimer) clearInterval(this._boostTimer);
    this._boostTimer = setInterval(() => {
      const anyActive = Object.values(this._boostStates).some(
        end => end && new Date(end) > Date.now()
      );
      if (anyActive) {
        // Only update countdown labels, no full re-render
        this._updateBoostCountdowns();
      }
    }, 30000); // refresh every 30 s
  }

  _updateBoostCountdowns() {
    for (const [roomId, end] of Object.entries(this._boostStates)) {
      const el = this.shadowRoot.querySelector(`[data-boost-id="${roomId}"]`);
      if (!el) continue;
      const mins = this._boostRemainingMins(roomId);
      if (mins) el.textContent = `🔥 Boost ${mins} min`;
      else el.textContent = '';
    }
  }

  // ── Temperature helpers ───────────────────────────────────────────────────

  _currentTemp(room) {
    const sensor = room.temp_sensor && this._hass.states[room.temp_sensor];
    if (sensor) return parseFloat(sensor.state);
    const climate = room.climate_entity && this._hass.states[room.climate_entity];
    if (climate) return climate.attributes.current_temperature;
    return null;
  }

  _targetTemp(room) {
    const climate = room.climate_entity && this._hass.states[room.climate_entity];
    if (climate) return climate.attributes.temperature;
    return null;
  }

  _climateMode(room) {
    const climate = room.climate_entity && this._hass.states[room.climate_entity];
    if (!climate) return 'off';
    return climate.state; // heat, off, auto
  }

  _isWindowOpen(room) {
    if (!room.window_sensor) return false;
    const s = this._hass.states[room.window_sensor];
    return s && s.state === 'on';
  }

  _heatPercent(room) {
    const cur = this._currentTemp(room);
    const tgt = this._targetTemp(room);
    if (cur == null || tgt == null) return 0;
    const diff = tgt - cur;
    return Math.max(0, Math.min(100, diff / 3 * 100));
  }

  _heatingState(room) {
    const climate = room.climate_entity && this._hass.states[room.climate_entity];
    if (!climate) return null;
    // hvac_action is the HA standard attribute (heating/idle/off)
    const action = climate.attributes.hvac_action;
    if (action === 'heating') return 'heat';
    if (action === 'idle' || action === 'off') return 'idle';
    // Z2M may expose running_state as a separate attribute
    const rs = climate.attributes.running_state;
    if (rs === 'heat') return 'heat';
    if (rs === 'idle' || rs === 'off') return 'idle';
    // Last resort: off state = idle
    if (climate.state === 'off') return 'idle';
    return null;
  }

  _valveGaugeSVG(pct, size = 72) {
    const r = (size / 2) - 6;
    const circ = 2 * Math.PI * r;
    const filled = (pct / 100) * circ;
    const color = pct > 60 ? '#f44336' : pct > 20 ? '#ff9800' : '#0288d1';
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none"
        stroke="var(--divider-color,#eee)" stroke-width="5"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none"
        stroke="${color}" stroke-width="5"
        stroke-dasharray="${filled} ${circ - filled}"
        stroke-linecap="round"/>
    </svg>`;
  }

  // ── Live temp update (called on every hass update) ────────────────────────

  _updateLiveTemps() {
    if (this._modal) return;
    for (const room of Object.values(this._rooms)) {
      const card = this.shadowRoot.querySelector(`[data-room-id="${room.id}"]`);
      if (!card) continue;
      const cur = this._currentTemp(room);
      const tgt = this._targetTemp(room);
      const curEl  = card.querySelector('.temp-current');
      const tgtEl  = card.querySelector('.temp-target');
      const fill   = card.querySelector('.heat-bar-fill');
      if (curEl) curEl.textContent = fmtTemp(cur);
      if (tgtEl) tgtEl.textContent = fmtTemp(tgt);
      if (fill)  fill.style.width  = this._heatPercent(room) + '%';
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  _render() {
    const root = this.shadowRoot;
    // Keep the style element
    const existing = root.querySelector('style');
    root.innerHTML = '';
    if (existing) root.appendChild(existing);
    else { const s = document.createElement('style'); s.textContent = CSS; root.appendChild(s); }

    if (!this._hass) { root.innerHTML += '<div class="loading"><div class="spinner"></div><span>Verbinde…</span></div>'; return; }

    if (this._view === 'dashboard') this._renderDashboard(root);
    else if (this._view === 'room') this._renderRoomDetail(root);
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  _renderDashboard(root) {
    const rooms = Object.values(this._rooms);

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="sh-header">
        <div style="display:flex;align-items:center;gap:8px;flex:1">
          ${ICON.radiator}
          <h1>Smart Heating</h1>
          <span style="font-size:11px;opacity:.6;font-weight:400">v0.1.8</span>
        </div>
        <button class="btn-settings" title="Einstellungen">${ICON.settings}</button>
      </div>

      <div class="mode-bar">
        <button class="mode-btn ${this._global.mode === 'auto'    ? 'active' : ''}" data-mode="auto">🏠 Zuhause</button>
        <button class="mode-btn ${this._global.mode === 'away'    ? 'active' : ''}" data-mode="away">🏃 Abwesend</button>
        <button class="mode-btn ${this._global.mode === 'sleep'   ? 'active' : ''}" data-mode="sleep">🌙 Nacht</button>
      </div>

      <div class="sh-content">
        ${rooms.length === 0 ? this._emptyState() : `<div class="rooms-grid">${rooms.map(r => this._roomCardHTML(r)).join('')}</div>`}
      </div>

      <button class="fab" title="Raum hinzufügen">${ICON.add}</button>
    `;

    root.appendChild(wrap);

    // Events
    wrap.querySelector('.btn-settings').addEventListener('click', () => this._openRoomEditor());
    wrap.querySelector('.fab').addEventListener('click', () => this._openRoomEditor());
    wrap.querySelectorAll('.mode-btn').forEach(btn =>
      btn.addEventListener('click', () => this._setGlobalMode(btn.dataset.mode)));
    wrap.querySelectorAll('.room-card').forEach(card =>
      card.addEventListener('click', () => this._goRoom(card.dataset.roomId)));
  }

  _emptyState() {
    return `<div class="empty-state">
      ${ICON.radiator}
      <p>Noch keine Räume konfiguriert.</p>
      <p style="font-size:13px;color:var(--secondary-text-color)">Klicke auf + um deinen ersten Raum hinzuzufügen.</p>
    </div>`;
  }

  _roomCardHTML(room) {
    const cur   = this._currentTemp(room);
    const tgt   = this._targetTemp(room);
    const fill  = this._heatPercent(room);
    const hstate = this._heatingState(room);
    const mode  = this._climateMode(room);
    const winOpen = this._isWindowOpen(room);

    const boostMins = this._boostRemainingMins(room.id);
    const modeHint = boostMins      ? `<span class="badge badge-boost">${ICON.boost} Boost ${boostMins} min</span>`
                   : mode === 'off' ? '<span class="badge badge-off">Aus</span>'
                   : winOpen        ? '<span class="badge badge-window">' + ICON.window + ' Fenster offen</span>'
                   : '';

    const heatBadge = hstate === 'heat'
      ? `<span class="badge badge-heating">🔥 Heizend</span>`
      : hstate === 'idle'
      ? `<span class="badge badge-idle">✓ Bereit</span>`
      : '';

    return `<div class="room-card" data-room-id="${room.id}">
      <div class="room-card-header">
        <span class="room-name">${room.name}</span>
        <div class="room-badges">${modeHint}${heatBadge}</div>
      </div>
      <div class="temp-row">
        <span class="temp-current">${fmtTemp(cur)}</span>
        <span class="temp-sep">→</span>
        <span class="temp-target">${fmtTemp(tgt)}</span>
      </div>
      <div class="heat-bar"><div class="heat-bar-fill" style="width:${fill}%"></div></div>
      <div class="schedule-hint" data-boost-id="${room.id}">${boostMins ? `🔥 Boost ${boostMins} min` : this._activeSlotHint(room.id)}</div>
    </div>`;
  }

  _activeSlotHint(roomId) {
    const slots = this._schedules[roomId] || [];
    if (!slots.length) return 'Kein Zeitplan';
    const now  = new Date();
    const day  = (now.getDay() + 6) % 7; // 0=Mon
    const mins = now.getHours() * 60 + now.getMinutes();
    const active = slots.find(s =>
      s.days.includes(day) &&
      timeToMins(s.start) <= mins && mins < timeToMins(s.end));
    return active
      ? `⏰ Aktiv bis ${active.end} · ${fmtTemp(active.temperature)}`
      : `📋 ${slots.length} Zeitslot${slots.length !== 1 ? 's' : ''}`;
  }

  // ── Room Detail ───────────────────────────────────────────────────────────

  _renderRoomDetail(root) {
    const room   = this._rooms[this._roomId];
    if (!room) { this._goDashboard(); return; }
    const slots  = this._schedules[this._roomId] || [];
    const cur    = this._currentTemp(room);
    const tgt    = this._targetTemp(room);

    const climateState = room.climate_entity && this._hass.states[room.climate_entity];
    const sensorState  = room.temp_sensor    && this._hass.states[room.temp_sensor];
    const windowState  = room.window_sensor  && this._hass.states[room.window_sensor];

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="sh-header">
        <button class="sh-back">${ICON.back}</button>
        <h1>${room.name}</h1>
        <button class="btn-edit-room" title="Raum bearbeiten">${ICON.edit}</button>
      </div>

      <div class="sh-content">
        <!-- Temperature hero -->
        <div class="detail-section">
          <div class="detail-card">
            <div class="temp-hero">
              <div class="temp-hero-item">
                <div class="temp-hero-value">${fmtTemp(cur)}</div>
                <div class="temp-hero-label">Ist-Temperatur</div>
              </div>
              <div class="temp-hero-arrow">→</div>
              <div class="temp-hero-item">
                <div class="temp-hero-value" style="color:var(--primary-color)">${fmtTemp(tgt)}</div>
                <div class="temp-hero-label">Soll-Temperatur</div>
              </div>
              ${(() => {
                const hs = this._heatingState(room);
                if (hs == null) return '';
                const isHeat = hs === 'heat';
                const color  = isHeat ? '#f44336' : '#43a047';
                const icon   = isHeat ? '🔥' : '✓';
                const label  = isHeat ? 'Heizend' : 'Bereit';
                return `<div class="valve-gauge">
                  <div class="valve-gauge-ring" style="border:3px solid ${color};border-radius:50%;width:72px;height:72px;display:flex;align-items:center;justify-content:center;font-size:24px">${icon}</div>
                  <div class="valve-gauge-label">${label}</div>
                </div>`;
              })()}
            </div>
          </div>
        </div>

        <!-- Entity info -->
        <div class="detail-section">
          <h3>Entities</h3>
          <div class="detail-card">
            <div class="entity-row">
              <span class="entity-label">Thermostat</span>
              <span class="entity-value">${room.climate_entity || '—'}</span>
              <span class="entity-state">${climateState ? climateState.state : '—'}</span>
            </div>
            ${room.temp_sensor ? `<div class="entity-row">
              <span class="entity-label">Temperatursensor</span>
              <span class="entity-value">${room.temp_sensor}</span>
              <span class="entity-state">${sensorState ? sensorState.state + ' °C' : '—'}</span>
            </div>` : ''}
            ${room.window_sensor ? `<div class="entity-row">
              <span class="entity-label">Fensterkontakt</span>
              <span class="entity-value">${room.window_sensor}</span>
              <span class="entity-state">${windowState ? (windowState.state === 'on' ? '🪟 Offen' : '✓ Zu') : '—'}</span>
            </div>` : ''}
            ${room.valve_entity ? `<div class="entity-row">
              <span class="entity-label">Ventilsensor</span>
              <span class="entity-value">${room.valve_entity}</span>
              <span class="entity-state">${(() => { const s = this._hass.states[room.valve_entity]; return s ? Math.round(Number(s.state)) + ' %' : '—'; })()}</span>
            </div>` : ''}
          </div>
        </div>

        <!-- Schedule timeline -->
        <div class="detail-section">
          <div class="section-header">
            <h3>Wochenplan</h3>
          </div>
          <div class="detail-card">
            ${this._timelineHTML(slots)}
          </div>
        </div>

        <!-- Schedule slots -->
        <div class="detail-section">
          <div class="section-header">
            <h3>Zeitslots</h3>
          </div>
          ${slots.length === 0
            ? '<p style="color:var(--secondary-text-color);font-size:13px;margin:0 0 8px">Noch keine Zeitslots. Füge deinen ersten hinzu.</p>'
            : slots.map(s => this._slotItemHTML(s)).join('')}
          <button class="btn-add btn-add-slot">+ Zeitslot hinzufügen</button>
        </div>

        <!-- Temperatures -->
        <div class="detail-section">
          <h3>Standard-Temperaturen</h3>
          <div class="detail-card">
            <div class="entity-row">
              <span class="entity-label">Komfort</span>
              <span class="entity-state">${fmtTemp(room.temp_comfort)}</span>
            </div>
            <div class="entity-row">
              <span class="entity-label">Eco / Abwesend</span>
              <span class="entity-state">${fmtTemp(room.temp_eco)}</span>
            </div>
            <div class="entity-row">
              <span class="entity-label">Schlaf</span>
              <span class="entity-state">${fmtTemp(room.temp_sleep)}</span>
            </div>
          </div>
        </div>

        <!-- Boost -->
        <div class="detail-section">
          <h3>Boost</h3>
          ${this._boostRemainingMins(room.id)
            ? `<div class="detail-card" style="display:flex;align-items:center;gap:12px;padding:12px 16px">
                <span style="flex:1;font-size:13px">🔥 Boost aktiv — noch <strong>${this._boostRemainingMins(room.id)} min</strong></span>
                <button class="btn btn-secondary btn-cancel-boost" style="padding:6px 14px;font-size:13px">Abbrechen</button>
               </div>`
            : `<div style="display:flex;gap:8px">
                <button class="btn btn-secondary btn-boost" data-mins="30" style="flex:1">🔥 30 min</button>
                <button class="btn btn-secondary btn-boost" data-mins="60" style="flex:1">🔥 60 min</button>
                <button class="btn btn-secondary btn-boost" data-mins="90" style="flex:1">🔥 90 min</button>
               </div>`
          }
        </div>

        <!-- Delete -->
        <div class="detail-section">
          <button class="btn btn-danger btn-delete-room" style="width:100%">Raum löschen</button>
        </div>
      </div>
    `;

    root.appendChild(wrap);

    // Events
    wrap.querySelector('.sh-back').addEventListener('click', () => this._goDashboard());
    wrap.querySelector('.btn-edit-room').addEventListener('click', () => this._openRoomEditor(room));
    wrap.querySelector('.btn-add-slot').addEventListener('click', () => this._openSlotEditor(room.id));
    wrap.querySelector('.btn-delete-room').addEventListener('click', () => this._deleteRoom(room.id));
    wrap.querySelectorAll('.slot-item').forEach(el =>
      el.addEventListener('click', () => this._openSlotEditor(room.id,
        slots.find(s => s.id === el.dataset.slotId))));
    wrap.querySelectorAll('.slot-delete').forEach(btn =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteSlot(room.id, btn.dataset.slotId);
      }));
    wrap.querySelectorAll('.btn-boost').forEach(btn =>
      btn.addEventListener('click', () => this._setBoost(room.id, parseInt(btn.dataset.mins))));
    const cancelBoost = wrap.querySelector('.btn-cancel-boost');
    if (cancelBoost) cancelBoost.addEventListener('click', () => this._cancelBoost(room.id));
  }

  _timelineHTML(slots) {
    const html = DAYS_SHORT.map((day, di) => {
      const daySlots = slots.filter(s => s.days.includes(di));
      const bars = daySlots.map(s => {
        const left  = (timeToMins(s.start) / 1440 * 100).toFixed(2);
        const width = ((timeToMins(s.end) - timeToMins(s.start)) / 1440 * 100).toFixed(2);
        return `<div class="timeline-slot" style="left:${left}%;width:${width}%" title="${s.start}–${s.end} · ${fmtTemp(s.temperature)}"></div>`;
      }).join('');
      return `<div class="timeline-row">
        <span class="timeline-day">${day}</span>
        <div class="timeline-bar">${bars}</div>
      </div>`;
    }).join('');

    const ticks = [0, 6, 12, 18].map(h =>
      `<span class="timeline-tick">${String(h).padStart(2,'0')}:00</span>`).join('');

    return html + `<div class="timeline-ticks">${ticks}</div>`;
  }

  _slotItemHTML(slot) {
    const dayChips = DAYS_SHORT.map((d, i) =>
      `<div class="slot-day-chip ${slot.days.includes(i) ? '' : 'inactive'}">${d}</div>`).join('');
    return `<div class="slot-item" data-slot-id="${slot.id}">
      <div class="slot-days">${dayChips}</div>
      <div class="slot-info">
        <div class="slot-time">${slot.start} – ${slot.end}</div>
        <div class="slot-temp">${fmtTemp(slot.temperature)}</div>
      </div>
      <button class="slot-delete" data-slot-id="${slot.id}" title="Löschen">${ICON.delete}</button>
    </div>`;
  }

  // ── Modal: Room Editor ────────────────────────────────────────────────────

  _renderModal() {
    const existing = this.shadowRoot.querySelector('.modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    if (this._modal === 'room-edit') {
      overlay.innerHTML = this._roomEditorHTML();
      this.shadowRoot.appendChild(overlay);
      this._bindRoomEditorEvents(overlay);
    } else if (this._modal === 'slot-edit') {
      overlay.innerHTML = this._slotEditorHTML();
      this.shadowRoot.appendChild(overlay);
      this._bindSlotEditorEvents(overlay);
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this._closeModal();
    });
  }

  _roomEditorHTML() {
    const r = this._editRoom;
    const isNew = !r.id;

    // Get climate entities from hass
    const climates  = Object.keys(this._hass.states).filter(id => id.startsWith('climate.')).sort();
    const sensors   = Object.keys(this._hass.states).filter(id => id.startsWith('sensor.') && this._hass.states[id].attributes.unit_of_measurement === '°C').sort();
    const binaries  = Object.keys(this._hass.states).filter(id => id.startsWith('binary_sensor.')).sort();

    const option = (list, selected, placeholder) =>
      `<option value="">${placeholder}</option>` +
      list.map(id => `<option value="${id}" ${id === selected ? 'selected' : ''}>${id}</option>`).join('');

    return `<div class="modal-sheet">
      <div class="modal-title">
        ${isNew ? 'Raum hinzufügen' : 'Raum bearbeiten'}
        <button class="modal-close">✕</button>
      </div>

      <div class="form-group">
        <label>Raumname</label>
        <input id="room-name" type="text" value="${r.name}" placeholder="z.B. Wohnzimmer">
      </div>

      <div class="form-group">
        <label>Thermostat (climate entity)</label>
        <select id="room-climate">
          ${option(climates, r.climate_entity, '— Thermostat wählen —')}
        </select>
      </div>

      <div class="form-group">
        <label>Temperatursensor (optional)</label>
        <select id="room-sensor">
          ${option(sensors, r.temp_sensor, '— Sensor wählen (optional) —')}
        </select>
      </div>

      <div class="form-group">
        <label>Fensterkontakt (optional)</label>
        <select id="room-window">
          ${option(binaries, r.window_sensor, '— Fenstersensor wählen (optional) —')}
        </select>
      </div>

      <div class="form-group">
        <label>Ventilsensor (optional) — z.B. number.*_valve_opening_degree</label>
        <select id="room-valve">
          ${option(
            Object.keys(this._hass.states).filter(id => id.startsWith('number.')).sort(),
            r.valve_entity,
            '— Ventilsensor wählen (optional) —'
          )}
        </select>
      </div>

      <div class="divider"></div>
      <div class="form-row">
        <div class="form-group">
          <label>Komfort °C</label>
          <input id="temp-comfort" type="number" step="0.5" value="${r.temp_comfort}">
        </div>
        <div class="form-group">
          <label>Eco °C</label>
          <input id="temp-eco" type="number" step="0.5" value="${r.temp_eco}">
        </div>
        <div class="form-group">
          <label>Schlaf °C</label>
          <input id="temp-sleep" type="number" step="0.5" value="${r.temp_sleep}">
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary modal-cancel">Abbrechen</button>
        <button class="btn btn-primary modal-save">Speichern</button>
      </div>
    </div>`;
  }

  _bindRoomEditorEvents(overlay) {
    overlay.querySelector('.modal-close').addEventListener('click', () => this._closeModal());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => this._closeModal());
    overlay.querySelector('.modal-save').addEventListener('click', () => {
      const name = overlay.querySelector('#room-name').value.trim();
      if (!name) { alert('Bitte einen Raumnamen eingeben.'); return; }
      const climate = overlay.querySelector('#room-climate').value;
      if (!climate) { alert('Bitte einen Thermostat wählen.'); return; }

      const room = {
        ...this._editRoom,
        name,
        climate_entity: climate,
        temp_sensor:    overlay.querySelector('#room-sensor').value  || null,
        window_sensor:  overlay.querySelector('#room-window').value  || null,
        valve_entity:   overlay.querySelector('#room-valve').value   || null,
        temp_comfort:   parseFloat(overlay.querySelector('#temp-comfort').value) || 21,
        temp_eco:       parseFloat(overlay.querySelector('#temp-eco').value)     || 17,
        temp_sleep:     parseFloat(overlay.querySelector('#temp-sleep').value)   || 18,
      };
      this._saveRoom(room);
    });
  }

  // ── Modal: Slot Editor ────────────────────────────────────────────────────

  _slotEditorHTML() {
    const s = this._editSlot;
    const dayToggles = DAYS_SHORT.map((d, i) =>
      `<button type="button" class="day-toggle ${s.days.includes(i) ? 'active' : ''}" data-day="${i}">${d}</button>`
    ).join('');

    return `<div class="modal-sheet">
      <div class="modal-title">
        ${s.id ? 'Zeitslot bearbeiten' : 'Zeitslot hinzufügen'}
        <button class="modal-close">✕</button>
      </div>

      <div class="form-group">
        <label>Wochentage</label>
        <div class="day-picker">${dayToggles}</div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Von</label>
          <input id="slot-start" type="time" value="${s.start}">
        </div>
        <div class="form-group">
          <label>Bis</label>
          <input id="slot-end" type="time" value="${s.end}">
        </div>
      </div>

      <div class="form-group">
        <label>Zieltemperatur (°C)</label>
        <input id="slot-temp" type="number" step="0.5" min="5" max="30" value="${s.temperature}">
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary modal-cancel">Abbrechen</button>
        <button class="btn btn-primary modal-save">Speichern</button>
      </div>
    </div>`;
  }

  _bindSlotEditorEvents(overlay) {
    const activeDays = new Set(this._editSlot.days || []);

    overlay.querySelectorAll('.day-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = parseInt(btn.dataset.day);
        if (activeDays.has(d)) { activeDays.delete(d); btn.classList.remove('active'); }
        else { activeDays.add(d); btn.classList.add('active'); }
      });
    });

    overlay.querySelector('.modal-close').addEventListener('click', () => this._closeModal());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => this._closeModal());
    overlay.querySelector('.modal-save').addEventListener('click', () => {
      const start = overlay.querySelector('#slot-start').value;
      const end   = overlay.querySelector('#slot-end').value;
      const temp  = parseFloat(overlay.querySelector('#slot-temp').value);

      if (!activeDays.size)              { alert('Bitte mindestens einen Tag wählen.'); return; }
      if (!start || !end)                { alert('Bitte Start- und Endzeit eingeben.'); return; }
      if (timeToMins(start) >= timeToMins(end)) { alert('Endzeit muss nach Startzeit liegen.'); return; }
      if (isNaN(temp))                   { alert('Bitte eine Temperatur eingeben.'); return; }

      const slot = { ...this._editSlot, days: [...activeDays].sort(), start, end, temperature: temp };
      this._saveSlot(this._editSlotRoomId, slot);
    });
  }
}

customElements.define('smart-heating-panel', SmartHeatingPanel);
