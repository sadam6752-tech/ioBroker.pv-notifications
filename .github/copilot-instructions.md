# ioBroker Adapter Development Guidelines

## Project Context

- **Adapter Name:** pv-notifications
- **Current Version:** 1.0.82
- **Type:** Energy/Solar/Battery
- **Language:** JavaScript (ES6+)
- **js-controller:** ≥5.0.0 (compatible with 7+)
- **Node.js:** ≥16.0.0
- **Testing:** @iobroker/testing
- **GitHub:** https://github.com/sadam6752-tech/ioBroker.pv-notifications
- **Local Test Instance:** http://192.168.1.15:8081/

---

## ⚠️ Critical Rules (js-controller 7+)

**THESE RULES ARE MANDATORY - NEVER VIOLATE:**

### 1. Event Handler Explicit Registration
```javascript
// ❌ WRONG: Will NOT work in js-controller 7+
async onReady() {
    // Code here will NOT execute!
}

// ✅ CORRECT: Explicit registration required
constructor(options = {}) {
    super({ ...options, name: 'pv-notifications' });
    this.onReady = this.onReady.bind(this);
    this.on('ready', this.onReady);  // ← MANDATORY!
}
```

### 2. State Change Handler Registration
```javascript
// ❌ WRONG: Will NOT be called in js-controller 7+
async onStateChange(id, state) {
    // Will not be invoked!
}

// ✅ CORRECT: Explicit registration
constructor(options = {}) {
    super({ ...options, name: 'pv-notifications' });
    this.onStateChange = this.onStateChange.bind(this);
    this.on('stateChange', this.onStateChange);  // ← MANDATORY!
}
```

### 3. External States - Subscription
```javascript
// ❌ WRONG: Does NOT work for external adapters (modbus, javascript, sourceanalytix)
this.subscribeStates(this.config.batterySOC);

// ✅ CORRECT: Use subscribeForeignStates for external states
this.subscribeForeignStates(this.config.batterySOC);
this.log.info(`Subscription for ${this.config.batterySOC} created (foreign)`);
```

### 4. External States - Reading
```javascript
// ❌ WRONG: Returns NULL for external states
const state = await this.getStateAsync('modbus.0.holdingRegisters.40083');

// ✅ CORRECT: Use getForeignStateAsync for external states
const state = await this.getForeignStateAsync('modbus.0.holdingRegisters.40083');
if (state && state.val !== null) {
    this.log.debug(`Value: ${state.val}`);
}
```

### 5. setStateAsync with await
```javascript
// ❌ WRONG: Fire-and-forget is NOT reliable
this.setStateAsync('statistics.currentSOC', soc, true);

// ✅ CORRECT: Always use await
await this.setStateAsync('statistics.currentSOC', soc, true);
this.log.debug(`statistics.currentSOC updated: ${soc}`);
```

### 6. instanceObjects for Instance States
```json
// io-package.json
{
  "objects": [
    // ❌ Only for GLOBAL adapter objects (not per instance)
  ],
  "instanceObjects": [
    // ✅ CORRECT: For instance-specific states
    {
      "_id": "statistics.currentSOC",
      "type": "state",
      "common": {
        "name": "Current SOC",
        "type": "number",
        "read": true,
        "write": false
      }
    }
  ]
}
```

---

## 📋 Code Style

### Formatting
- **Indentation:** 4 spaces (no tabs)
- **Quotes:** Single quotes (`'string'`)
- **Semicolons:** Always required
- **Line Length:** Max 120 characters
- **Braces:** Always use braces for blocks

### ES6+ Features
- **Classes:** Yes (ES6 classes)
- **Arrow Functions:** Yes (for callbacks)
- **Async/Await:** Yes (mandatory for async operations)
- **Template Literals:** Yes (for string interpolation)
- **Const/Let:** Prefer `const`, use `let` for reassignments

### Naming Conventions
```javascript
// Variables: camelCase
let batterySOC = 100;
const thresholdFull = 100;

// Functions: camelCase
async function buildMessage() { }

// Classes: PascalCase
class PvNotifications extends Adapter { }

// Constants: UPPER_SNAKE_CASE
const MAX_RETRY_COUNT = 5;

// Private members: Leading underscore
this._internalState = null;
```

---

## 🏗️ Project Structure

