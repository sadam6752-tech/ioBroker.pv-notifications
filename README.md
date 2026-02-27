# ioBroker PV Notifications Adapter

Sends Telegram notifications for PV battery status (full, empty, intermediate levels).

## Features

- 🔋 **Battery Full Notification** at 100%
- ⚠️ **Battery Empty Notification** at 0%
- 📊 **Intermediate Levels** (20%, 40%, 60%, 80%) with charge level in % and kWh
- 🌙 **Night Mode** (configurable time, default: 23:00-06:00)
- 🤫 **Quiet Mode** (configurable time, default: 12:00-15:00)
- 📈 **Daily Statistics** at configurable time (default: 22:00)
- 📅 **Weekly Statistics** on configurable weekday
- 📆 **Monthly Statistics** (optional) on configurable day
- 🌤️ **Weather Forecast** integration (requires openweathermap adapter)
- ⚡ **Recommendations** for high production / high consumption
- 📊 **Statistics Data** from sourceanalytix adapter

## Dependencies

The following adapters are required for full functionality:

| Adapter | Description | Required |
|---------|-------------|----------|
| **telegram** | Sends notifications | ✅ Yes |
| **sourceanalytix** | Statistics data (consumption, feed-in, grid power) | ✅ Yes |
| **daswetter** or **openweathermap** | Weather forecast for recommendations | ❌ Optional |

## Installation

### Via ioBroker Admin (GitHub)

```bash
# In ioBroker Admin under "Adapter" → "Install custom adapter":
https://github.com/sadam6752-tech/ioBroker.pv-notifications
```

### Via ioBroker CLI

```bash
iobroker url https://github.com/sadam6752-tech/ioBroker.pv-notifications
```

## Configuration

### Telegram

| Setting | Description |
|---------|-------------|
| Telegram Instance | E.g. `telegram.0` |
| Telegram Users | Comma-separated list of names or IDs, e.g. `User1, User2` or `-123456789` |

**Note:** You can add Telegram users both by **username** (without @) and by **Telegram ID** (negative for groups/channels).

### Data Points

| Setting | Description | Example |
|---------|-------------|---------|
| Battery SOC | SOC value in % | `modbus.0.holdingRegisters.40083_Batterie_SOC` |
| PV Power | Current power in W | `javascript.0.Solar.Sungrow.Leistung` |
| Total Production | Production today in kWh | `javascript.0.Solar.Sungrow.Gesamtproduktion` |
| Feed In | Feed-in today in kWh | `sourceanalytix.0...Einspeisung...` |
| Consumption | Consumption today in kWh | `sourceanalytix.0...Hausverbrauch...` |
| Grid Power | Grid power today in kWh | `sourceanalytix.0...Netzbezug...` |
| Production this Month | Monthly production (kWh) | `sourceanalytix.0...Produktion.currentMonth` |
| Consumption this Month | Monthly consumption (kWh) | `sourceanalytix.0...Verbrauch.currentMonth` |
| Feed In this Month | Monthly feed-in (kWh) | `sourceanalytix.0...Einspeisung.currentMonth` |
| Grid Power this Month | Monthly grid power (kWh) | `sourceanalytix.0...Netzbezug.currentMonth` |
| Production this Week | Weekly production (kWh) | `sourceanalytix.0...Produktion.currentWeek` |
| Consumption this Week | Weekly consumption (kWh) | `sourceanalytix.0...Verbrauch.currentWeek` |
| Feed In this Week | Weekly feed-in (kWh) | `sourceanalytix.0...Einspeisung.currentWeek` |
| Grid Power this Week | Weekly grid power (kWh) | `sourceanalytix.0...Netzbezug.currentWeek` |

### Weather (Optional)

| Setting | Description | Example (daswetter) | Example (openweathermap) |
|---------|-------------|---------------------|-------------------------|
| Weather Today | Weather description today | `daswetter.0.Day0.forecast.currentSymbol` | `openweathermap.0.forecast.0.text` |
| Temperature Today (°C) | Temperature today | `daswetter.0.Day0.forecast.maxTemp` | `openweathermap.0.forecast.0.temp` |
| Weather Tomorrow | Weather description tomorrow | `daswetter.0.Day1.forecast.currentSymbol` | `openweathermap.0.forecast.1.text` |
| Temperature Tomorrow (°C) | Temperature tomorrow | `daswetter.0.Day1.forecast.maxTemp` | `openweathermap.0.forecast.1.temp` |

