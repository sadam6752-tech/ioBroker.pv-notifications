# ioBroker PV Notifications Adapter

Sendet Telegram-Benachrichtigungen für PV-Batteriestatus (voll, leer, Intermediate-Stufen).

## Features

- 🔋 **Batterie-Voll Benachrichtigung** bei 100% (nicht zwischen 00:00-08:00)
- ⚠️ **Batterie-Leer Benachrichtigung** bei 0% (auch nachts)
- 📊 **Intermediate-Stufen** (20%, 40%, 60%, 80%) mit Ladestand in % und kWh
- 🌙 **Nachtmodus** (00:00-08:00): Nur 0% Benachrichtigungen
- 📈 **Tagesstatistik** um konfigurierbare Zeit (Standard: 22:00)
- 📅 **Wochenstatistik** am konfigurierbaren Wochentag
- 📆 **Monatsstatistik** (optional) am konfigurierbaren Tag
- 🌤️ **Wetter-Prognose** Integration (benötigt openweathermap Adapter)
- ⚡ **Empfehlungen** bei hoher Produktion / hohem Verbrauch
- 📊 **Statistik-Daten** von sourceanalytix Adapter

## Abhängigkeiten

Für volle Funktionalität werden folgende Adapter benötigt:

| Adapter | Beschreibung | Erforderlich |
|---------|--------------|--------------|
| **telegram** | Sendet Benachrichtigungen | ✅ Ja |
| **sourceanalytix** | Statistik-Daten (Verbrauch, Einspeisung, Netzbezug) | ✅ Ja |
| **daswetter** oder **openweathermap** | Wetter-Prognose für Empfehlungen | ❌ Optional |

## Installation

### Von GitHub

```bash
# In ioBroker Admin unter "Adapter" → "Eigenen Adapter hinzufügen":
https://github.com/sadam6752-tech/ioBroker.pv-notifications
```

### Manuell

```bash
cd /opt/iobroker
npm install iobroker.pv-notifications
```

## Konfiguration

### Telegram

| Einstellung | Beschreibung |
|-------------|--------------|
| Telegram Instanz | Z.B. `telegram.0` |
| Telegram Benutzer | Kommagetrennte Liste mit Namen oder IDs, z.B. `User1, User2` oder `-123456789` |

**Hinweis:** Du kannst Telegram-Benutzer sowohl über den **Benutzernamen** (ohne @) als auch über die **Telegram-ID** (negativ bei Gruppen/Channels) hinzufügen.

### Datenpunkte

| Einstellung | Beschreibung | Beispiel |
|-------------|--------------|----------|
| Batterie SOC | SOC-Wert in % | `modbus.0.holdingRegisters.40083_Batterie_SOC` |
| PV-Leistung | Aktuelle Leistung in W | `javascript.0.Solar.Sungrow.Leistung` |
| Gesamtproduktion | Produktion heute in kWh | `javascript.0.Solar.Sungrow.Gesamtproduktion` |
| Einspeisung | Eingespeist heute in kWh | `sourceanalytix.0...Einspeisung...` |
| Hausverbrauch | Verbrauch heute in kWh | `sourceanalytix.0...Hausverbrauch...` |
| Netzbezug | Netzbezug heute in kWh | `sourceanalytix.0...Netzbezug...` |
| Produktion diesen Monat | Monatsproduktion (kWh) | `sourceanalytix.0...Produktion.currentMonth` |
| Verbrauch diesen Monat | Monatsverbrauch (kWh) | `sourceanalytix.0...Verbrauch.currentMonth` |
| Einspeisung diesen Monat | Monatseinspeisung (kWh) | `sourceanalytix.0...Einspeisung.currentMonth` |
| Netzbezug diesen Monat | Monats-Netzbezug (kWh) | `sourceanalytix.0...Netzbezug.currentMonth` |
| Produktion diese Woche | Wochenproduktion (kWh) | `sourceanalytix.0...Produktion.currentWeek` |
| Verbrauch diese Woche | Wochenverbrauch (kWh) | `sourceanalytix.0...Verbrauch.currentWeek` |
| Einspeisung diese Woche | Wocheneinspeisung (kWh) | `sourceanalytix.0...Einspeisung.currentWeek` |
| Netzbezug diese Woche | Wochen-Netzbezug (kWh) | `sourceanalytix.0...Netzbezug.currentWeek` |