```
pv-notifications/
├── .github/
│   ├── workflows/
│   │   └── test-and-release.yml    # CI/CD pipeline
│   └── dependabot.yml              # Auto dependency updates
├── admin/
│   ├── i18n/
│   │   ├── de/translations.json    # German translations
│   │   ├── en/translations.json    # English translations
│   │   └── ru/translations.json    # Russian translations
│   ├── jsonConfig.json             # Admin UI configuration
│   └── jsonConfig.js               # Admin UI logic (if needed)
├── build/
│   └── release.js                  # Release automation script
├── lib/
│   └── utils.js                    # Utility functions (if needed)
├── test/
│   ├── integration.js              # Integration tests
│   └── package.js                  # Package file validation
├── .eslintrc.json                  # ESLint configuration
├── .gitignore                      # Git ignore rules
├── main.js                         # Main adapter logic (~1400 lines)
├── io-package.json                 # Adapter configuration
├── package.json                    # NPM dependencies
└── README.md                       # User documentation
```

---

## 🔑 Key Features

### Battery Notifications
- **Full Battery (100%):** Send Telegram notification
- **Empty Battery (0%):** Send Telegram notification (even at night)
- **Intermediate Levels (20%, 40%, 60%, 80%):** Send with current power data

### Night Mode (Configurable)
- **Default Time:** 23:00 - 06:00
- **Behavior:** Suppresses FULL and Intermediate notifications
- **Exception:** 0% always notifies (if `nightModeIgnoreEmpty` is true)

### Quiet Mode (Configurable)
- **Default Time:** 12:00 - 15:00
- **Behavior:** Suppresses ALL notifications (including 0%)
- **Use Case:** Meetings, nap time, undisturbed periods

### Statistics
- **Daily:** Configurable time (default: 22:00)
- **Weekly:** Configurable weekday (default: Monday) + time (default: 10:00)
- **Monthly:** Configurable day (default: 1st) + time (default: 09:00)

### Weather Integration
- **Supported:** daswetter, openweathermap
- **Data:** Today/tomorrow forecast, temperature
- **Usage:** Included in daily statistics

---

## 🧪 Testing Guidelines

### Run Tests
```bash
npm test              # Run all tests
npm run test:package  # Package file validation
npm run test:integration  # Integration tests
npm run lint          # ESLint check
```

### Writing Tests
```javascript
const { tests } = require('@iobroker/testing');
const path = require('path');

// Package file validation (test/package.js)
tests.packageFiles(path.join(__dirname, '..'));

// Integration tests (test/integration.js)
tests.integration(path.join(__dirname, '..'));
```

### Unit Test Example
```javascript
describe('PvNotifications Adapter', () => {
    let adapter;
    
    beforeEach(() => {
        adapter = createMockAdapter();
    });
    
    test('should initialize correctly', async () => {
        await adapter.onReady();
        expect(adapter.connected).toBe(true);
    });
    
    test('should handle external state correctly', async () => {
        const state = await adapter.getForeignStateAsync('modbus.0.soc');
        expect(state.val).toBe(80);
    });
});
```

---

## 📝 Documentation Standards

### Commit Messages
```
v1.0.82: Feature name

- File1: Description of change
- File2: New function added
- Version updated in io-package.json and package.json
```

### Changelog Format (README.md)
```markdown
### 1.0.82 (2026-02-25)
- (user) Added quiet mode feature
- (user) Configurable night mode times
- (fix) Fixed state subscription issue
```

### pv-notification-work.md
Always add new version entries:
```markdown
### Version 1.0.82 - Feature Name
- ✅ Feature description
- ✅ Another change
- ✅ Bug fix
```

---

## 🚀 Release Process

### Automated Release
```bash
# Patch release (1.0.81 → 1.0.82)
npm run release:patch

# Minor release (1.0.81 → 1.0.90)
npm run release:minor

# Major release (1.0.81 → 2.0.0)
npm run release:major

# Manual version
npm run release 1.0.82
```

### What Release Script Does
1. ✅ Updates version in package.json and io-package.json
2. ✅ Creates git commit
3. ✅ Creates git tag (v1.0.82)
4. ✅ Pushes to GitHub (main + tag)

### Manual Release Checklist
- [ ] All tests pass (`npm test`)
- [ ] ESLint clean (`npm run lint`)
- [ ] Version updated in both JSON files
- [ ] Changelog updated in README.md
- [ ] pv-notification-work.md updated
- [ ] Git commit with version in message
- [ ] Git tag created (v1.0.82)
- [ ] Pushed to GitHub
- [ ] GitHub Release created
- [ ] Published to NPM

---

## 🔧 Common Tasks