**Note:** The fields `Weather Today` and `Weather Tomorrow` can alternatively be used if the weather adapter provides different formats. For best compatibility, we recommend using `Weather Text` fields.

### Battery

| Setting | Description | Default |
|---------|-------------|---------|
| Battery Capacity | Capacity in Wh | `21000` |
| Threshold FULL | SOC for "full" | `100` |
| Threshold EMPTY | SOC for "empty" | `0` |
| Reset FULL below | Reset if SOC < | `95` |
| Reset EMPTY above | Reset if SOC > | `5` |

### Intermediate Levels

| Setting | Description | Default |
|---------|-------------|---------|
| Intermediate Levels | Comma-separated SOC levels | `20,40,60,80` |
| Min. Interval FULL | Minutes between notifications | `10` |
| Min. Interval EMPTY | Minutes between notifications | `5` |
| Min. Interval Intermediate | Minutes between notifications | `30` |
| Enable Night Mode | Checkbox for night mode | `true` |
| Night Mode Start | Start time (Format: HH:MM) | `23:00` |
| Night Mode End | End time (Format: HH:MM) | `06:00` |
| Ignore Night Mode for 0% Battery | Always notify at 0% | `true` |
| Enable Quiet Mode | Checkbox for quiet mode | `false` |
| Quiet Mode Start | Start time (Format: HH:MM) | `12:00` |
| Quiet Mode End | End time (Format: HH:MM) | `15:00` |

### Statistics

| Setting | Description | Default |
|---------|-------------|---------|
| Daily Statistics Time | Format HH:MM | `22:00` |
| Weekday Weekly Statistics | 0=Mon, 1=Tue, ..., 6=Sun | `0` (Monday) |
| Time Weekly Statistics | Format HH:MM | `10:00` |
| Enable Monthly Statistics | Checkbox for monthly statistics | `false` |
| Day of Month | 1-31 | `1` (1st of month) |
| Time Monthly Statistics | Format HH:MM | `09:00` |

## Examples

### Battery Full (100%)
```
11:45 - 🔋 *Battery FULL* (100%)

⚡ Current Production: 5356 W
🏠 Current Consumption: 1200 W
☀️ Production Today: 12.5 kWh
🔌 Feed-in Today: 8.2 kWh
🌤️ Tomorrow: ☀️ Sunny

🚗 Now ideal for: Electric car, washing machine, dishwasher!
```

### Intermediate (60%)
```
11:51 - 🔋 Battery at 60% (12.6 kWh) ⬆️
⚡ Production: 5356 W
```

### Daily Statistics (22:00)
```
22:00 - 📊 *Daily Statistics PV System*
━━━━━━━━━━━━━━━━━━━━━━
🔋 Current Charge Level: 85%
⚡ Current Energy: 17.9 kWh (21.0 kWh Total)
━━━━━━━━━━━━━━━━━━━━━━
☀️ Production: 12.5 kWh
🏠 Own Consumption: 8.2 kWh (65.6%)
🔌 Feed-in: 4.3 kWh
⚡ Grid Power: 2.1 kWh
```

### Monthly Statistics (1st of month at 09:00)
```
09:00 - 📊 *Monthly Statistics PV System*
━━━━━━━━━━━━━━━━━━━━━━
🔋 Full Cycles This Month: 28
📉 Empty Cycles This Month: 15
━━━━━━━━━━━━━━━━━━━━━━
☀️ Production: 345.2 kWh
🏠 Own Consumption: 287.5 kWh (83.3%)
🔌 Feed-in: 57.7 kWh
⚡ Grid Power: 23.4 kWh
━━━━━━━━━━━━━━━━━━━━━━
```

## States

The adapter creates the following states under `pv-notifications.0`:

### Current Statistics