### Wetter (Optional)

| Einstellung | Beschreibung | Beispiel (daswetter) | Beispiel (openweathermap) |
|-------------|--------------|----------------------|---------------------------|
| Wetter heute | Wetterbeschreibung heute | `daswetter.0.Day0.forecast.currentSymbol` | `openweathermap.0.forecast.0.text` |
| Temperatur heute (°C) | Temperatur heute | `daswetter.0.Day0.forecast.maxTemp` | `openweathermap.0.forecast.0.temp` |
| Wetter morgen | Wetterbeschreibung morgen | `daswetter.0.Day1.forecast.currentSymbol` | `openweathermap.0.forecast.1.text` |
| Temperatur morgen (°C) | Temperatur morgen | `daswetter.0.Day1.forecast.maxTemp` | `openweathermap.0.forecast.1.temp` |

**Hinweis:** Die Felder `Wetter heute` und `Wetter morgen` können alternativ verwendet werden, wenn der Wetter-Adapter andere Formate liefert. Für die beste Kompatibilität empfehlen wir die Verwendung von `Wettertext`-Feldern.

### Batterie

| Einstellung | Beschreibung | Standard |
|-------------|--------------|----------|
| Batterie-Kapazität | Kapazität in Wh | `21000` |
| Schwellwert VOLL | SOC für "voll" | `100` |
| Schwellwert LEER | SOC für "leer" | `0` |
| Reset VOLL unter | Reset wenn SOC < | `95` |
| Reset LEER über | Reset wenn SOC > | `5` |

### Intermediate-Stufen

| Einstellung | Beschreibung | Standard |
|-------------|--------------|----------|
| Intermediate-Stufen | Kommagetrennte SOC-Stufen | `20,40,60,80` |
| Min. Intervall VOLL | Minuten zwischen Benachrichtigungen | `10` |
| Min. Intervall LEER | Minuten zwischen Benachrichtigungen | `5` |
| Min. Intervall Intermediate | Minuten zwischen Benachrichtigungen | `30` |
| Nachtmodus aktivieren | Checkbox für Nachtmodus (00:00-08:00) | `true` |
| Nachtmodus für 0% ignorieren | Bei 0% immer benachrichtigen | `true` |

### Statistik

| Einstellung | Beschreibung | Standard |
|-------------|--------------|----------|
| Tagesstatistik Uhrzeit | Format HH:MM | `22:00` |
| Wochentag Wochenstatistik | 0=So, 1=Mo, ..., 6=Sa | `6` (Samstag) |
| Uhrzeit Wochenstatistik | Format HH:MM | `10:00` |
| Monatsstatistik aktivieren | Checkbox für Monatsstatistik | `false` |
| Tag des Monats | 1-31 | `1` (Erster des Monats) |
| Uhrzeit Monatsstatistik | Format HH:MM | `09:00` |

## Beispiele

### Batterie voll (100%)
```
11:45 - 🔋 *Batterie VOLL* (100%)

⚡ Aktuelle Produktion: 5356 W
🏠 Aktueller Verbrauch: 1200 W
☀️ Produktion heute: 12.5 kWh
🔌 Eingespeist heute: 8.2 kWh
🌤️ Morgen: ☀️ sonnig

🚗 Jetzt ideal für: Elektroauto, Waschmaschine, Spülmaschine!
```

### Intermediate (60%)
```
11:51 - 🔋 Batterie bei 60% (12.6 kWh) ⬆️
⚡ Produktion: 5356 W
```