### Adding New Configuration Option

**1. io-package.json (native section):**
```json
{
  "native": {
    "newOption": "default value"
  }
}
```

**2. admin/jsonConfig.json:**
```json
{
  "newOption": {
    "type": "text",
    "label": "label_newOption",
    "sm": 6,
    "default": "default value"
  }
}
```

**3. admin/i18n/{de,en,ru}/translations.json:**
```json
{
  "label_newOption": "New Option Label"
}
```

**4. main.js (use in code):**
```javascript
const value = this.config.newOption;
```

---

## ⚡ Best Practices

### Native Node.js APIs (No Dependencies)
```javascript
// ✅ CORRECT: Native fetch (Node.js 18+)
const response = await fetch('https://api.example.com/data');
const data = await response.json();

// ❌ AVOID: External libraries for simple tasks
const axios = require('axios');  // Don't add this
```

### Minimal Dependencies
```javascript
// ✅ Write simple helpers yourself
function round(value, decimals) {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

// ❌ Don't add lodash for one function
const _ = require('lodash');  // Don't add this
_.round(value, decimals);
```

### Security
```javascript
// ✅ Read from config, never hardcode
const apiKey = this.config.apiKey;

// ✅ Encrypt sensitive data
const encrypted = this.encrypt(password);

// ❌ NEVER hardcode credentials
const password = 'mySecretPassword123';  // NEVER!
```

### Error Handling
```javascript
try {
    const state = await this.getForeignStateAsync(stateId);
    if (state && state.val !== null) {
        // Process value
    }
} catch (error) {
    this.log.error(`Error reading ${stateId}: ${error.message}`);
    // Handle error gracefully
}
```

### Logging
```javascript
// Use appropriate log levels
this.log.debug('Detailed debug info');  // Only in debug mode
this.log.info('Normal operational info');  // Always shown
this.log.warn('Warning, but not critical');  // Potential issue
this.log.error('Error occurred');  // Something broke
```

---

## 🌐 Translation Management

### Supported Languages
- Deutsch (de)
- English (en)
- Russian (ru)

### Adding New Translation Key

**1. Add to all three files:**
- `admin/i18n/de/translations.json`
- `admin/i18n/en/translations.json`
- `admin/i18n/ru/translations.json`

**2. Use in jsonConfig.json:**
```json
{
  "label": "label_myNewKey"
}
```

**3. Use in main.js:**
```javascript
const text = this.translate('myNewKey');
```

### Validation Script
```javascript
// Check for missing translations
const fs = require('fs');

function validateTranslations() {
    const de = JSON.parse(fs.readFileSync('admin/i18n/de/translations.json'));
    const en = JSON.parse(fs.readFileSync('admin/i18n/en/translations.json'));
    const ru = JSON.parse(fs.readFileSync('admin/i18n/ru/translations.json'));
    
    // All keys should exist in all languages
    const deKeys = Object.keys(de);
    const enKeys = Object.keys(en);
    const ruKeys = Object.keys(ru);
    
    if (deKeys.length !== enKeys.length || deKeys.length !== ruKeys.length) {
        console.error('Translation keys mismatch!');
    }
}
```

---

## 📊 State Management

### State Naming Convention
```javascript
// Use descriptive names under statistics/ namespace
'statistics.currentSOC'           // Current battery SOC
'statistics.currentEnergyKWh'     // Current energy in kWh
'statistics.fullCyclesToday'      // Full cycles today
'statistics.emptyCyclesToday'     // Empty cycles today
'statistics.lastWeekProduction'   // Last week production
```

### State Creation Pattern
```javascript
async createState(id, def, type, desc) {
    await this.extendObjectAsync(id, {
        type: 'state',
        common: {
            name: desc,
            type: type,
            role: 'value',
            read: true,
            write: false,
            def: def
        }
    });
}

// Usage
await this.createState('statistics.currentSOC', 0, 'number', 'Current SOC');
```

---

## 🔗 Useful Links

- **ioBroker Documentation:** https://www.iobroker.net/#de/documentation
- **ioBroker Forum:** https://forum.iobroker.net
- **Adapter Development:** https://github.com/ioBroker/ioBroker/blob/master/doc/DEVADAPTERS.md
- **Testing Framework:** https://github.com/ioBroker/testing
- **GitHub Repository:** https://github.com/sadam6752-tech/ioBroker.pv-notifications

---

**Version:** 1.0.81  
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions  
**Last Updated:** 2026-02-25