| State | Type | Description |
|-------|------|-------------|
| `statistics.fullCyclesToday` | number | Full cycles today |
| `statistics.emptyCyclesToday` | number | Empty cycles today |
| `statistics.maxSOCToday` | number | Max SOC today |
| `statistics.minSOCToday` | number | Min SOC today |
| `statistics.fullCyclesWeek` | number | Full cycles this week |
| `statistics.emptyCyclesWeek` | number | Empty cycles this week |
| `statistics.currentSOC` | number | Current SOC |
| `statistics.currentEnergyKWh` | number | Current energy in kWh |

### Saved Last Month Data (for Monthly Statistics)

| State | Type | Description |
|-------|------|-------------|
| `statistics.lastMonthProduction` | number | Production last month (kWh) |
| `statistics.lastMonthConsumption` | number | Consumption last month (kWh) |
| `statistics.lastMonthFeedIn` | number | Feed-in last month (kWh) |
| `statistics.lastMonthGridPower` | number | Grid power last month (kWh) |
| `statistics.lastMonthFullCycles` | number | Full cycles last month |
| `statistics.lastMonthEmptyCycles` | number | Empty cycles last month |

### Saved Last Week Data (for Weekly Statistics)

| State | Type | Description |
|-------|------|-------------|
| `statistics.lastWeekProduction` | number | Production last week (kWh) |
| `statistics.lastWeekConsumption` | number | Consumption last week (kWh) |
| `statistics.lastWeekFeedIn` | number | Feed-in last week (kWh) |
| `statistics.lastWeekGridPower` | number | Grid power last week (kWh) |
| `statistics.lastWeekFullCycles` | number | Full cycles last week |
| `statistics.lastWeekEmptyCycles` | number | Empty cycles last week |

## Note on Monthly and Weekly Statistics

**Important:** The adapter automatically saves data from last month and last week in the states.

### Monthly Statistics

- Monthly statistics are sent on the **configured day** (default: 1st of month)
- The adapter **automatically saves** current monthly data before resetting statistics
- Statistics use **saved data** from `statistics.lastMonth*` states
- **Configuration:** Ensure monthly statistics are sent **after the last day of the month** (e.g. 1st at 09:00)

### Weekly Statistics

- Weekly statistics are sent on the **configured weekday** (default: Monday)
- The adapter **automatically saves** current weekly data before resetting statistics
- Statistics use **saved data** from `statistics.lastWeek*` states
- **Configuration:** Set weekday (0=Mon, 1=Tue, ..., 6=Sun)

## Configuration Example (openweathermap)

### Configure Weather Data Points

If you use the **openweathermap** adapter, configure the following fields:

```
Weather Today:          openweathermap.0.forecast.0.text
Temperature Today:      openweathermap.0.forecast.0.temp
Weather Tomorrow:       openweathermap.0.forecast.1.text
Temperature Tomorrow:   openweathermap.0.forecast.1.temp
```

### Alternative: Daswetter Adapter

```
Weather Today:          daswetter.0.Day0.forecast.currentSymbol
Temperature Today:      daswetter.0.Day0.forecast.maxTemp
Weather Tomorrow:       daswetter.0.Day1.forecast.currentSymbol
Temperature Tomorrow:   daswetter.0.Day1.forecast.maxTemp
```

### Example Output with Weather

**Daily Statistics:**
```
📊 *Daily Statistics PV System*
━━━━━━━━━━━━━━━━━━━━━━
🔋 Current Charge Level: 85%
⚡ Current Energy: 17.9 kWh (21.0 kWh Total)
━━━━━━━━━━━━━━━━━━━━━━
☀️ Production: 45.2 kWh
🏠 Own Consumption: 32.1 kWh (71%)
🔌 Feed-in: 13 kWh
⚡ Grid Power: 2 kWh
━━━━━━━━━━━━━━━━━━━━━━
🌤️ *Weather Tomorrow:* ☀️ Sunny 22.5°C
☀️ Good PV production expected!
```

