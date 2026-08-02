# Old Changelog

### 1.2.17 (2026-03-15)
* (FIX) Removed old versions from common.news to comply with W1032 (maximum 7 versions)

### 1.2.16 (2026-03-14)
* (FIX) Removed empty line in battery full message for improved formatting

### 1.2.15 (2026-03-08)
* (ADD) Added separator lines to battery full/empty and intermediate messages for improved readability

### 1.2.14 (2026-03-06)
* (FIX) Fixed intermediate message formatting: Removed extra line break before weather data (weather today appears directly below separator)

### 1.2.13 (2026-03-03)
* (ADD) Added current production (W) to test message, daily statistics and intermediate messages with improved layout
* (FIX) README.md Changelog updated for repository checker (E6006 fix)

### 1.2.11 (2026-03-02)
* (FIX) Daily statistics: Self-consumption cannot be negative (Math.max(0, totalProd - feedIn))
* (FIX) Daily statistics: Added weather today to message (in addition to weather tomorrow)
* (FIX) Weather error logging improved (warn instead of debug for better visibility)

### 1.2.10 (2026-03-02)
* (FIX) Fixed duplicate news entry in io-package.json (E1036/E2005 fix)
* (FIX) Added full translations for common.news (pt, nl, fr, it, es, pl, uk, zh-cn)
* (FIX) Reduced news entries to 7 versions (W1032 fix)

### 1.2.7 (2026-03-02)
* (FIX) Fixed io-package.json JSON syntax error (invalid duplicate news section removed)

### 1.2.6 (2026-03-02)
* (FIX) Added size attributes (xs, xl) for monthlyStatsDay, monthlyStatsTime, weatherEnabled, weatherInIntermediate, weatherInDailyStats, highProduction, highConsumption fields (E5507 fix)

### 1.2.5 (2026-03-02)
* (FIX) Added size attributes (xs, xl) for monthlyStatsEnabled, minIntervalIntermediate, statsDayTime, statsWeekDay, statsWeekTime fields (E5507 fix)
* (FIX) Added LICENSE file (E190 fix)
* (FIX) Copyright formatting: Added two trailing spaces to copyright lines in README.md, doc/de/README.md, doc/ru/README.md (W6009/W6011/W7004 fix)

### 1.2.3 (2026-03-02)
* (FIX) Added size attributes (xs, xl) for minIntervalFull, minIntervalEmpty, intermediateSteps, quietModeStart, quietModeEnd fields (E5507 fix)

### 1.2.2 (2026-03-02)
* (FIX) Weekly statistics: Now uses weeklyProduction/weeklyConsumption/weeklyFeedIn/weeklyGridPower fields instead of daily values

### 1.2.1 (2026-03-01)
* (FIX) Added size attributes (xs, xl) for night mode and quiet mode fields in admin UI (E5507 fix)

### 1.2.0 (2026-03-01)
* (ADD) common.news section added to io-package.json for repository checker (E136 fix)

### 1.1.1 (2026-03-01)
* (FIX) Intermediate messages: Flag reset condition changed from `> 2` to `>= 2` for proper 2% tolerance

### 1.0.93 (2026-02-27)
* (FIX) size attributes (xs, xl) added for number fields in jsonConfig.json (E5507)
* (FIX) VSCode schema definitions updated for io-package.json and jsonConfig.json (W4040, W4042)

### 1.0.92 (2026-02-27)
* (ADD) VSCode settings added with JSON schema definitions (S4036)

### 1.0.91 (2026-02-27)
* (FIX) Old news removed from io-package.json (E2004, W1032)
* (FIX) size attributes (xs, xl) added for all objectId fields in jsonConfig.json (E5507)
* (FIX) .commitinfo added to .gitignore (S9006)

### 1.0.90 (2026-02-27)
* (FIX) JSDoc parameter descriptions added for all functions

### 1.0.89 (2026-02-27)
* (FIX) createState replaced with setObjectNotExists (W5034)
* (FIX) size attributes (xs, xl) added to jsonConfig.json (E5507)
* (FIX) Dependencies updated (@iobroker/adapter-core ^3.3.2, @alcalzone/release-script ^5.1.1)
* (FIX) admin dependency updated to >=7.6.20 (W1056)
* (FIX) Translations added for titleLang, desc, news (W1027, W1034, W1054)

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
