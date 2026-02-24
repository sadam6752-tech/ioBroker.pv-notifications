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
            lastWeekReset: new Date().getDay(),
            lastMonthReset: 0,
            
            // Letzte Monats-/Wochendaten
            lastMonthProduction: 0,
            lastMonthConsumption: 0,
            lastMonthFeedIn: 0,
            lastMonthGridPower: 0,
            lastMonthFullCycles: 0,
            lastMonthEmptyCycles: 0,
            lastWeekProduction: 0,
            lastWeekConsumption: 0,
            lastWeekFeedIn: 0,
            lastWeekGridPower: 0,
            lastWeekFullCycles: 0,
            lastWeekEmptyCycles: 0
        };

        this.onReady = this.onReady.bind(this);
        this.onStateChange = this.onStateChange.bind(this);
        this.onUnload = this.onUnload.bind(this);
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Reset connection indicator
        this.setState('info.connection', false, true);

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
        
        // States für letzte Monats-/Wochenstatistik
        await this.createState('statistics.lastMonthProduction', 0, 'number', 'Produktion letzter Monat');
        await this.createState('statistics.lastMonthConsumption', 0, 'number', 'Verbrauch letzter Monat');
        await this.createState('statistics.lastMonthFeedIn', 0, 'number', 'Einspeisung letzter Monat');
        await this.createState('statistics.lastMonthGridPower', 0, 'number', 'Netzbezug letzter Monat');
        await this.createState('statistics.lastMonthFullCycles', 0, 'number', 'Vollzyklen letzter Monat');
        await this.createState('statistics.lastMonthEmptyCycles', 0, 'number', 'Leerzyklen letzter Monat');
        await this.createState('statistics.lastWeekProduction', 0, 'number', 'Produktion letzte Woche');
        await this.createState('statistics.lastWeekConsumption', 0, 'number', 'Verbrauch letzte Woche');
        await this.createState('statistics.lastWeekFeedIn', 0, 'number', 'Einspeisung letzte Woche');
        await this.createState('statistics.lastWeekGridPower', 0, 'number', 'Netzbezug letzte Woche');
        await this.createState('statistics.lastWeekFullCycles', 0, 'number', 'Vollzyklen letzte Woche');
        await this.createState('statistics.lastWeekEmptyCycles', 0, 'number', 'Leerzyklen letzte Woche');
        
        await this.createState('info.connection', false, 'boolean', 'Adapter ist mit Telegram verbunden');

        // Event-Handler für Batterie-SOC registrieren
        if (this.config.batterySOC) {
            this.subscribeStates(this.config.batterySOC);
            this.log.info(`Subscription für ${this.config.batterySOC} erstellt`);
        }

        // Zeitgesteuerte Aufgaben starten
        this.startScheduledTasks();

        // Initiale Statistik laden
        await this.loadStatistics();

        // Signalisiere dass der Adapter bereit ist
        this.setState('info.connection', true, true);
        this.log.info('PV Notifications Adapter ist bereit');
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
            
            // Letzte Monats-/Wochendaten speichern
            await this.setStateAsync('statistics.lastMonthProduction', this.stats.lastMonthProduction, true);
            await this.setStateAsync('statistics.lastMonthConsumption', this.stats.lastMonthConsumption, true);
            await this.setStateAsync('statistics.lastMonthFeedIn', this.stats.lastMonthFeedIn, true);
            await this.setStateAsync('statistics.lastMonthGridPower', this.stats.lastMonthGridPower, true);
            await this.setStateAsync('statistics.lastMonthFullCycles', this.stats.lastMonthFullCycles, true);
            await this.setStateAsync('statistics.lastMonthEmptyCycles', this.stats.lastMonthEmptyCycles, true);
            await this.setStateAsync('statistics.lastWeekProduction', this.stats.lastWeekProduction, true);
            await this.setStateAsync('statistics.lastWeekConsumption', this.stats.lastWeekConsumption, true);
            await this.setStateAsync('statistics.lastWeekFeedIn', this.stats.lastWeekFeedIn, true);
            await this.setStateAsync('statistics.lastWeekGridPower', this.stats.lastWeekGridPower, true);
            await this.setStateAsync('statistics.lastWeekFullCycles', this.stats.lastWeekFullCycles, true);
            await this.setStateAsync('statistics.lastWeekEmptyCycles', this.stats.lastWeekEmptyCycles, true);
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
        const nightModeActive = this.config.nightModeEnabled !== false;
        const ignoreEmptyAtNight = this.config.nightModeIgnoreEmpty !== false;

        // === Batterie VOLL (100%) - Nicht nachts (wenn Nachtmodus aktiv) ===
        if (soc === this.config.thresholdFull) {
            if ((!nightTime || !nightModeActive) && !this.status.full && this.canNotify('full')) {
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
            } else if (nightTime && nightModeActive) {
                this.log.debug('Batterie voll, aber Nachtzeit (00:00-08:00) - keine Benachrichtigung');
            }
        }

        // === Batterie LEER (0%) - Immer erlauben wenn nightModeIgnoreEmpty aktiv ist ===
        if (soc === this.config.thresholdEmpty) {
            if (!this.status.empty && this.canNotify('empty')) {
                // Bei 0% immer benachrichtigen wenn nightModeIgnoreEmpty aktiv ist
                // Sonst nur wenn nicht Nachtzeit oder Nachtmodus deaktiviert
                if (ignoreEmptyAtNight || !nightTime || !nightModeActive) {
                    const message = this.buildEmptyMessage(soc);
                    this.sendTelegram(message, 'high');
                    this.status.empty = true;
                    this.status.lastNotification.empty = Date.now();
                    this.stats.emptyCycles++;
                    this.stats.weekEmptyCycles++;
                    this.saveStatistics();
                    this.log.info('Batterie leer - Telegram gesendet');
                } else if (nightTime && nightModeActive && !ignoreEmptyAtNight) {
                    this.log.debug('Batterie leer, aber Nachtmodus aktiv und 0% wird ignoriert');
                }
            } else if (this.status.empty && !this.canNotify('empty')) {
                this.log.debug('Batterie leer, aber Intervall noch nicht abgelaufen');
            }
        }

        // === Intermediate-Stufen (nur wenn nicht voll/leer und nicht nachts) ===
        if (soc !== this.config.thresholdFull && soc !== this.config.thresholdEmpty) {
            const intermediateSteps = this.config.intermediateSteps.split(',').map(s => parseInt(s.trim()));

            // Prüfe Intermediate-Stufen - nur außerhalb der Nachtzeit (wenn Nachtmodus aktiv)
            if (!nightTime || !nightModeActive) {
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
            } else if (nightModeActive) {
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
            // Benutzer aus kommagetrennter Liste
            const users = this.config.telegramUsers || '';
            const usersList = users.split(',').map(u => u.trim()).filter(u => u.length > 0);

            if (usersList.length > 0) {
                this.sendTo(this.config.telegramInstance, 'send', {
                    text: fullMessage,
                    users: usersList.join(', ')
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
        if (this.config.weatherTomorrowText || this.config.weatherTomorrow) {
            try {
                const weatherTomorrowText = this.getStateValue(this.config.weatherTomorrowText);
                const weatherTomorrow = this.getStateValue(this.config.weatherTomorrow);
                const tempTomorrow = this.getStateValue(this.config.weatherTomorrowTemp);
                const tempText = tempTomorrow ? ` ${this.round(tempTomorrow, 1)}°C` : '';
                
                const weatherText = weatherTomorrowText || weatherTomorrow;
                if (weatherText) {
                    const weatherDesc = this.getWeatherDescription(weatherText);
                    message += `\n🌤️ Morgen: ${weatherDesc}${tempText}`;

                    if (this.isWeatherBad(weatherText)) {
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
        if (this.config.weatherTomorrowText || this.config.weatherTomorrow) {
            try {
                const weatherTomorrowText = this.getStateValue(this.config.weatherTomorrowText);
                const weatherTomorrow = this.getStateValue(this.config.weatherTomorrow);
                const tempTomorrow = this.getStateValue(this.config.weatherTomorrowTemp);
                const tempText = tempTomorrow ? ` ${this.round(tempTomorrow, 1)}°C` : '';
                
                const weatherText = weatherTomorrowText || weatherTomorrow;
                if (weatherText) {
                    const weatherDesc = this.getWeatherDescription(weatherText);
                    message += `\n🌤️ Morgen: ${weatherDesc}${tempText}`;

                    if (this.isWeatherGood(weatherText)) {
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
        const gridPower = this.getStateValue(this.config.gridPower);
        const selfConsumption = this.round(totalProd - Math.abs(feedIn), 1);
        const selfConsumptionRate = totalProd > 0 ? this.round((selfConsumption / totalProd) * 100, 1) : 0;

        let message = `📊 *Tagesstatistik PV-Anlage*
━━━━━━━━━━━━━━━━━━━━━━
🔋 Aktueller Ladestand: ${soc}%
⚡ Aktuelle Energie: ${currentKWh} kWh (${batteryCapacityKWh} kWh Gesamt)
━━━━━━━━━━━━━━━━━━━━━━
☀️ Produktion: ${this.round(totalProd)} kWh
🏠 Eigenverbrauch: ${selfConsumption} kWh (${selfConsumptionRate}%)
🔌 Einspeisung: ${this.round(Math.abs(feedIn), 0)} kWh
⚡ Netzbezug: ${this.round(gridPower, 0)} kWh`;

        // Wetter-Prognose für morgen hinzufügen
        if (this.config.weatherTomorrowText || this.config.weatherTomorrow) {
            try {
                const weatherTomorrowText = this.getStateValue(this.config.weatherTomorrowText);
                const weatherTomorrow = this.getStateValue(this.config.weatherTomorrow);
                const tempTomorrow = this.getStateValue(this.config.weatherTomorrowTemp);
                const tempText = tempTomorrow ? ` ${this.round(tempTomorrow, 1)}°C` : '';

                const weatherText = weatherTomorrowText || weatherTomorrow;
                if (weatherText) {
                    const weatherDesc = this.getWeatherDescription(weatherText);
                    message += `\n━━━━━━━━━━━━━━━━━━━━━━\n🌤️ *Wetter morgen:* ${weatherDesc}${tempText}`;

                    // Zusätzliche Info bei gutem/schlechtem Wetter
                    if (this.isWeatherGood(weatherText)) {
                        message += `\n☀️ Gute PV-Produktion erwartet!`;
                    } else if (this.isWeatherBad(weatherText)) {
                        message += `\n⛅ Weniger PV-Produktion erwartet`;
                    }
                }
            } catch (e) {
                this.log.debug('Wetter-Daten für morgen nicht verfügbar: ' + e.message);
            }
        }

        return message;
    }

    /**
     * Baue wöchentliche Statistik-Nachricht
     */
    buildWeeklyStatsMessage() {
        const totalProd = this.round(this.stats.lastWeekProduction, 1);
        const consumption = this.round(this.stats.lastWeekConsumption, 1);
        const feedIn = this.round(Math.abs(this.stats.lastWeekFeedIn), 1);
        const gridPower = this.round(this.stats.lastWeekGridPower, 1);
        const selfConsumption = this.round(totalProd - feedIn, 1);
        const selfConsumptionRate = totalProd > 0 ? this.round((selfConsumption / totalProd) * 100, 1) : 0;

        return `📊 *Wochenstatistik PV-Anlage*
━━━━━━━━━━━━━━━━━━━━━━
🔋 Vollzyklen letzte Woche: ${this.stats.lastWeekFullCycles}
📉 Leerzyklen letzte Woche: ${this.stats.lastWeekEmptyCycles}
━━━━━━━━━━━━━━━━━━━━━━
☀️ Produktion: ${totalProd} kWh
🏠 Eigenverbrauch: ${selfConsumption} kWh (${selfConsumptionRate}%)
🔌 Einspeisung: ${feedIn} kWh
⚡ Netzbezug: ${gridPower} kWh
━━━━━━━━━━━━━━━━━━━━━━
💡 Ein gesunder Zyklus pro Tag ist normal.
🔋 Bei vielen Zyklen: Batterie-Settings prüfen.`;
    }

    /**
     * Baue monatliche Statistik-Nachricht
     */
    buildMonthlyStatsMessage() {
        const totalProd = this.round(this.stats.lastMonthProduction, 1);
        const consumption = this.round(this.stats.lastMonthConsumption, 1);
        const feedIn = this.round(Math.abs(this.stats.lastMonthFeedIn), 1);
        const gridPower = this.round(this.stats.lastMonthGridPower, 1);
        const selfConsumption = this.round(totalProd - feedIn, 1);
        const selfConsumptionRate = totalProd > 0 ? this.round((selfConsumption / totalProd) * 100, 1) : 0;

        return `📊 *Monatsstatistik PV-Anlage*
━━━━━━━━━━━━━━━━━━━━━━
🔋 Vollzyklen letzter Monat: ${this.stats.lastMonthFullCycles}
📉 Leerzyklen letzter Monat: ${this.stats.lastMonthEmptyCycles}
━━━━━━━━━━━━━━━━━━━━━━
☀️ Produktion: ${totalProd} kWh
🏠 Eigenverbrauch: ${selfConsumption} kWh (${selfConsumptionRate}%)
🔌 Einspeisung: ${feedIn} kWh
⚡ Netzbezug: ${gridPower} kWh
━━━━━━━━━━━━━━━━━━━━━━`;
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
            this.resetMonthlyStats();
        });

        // Tägliche Statistik zur konfigurierten Zeit
        const [dayHours, dayMinutes] = this.config.statsDayTime.split(':');
        this.scheduleJob(`${dayMinutes} ${dayHours} * * *`, () => {
            this.sendTelegram(this.buildDailyStatsMessage());
        });

        // Wöchentliche Statistik am konfigurierten Tag und Zeit
        const [weekHours, weekMinutes] = this.config.statsWeekTime.split(':');
        this.scheduleJob(`${weekMinutes} ${weekHours} * * ${this.config.statsWeekDay}`, () => {
            this.sendTelegram(this.buildWeeklyStatsMessage());
        });

        // Monatsstatistik am konfigurierten Tag und Zeit (wenn aktiviert)
        if (this.config.monthlyStatsEnabled) {
            const [monthHours, monthMinutes] = this.config.monthlyStatsTime.split(':');
            this.scheduleJob(`${monthMinutes} ${monthHours} ${this.config.monthlyStatsDay} * *`, () => {
                this.sendTelegram(this.buildMonthlyStatsMessage());
            });
            this.log.info(`Monatsstatistik aktiviert: Tag ${this.config.monthlyStatsDay} um ${this.config.monthlyStatsTime}`);
        }

        this.log.info(`Zeitgesteuerte Aufgaben gestartet (Täglich: ${this.config.statsDayTime}, Wöchentlich: Tag ${this.config.statsWeekDay} um ${this.config.statsWeekTime})`);
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
            
            // Aktuelle Daten als "letzte Woche" speichern
            this.stats.lastWeekProduction = this.getStateValue(this.config.weeklyProduction);
            this.stats.lastWeekConsumption = this.getStateValue(this.config.weeklyConsumption);
            this.stats.lastWeekFeedIn = this.getStateValue(this.config.weeklyFeedIn);
            this.stats.lastWeekGridPower = this.getStateValue(this.config.weeklyGridPower);
            this.stats.lastWeekFullCycles = this.stats.weekFullCycles;
            this.stats.lastWeekEmptyCycles = this.stats.weekEmptyCycles;
            
            // Wöchentliche Statistik zurücksetzen
            this.stats.weekFullCycles = 0;
            this.stats.weekEmptyCycles = 0;
            this.stats.lastWeekReset = today;
            
            this.saveStatistics();
            this.sendTelegram(this.buildWeeklyStatsMessage());
        }
    }

    /**
     * Monatsstatistik zurücksetzen
     */
    resetMonthlyStats() {
        if (!this.config.monthlyStatsEnabled) return;

        const today = new Date().getDate();
        const now = new Date();
        const hours = now.getHours();
        const [statHours, statMinutes] = this.config.monthlyStatsTime.split(':').map(Number);

        // Daten am konfigurierten Tag nach der Sendezeit speichern
        if (today === this.config.monthlyStatsDay &&
            this.stats.lastMonthReset !== today &&
            hours >= statHours) {
            this.log.info('Setze monatliche Statistik zurück');
            
            // Aktuelle Daten als "letzter Monat" speichern
            this.stats.lastMonthProduction = this.getStateValue(this.config.monthlyProduction);
            this.stats.lastMonthConsumption = this.getStateValue(this.config.monthlyConsumption);
            this.stats.lastMonthFeedIn = this.getStateValue(this.config.monthlyFeedIn);
            this.stats.lastMonthGridPower = this.getStateValue(this.config.monthlyGridPower);
            this.stats.lastMonthFullCycles = this.stats.fullCycles;
            this.stats.lastMonthEmptyCycles = this.stats.emptyCycles;
            
            this.stats.lastMonthReset = today;
            this.saveStatistics();
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    async onUnload(callback) {
        try {
            this.log.info('PV Notifications Adapter wird gestoppt');
            // Connection zurücksetzen
            this.setState('info.connection', false, true);
            await this.saveStatistics();
            callback();
        } catch (e) {
            this.log.error('Fehler beim Stoppen: ' + e.message);
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
