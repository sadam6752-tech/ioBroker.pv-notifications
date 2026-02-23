'use strict';

/*
 * PV Notifications Adapter for ioBroker
 * Send Telegram notifications for PV battery status
 */

const utils = require('@iobroker/adapter-core');

class PvNotifications extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options = {}) {
        super({
            ...options,
            name: 'pv-notifications',
        });

        // Status & Counter
        this.status = {
            full: false,
            empty: false,
            intermediateNotified: [],
            lastNotification: {
                full: 0,
                empty: 0,
                intermediate: 0
            },
            previousSOC: null
        };

        // Statistik
        this.stats = {
            fullCycles: 0,
            emptyCycles: 0,
            maxSOC: 0,
            minSOC: 100,
            weekFullCycles: 0,
            weekEmptyCycles: 0,
            lastStatsReset: new Date().getDate(),
            lastWeekReset: new Date().getDay()
        };

        this.onReady = this.onReady.bind(this);
        this.onStateChange = this.onStateChange.bind(this);
        this.onUnload = this.onUnload.bind(this);
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        this.log.info('PV Notifications Adapter gestartet');

        // Konfiguration loggen
        this.log.info(`Konfiguration: Voll=${this.config.thresholdFull}%, Leer=${this.config.thresholdEmpty}%, Intermediate=[${this.config.intermediateSteps}]`);

        // States für Statistik erstellen
        await this.createState('statistics.fullCyclesToday', 0, 'number', 'Vollzyklen heute');
        await this.createState('statistics.emptyCyclesToday', 0, 'number', 'Leerzyklen heute');
        await this.createState('statistics.maxSOCToday', 0, 'number', 'Max SOC heute');
        await this.createState('statistics.minSOCToday', 100, 'number', 'Min SOC heute');
        await this.createState('statistics.fullCyclesWeek', 0, 'number', 'Vollzyklen diese Woche');
        await this.createState('statistics.emptyCyclesWeek', 0, 'number', 'Leerzyklen diese Woche');
        await this.createState('statistics.currentSOC', 0, 'number', 'Aktueller SOC');
        await this.createState('statistics.currentEnergyKWh', 0, 'number', 'Aktuelle Energie in kWh');

        // Event-Handler für Batterie-SOC registrieren
        if (this.config.batterySOC) {
            this.subscribeStates(this.config.batterySOC);
            this.log.info(`Subscription für ${this.config.batterySOC} erstellt`);
        }

        // Zeitgesteuerte Aufgaben starten
        this.startScheduledTasks();