### Tagesstatistik (22:00)
```
22:00 - 📊 *Tagesstatistik PV-Anlage*
━━━━━━━━━━━━━━━━━━━━━━
🔋 Aktueller Ladestand: 85%
⚡ Aktuelle Energie: 17.9 kWh (21.0 kWh Gesamt)
━━━━━━━━━━━━━━━━━━━━━━
☀️ Produktion: 12.5 kWh
🏠 Eigenverbrauch: 8.2 kWh (65.6%)
🔌 Einspeisung: 4.3 kWh
⚡ Netzbezug: 2.1 kWh
```

### Monatsstatistik (01. des Monats um 09:00)
```
09:00 - 📊 *Monatsstatistik PV-Anlage*
━━━━━━━━━━━━━━━━━━━━━━
🔋 Vollzyklen dieser Monat: 28
📉 Leerzyklen dieser Monat: 15
━━━━━━━━━━━━━━━━━━━━━━
☀️ Produktion: 345.2 kWh
🏠 Eigenverbrauch: 287.5 kWh (83.3%)
🔌 Einspeisung: 57.7 kWh
⚡ Netzbezug: 23.4 kWh
━━━━━━━━━━━━━━━━━━━━━━
```

## States

Der Adapter erstellt folgende States unter `pv-notifications.0`:

### Aktuelle Statistik

| State | Typ | Beschreibung |
|-------|-----|--------------|
| `statistics.fullCyclesToday` | number | Vollzyklen heute |
| `statistics.emptyCyclesToday` | number | Leerzyklen heute |
| `statistics.maxSOCToday` | number | Max SOC heute |
| `statistics.minSOCToday` | number | Min SOC heute |
| `statistics.fullCyclesWeek` | number | Vollzyklen diese Woche |
| `statistics.emptyCyclesWeek` | number | Leerzyklen diese Woche |
| `statistics.currentSOC` | number | Aktueller SOC |
| `statistics.currentEnergyKWh` | number | Aktuelle Energie in kWh |

### Gespeicherte letzte Monatsdaten (für Monatsstatistik)

| State | Typ | Beschreibung |
|-------|-----|--------------|
| `statistics.lastMonthProduction` | number | Produktion letzter Monat (kWh) |
| `statistics.lastMonthConsumption` | number | Verbrauch letzter Monat (kWh) |
| `statistics.lastMonthFeedIn` | number | Einspeisung letzter Monat (kWh) |
| `statistics.lastMonthGridPower` | number | Netzbezug letzter Monat (kWh) |
| `statistics.lastMonthFullCycles` | number | Vollzyklen letzter Monat |
| `statistics.lastMonthEmptyCycles` | number | Leerzyklen letzter Monat |

### Gespeicherte letzte Wochendaten (für Wochenstatistik)

| State | Typ | Beschreibung |
|-------|-----|--------------|
| `statistics.lastWeekProduction` | number | Produktion letzte Woche (kWh) |
| `statistics.lastWeekConsumption` | number | Verbrauch letzte Woche (kWh) |
| `statistics.lastWeekFeedIn` | number | Einspeisung letzte Woche (kWh) |
| `statistics.lastWeekGridPower` | number | Netzbezug letzte Woche (kWh) |
| `statistics.lastWeekFullCycles` | number | Vollzyklen letzte Woche |
| `statistics.lastWeekEmptyCycles` | number | Leerzyklen letzte Woche |

## Hinweis zur Monats- und Wochenstatistik

**Wichtig:** Der Adapter speichert automatisch die Daten vom letzten Monat und letzter Woche in den States.

### Monatsstatistik

- Die Monatsstatistik wird am **konfigurierten Tag** (Standard: 1. des Monats) gesendet
- Der Adapter **speichert automatisch** die aktuellen Monatsdaten, bevor die Statistik zurückgesetzt wird
- Die Statistik verwendet **gespeicherte Daten** aus `statistics.lastMonth*` States
- **Konfiguration:** Stelle sicher, dass die Monatsstatistik **nach dem letzten Tag des Monats** gesendet wird (z.B. 1. um 09:00)