**Weekly Statistics:**
```
📊 *Weekly Statistics PV System*
━━━━━━━━━━━━━━━━━━━━━━
🔋 Full Cycles Last Week: 5
📉 Empty Cycles Last Week: 3
━━━━━━━━━━━━━━━━━━━━━━
☀️ Production: 312.5 kWh
🏠 Own Consumption: 224.8 kWh (72%)
🔌 Feed-in: 87.7 kWh
⚡ Grid Power: 45.3 kWh
━━━━━━━━━━━━━━━━━━━━━━
💡 A healthy cycle per day is normal.
🔋 Check battery settings if many cycles.
```

### Monthly Statistics (1st of month at 09:00)
```
09:00 - 📊 *Monthly Statistics PV System*
━━━━━━━━━━━━━━━━━━━━━━
🔋 Full Cycles Last Month: 28
📉 Empty Cycles Last Month: 15
━━━━━━━━━━━━━━━━━━━━━━
☀️ Production: 1245.7 kWh
🏠 Own Consumption: 897.3 kWh (72%)
🔌 Feed-in: 348.4 kWh
⚡ Grid Power: 185.2 kWh
━━━━━━━━━━━━━━━━━━━━━━
```

## Night Mode & Quiet Mode

### Night Mode (configurable)

Between **23:00 and 06:00** (configurable), the following notifications are suppressed:
- ❌ Battery FULL (100%)
- ❌ Intermediate Levels (20%, 40%, 60%, 80%)

The following notification is **always** sent:
- ✅ Battery EMPTY (0%) – if "Ignore night mode for 0% battery" is enabled

### Quiet Mode (configurable)

Between **12:00 and 15:00** (configurable), **all** notifications are suppressed:
- ❌ Battery FULL (100%)
- ❌ Battery EMPTY (0%)
- ❌ Intermediate Levels (20%, 40%, 60%, 80%)

**Note:** Quiet mode suppresses all notifications including 0% battery. Use it for times when you don't want to be disturbed at all (e.g. nap time, meetings).

## License

MIT License

Copyright (c) 2025-2026  sadam6752-tech    sadam6752@gmail.com

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Author

Alex1808 via LLM: Qwen

sadam6752@gmail.com

## Changelog

### 1.0.89 (2026-02-27)
* (FIX) createState replaced with setObjectNotExists (W5034)
* (FIX) size attributes (xs, xl) added to jsonConfig.json (E5507)
* (FIX) Dependencies updated (@iobroker/adapter-core ^3.3.2, @alcalzone/release-script ^5.1.1)
* (FIX) admin dependency updated to >=7.6.20 (W1056)
* (FIX) Translations added for titleLang, desc, news (W1027, W1034, W1054)

### **WORK IN PROGRESS**

### 1.0.85 (2026-02-26)
* (FIX) Deprecated common.main removed from io-package.json (W1084)

### 1.0.84 (2026-02-26)
* (FIX) Node.js version updated to >=18
* (FIX) Dependencies updated (@iobroker/adapter-core to 3.2.3, @iobroker/testing to 5.2.2)
* (FIX) io-package.json schema fixed (licenseInformation added, deprecated fields removed)
* (FIX) setInterval with clearInterval added for proper cleanup
* (FIX) js-controller dependency updated to >=6.0.11
* (FIX) admin dependency updated to >=7.6.17

### 1.0.83 (2026-02-26)
* (FIX) createState deprecated fixed (setObjectNotExists)
* (FIX) All log messages translated to English
* (FIX) README.md translated (EN + doc/de/ + doc/ru/ structure)
* (FIX) Node.js 24 added to test matrix
* (FIX) Manual installation guide removed

### 1.0.82 (2026-02-25)
* (FIX) Copilot infrastructure and AI assistant guidelines added

### 1.0.81 (2026-02-25)
* (FIX) create-adapter infrastructure added (GitHub Actions, Dependabot, ESLint, Tests)

### 1.0.80 (2026-02-25)
* (FIX) Unified intermediate notifications format (all levels show charging/discharging status)

## Documentation in Other Languages

- [🇬🇧 English](README.md)
- [🇩🇪 Deutsch](doc/de/README.md)
- [🇷🇺 Русский](doc/ru/README.md)