        // Initiale Statistik laden
        await this.loadStatistics();
    }

    /**
     * State erstellen
     */
    async createState(name, def, type, desc) {
        const id = `${this.namespace}.${name}`;
        try {
            await this.setObjectNotExistsAsync(name, {
                type: 'state',
                common: {
                    name: desc,
                    type: type,
                    role: 'value',
                    read: true,
                    write: true,
                    def: def
                },
                native: {}
            });
        } catch (e) {
            this.log.error(`Fehler beim Erstellen von ${name}: ${e.message}`);
        }
    }

    /**
     * Statistik aus States laden
     */
    async loadStatistics() {
        try {
            const today = new Date().getDate();
            const lastReset = await this.getStateAsync('statistics.lastStatsReset');
            
            if (!lastReset || lastReset.val !== today) {
                // Neuer Tag - Statistik zurücksetzen
                this.stats.fullCycles = 0;
                this.stats.emptyCycles = 0;
                this.stats.maxSOC = 0;
                this.stats.minSOC = 100;
                this.stats.lastStatsReset = today;
                await this.saveStatistics();
            }
        } catch (e) {
            this.log.error(`Fehler beim Laden der Statistik: ${e.message}`);
        }
    }

    /**
     * Statistik in States speichern
     */
    async saveStatistics() {
        try {
            await this.setStateAsync('statistics.fullCyclesToday', this.stats.fullCycles, true);
            await this.setStateAsync('statistics.emptyCyclesToday', this.stats.emptyCycles, true);
            await this.setStateAsync('statistics.maxSOCToday', this.stats.maxSOC, true);
            await this.setStateAsync('statistics.minSOCToday', this.stats.minSOC, true);
            await this.setStateAsync('statistics.fullCyclesWeek', this.stats.weekFullCycles, true);
            await this.setStateAsync('statistics.emptyCyclesWeek', this.stats.weekEmptyCycles, true);
        } catch (e) {
            this.log.error(`Fehler beim Speichern der Statistik: ${e.message}`);
        }
    }

    /**
     * Is called when adapter receives configuration.
     */
    async onConfigChange() {
        this.log.info('Konfiguration geändert');
    }

    /**
     * Is called if a subscribed state changes
     */
    async onStateChange(id, state) {
        if (state) {
            // Batterie-SOC Änderung verarbeiten
            if (id === this.config.batterySOC) {
                this.onBatterySOCChange(state.val);
            }
        }
    }

    /**
     * Hauptfunktion - wird bei SOC-Änderung aufgerufen
     */
    onBatterySOCChange(soc) {
        // Prüfe auf undefinierte/null Werte
        if (soc === null || soc === undefined || isNaN(soc)) {
            this.log.warn('Ungültiger SOC-Wert erhalten: ' + soc);
            return;
        }

        // Aktuelle States aktualisieren
        this.setStateAsync('statistics.currentSOC', soc, true);
        const currentKWh = this.round((soc / 100) * this.config.batteryCapacityWh / 1000, 1);
        this.setStateAsync('statistics.currentEnergyKWh', currentKWh, true);

        // Statistik aktualisieren
        if (soc > this.stats.maxSOC) this.stats.maxSOC = soc;
        if (soc < this.stats.minSOC) this.stats.minSOC = soc;

        this.log.debug(`Batterie-SOC: ${soc}% | Status: voll=${this.status.full}, leer=${this.status.empty}`);

        // Bestimme Richtung (steigend/fallend) für Intermediate
        const direction = (this.status.previousSOC !== null && soc > this.status.previousSOC) ? 'up' :
                          (this.status.previousSOC !== null && soc < this.status.previousSOC) ? 'down' : 'up';

        // Vorherigen SOC für nächste Aktualisierung speichern
        this.status.previousSOC = soc;

        // === NACHT-ZEIT (00:00-08:00) - Nur 0% Benachrichtigung erlauben ===
        const nightTime = this.isNightTime();

        // === Batterie VOLL (100%) - Nicht nachts ===
        if (soc === this.config.thresholdFull) {
            if (!nightTime && !this.status.full && this.canNotify('full')) {
                const message = this.buildFullMessage(soc);
                this.sendTelegram(message, 'high');
                this.status.full = true;
                this.status.lastNotification.full = Date.now();
                this.stats.fullCycles++;
                this.stats.weekFullCycles++;
                this.saveStatistics();
                this.log.info('Batterie voll - Telegram gesendet');
            } else if (this.status.full && !this.canNotify('full')) {
                this.log.debug('Batterie voll, aber Intervall noch nicht abgelaufen');
            } else if (nightTime) {
                this.log.debug('Batterie voll, aber Nachtzeit (00:00-08:00) - keine Benachrichtigung');
            }
        }

        // === Batterie LEER (0%) - Immer erlauben (auch nachts) ===
        if (soc === this.config.thresholdEmpty) {
            if (!this.status.empty && this.canNotify('empty')) {
                const message = this.buildEmptyMessage(soc);
                this.sendTelegram(message, 'high');
                this.status.empty = true;
                this.status.lastNotification.empty = Date.now();
                this.stats.emptyCycles++;
                this.stats.weekEmptyCycles++;
                this.saveStatistics();
                this.log.info('Batterie leer - Telegram gesendet');
            } else if (this.status.empty && !this.canNotify('empty')) {
                this.log.debug('Batterie leer, aber Intervall noch nicht abgelaufen');
            }
        }

        // === Intermediate-Stufen (nur wenn nicht voll/leer und nicht nachts) ===
        if (soc !== this.config.thresholdFull && soc !== this.config.thresholdEmpty) {
            const intermediateSteps = this.config.intermediateSteps.split(',').map(s => parseInt(s.trim()));
            
            // Prüfe Intermediate-Stufen - nur außerhalb der Nachtzeit
            if (!nightTime) {
                for (const step of intermediateSteps) {
                    if (soc === step && !this.status.intermediateNotified.includes(step)) {
                        if (this.canNotify('intermediate')) {
                            const message = this.buildIntermediateMessage(soc, direction);
                            this.sendTelegram(message);
                            this.status.intermediateNotified.push(step);
                            this.status.lastNotification.intermediate = Date.now();
                            this.log.info(`Intermediate ${step}% - Telegram gesendet`);
                        }
                        break;
                    }
                }

                // Reset Intermediate-Flags wenn Stufe verlassen
                for (const step of intermediateSteps) {
                    if (soc !== step && Math.abs(soc - step) > 2) {
                        const idx = this.status.intermediateNotified.indexOf(step);
                        if (idx > -1) {
                            this.status.intermediateNotified.splice(idx, 1);
                            this.log.debug(`Intermediate ${step}% Flag zurückgesetzt`);
                        }
                    }
                }
            } else {
                this.log.debug('Nachtzeit (00:00-08:00) - Intermediate Benachrichtigungen unterdrückt');
            }
        }

        // === Reset Flag "voll" wenn SOC < 95% ===
        if (soc < this.config.thresholdResetFull && this.status.full) {
            this.status.full = false;
            this.log.debug('Status "voll" zurückgesetzt (SOC < 95%)');
        }

        // === Reset Flag "leer" wenn SOC > 5% ===
        if (soc > this.config.thresholdResetEmpty && this.status.empty) {
            this.status.empty = false;
            this.log.debug('Status "leer" zurückgesetzt (SOC > 5%)');
        }
    }

    /**
     * Prüfe ob Mindestintervall eingehalten
     */
    canNotify(type) {
        const now = Date.now();
        const lastTime = this.status.lastNotification[type] || 0;
        const minIntervalMinutes = this.config[`minInterval${type.charAt(0).toUpperCase() + type.slice(1)}`] || 10;
        const minInterval = minIntervalMinutes * 60 * 1000;
        return (now - lastTime) >= minInterval;
    }

    /**
     * Prüfe ob aktuelle Zeit im Nacht-Fenster (00:00-08:00) ist
     */
    isNightTime() {
        const now = new Date();
        const hours = now.getHours();
        return hours >= 0 && hours < 8;
    }

    /**
     * Sende Telegram-Nachricht mit Zeitstempel
     */
    sendTelegram(message, priority = 'normal') {
        const timestamp = this.getTimeString();
        const fullMessage = `${timestamp} - ${message}`;

        if (this.config.telegramInstance) {
            // Benutzer zusammenstellen (User1 und/oder User2)
            const users = [];
            if (this.config.telegramUser1 && this.config.telegramUser1.trim()) {
                users.push(this.config.telegramUser1.trim());
            }
            if (this.config.telegramUser2 && this.config.telegramUser2.trim()) {
                users.push(this.config.telegramUser2.trim());
            }

            if (users.length > 0) {
                this.sendTo(this.config.telegramInstance, 'send', {
                    text: fullMessage,
                    users: users.join(', ')
                }, (result) => {
                    if (result && result.error) {
                        this.log.error(`Telegram Fehler: ${result.error}`);
                    } else {
                        this.log.info(fullMessage);
                    }
                });
            } else {
                this.log.warn('Keine Telegram-Benutzer konfiguriert: ' + fullMessage);
            }
        } else {
            this.log.warn('Telegram-Instanz nicht konfiguriert: ' + fullMessage);
        }
    }

    /**
     * Aktuelle Zeit als formatierter String
     */
    getTimeString() {
        const now = new Date();
        return now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }

    /**
     * Baue detaillierte Status-Nachricht bei vollem Akku
     */
    buildFullMessage(soc) {
        const power = this.getStateValue(this.config.powerProduction);
        const totalProd = this.getStateValue(this.config.totalProduction);
        const feedIn = this.getStateValue(this.config.feedIn);
        const consumption = this.getStateValue(this.config.consumption);

        let message = `🔋 *Batterie VOLL* (${soc}%)

⚡ Aktuelle Produktion: ${this.round(power)} W
🏠 Aktueller Verbrauch: ${this.round(consumption)} W
☀️ Produktion heute: ${this.round(totalProd)} kWh
🔌 Eingespeist heute: ${this.round(Math.abs(feedIn), 0)} kWh`;

        // Wetter-Prognose hinzufügen (optional)
        if (this.config.weatherTomorrow) {
            try {
                const weatherTomorrow = this.getStateValue(this.config.weatherTomorrow);
                if (weatherTomorrow) {
                    const weatherDesc = this.getWeatherDescription(weatherTomorrow);
                    message += `\n🌤️ Morgen: ${weatherDesc}`;

                    if (this.isWeatherBad(weatherTomorrow)) {
                        message += `\n💡 Tipp: Morgen wenig Sonne - heute Verbraucher nutzen!`;
                    }
                }
            } catch (e) {
                this.log.debug('Wetter-Daten nicht verfügbar: ' + e.message);
            }
        }

        // Empfehlungen bei hoher Produktion
        if (power > this.config.highProduction) {
            message += `\n\n🚗 Jetzt ideal für: Elektroauto, Waschmaschine, Spülmaschine!`;
        }

        return message;
    }

    /**
     * Baue Nachricht bei leerem Akku
     */
    buildEmptyMessage(soc) {
        const gridPower = this.getStateValue(this.config.gridPower);
        const consumption = this.getStateValue(this.config.consumption);

        let message = `🔋 *Batterie LEER* (${soc}%)

⚠️ Aktueller Netzbezug: ${this.round(gridPower)} W
🏠 Verbrauch: ${this.round(consumption)} W`;

        // Wetter-Prognose
        if (this.config.weatherTomorrow) {
            try {
                const weatherTomorrow = this.getStateValue(this.config.weatherTomorrow);
                if (weatherTomorrow) {
                    const weatherDesc = this.getWeatherDescription(weatherTomorrow);
                    message += `\n🌤️ Morgen: ${weatherDesc}`;

                    if (this.isWeatherGood(weatherTomorrow)) {
                        message += `\n💡 Gute Nachricht: Morgen wieder mehr Sonne!`;
                    }
                }
            } catch (e) {
                this.log.debug('Wetter-Daten nicht verfügbar: ' + e.message);
            }
        }

        // Spartipps
        if (consumption > this.config.highConsumption) {
            message += `\n\n💰 Hoher Verbrauch! Nicht benötigte Geräte ausschalten.`;
        }

        return message;
    }

    /**
     * Baue Intermediate-Nachricht (20%, 40%, 60%, 80%)
     */
    buildIntermediateMessage(soc, direction) {
        const power = this.getStateValue(this.config.powerProduction);
        const trend = direction === 'up' ? '⬆️' : '⬇️';
        const currentKWh = this.round((soc / 100) * this.config.batteryCapacityWh / 1000, 1);

        // Nachrichtentext basierend auf SOC und Richtung
        let infoText = '';
        if (soc === 80) {
            infoText = '💡 Bald voll!';
        } else if (soc === 60) {
            infoText = '';
        } else if (soc === 40) {
            infoText = '💡 Noch ausreichend Reserve';
        } else if (soc === 20) {
            if (direction === 'down') {
                infoText = '⚠️ Bald Reserve nötig';
            } else {
                infoText = '✅ Batterie wird geladen';
            }
        }

        const messages = {
            80: `🔋 Batterie bei ${soc}% (${currentKWh} kWh) ${trend}\n⚡ Produktion: ${this.round(power)} W\n${infoText}`,
            60: `🔋 Batterie bei ${soc}% (${currentKWh} kWh) ${trend}\n⚡ Produktion: ${this.round(power)} W`,
            40: `🔋 Batterie bei ${soc}% (${currentKWh} kWh) ${trend}\n⚡ Produktion: ${this.round(power)} W\n${infoText}`,
            20: `🔋 Batterie bei ${soc}% (${currentKWh} kWh) ${trend}\n⚡ Produktion: ${this.round(power)} W\n${infoText}`
        };

        return messages[soc] || `🔋 Batterie bei ${soc}% (${currentKWh} kWh)`;
    }

    /**
     * Baue tägliche Statistik-Nachricht
     */
    buildDailyStatsMessage() {
        const soc = this.getStateValue(this.config.batterySOC);
        const batteryCapacityKWh = this.round(this.config.batteryCapacityWh / 1000, 1);
        const currentKWh = this.round((soc / 100) * this.config.batteryCapacityWh / 1000, 1);

        const totalProd = this.getStateValue(this.config.totalProduction);
        const feedIn = this.getStateValue(this.config.feedIn);
        const selfConsumption = this.round(totalProd - Math.abs(feedIn), 1);
        const selfConsumptionRate = totalProd > 0 ? this.round((selfConsumption / totalProd) * 100, 1) : 0;

        return `📊 *Tagesstatistik PV-Anlage*
━━━━━━━━━━━━━━━━━━━━━━
🔋 Aktueller Ladestand: ${soc}%
⚡ Aktuelle Energie: ${currentKWh} kWh (${batteryCapacityKWh} kWh Gesamt)
━━━━━━━━━━━━━━━━━━━━━━
☀️ Produktion: ${this.round(totalProd)} kWh
🏠 Eigenverbrauch: ${selfConsumption} kWh (${selfConsumptionRate}%)
🔌 Einspeisung: ${this.round(Math.abs(feedIn), 0)} kWh`;
    }

    /**
     * Baue wöchentliche Statistik-Nachricht
     */
    buildWeeklyStatsMessage() {
        return `📊 *Wochenstatistik PV-Anlage*
━━━━━━━━━━━━━━━━━━━━━━
🔋 Vollzyklen diese Woche: ${this.stats.weekFullCycles}
📉 Leerzyklen diese Woche: ${this.stats.weekEmptyCycles}
━━━━━━━━━━━━━━━━━━━━━━
💡 Ein gesunder Zyklus pro Tag ist normal.
🔋 Bei vielen Zyklen: Batterie-Settings prüfen.`;
    }

    /**
     * Hole Wetter-Description aus Text
     */
    getWeatherDescription(weatherText) {
        if (!weatherText) return '🌡️ unbekannt';

        const text = weatherText.toLowerCase();

        if (text.includes('sonnig') || text.includes('klar')) return '☀️ sonnig';
        if (text.includes('wolkig') || text.includes('bewölkt')) return '⛅ bewölkt';
        if (text.includes('bedeckt')) return '☁️ bedeckt';
        if (text.includes('regen') || text.includes('rain')) return '🌧️ Regen';
        if (text.includes('schnee') || text.includes('snow')) return '❄️ Schnee';
        if (text.includes('gewitter') || text.includes('thunder')) return '⛈️ Gewitter';
        if (text.includes('nebel') || text.includes('fog')) return '🌫️ Nebel';

        if (text.includes('clear')) return '☀️ sonnig';
        if (text.includes('cloud')) return '⛅ bewölkt';

        return '🌡️ ' + weatherText;
    }

    /**
     * Prüfe ob Wetter gut ist
     */
    isWeatherGood(weatherText) {
        if (!weatherText) return false;
        const text = weatherText.toLowerCase();
        return text.includes('sonnig') || text.includes('klar') ||
               text.includes('clear') || text.includes('few clouds');
    }

    /**
     * Prüfe ob Wetter schlecht ist
     */
    isWeatherBad(weatherText) {
        if (!weatherText) return false;
        const text = weatherText.toLowerCase();
        return text.includes('regen') || text.includes('rain') ||
               text.includes('schnee') || text.includes('snow') ||
               text.includes('gewitter') || text.includes('thunder') ||
               text.includes('bedeckt') || text.includes('overcast');
    }

    /**
     * State-Wert holen
     */
    getStateValue(id) {
        if (!id) return 0;
        try {
            const state = this.getState(id);
            return state && state.val !== null && state.val !== undefined ? state.val : 0;
        } catch (e) {
            return 0;
        }
    }

    /**
     * Runde Zahl auf Dezimalstellen
     */
    round(value, decimals = 2) {
        if (value === null || value === undefined || isNaN(value)) return 0;
        return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
    }

    /**
     * Zeitgesteuerte Aufgaben starten
     */
    startScheduledTasks() {
        // Alle 5 Minuten: Statistik prüfen
        this.scheduleJob('*/5 * * * *', () => {
            this.resetDailyStats();
            this.resetWeeklyStats();
        });

        // Tägliche Statistik zur konfigurierten Zeit
        const [hours, minutes] = this.config.statsDayTime.split(':');
        this.scheduleJob(`${minutes} ${hours} * * *`, () => {
            this.sendTelegram(this.buildDailyStatsMessage());
        });

        this.log.info(`Zeitgesteuerte Aufgaben gestartet (Stats um ${this.config.statsDayTime})`);
    }

    /**
     * Tägliche Statistik zurücksetzen (nur um 22:00)
     */
    resetDailyStats() {
        const today = new Date().getDate();
        const now = new Date();
        const hours = now.getHours();

        // Reset nur zwischen 22:00 und 23:59
        if (today !== this.stats.lastStatsReset && hours >= 22) {
            this.log.info('Setze tägliche Statistik zurück');
            this.stats.fullCycles = 0;
            this.stats.emptyCycles = 0;
            this.stats.maxSOC = 0;
            this.stats.minSOC = 100;
            this.stats.lastStatsReset = today;
            this.saveStatistics();
        }
    }

    /**
     * Wöchentliche Statistik zurücksetzen
     */
    resetWeeklyStats() {
        const today = new Date().getDay();
        if (today === this.config.statsWeekDay && today !== this.stats.lastWeekReset) {
            this.log.info('Setze wöchentliche Statistik zurück');
            this.stats.weekFullCycles = 0;
            this.stats.weekEmptyCycles = 0;
            this.stats.lastWeekReset = today;
            this.sendTelegram(this.buildWeeklyStatsMessage());
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    async onUnload(callback) {
        try {
            this.log.info('PV Notifications Adapter wird gestoppt');
            await this.saveStatistics();
            callback();
        } catch (e) {
            callback();
        }
    }
}

// @ts-ignore
if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions> | undefined} [options]
     */
    module.exports = (options) => new PvNotifications(options);
} else {
    // otherwise start the instance directly
    new PvNotifications();
}