### Wochenstatistik

- Die Wochenstatistik wird am **konfigurierten Wochentag** (Standard: Samstag) gesendet
- Der Adapter **speichert automatisch** die aktuellen Wochendaten, bevor die Statistik zurückgesetzt wird
- Die Statistik verwendet **gespeicherte Daten** aus `statistics.lastWeek*` States
- **Konfiguration:** Wochentag einstellen (0=So, 1=Mo, ..., 6=Sa)

## Konfigurations-Beispiel (openweathermap)

### Wetter-Datenpunkte konfigurieren

Wenn du den **openweathermap**-Adapter verwendest, konfiguriere folgende Felder:

```
Wetter heute:           openweathermap.0.forecast.0.text
Temperatur heute:       openweathermap.0.forecast.0.temp
Wetter morgen:          openweathermap.0.forecast.1.text
Temperatur morgen:      openweathermap.0.forecast.1.temp
```

### Alternative: Daswetter-Adapter

```
Wetter heute:           daswetter.0.Day0.forecast.currentSymbol
Temperatur heute:       daswetter.0.Day0.forecast.maxTemp
Wetter morgen:          daswetter.0.Day1.forecast.currentSymbol
Temperatur morgen:      daswetter.0.Day1.forecast.maxTemp
```

### Beispiel-Ausgabe mit Wetter

**Tagesstatistik:**
```
📊 *Tagesstatistik PV-Anlage*
━━━━━━━━━━━━━━━━━━━━━━
🔋 Aktueller Ladestand: 85%
⚡ Aktuelle Energie: 17.9 kWh (21.0 kWh Gesamt)
━━━━━━━━━━━━━━━━━━━━━━
☀️ Produktion: 45.2 kWh
🏠 Eigenverbrauch: 32.1 kWh (71%)
🔌 Einspeisung: 13 kWh
⚡ Netzbezug: 2 kWh
━━━━━━━━━━━━━━━━━━━━━━
🌤️ *Wetter morgen:* ☀️ sonnig 22.5°C
☀️ Gute PV-Produktion erwartet!
```

**Wochenstatistik:**
```
📊 *Wochenstatistik PV-Anlage*
━━━━━━━━━━━━━━━━━━━━━━
🔋 Vollzyklen letzte Woche: 5
📉 Leerzyklen letzte Woche: 3
━━━━━━━━━━━━━━━━━━━━━━
☀️ Produktion: 312.5 kWh
🏠 Eigenverbrauch: 224.8 kWh (72%)
🔌 Einspeisung: 87.7 kWh
⚡ Netzbezug: 45.3 kWh
━━━━━━━━━━━━━━━━━━━━━━
💡 Ein gesunder Zyklus pro Tag ist normal.
🔋 Bei vielen Zyklen: Batterie-Settings prüfen.
```

### Monatsstatistik (01. des Monats um 09:00)
```
09:00 - 📊 *Monatsstatistik PV-Anlage*
━━━━━━━━━━━━━━━━━━━━━━
🔋 Vollzyklen letzter Monat: 28
📉 Leerzyklen letzter Monat: 15
━━━━━━━━━━━━━━━━━━━━━━
☀️ Produktion: 1245.7 kWh
🏠 Eigenverbrauch: 897.3 kWh (72%)
🔌 Einspeisung: 348.4 kWh
⚡ Netzbezug: 185.2 kWh
━━━━━━━━━━━━━━━━━━━━━━
```

## Nachtmodus

Zwischen **00:00 und 08:00** werden folgende Benachrichtigungen unterdrückt:
- ❌ Batterie VOLL (100%)
- ❌ Intermediate-Stufen (20%, 40%, 60%, 80%)

Folgende Benachrichtigung wird **immer** gesendet:
- ✅ Batterie LEER (0%) - auch nachts

## Lizenz

MIT License

## Autor

Alex <alex@example.com>
