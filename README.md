# Smart Heating – SONOFF TRVZB

Intelligente Heizungssteuerung für Home Assistant mit einem übersichtlichen Seitenleisten-Panel.
Speziell entwickelt für **SONOFF TRVZB Zigbee-Thermostate** via **Zigbee2MQTT**.

---

## Features

| Feature | Beschreibung |
|---|---|
| 📅 Wochenpläne | Zeitslots pro Raum (Mo–So, individuelle Zieltemperaturen) |
| 🏠 Globale Modi | Zuhause / Abwesend / Nacht – wirkt sofort auf alle Räume |
| 🪟 Fenstererkennung | Heizung pausiert automatisch bei geöffnetem Fenster (konfigurierbarer Delay) |
| 👤 Anwesenheit | Eco-Temperatur wenn Person-Entity auf `not_home` |
| 🌡️ Außentemperatur | Kompensationskurve: ab 18°C wird Heizziel reduziert |
| 🔥 Boost-Modus | 30/60/90 Minuten Aufheizung per Knopfdruck, mit Countdown |
| 🎛️ Seitenleisten-Panel | Dashboard mit Raumkarten, Zeitplan-Editor und Detailansicht |

---

## Installation via HACS

### Schritt 1 – Repository hinzufügen

1. HACS öffnen → **Integrationen** → ⋮ → **Benutzerdefinierte Repositories**
2. URL eintragen: `https://github.com/YOUR_USERNAME/smart-heating-hacs`
3. Kategorie: **Integration**
4. **Hinzufügen** klicken

### Schritt 2 – Integration installieren

1. In HACS → **Integrationen** → **Smart Heating** suchen
2. **Herunterladen** → Home Assistant neu starten

### Schritt 3 – Integration einrichten

1. **Einstellungen → Geräte & Dienste → Integration hinzufügen**
2. „Smart Heating" suchen und bestätigen
3. Das Panel erscheint automatisch in der Seitenleiste unter **Smart Heating**

---

## Manuelle Installation

Den Ordner `custom_components/smart_heating/` in dein HA-Konfigurationsverzeichnis kopieren:

```
/config/custom_components/smart_heating/
```

Danach HA neu starten und die Integration wie oben einrichten.

---

## Konfiguration

Die gesamte Konfiguration erfolgt über das **Seitenleisten-Panel** – kein manuelles Bearbeiten von YAML nötig.

### Raum hinzufügen

1. Panel öffnen → **+** (unten rechts)
2. Raumname, Thermostat-Entity (`climate.*`) wählen
3. Optional: Temperatursensor, Fensterkontakt, Standard-Temperaturen
4. **Speichern**

### Zeitplan konfigurieren

1. Raum-Karte anklicken
2. **+ Zeitslot hinzufügen**
3. Wochentage, Start-/Endzeit und Zieltemperatur wählen

### Globale Einstellungen (optional)

Über `smart_heating/set_global_mode` WebSocket oder direkt im Panel:

| Einstellung | Beschreibung |
|---|---|
| `presence_entity` | Person-Entity für Auto-Abwesenheitserkennung |
| `weather_entity` | Wetter-Entity für Außentemperatur-Kompensation |
| `away_temp` | Eco-Temperatur im Abwesend-Modus (Standard: 16°C) |

---

## Temperatur-Prioritäten

Der Scheduler wertet pro Raum in dieser Reihenfolge aus:

```
1. Boost aktiv           → temp_boost (Standard: 24°C)
2. Fenster offen         → temp_eco
3. Modus = Abwesend      → away_temp (global)
4. Modus = Nacht         → temp_sleep
5. Aktiver Zeitplan-Slot → Slot-Temperatur (± Außentemp-Kompensation)
6. Fallback              → temp_eco
```

---

## Außentemperatur-Kompensation

| Außentemperatur | Effekt |
|---|---|
| ≥ 18°C | Zieltemperatur −2°C (Minimum: 15°C) |
| 0°C – 18°C | Keine Anpassung |
| < 0°C | Zieltemperatur +0.5°C |

---

## Voraussetzungen

- Home Assistant **2023.6+**
- SONOFF TRVZB via **Zigbee2MQTT** (climate-Entity muss vorhanden sein)
- Optional: Temperatursensoren, Fensterkontakte (binary_sensor), Person-Entity, Wetter-Integration

---

## Entwicklung & Beitrag

Pull Requests sind willkommen! Bitte einen Issue erstellen bevor größere Änderungen gestartet werden.

```bash
git clone https://github.com/YOUR_USERNAME/smart-heating-hacs
cd smart-heating-hacs
# custom_components/smart_heating/ in HA einbinden (symlink oder kopieren)
```

---

## Lizenz

MIT License — siehe [LICENSE](LICENSE)
