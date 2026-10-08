'use strict';

/*
 * PV Notifications Adapter for ioBroker
 * Send Telegram notifications for PV battery status
 */

const utils = require('@iobroker/adapter-core');

class PvNotifications extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options] - Adapter options
     */
    constructor(options = {}) {
        super({
            ...options,
            name: 'pv-notifications',
        });

        // Systemsprache laden
        this.systemLang = 'de'; // Standard

        // Status & Counter
        this.status = {
            full: false,
            empty: false,
            intermediateNotified: [],
            lastNotification: {
                full: 0,
                empty: 0,
                intermediate: 0,
            },
            previousSOC: null,
            testMessageRunning: false, // Flag gegen doppelte Test-Nachrichten
        };

        // Statistik
        this.stats = {
            fullCycles: 0,
            emptyCycles: 0,
            maxSOC: 0,
            minSOC: 100,
            weekFullCycles: 0,
            weekEmptyCycles: 0,
            monthFullCycles: 0,
            monthEmptyCycles: 0,
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
            lastWeekEmptyCycles: 0,
        };

        this.onReady = this.onReady.bind(this);
        this.onStateChange = this.onStateChange.bind(this);
        this.onUnload = this.onUnload.bind(this);

        // Timer reference for cleanup
        this.scheduledInterval = null;

        // Ready-Handler registrieren (für js-controller 7+)
        this.on('ready', this.onReady);

        // StateChange-Handler registrieren (für js-controller 7+)
        this.on('stateChange', this.onStateChange);

        // Unload handler (saves statistics, resets connection state)
        this.on('unload', this.onUnload);
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        this.log.debug('onReady is executing...');

        // Reset connection indicator
        await this.setState('info.connection', false, true);

        // Load system language
        this.log.debug('Loading system language...');
        await this.loadSystemLanguage();

        this.log.info('PV Notifications Adapter started');

        // Migration: Set weather checkboxes to true if not set (for updates from < v1.1.3)
        if (
            this.config.weatherEnabled === true &&
            (this.config.weatherInIntermediate === undefined || this.config.weatherInIntermediate === null)
        ) {
            this.log.debug('Migration: Setting weatherInIntermediate to true (default)');
        }
        if (
            this.config.weatherEnabled === true &&
            (this.config.weatherInDailyStats === undefined || this.config.weatherInDailyStats === null)
        ) {
            this.log.debug('Migration: Setting weatherInDailyStats to true (default)');
        }

        // Log configuration
        this.log.info(
            `Configuration: Full=${this.config.thresholdFull}%, Empty=${this.config.thresholdEmpty}%, Intermediate=[${this.config.intermediateSteps}]`,
        );

        // Create channel objects
        await this.setObjectNotExists('statistics', { type: 'channel', common: { name: 'Statistics' }, native: {} });
        await this.setObjectNotExists('info', { type: 'channel', common: { name: 'Info' }, native: {} });

        // Create statistics states
        this.log.debug('Creating statistics states...');
        await this.setObjectNotExists('statistics.fullCyclesToday', {
            type: 'state',
            common: { name: 'Full cycles today', type: 'number', role: 'value', read: true, write: false, def: 0 },
        });
        await this.setObjectNotExists('statistics.emptyCyclesToday', {
            type: 'state',
            common: { name: 'Empty cycles today', type: 'number', role: 'value', read: true, write: false, def: 0 },
        });
        await this.extendObject('statistics.maxSOCToday', {
            type: 'state',
            common: {
                name: 'Max SOC today',
                type: 'number',
                role: 'value.battery',
                read: true,
                write: false,
                def: 0,
                unit: '%',
            },
        });
        await this.extendObject('statistics.minSOCToday', {
            type: 'state',
            common: {
                name: 'Min SOC today',
                type: 'number',
                role: 'value.battery',
                read: true,
                write: false,
                def: 100,
                unit: '%',
            },
        });
        await this.setObjectNotExists('statistics.fullCyclesWeek', {
            type: 'state',
            common: { name: 'Full cycles this week', type: 'number', role: 'value', read: true, write: false, def: 0 },
        });
        await this.setObjectNotExists('statistics.emptyCyclesWeek', {
            type: 'state',
            common: { name: 'Empty cycles this week', type: 'number', role: 'value', read: true, write: false, def: 0 },
        });
        await this.setObjectNotExists('statistics.fullCyclesMonth', {
            type: 'state',
            common: { name: 'Full cycles this month', type: 'number', role: 'value', read: true, write: false, def: 0 },
        });
        await this.setObjectNotExists('statistics.emptyCyclesMonth', {
            type: 'state',
            common: {
                name: 'Empty cycles this month',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
                def: 0,
            },
        });
        await this.setObjectNotExists('statistics.lastStatsReset', {
            type: 'state',
            common: {
                name: 'Day of last daily reset',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
                def: 0,
            },
        });
        await this.extendObject('statistics.currentSOC', {
            type: 'state',
            common: {
                name: 'Current SOC',
                type: 'number',
                role: 'value.battery',
                read: true,
                write: false,
                def: 0,
                unit: '%',
            },
        });
        await this.extendObject('statistics.currentEnergyKWh', {
            type: 'state',
            common: {
                name: 'Current energy',
                type: 'number',
                role: 'value.energy',
                read: true,
                write: false,
                def: 0,
                unit: 'kWh',
            },
        });
        await this.extendObject('statistics.currentPower', {
            type: 'state',
            common: {
                name: 'Current power',
                type: 'number',
                role: 'value.power',
                read: true,
                write: false,
                def: 0,
                unit: 'W',
            },
        });
        await this.extendObject('statistics.currentConsumptionPower', {
            type: 'state',
            common: {
                name: 'Current consumption power',
                type: 'number',
                role: 'value.power',
                read: true,
                write: false,
                def: 0,
                unit: 'W',
            },
        });
        await this.extendObject('statistics.currentTotalProduction', {
            type: 'state',
            common: {
                name: 'Total production today',
                type: 'number',
                role: 'value.energy',
                read: true,
                write: false,
                def: 0,
                unit: 'kWh',
            },
        });
        await this.extendObject('statistics.currentFeedIn', {
            type: 'state',
            common: {
                name: 'Feed-in today',
                type: 'number',
                role: 'value.energy',
                read: true,
                write: false,
                def: 0,
                unit: 'kWh',
            },
        });
        await this.extendObject('statistics.currentConsumption', {
            type: 'state',
            common: {
                name: 'Consumption today',
                type: 'number',
                role: 'value.energy',
                read: true,
                write: false,
                def: 0,
                unit: 'kWh',
            },
        });
        await this.extendObject('statistics.currentGridPower', {
            type: 'state',
            common: {
                name: 'Grid power today',
                type: 'number',
                role: 'value.energy',
                read: true,
                write: false,
                def: 0,
                unit: 'kWh',
            },
        });

        // States für letzte Monats-/Wochenstatistik
        await this.extendObject('statistics.lastMonthProduction', {
            type: 'state',
            common: {
                name: 'Production last month',
                type: 'number',
                role: 'value.energy',
                read: true,
                write: false,
                def: 0,
                unit: 'kWh',
            },
        });
        await this.extendObject('statistics.lastMonthConsumption', {
            type: 'state',
            common: {
                name: 'Consumption last month',
                type: 'number',
                role: 'value.energy',
                read: true,
                write: false,
                def: 0,
                unit: 'kWh',
            },
        });
        await this.extendObject('statistics.lastMonthFeedIn', {
            type: 'state',
            common: {
                name: 'Feed-in last month',
                type: 'number',
                role: 'value.energy',
                read: true,
                write: false,
                def: 0,
                unit: 'kWh',
            },
        });
        await this.extendObject('statistics.lastMonthGridPower', {
            type: 'state',
            common: {
                name: 'Grid power last month',
                type: 'number',
                role: 'value.energy',
                read: true,
                write: false,
                def: 0,
                unit: 'kWh',
            },
        });
        await this.setObjectNotExists('statistics.lastMonthFullCycles', {
            type: 'state',
            common: {
                name: 'Full cycles last month',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
                def: 0,
            },
        });
        await this.setObjectNotExists('statistics.lastMonthEmptyCycles', {
            type: 'state',
            common: {
                name: 'Empty cycles last month',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
                def: 0,
            },
        });
        await this.extendObject('statistics.lastWeekProduction', {
            type: 'state',
            common: {
                name: 'Production last week',
                type: 'number',
                role: 'value.energy',
                read: true,
                write: false,
                def: 0,
                unit: 'kWh',
            },
        });
        await this.extendObject('statistics.lastWeekConsumption', {
            type: 'state',
            common: {
                name: 'Consumption last week',
                type: 'number',
                role: 'value.energy',
                read: true,
                write: false,
                def: 0,
                unit: 'kWh',
            },
        });
        await this.extendObject('statistics.lastWeekFeedIn', {
            type: 'state',
            common: {
                name: 'Feed-in last week',
                type: 'number',
                role: 'value.energy',
                read: true,
                write: false,
                def: 0,
                unit: 'kWh',
            },
        });
        await this.extendObject('statistics.lastWeekGridPower', {
            type: 'state',
            common: {
                name: 'Grid power last week',
                type: 'number',
                role: 'value.energy',
                read: true,
                write: false,
                def: 0,
                unit: 'kWh',
            },
        });
        await this.setObjectNotExists('statistics.lastWeekFullCycles', {
            type: 'state',
            common: {
                name: 'Full cycles last week',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
                def: 0,
            },
        });
        await this.setObjectNotExists('statistics.lastWeekEmptyCycles', {
            type: 'state',
            common: {
                name: 'Empty cycles last week',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
                def: 0,
            },
        });

        // Test-Button State erstellen
        await this.setObjectNotExists('testButton', {
            type: 'state',
            common: {
                name: 'Send test notification',
                type: 'boolean',
                role: 'button',
                read: false,
                write: true,
                def: false,
            },
        });

        // Explicitly subscribe (for js-controller 7+)
        this.subscribeStates('testButton');
        this.log.debug('Subscription for testButton created');

        await this.setObjectNotExists('info.connection', {
            type: 'state',
            common: {
                name: 'Adapter is connected to Telegram',
                type: 'boolean',
                role: 'indicator.connected',
                read: true,
                write: false,
                def: false,
            },
        });

        // Register event handler for battery SOC
        if (this.config.batterySOC) {
            // Use subscribeForeignStates for external states
            this.subscribeForeignStates(this.config.batterySOC);
            this.log.debug(`Subscription for ${this.config.batterySOC} created (foreign)`);
        }

        // Create subscriptions for all data points
        const dataPoints = [
            this.config.powerProduction,
            this.config.totalProduction,
            this.config.feedIn,
            this.config.consumption,
            this.config.currentConsumptionPower,
            this.config.gridPower,
            this.config.weeklyProduction,
            this.config.weeklyConsumption,
            this.config.weeklyFeedIn,
            this.config.weeklyGridPower,
            this.config.monthlyProduction,
            this.config.monthlyConsumption,
            this.config.monthlyFeedIn,
            this.config.monthlyGridPower,
        ];

        for (const dp of dataPoints) {
            if (dp) {
                // Use subscribeForeignStates for external states
                this.subscribeForeignStates(dp);
                this.log.debug(`Subscription for ${dp} created (foreign)`);
            }
        }

        // Re-subscribe all states after all subscriptions
        this.subscribeStates('*');
        this.log.debug('All states subscribed (*)');

        // Start scheduled tasks
        this.startScheduledTasks();

        // Load initial statistics
        await this.loadStatistics();

        // Refresh current values from configured data points
        await this.refreshCurrentValues();

        // Check permissions for configured data points
        await this.checkPermissions();

        // Signal that adapter is ready
        this.setState('info.connection', true, true);
        this.log.info('PV Notifications Adapter is ready');
        this.log.debug(`Adapter namespace: ${this.namespace}`);
    }

    /**
     * Check permissions for configured data points
     */
    async checkPermissions() {
        const dataPoints = [
            { name: 'Battery SOC', id: this.config.batterySOC },
            { name: 'PV Power', id: this.config.powerProduction },
            { name: 'Total Production', id: this.config.totalProduction },
            { name: 'Feed In', id: this.config.feedIn },
            { name: 'Consumption', id: this.config.consumption },
            { name: 'Current Consumption Power', id: this.config.currentConsumptionPower },
            { name: 'Grid Power', id: this.config.gridPower },
        ];

        for (const dp of dataPoints) {
            if (dp.id) {
                try {
                    const state = await this.getForeignStateAsync(dp.id);
                    if (state === null || state === undefined) {
                        this.log.warn(`No read access to "${dp.id}" (${dp.name}) - Please check permissions!`);
                        this.log.warn(
                            `Instructions: Objects → ${dp.id} → 🔑 Key → Enable Read/Receive for pv-notifications.0`,
                        );
                    }
                } catch (e) {
                    this.log.warn(`Error accessing "${dp.id}" (${dp.name}): ${e.message}`);
                }
            }
        }
    }

    /**
     * Load statistics from states
     */
    async loadStatistics() {
        try {
            const today = new Date().getDate();
            const lastReset = await this.getStateAsync('statistics.lastStatsReset');
            const num = async id => {
                const st = await this.getStateAsync(id);
                return st && typeof st.val === 'number' ? st.val : 0;
            };

            // Week/month counters survive restarts
            this.stats.weekFullCycles = await num('statistics.fullCyclesWeek');
            this.stats.weekEmptyCycles = await num('statistics.emptyCyclesWeek');
            this.stats.monthFullCycles = await num('statistics.fullCyclesMonth');
            this.stats.monthEmptyCycles = await num('statistics.emptyCyclesMonth');

            if (lastReset && lastReset.val === today) {
                // Same day - restore daily values (a restart must not wipe them)
                this.stats.fullCycles = await num('statistics.fullCyclesToday');
                this.stats.emptyCycles = await num('statistics.emptyCyclesToday');
                const max = await this.getStateAsync('statistics.maxSOCToday');
                const min = await this.getStateAsync('statistics.minSOCToday');
                this.stats.maxSOC = max && typeof max.val === 'number' ? max.val : 0;
                this.stats.minSOC = min && typeof min.val === 'number' ? min.val : 100;
                this.stats.lastStatsReset = today;
            }
            const isNewDay = !(lastReset && lastReset.val === today);
            if (isNewDay) {
                // New day - reset statistics (saved below, after last week/month values are loaded)
                this.stats.fullCycles = 0;
                this.stats.emptyCycles = 0;
                this.stats.maxSOC = 0;
                this.stats.minSOC = 100;
                this.stats.lastStatsReset = today;
            }

            // Load saved last week data from states
            const lastWeekProduction = await this.getStateAsync('statistics.lastWeekProduction');
            const lastWeekConsumption = await this.getStateAsync('statistics.lastWeekConsumption');
            const lastWeekFeedIn = await this.getStateAsync('statistics.lastWeekFeedIn');
            const lastWeekGridPower = await this.getStateAsync('statistics.lastWeekGridPower');
            const lastWeekFullCycles = await this.getStateAsync('statistics.lastWeekFullCycles');
            const lastWeekEmptyCycles = await this.getStateAsync('statistics.lastWeekEmptyCycles');

            this.stats.lastWeekProduction =
                lastWeekProduction && lastWeekProduction.val !== null ? lastWeekProduction.val : 0;
            this.stats.lastWeekConsumption =
                lastWeekConsumption && lastWeekConsumption.val !== null ? lastWeekConsumption.val : 0;
            this.stats.lastWeekFeedIn = lastWeekFeedIn && lastWeekFeedIn.val !== null ? lastWeekFeedIn.val : 0;
            this.stats.lastWeekGridPower =
                lastWeekGridPower && lastWeekGridPower.val !== null ? lastWeekGridPower.val : 0;
            this.stats.lastWeekFullCycles =
                lastWeekFullCycles && lastWeekFullCycles.val !== null ? lastWeekFullCycles.val : 0;
            this.stats.lastWeekEmptyCycles =
                lastWeekEmptyCycles && lastWeekEmptyCycles.val !== null ? lastWeekEmptyCycles.val : 0;

            // Load saved last month data from states
            const lastMonthProduction = await this.getStateAsync('statistics.lastMonthProduction');
            const lastMonthConsumption = await this.getStateAsync('statistics.lastMonthConsumption');
            const lastMonthFeedIn = await this.getStateAsync('statistics.lastMonthFeedIn');
            const lastMonthGridPower = await this.getStateAsync('statistics.lastMonthGridPower');
            const lastMonthFullCycles = await this.getStateAsync('statistics.lastMonthFullCycles');
            const lastMonthEmptyCycles = await this.getStateAsync('statistics.lastMonthEmptyCycles');

            this.stats.lastMonthProduction =
                lastMonthProduction && lastMonthProduction.val !== null ? lastMonthProduction.val : 0;
            this.stats.lastMonthConsumption =
                lastMonthConsumption && lastMonthConsumption.val !== null ? lastMonthConsumption.val : 0;
            this.stats.lastMonthFeedIn = lastMonthFeedIn && lastMonthFeedIn.val !== null ? lastMonthFeedIn.val : 0;
            this.stats.lastMonthGridPower =
                lastMonthGridPower && lastMonthGridPower.val !== null ? lastMonthGridPower.val : 0;
            this.stats.lastMonthFullCycles =
                lastMonthFullCycles && lastMonthFullCycles.val !== null ? lastMonthFullCycles.val : 0;
            this.stats.lastMonthEmptyCycles =
                lastMonthEmptyCycles && lastMonthEmptyCycles.val !== null ? lastMonthEmptyCycles.val : 0;

            if (isNewDay) {
                // Must run after loading last week/month values, otherwise they are overwritten with 0
                await this.saveStatistics();
            }

            this.log.debug('Statistics loaded from states');
        } catch (e) {
            this.log.error(`Error loading statistics: ${e.message}`);
        }
    }

    /**
     * Refresh current values from configured data points
     */
    async refreshCurrentValues() {
        try {
            this.log.debug('Refreshing current values...');

            // Read and process SOC (using getForeignStateAsync for external states)
            if (this.config.batterySOC) {
                this.log.debug(`Reading SOC from ${this.config.batterySOC}...`);
                const socState = await this.getForeignStateAsync(this.config.batterySOC);
                if (socState && socState.val !== null) {
                    this.log.debug(`SOC read: ${socState.val}%`);
                    await this.onBatterySOCChange(socState.val);
                } else {
                    this.log.warn('SOC state is null or undefined');
                    this.log.warn(`Please check: Does "${this.config.batterySOC}" exist in Objects?`);
                }
            }

            // Store other values directly in states
            const valueMap = [
                { config: this.config.powerProduction, state: 'statistics.currentPower' },
                { config: this.config.totalProduction, state: 'statistics.currentTotalProduction' },
                { config: this.config.feedIn, state: 'statistics.currentFeedIn' },
                { config: this.config.consumption, state: 'statistics.currentConsumption' },
                { config: this.config.currentConsumptionPower, state: 'statistics.currentConsumptionPower' },
                { config: this.config.gridPower, state: 'statistics.currentGridPower' },
            ];

            for (const item of valueMap) {
                if (item.config) {
                    const state = await this.getForeignStateAsync(item.config);
                    if (state && state.val !== null) {
                        await this.setStateAsync(item.state, state.val, true);
                    }
                }
            }
            this.log.debug('Current values updated');
        } catch (e) {
            this.log.error(`Error updating values: ${e.message}`);
        }
    }

    /**
     * Read a numeric foreign state; returns 0 for empty id, missing state or read error
     *
     * @param {string} id - Foreign state ID (may be empty)
     */
    async readForeignNumber(id) {
        if (!id) {
            return 0;
        }
        try {
            const state = await this.getForeignStateAsync(id);
            const val = state ? Number(state.val) : NaN;
            return state && state.val !== null && !isNaN(val) ? val : 0;
        } catch (e) {
            this.log.warn(`Could not read "${id}": ${e.message}`);
            return 0;
        }
    }

    /**
     * Save statistics to states
     */
    async saveStatistics() {
        try {
            await this.setStateAsync('statistics.fullCyclesToday', this.stats.fullCycles, true);
            await this.setStateAsync('statistics.emptyCyclesToday', this.stats.emptyCycles, true);
            await this.setStateAsync('statistics.maxSOCToday', this.stats.maxSOC, true);
            await this.setStateAsync('statistics.minSOCToday', this.stats.minSOC, true);
            await this.setStateAsync('statistics.fullCyclesWeek', this.stats.weekFullCycles, true);
            await this.setStateAsync('statistics.emptyCyclesWeek', this.stats.weekEmptyCycles, true);
            await this.setStateAsync('statistics.fullCyclesMonth', this.stats.monthFullCycles, true);
            await this.setStateAsync('statistics.emptyCyclesMonth', this.stats.monthEmptyCycles, true);
            await this.setStateAsync('statistics.lastStatsReset', this.stats.lastStatsReset, true);

            // Save last month/week data
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
            this.log.error(`Error saving statistics: ${e.message}`);
        }
    }

    /**
     * Is called if a subscribed state changes
     *
     * @param {string} id - State ID
     * @param {ioBroker.State | null | undefined} state - State object
     */
    async onStateChange(id, state) {
        // Errors in an async event handler would become unhandled rejections and stop the adapter
        try {
            await this.handleStateChange(id, state);
        } catch (e) {
            this.log.error(`Error processing state change of ${id}: ${e.message}`);
        }
    }

    /**
     * Process a state change (called by onStateChange)
     *
     * @param {string} id - State ID
     * @param {ioBroker.State | null | undefined} state - State object
     */
    async handleStateChange(id, state) {
        if (state) {
            // Process test button (all states in own namespace)
            if (id.startsWith(`${this.namespace}.testButton`)) {
                // Only when set to true and not already running
                if (state.val === true && !this.status.testMessageRunning) {
                    this.status.testMessageRunning = true; // Set flag
                    this.log.debug(`Test button state received: ${id}, val=${state.val}`);
                    this.log.debug('Test button was pressed');
                    try {
                        await this.sendTestMessage();
                    } finally {
                        // Reset state and flag even if sending failed
                        this.status.testMessageRunning = false;
                        await this.setStateAsync('testButton', false, true);
                    }
                }
                return;
            }

            // Process battery SOC change
            if (id === this.config.batterySOC) {
                await this.onBatterySOCChange(state.val);
                return;
            }

            // Update other data points (Production, Consumption, etc.) - only ack states
            if (state.ack) {
                if (id === this.config.totalProduction) {
                    await this.setStateAsync('statistics.currentTotalProduction', state.val, true);
                    this.log.debug(`Updated currentTotalProduction: ${state.val}`);
                }
                if (id === this.config.feedIn) {
                    await this.setStateAsync('statistics.currentFeedIn', state.val, true);
                    this.log.debug(`Updated currentFeedIn: ${state.val}`);
                }
                if (id === this.config.consumption) {
                    await this.setStateAsync('statistics.currentConsumption', state.val, true);
                    this.log.debug(`Updated currentConsumption: ${state.val}`);
                }
                if (id === this.config.currentConsumptionPower) {
                    await this.setStateAsync('statistics.currentConsumptionPower', state.val, true);
                    this.log.debug(`Updated currentConsumptionPower: ${state.val}`);
                }
                if (id === this.config.gridPower) {
                    await this.setStateAsync('statistics.currentGridPower', state.val, true);
                    this.log.debug(`Updated currentGridPower: ${state.val}`);
                }
                if (id === this.config.powerProduction) {
                    await this.setStateAsync('statistics.currentPower', state.val, true);
                    this.log.debug(`Updated currentPower: ${state.val}`);
                }
            }
        }
    }

    /**
     * Main function - called on SOC change
     *
     * @param {number} soc - Battery state of charge in percent
     */
    async onBatterySOCChange(soc) {
        // Check for undefined/null values
        if (soc === null || soc === undefined || soc === '' || isNaN(soc)) {
            this.log.warn(`Invalid SOC value received: ${soc}`);
            return;
        }
        // Some adapters deliver the SOC as string - strict comparisons below need a number
        soc = Number(soc);

        // Update current states
        await this.setStateAsync('statistics.currentSOC', soc, true);
        const currentKWh = this.round(((soc / 100) * this.config.batteryCapacityWh) / 1000, 1);
        await this.setStateAsync('statistics.currentEnergyKWh', currentKWh, true);

        // Update statistics (persist immediately, otherwise the states stay stale until the next full/empty event)
        if (soc > this.stats.maxSOC) {
            this.stats.maxSOC = soc;
            await this.setStateAsync('statistics.maxSOCToday', soc, true);
        }
        if (soc < this.stats.minSOC) {
            this.stats.minSOC = soc;
            await this.setStateAsync('statistics.minSOCToday', soc, true);
        }

        this.log.debug(`Battery SOC: ${soc}% | Status: full=${this.status.full}, empty=${this.status.empty}`);

        // Determine direction (rising/falling) for intermediate
        const direction =
            this.status.previousSOC !== null && soc > this.status.previousSOC
                ? 'up'
                : this.status.previousSOC !== null && soc < this.status.previousSOC
                  ? 'down'
                  : 'up';

        // Store previous SOC for next update
        const previousSOC = this.status.previousSOC;
        this.status.previousSOC = soc;

        // Thresholds are compared as "reached or crossed" - the SOC can jump (39 -> 41), be a decimal (40.3)
        // or stop just below 100, so an exact comparison would miss notifications
        const thresholdFull = Number(this.config.thresholdFull);
        const thresholdEmpty = Number(this.config.thresholdEmpty);

        // === NIGHT-TIME check with configurable time ===
        const nightTime = this.isNightTime();
        const nightModeActive = this.config.nightModeEnabled !== false;
        const ignoreEmptyAtNight = this.config.nightModeIgnoreEmpty !== false;

        // === RUHE-ZEIT - Neue Logik für Ruhemodus ===
        const quietTime = this.isQuietTime();
        const quietModeActive = this.config.quietModeEnabled !== false;

        // === Batterie VOLL (100%) - Nicht nachts (wenn Nachtmodus aktiv) und nicht in Ruhezeit ===
        if (soc >= thresholdFull) {
            // Prüfen ob Benachrichtigung erlaubt ist (nicht in Nachtzeit oder Ruhezeit)
            const allowNotification = (!nightTime || !nightModeActive) && (!quietTime || !quietModeActive);

            if (allowNotification && !this.status.full && this.canNotify('full')) {
                const message = await this.buildFullMessage(soc);
                this.sendTelegram(message, 'high');
                this.status.full = true;
                this.status.lastNotification.full = Date.now();
                this.stats.fullCycles++;
                this.stats.weekFullCycles++;
                this.stats.monthFullCycles++;
                this.saveStatistics();
                this.log.info('Battery full - Telegram sent');
            } else if (this.status.full && !this.canNotify('full')) {
                this.log.debug('Battery full, but interval not yet elapsed');
            } else if (!allowNotification) {
                if (nightTime && nightModeActive) {
                    this.log.debug('Battery full, but night time - no notification');
                }
                if (quietTime && quietModeActive) {
                    this.log.debug('Battery full, but quiet time - no notification');
                }
            }
        }

        // === Battery EMPTY (0%) - Always allow if nightModeIgnoreEmpty is active ===
        if (soc <= thresholdEmpty) {
            if (!this.status.empty && this.canNotify('empty')) {
                // Always notify at 0% if nightModeIgnoreEmpty is active
                // But still respect quiet time (unless nightModeIgnoreEmpty is active)
                const allowEmptyNotification = ignoreEmptyAtNight || !nightTime || !nightModeActive;
                const blockedByQuietTime = quietTime && quietModeActive;

                if (allowEmptyNotification && !blockedByQuietTime) {
                    const message = await this.buildEmptyMessage(soc);
                    this.sendTelegram(message, 'high');
                    this.status.empty = true;
                    this.status.lastNotification.empty = Date.now();
                    this.stats.emptyCycles++;
                    this.stats.weekEmptyCycles++;
                    this.stats.monthEmptyCycles++;
                    this.saveStatistics();
                    this.log.info('Battery empty - Telegram sent');
                } else if (blockedByQuietTime) {
                    this.log.debug('Battery empty, but quiet time active');
                } else if (nightTime && nightModeActive && !ignoreEmptyAtNight) {
                    this.log.debug('Battery empty, but night mode active and 0% is ignored');
                }
            } else if (this.status.empty && !this.canNotify('empty')) {
                this.log.debug('Battery empty, but interval not yet elapsed');
            }
        }
        // === Intermediate-Stufen (nur wenn nicht voll/leer und nicht nachts und nicht in Ruhezeit) ===
        if (soc < thresholdFull && soc > thresholdEmpty) {
            const intermediateSteps = (this.config.intermediateSteps || '20,40,60,80')
                .split(',')
                .map(s => parseInt(s.trim()))
                .filter(n => !isNaN(n));

            // Prüfe Intermediate-Stufen - nur außerhalb der Nachtzeit und Ruhezeit
            const allowIntermediate = (!nightTime || !nightModeActive) && (!quietTime || !quietModeActive);

            if (allowIntermediate) {
                // Reset Intermediate-Flags wenn Stufe verlassen (±2% Toleranz) - vor der Prüfung, damit eine
                // gerade überschrittene Stufe ihr Flag bis zum nächsten Wert behält (verhindert Flattern um die Stufe)
                for (const step of intermediateSteps) {
                    if (Math.abs(soc - step) >= 2) {
                        const idx = this.status.intermediateNotified.indexOf(step);
                        if (idx > -1) {
                            this.status.intermediateNotified.splice(idx, 1);
                            this.log.debug(`Intermediate ${step}% flag reset (SOC=${soc}%)`);
                        }
                    }
                }

                // Steps reached or crossed since the last value; the step closest to the current SOC comes first.
                // Without a previous value (adapter start) only an exact hit counts, to avoid messages on every restart.
                const crossed = intermediateSteps
                    .filter(step => this.isStepCrossed(previousSOC, soc, step))
                    .filter(step => !this.status.intermediateNotified.includes(step))
                    .sort((a, b) => Math.abs(soc - a) - Math.abs(soc - b));

                if (crossed.length > 0) {
                    if (this.canNotify('intermediate')) {
                        const message = await this.buildIntermediateMessage(soc, direction);
                        this.sendTelegram(message);
                        // A jump over several steps sends one message only
                        this.status.intermediateNotified.push(...crossed);
                        this.status.lastNotification.intermediate = Date.now();
                        this.log.info(`Intermediate ${crossed[0]}% (SOC ${soc}%) - Telegram sent`);
                    } else {
                        this.log.debug(`Intermediate ${crossed[0]}% reached, but interval not yet elapsed`);
                    }
                }
            } else {
                this.log.debug('Night/quiet time - intermediate notifications suppressed');
            }
        }

        // === Reset "full" flag if SOC < 95% ===
        if (soc < this.config.thresholdResetFull && this.status.full) {
            this.status.full = false;
            this.log.debug('Status "full" reset (SOC < 95%)');
        }

        // === Reset "empty" flag if SOC > 5% ===
        if (soc > this.config.thresholdResetEmpty && this.status.empty) {
            this.status.empty = false;
            this.log.debug('Status "empty" reset (SOC > 5%)');
        }
    }

    /**
     * Prüfe ob eine Stufe seit dem letzten Wert erreicht oder überschritten wurde (in beide Richtungen)
     *
     * @param {number | null} previousSOC - Previous SOC (null after adapter start)
     * @param {number} soc - Current SOC
     * @param {number} step - Intermediate step in percent
     */
    isStepCrossed(previousSOC, soc, step) {
        if (previousSOC === null || previousSOC === undefined) {
            return soc === step;
        }
        if (soc > previousSOC) {
            return previousSOC < step && step <= soc;
        }
        if (soc < previousSOC) {
            return previousSOC > step && step >= soc;
        }
        return false;
    }

    /**
     * Prüfe ob Mindestintervall eingehalten
     *
     * @param {string} type - Notification type (full, empty, intermediate)
     */
    canNotify(type) {
        const now = Date.now();
        const lastTime = this.status.lastNotification[type] || 0;
        const minIntervalMinutes = this.config[`minInterval${type.charAt(0).toUpperCase() + type.slice(1)}`] || 10;
        const minInterval = minIntervalMinutes * 60 * 1000;
        return now - lastTime >= minInterval;
    }

    /**
     * Prüfe ob aktuelle Zeit im Nacht-Fenster ist (konfigurierbar)
     */
    isNightTime() {
        if (!this.config.nightModeEnabled) {
            return false;
        }

        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();

        const [startHour, startMin] = (this.config.nightModeStart || '00:00').split(':').map(Number);
        const [endHour, endMin] = (this.config.nightModeEnd || '08:00').split(':').map(Number);

        const startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;

        // Handle overnight periods (e.g., 22:00-06:00)
        if (startTime > endTime) {
            return currentTime >= startTime || currentTime < endTime;
        }

        return currentTime >= startTime && currentTime < endTime;
    }

    /**
     * Prüfe ob aktuelle Zeit im Ruhemodus-Fenster ist (konfigurierbar)
     */
    isQuietTime() {
        if (!this.config.quietModeEnabled) {
            return false;
        }

        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();

        const [startHour, startMin] = (this.config.quietModeStart || '22:00').split(':').map(Number);
        const [endHour, endMin] = (this.config.quietModeEnd || '07:00').split(':').map(Number);

        const startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;

        // Handle overnight periods (e.g., 22:00-07:00)
        if (startTime > endTime) {
            return currentTime >= startTime || currentTime < endTime;
        }

        return currentTime >= startTime && currentTime < endTime;
    }

    /**
     * Nachricht für Telegram parse_mode HTML aufbereiten
     *
     * @param {string} message - Nachrichtentext mit *fett*-Markierungen
     * @returns {string} HTML-Text für Telegram
     */
    formatTelegramHtml(message) {
        // Escape HTML first, so values from foreign states (weather texts etc.) can never break the message,
        // then turn the *bold* markers of the message templates into <b> tags (per line, always balanced)
        return String(message)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
    }

    /**
     * Sende Telegram-Nachricht mit Zeitstempel
     *
     * @param {string} message - Nachrichtentext
     */
    sendTelegram(message) {
        const timestamp = this.getTimeString();
        const fullMessage = `${timestamp} - ${message}`;

        if (this.config.telegramInstance) {
            // Benutzer aus kommagetrennter Liste
            const users = this.config.telegramUsers || '';
            const usersList = users
                .split(',')
                .map(u => u.trim())
                .filter(u => u.length > 0);

            if (usersList.length > 0) {
                this.sendTo(
                    this.config.telegramInstance,
                    'send',
                    {
                        text: this.formatTelegramHtml(fullMessage),
                        // Without parse_mode Telegram shows the *bold* markers literally
                        parse_mode: 'HTML',
                        // The telegram adapter reads "user" (comma separated list) - without it the
                        // message is broadcast to every user known to the bot
                        user: usersList.join(','),
                    },
                    result => {
                        if (result && result.error) {
                            this.log.error(`Telegram error: ${result.error}`);
                        } else {
                            this.log.debug(fullMessage);
                            this.log.info(`Telegram sent successfully to: ${usersList.join(', ')}`);
                        }
                    },
                );
            } else {
                this.log.warn(`No Telegram users configured: ${fullMessage}`);
            }
        } else {
            this.log.warn(`Telegram instance not configured: ${fullMessage}`);
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
     * Baue die Verbrauchs-Zeile für Batterie-Status-Meldungen (voll/leer).
     *
     * Wenn ein Datenpunkt für den momentanen Verbrauch (W) konfiguriert ist,
     * wird dieser Live-Wert in W ausgegeben (Issue #74). Andernfalls kann kein
     * korrekter momentaner W-Wert gebildet werden, daher wird der Tages-Verbrauch
     * in kWh mit korrekter Einheit angezeigt (Fallback, rückwärtskompatibel).
     *
     * @param {number} consumptionKWh - Tages-Hausverbrauch in kWh (Fallback-Wert)
     * @returns {Promise<string>} Formatierte Zeile für die Nachricht
     */
    async buildConsumptionPowerLine(consumptionKWh) {
        if (this.config.currentConsumptionPower) {
            const consumptionPowerState = await this.getStateAsync('statistics.currentConsumptionPower');
            const consumptionPower =
                consumptionPowerState && consumptionPowerState.val !== null ? consumptionPowerState.val : 0;
            return `🏠 ${this.translate('Current consumption')}: ${this.round(consumptionPower)} W`;
        }
        // Fallback: kein momentaner W-Datenpunkt konfiguriert -> Tageswert in kWh anzeigen
        return `🏠 ${this.translate('Consumption today')}: ${this.round(consumptionKWh, 1)} kWh`;
    }

    /**
     * Baue detaillierte Status-Nachricht bei vollem Akku
     *
     * @param {number} soc - Battery state of charge in percent
     */
    async buildFullMessage(soc) {
        // Werte aus INTERNEN States lesen (aktualisiert in Echtzeit durch onStateChange)
        const powerState = await this.getStateAsync('statistics.currentPower');
        const totalProdState = await this.getStateAsync('statistics.currentTotalProduction');
        const feedInState = await this.getStateAsync('statistics.currentFeedIn');
        const consumptionState = await this.getStateAsync('statistics.currentConsumption');

        const power = powerState && powerState.val !== null ? powerState.val : 0;
        const totalProd = totalProdState && totalProdState.val !== null ? totalProdState.val : 0;
        const feedIn = feedInState && feedInState.val !== null ? feedInState.val : 0;
        const consumption = consumptionState && consumptionState.val !== null ? consumptionState.val : 0;

        // Momentanen Hausverbrauch in W ermitteln (Issue #74)
        const consumptionPowerLine = await this.buildConsumptionPowerLine(consumption);

        const separator = '\n━━━━━━━━━━━━━━━━━━━━━━';

        let message = `🔋 *${this.translate('Battery full')}* (${soc}%)${separator}
⚡ ${this.translate('Current production')}: ${this.round(power)} W
${consumptionPowerLine}
☀️ ${this.translate('Production today')}: ${this.round(totalProd)} kWh
🔌 ${this.translate('Feed-in today')}: ${this.round(Math.abs(feedIn), 0)} kWh${separator}`;

        // Wetter-Prognose hinzufügen (heute und morgen)
        const weatherConfigured =
            this.config.weatherTodayText ||
            this.config.weatherTodayTemp ||
            this.config.weatherTomorrowText ||
            this.config.weatherTomorrow;
        if (this.config.weatherEnabled !== false && weatherConfigured) {
            try {
                // Wetter heute
                if (this.config.weatherTodayText || this.config.weatherTodayTemp) {
                    const weatherTodayTextState = this.config.weatherTodayText
                        ? await this.getForeignStateAsync(this.config.weatherTodayText)
                        : null;
                    const weatherTodayTempState = this.config.weatherTodayTemp
                        ? await this.getForeignStateAsync(this.config.weatherTodayTemp)
                        : null;

                    const weatherTodayText =
                        weatherTodayTextState && weatherTodayTextState.val !== null ? weatherTodayTextState.val : null;
                    const weatherTodayTemp =
                        weatherTodayTempState && weatherTodayTempState.val !== null ? weatherTodayTempState.val : null;
                    const todayTempText = weatherTodayTemp !== null ? ` ${this.round(weatherTodayTemp, 1)}°C` : '';

                    if (weatherTodayText || weatherTodayTemp !== null) {
                        const weatherDesc = weatherTodayText ? this.getWeatherDescription(weatherTodayText) : '🌡️';
                        message += `\n🌤️ Heute: ${weatherDesc}${todayTempText}`;
                    }
                }

                // Wetter morgen
                if (this.config.weatherTomorrowText || this.config.weatherTomorrow) {
                    const weatherTomorrowTextState = this.config.weatherTomorrowText
                        ? await this.getForeignStateAsync(this.config.weatherTomorrowText)
                        : null;
                    const weatherTomorrowState = this.config.weatherTomorrow
                        ? await this.getForeignStateAsync(this.config.weatherTomorrow)
                        : null;
                    const tempTomorrowState = this.config.weatherTomorrowTemp
                        ? await this.getForeignStateAsync(this.config.weatherTomorrowTemp)
                        : null;

                    const weatherTomorrowText =
                        weatherTomorrowTextState && weatherTomorrowTextState.val !== null
                            ? weatherTomorrowTextState.val
                            : null;
                    const weatherTomorrow =
                        weatherTomorrowState && weatherTomorrowState.val !== null ? weatherTomorrowState.val : null;
                    const tempTomorrow =
                        tempTomorrowState && tempTomorrowState.val !== null ? tempTomorrowState.val : null;
                    const tempText = tempTomorrow !== null ? ` ${this.round(tempTomorrow, 1)}°C` : '';

                    const weatherText = weatherTomorrowText || weatherTomorrow;
                    if (weatherText) {
                        const weatherDesc = this.getWeatherDescription(weatherText);
                        message += `\n🌤️ Morgen: ${weatherDesc}${tempText}`;

                        if (this.isWeatherBad(weatherText)) {
                            message += `\n💡 ${this.translate('Tip tomorrow little sun use consumers today')}`;
                        }
                    }
                }
            } catch (e) {
                this.log.debug(`Weather data not available: ${e.message}`);
            }
        }

        // Empfehlungen bei hoher Produktion
        if (power > this.config.highProduction) {
            message += `${separator}\n🚗 ${this.translate('Now ideal for electric car washing machine dishwasher')}`;
        }

        return message;
    }

    /**
     * Baue Nachricht bei leerem Akku
     *
     * @param {number} soc - Battery state of charge in percent
     */
    async buildEmptyMessage(soc) {
        // Werte aus INTERNEN States lesen (aktualisiert in Echtzeit durch onStateChange)
        const gridPowerState = await this.getStateAsync('statistics.currentGridPower');
        const consumptionState = await this.getStateAsync('statistics.currentConsumption');

        const gridPower = gridPowerState && gridPowerState.val !== null ? gridPowerState.val : 0;
        const consumption = consumptionState && consumptionState.val !== null ? consumptionState.val : 0;

        const separator = '\n━━━━━━━━━━━━━━━━━━━━━━';

        // Momentanen Hausverbrauch in W ermitteln (Issue #74)
        const consumptionPowerLine = await this.buildConsumptionPowerLine(consumption);

        let message = `🔋 *${this.translate('Battery empty')}* (${soc}%)${separator}

⚠️ ${this.translate('Grid consumption today')}: ${this.round(gridPower)} kWh
${consumptionPowerLine}${separator}`;

        // Wetter-Prognose hinzufügen (heute und morgen)
        const weatherConfigured =
            this.config.weatherTodayText ||
            this.config.weatherTodayTemp ||
            this.config.weatherTomorrowText ||
            this.config.weatherTomorrow;
        if (this.config.weatherEnabled !== false && weatherConfigured) {
            try {
                // Wetter heute
                if (this.config.weatherTodayText || this.config.weatherTodayTemp) {
                    const weatherTodayTextState = this.config.weatherTodayText
                        ? await this.getForeignStateAsync(this.config.weatherTodayText)
                        : null;
                    const weatherTodayTempState = this.config.weatherTodayTemp
                        ? await this.getForeignStateAsync(this.config.weatherTodayTemp)
                        : null;

                    const weatherTodayText =
                        weatherTodayTextState && weatherTodayTextState.val !== null ? weatherTodayTextState.val : null;
                    const weatherTodayTemp =
                        weatherTodayTempState && weatherTodayTempState.val !== null ? weatherTodayTempState.val : null;
                    const todayTempText = weatherTodayTemp !== null ? ` ${this.round(weatherTodayTemp, 1)}°C` : '';

                    if (weatherTodayText || weatherTodayTemp !== null) {
                        const weatherDesc = weatherTodayText ? this.getWeatherDescription(weatherTodayText) : '🌡️';
                        message += `\n🌤️ Heute: ${weatherDesc}${todayTempText}`;
                    }
                }

                // Wetter morgen
                if (this.config.weatherTomorrowText || this.config.weatherTomorrow) {
                    const weatherTomorrowTextState = this.config.weatherTomorrowText
                        ? await this.getForeignStateAsync(this.config.weatherTomorrowText)
                        : null;
                    const weatherTomorrowState = this.config.weatherTomorrow
                        ? await this.getForeignStateAsync(this.config.weatherTomorrow)
                        : null;
                    const tempTomorrowState = this.config.weatherTomorrowTemp
                        ? await this.getForeignStateAsync(this.config.weatherTomorrowTemp)
                        : null;

                    const weatherTomorrowText =
                        weatherTomorrowTextState && weatherTomorrowTextState.val !== null
                            ? weatherTomorrowTextState.val
                            : null;
                    const weatherTomorrow =
                        weatherTomorrowState && weatherTomorrowState.val !== null ? weatherTomorrowState.val : null;
                    const tempTomorrow =
                        tempTomorrowState && tempTomorrowState.val !== null ? tempTomorrowState.val : null;
                    const tempText = tempTomorrow !== null ? ` ${this.round(tempTomorrow, 1)}°C` : '';

                    const weatherText = weatherTomorrowText || weatherTomorrow;
                    if (weatherText) {
                        const weatherDesc = this.getWeatherDescription(weatherText);
                        message += `\n🌤️ Morgen: ${weatherDesc}${tempText}`;

                        if (this.isWeatherGood(weatherText)) {
                            message += `\n💡 ${this.translate('Good news tomorrow more sun')}`;
                        }
                    }
                }
            } catch (e) {
                this.log.debug(`Weather data not available: ${e.message}`);
            }
        }

        // Spartipps
        if (consumption > this.config.highConsumption) {
            message += `${separator}\n💰 ${this.translate('High consumption Turn off unnecessary devices')}`;
        }

        return message;
    }

    /**
     * Baue Intermediate-Nachricht (20%, 40%, 60%, 80%)
     *
     * @param {number} soc - Battery state of charge in percent
     * @param {string} direction - Charging direction ('up' or 'down')
     */
    async buildIntermediateMessage(soc, direction) {
        // Leistung aus State lesen (aktualisiert in Echtzeit)
        const powerState = await this.getStateAsync('statistics.currentPower');
        const power = powerState && powerState.val !== null ? powerState.val : 0;

        // Gesamtproduktion heute lesen
        const totalProdState = await this.getStateAsync('statistics.currentTotalProduction');
        const totalProd = totalProdState && totalProdState.val !== null ? this.round(totalProdState.val, 1) : 0;

        // Eigenverbrauch berechnen
        const feedInState = await this.getStateAsync('statistics.currentFeedIn');
        const feedIn = feedInState && feedInState.val !== null ? Math.abs(feedInState.val) : 0;
        const selfConsumption = this.round(Math.max(0, totalProd - feedIn), 1);
        const selfConsumptionRate = totalProd > 0 ? this.round((selfConsumption / totalProd) * 100, 1) : 0;

        const trend = direction === 'up' ? '⬆️' : '⬇️';
        const currentKWh = this.round(((soc / 100) * this.config.batteryCapacityWh) / 1000, 1);

        // Einheitlicher Status-Text für alle Intermediate-Stufen
        const statusText =
            direction === 'up' ? this.translate('Battery charging') : this.translate('Battery discharging');

        // Einheitliche Nachricht für alle Stufen (20, 40, 60, 80)
        const batteryAt = this.translate('Battery at');
        const production = this.translate('Production');
        const productionToday = this.translate('Production today');
        const ownConsumption = this.translate('Own consumption');

        let message = `🔋 ${batteryAt} ${soc}% (${currentKWh} kWh) ${trend}
${statusText}
━━━━━━━━━━━━━━━━━━━━━━
⚡️ ${production}: ${this.round(power)} W
✅ ${productionToday}: ${totalProd} kWh
🏠 ${ownConsumption}: ${selfConsumption} kWh (${selfConsumptionRate}%)
━━━━━━━━━━━━━━━━━━━━━━`;

        // Wetter-Prognose für morgen hinzufügen (optional, nur wenn weatherInIntermediate aktiv)
        const weatherConfigured =
            this.config.weatherTomorrowText ||
            this.config.weatherTomorrow ||
            this.config.weatherTodayText ||
            this.config.weatherTodayTemp;
        this.log.debug(
            `Weather config: enabled=${this.config.weatherEnabled}, inIntermediate=${this.config.weatherInIntermediate}, configured=${weatherConfigured}`,
        );
        this.log.debug(
            `Weather data points: todayText="${this.config.weatherTodayText}", todayTemp="${this.config.weatherTodayTemp}", tomorrowText="${this.config.weatherTomorrowText}", tomorrow="${this.config.weatherTomorrow}", tomorrowTemp="${this.config.weatherTomorrowTemp}"`,
        );

        if (this.config.weatherEnabled !== false && this.config.weatherInIntermediate !== false && weatherConfigured) {
            try {
                this.log.debug('Attempting to read weather data...');

                // Wetter heute lesen
                if (this.config.weatherTodayText || this.config.weatherTodayTemp) {
                    const weatherTodayTextState = this.config.weatherTodayText
                        ? await this.getForeignStateAsync(this.config.weatherTodayText)
                        : null;
                    const weatherTodayTempState = this.config.weatherTodayTemp
                        ? await this.getForeignStateAsync(this.config.weatherTodayTemp)
                        : null;

                    const weatherTodayText =
                        weatherTodayTextState && weatherTodayTextState.val !== null ? weatherTodayTextState.val : null;
                    const weatherTodayTemp =
                        weatherTodayTempState && weatherTodayTempState.val !== null ? weatherTodayTempState.val : null;
                    const todayTempText = weatherTodayTemp !== null ? ` ${this.round(weatherTodayTemp, 1)}°C` : '';

                    if (weatherTodayText || weatherTodayTemp !== null) {
                        const weatherDesc = weatherTodayText ? this.getWeatherDescription(weatherTodayText) : '🌡️';
                        message += `\n🌤️ ${this.translate('Weather today')}: ${weatherDesc}${todayTempText}`;
                        this.log.debug(`Weather today added to intermediate message: ${weatherDesc}${todayTempText}`);
                    }
                }

                // Wetter morgen lesen
                if (this.config.weatherTomorrowText || this.config.weatherTomorrow) {
                    const weatherTomorrowTextState = this.config.weatherTomorrowText
                        ? await this.getForeignStateAsync(this.config.weatherTomorrowText)
                        : null;
                    const weatherTomorrowState = this.config.weatherTomorrow
                        ? await this.getForeignStateAsync(this.config.weatherTomorrow)
                        : null;
                    const tempTomorrowState = this.config.weatherTomorrowTemp
                        ? await this.getForeignStateAsync(this.config.weatherTomorrowTemp)
                        : null;

                    const weatherTomorrowText =
                        weatherTomorrowTextState && weatherTomorrowTextState.val !== null
                            ? weatherTomorrowTextState.val
                            : null;
                    const weatherTomorrow =
                        weatherTomorrowState && weatherTomorrowState.val !== null ? weatherTomorrowState.val : null;
                    const tempTomorrow =
                        tempTomorrowState && tempTomorrowState.val !== null ? tempTomorrowState.val : null;
                    const tempText = tempTomorrow !== null ? ` ${this.round(tempTomorrow, 1)}°C` : '';

                    const weatherText = weatherTomorrowText || weatherTomorrow;
                    if (weatherText) {
                        const weatherDesc = this.getWeatherDescription(weatherText);
                        message += `\n🌤️ ${this.translate('Weather tomorrow')}: ${weatherDesc}${tempText}`;
                        this.log.debug(`Weather tomorrow added to intermediate message: ${weatherDesc}${tempText}`);
                    }
                }
            } catch (e) {
                this.log.error(`Weather data error: ${e.message}`);
                this.log.error(
                    `Config: weatherTodayText="${this.config.weatherTodayText}", weatherTomorrowText="${this.config.weatherTomorrowText}"`,
                );
            }
        } else {
            if (this.config.weatherEnabled === false) {
                this.log.debug('Weather disabled (weatherEnabled=false)');
            }
            if (this.config.weatherInIntermediate === false) {
                this.log.debug('Weather disabled for intermediate (weatherInIntermediate=false)');
            }
            if (!weatherConfigured) {
                this.log.debug(
                    'Weather not configured (no weatherTodayText, weatherTodayTemp, weatherTomorrowText or weatherTomorrow)',
                );
            }
        }

        message += '\n━━━━━━━━━━━━━━━━━━━━━━';

        return message;
    }

    /**
     * Baue tägliche Statistik-Nachricht
     */
    async buildDailyStatsMessage() {
        // Werte aus States lesen
        const socState = await this.getStateAsync('statistics.currentSOC');
        const soc = socState && socState.val !== null ? socState.val : 0;

        const batteryCapacityKWh = this.round(this.config.batteryCapacityWh / 1000, 1);
        const currentKWh = this.round(((soc / 100) * this.config.batteryCapacityWh) / 1000, 1);

        // Weitere Werte aus States lesen
        const totalProdState = await this.getStateAsync('statistics.currentTotalProduction');
        const totalProd = totalProdState && totalProdState.val !== null ? this.round(totalProdState.val, 1) : 0;

        const feedInState = await this.getStateAsync('statistics.currentFeedIn');
        const feedIn = feedInState && feedInState.val !== null ? this.round(Math.abs(feedInState.val), 0) : 0;

        const gridPowerState = await this.getStateAsync('statistics.currentGridPower');
        const gridPower = gridPowerState && gridPowerState.val !== null ? this.round(gridPowerState.val, 0) : 0;

        // Aktuelle Leistung (W) lesen
        const powerState = await this.getStateAsync('statistics.currentPower');
        const power = powerState && powerState.val !== null ? this.round(powerState.val, 0) : 0;

        // Eigenverbrauch berechnen (kann nicht negativ sein)
        const selfConsumption = this.round(Math.max(0, totalProd - feedIn), 1);
        const selfConsumptionRate = totalProd > 0 ? this.round((selfConsumption / totalProd) * 100, 1) : 0;

        let message = `📊 *${this.translate('Daily statistics PV system')}*
━━━━━━━━━━━━━━━━━━━━━━
🔋 ${this.translate('Current charge level')}: ${soc}%
⚡ ${this.translate('Current energy')}: ${currentKWh} kWh (${batteryCapacityKWh} kWh ${this.translate('Total capacity')})
━━━━━━━━━━━━━━━━━━━━━━
☀️ ${this.translate('Production')}: ${totalProd} kWh
⚡️ ${this.translate('Current production')}: ${power} W
🏠 ${this.translate('Own consumption')}: ${selfConsumption} kWh (${selfConsumptionRate}%)
🔌 ${this.translate('Feed-in')}: ${feedIn} kWh
⚡ ${this.translate('Grid consumption')}: ${gridPower} kWh`;

        // Wetter-Prognose für heute und morgen hinzufügen (optional, nur wenn weatherInDailyStats aktiv)
        const weatherTodayConfigured = this.config.weatherTodayText || this.config.weatherTodayTemp;
        const weatherTomorrowConfigured = this.config.weatherTomorrowText || this.config.weatherTomorrow;

        if (
            this.config.weatherEnabled !== false &&
            this.config.weatherInDailyStats !== false &&
            (weatherTodayConfigured || weatherTomorrowConfigured)
        ) {
            try {
                let weatherAdded = false;

                // Wetter heute lesen
                if (weatherTodayConfigured) {
                    const weatherTodayTextState = this.config.weatherTodayText
                        ? await this.getForeignStateAsync(this.config.weatherTodayText)
                        : null;
                    const weatherTodayTempState = this.config.weatherTodayTemp
                        ? await this.getForeignStateAsync(this.config.weatherTodayTemp)
                        : null;

                    const weatherTodayText =
                        weatherTodayTextState && weatherTodayTextState.val !== null ? weatherTodayTextState.val : null;
                    const weatherTodayTemp =
                        weatherTodayTempState && weatherTodayTempState.val !== null ? weatherTodayTempState.val : null;

                    if (weatherTodayText || weatherTodayTemp !== null) {
                        const weatherDesc = weatherTodayText ? this.getWeatherDescription(weatherTodayText) : '🌡️';
                        const todayTempSuffix =
                            weatherTodayTemp !== null
                                ? ` (${this.translate('Currently')}: ${this.round(weatherTodayTemp, 1)}°C)`
                                : '';
                        message += `\n━━━━━━━━━━━━━━━━━━━━━━\n🌤️ *${this.translate('Weather today')}:* ${weatherDesc}${todayTempSuffix}`;
                        weatherAdded = true;
                    }
                }

                // Wetter morgen lesen
                if (weatherTomorrowConfigured) {
                    const weatherTomorrowTextState = this.config.weatherTomorrowText
                        ? await this.getForeignStateAsync(this.config.weatherTomorrowText)
                        : null;
                    const weatherTomorrowState = this.config.weatherTomorrow
                        ? await this.getForeignStateAsync(this.config.weatherTomorrow)
                        : null;
                    const tempTomorrowState = this.config.weatherTomorrowTemp
                        ? await this.getForeignStateAsync(this.config.weatherTomorrowTemp)
                        : null;

                    const weatherTomorrowText =
                        weatherTomorrowTextState && weatherTomorrowTextState.val !== null
                            ? weatherTomorrowTextState.val
                            : null;
                    const weatherTomorrow =
                        weatherTomorrowState && weatherTomorrowState.val !== null ? weatherTomorrowState.val : null;
                    const tempTomorrow =
                        tempTomorrowState && tempTomorrowState.val !== null ? tempTomorrowState.val : null;
                    const tempText = tempTomorrow !== null ? ` ${this.round(tempTomorrow, 1)}°C` : '';

                    const weatherText = weatherTomorrowText || weatherTomorrow;
                    if (weatherText) {
                        const weatherDesc = this.getWeatherDescription(weatherText);
                        message += `\n🌤️ *${this.translate('Weather tomorrow')}:* ${weatherDesc}${tempText}`;
                        weatherAdded = true;

                        // Zusätzliche Info bei gutem/schlechtem Wetter
                        if (this.isWeatherGood(weatherText)) {
                            message += `\n☀️ ${this.translate('Good PV production expected')}`;
                        } else if (this.isWeatherBad(weatherText)) {
                            message += `\n⛅ ${this.translate('Less PV production expected')}`;
                        }
                    }
                }

                if (weatherAdded) {
                    message += `\n`;
                }
            } catch (e) {
                this.log.warn(`Weather data error in daily stats: ${e.message}`);
                this.log.warn(`Please check weather configuration in adapter settings`);
            }
        } else {
            if (this.config.weatherEnabled === false) {
                this.log.debug('Weather disabled (weatherEnabled=false)');
            }
            if (this.config.weatherInDailyStats === false) {
                this.log.debug('Weather in daily stats disabled (weatherInDailyStats=false)');
            }
            if (!weatherTodayConfigured && !weatherTomorrowConfigured) {
                this.log.debug('No weather data points configured for daily stats');
            }
        }

        return message;
    }

    /**
     * Baue wöchentliche Statistik-Nachricht
     */
    buildWeeklyStatsMessage() {
        const totalProd = this.round(this.stats.lastWeekProduction, 1);
        // const consumption = this.round(this.stats.lastWeekConsumption, 1);  // ESLint: unused
        const feedIn = this.round(Math.abs(this.stats.lastWeekFeedIn), 1);
        const gridPower = this.round(this.stats.lastWeekGridPower, 1);
        const selfConsumption = this.round(Math.max(0, totalProd - feedIn), 1);
        const selfConsumptionRate = totalProd > 0 ? this.round((selfConsumption / totalProd) * 100, 1) : 0;

        return `📊 *${this.translate('Weekly statistics PV system')}*
━━━━━━━━━━━━━━━━━━━━━━
🔋 ${this.translate('Full cycles last week')}: ${this.stats.lastWeekFullCycles}
📉 ${this.translate('Empty cycles last week')}: ${this.stats.lastWeekEmptyCycles}
━━━━━━━━━━━━━━━━━━━━━━
☀️ ${this.translate('Production')}: ${totalProd} kWh
🏠 ${this.translate('Own consumption')}: ${selfConsumption} kWh (${selfConsumptionRate}%)
🔌 ${this.translate('Feed-in')}: ${feedIn} kWh
⚡ ${this.translate('Grid consumption')}: ${gridPower} kWh
━━━━━━━━━━━━━━━━━━━━━━
💡 ${this.translate('A healthy cycle per day is normal')}
🔋 ${this.translate('If there are many cycles check battery settings')}`;
    }

    /**
     * Baue monatliche Statistik-Nachricht
     */
    buildMonthlyStatsMessage() {
        const totalProd = this.round(this.stats.lastMonthProduction, 1);
        // const consumption = this.round(this.stats.lastMonthConsumption, 1);  // ESLint: unused
        const feedIn = this.round(Math.abs(this.stats.lastMonthFeedIn), 1);
        const gridPower = this.round(this.stats.lastMonthGridPower, 1);
        const selfConsumption = this.round(Math.max(0, totalProd - feedIn), 1);
        const selfConsumptionRate = totalProd > 0 ? this.round((selfConsumption / totalProd) * 100, 1) : 0;

        return `📊 *${this.translate('Monthly statistics PV system')}*
━━━━━━━━━━━━━━━━━━━━━━
🔋 ${this.translate('Full cycles last month')}: ${this.stats.lastMonthFullCycles}
📉 ${this.translate('Empty cycles last month')}: ${this.stats.lastMonthEmptyCycles}
━━━━━━━━━━━━━━━━━━━━━━
☀️ ${this.translate('Production')}: ${totalProd} kWh
🏠 ${this.translate('Own consumption')}: ${selfConsumption} kWh (${selfConsumptionRate}%)
🔌 ${this.translate('Feed-in')}: ${feedIn} kWh
⚡ ${this.translate('Grid consumption')}: ${gridPower} kWh
━━━━━━━━━━━━━━━━━━━━━━`;
    }

    /**
     * Hole Wetter-Description aus Text
     *
     * @param {string} weatherText - Weather text from state
     */
    getWeatherDescription(weatherText) {
        if (!weatherText) {
            return '🌡️ unbekannt';
        }

        const text = String(weatherText).toLowerCase();

        if (text.includes('sonnig') || text.includes('klar')) {
            return '☀️ sonnig';
        }
        if (text.includes('wolkig') || text.includes('bewölkt')) {
            return '⛅ bewölkt';
        }
        if (text.includes('bedeckt')) {
            return '☁️ bedeckt';
        }
        if (text.includes('regen') || text.includes('rain')) {
            return '🌧️ Regen';
        }
        if (text.includes('schnee') || text.includes('snow')) {
            return '❄️ Schnee';
        }
        if (text.includes('gewitter') || text.includes('thunder')) {
            return '⛈️ Gewitter';
        }
        if (text.includes('nebel') || text.includes('fog')) {
            return '🌫️ Nebel';
        }

        if (text.includes('clear')) {
            return '☀️ sonnig';
        }
        if (text.includes('cloud')) {
            return '⛅ bewölkt';
        }

        return `🌡️ ${weatherText}`;
    }

    /**
     * Prüfe ob Wetter gut ist
     *
     * @param {string} weatherText - Weather text from state
     */
    isWeatherGood(weatherText) {
        if (!weatherText) {
            return false;
        }
        const text = String(weatherText).toLowerCase();
        return (
            text.includes('sonnig') || text.includes('klar') || text.includes('clear') || text.includes('few clouds')
        );
    }

    /**
     * Prüfe ob Wetter schlecht ist
     *
     * @param {string} weatherText - Weather text from state
     */
    isWeatherBad(weatherText) {
        if (!weatherText) {
            return false;
        }
        const text = String(weatherText).toLowerCase();
        return (
            text.includes('regen') ||
            text.includes('rain') ||
            text.includes('schnee') ||
            text.includes('snow') ||
            text.includes('gewitter') ||
            text.includes('thunder') ||
            text.includes('bedeckt') ||
            text.includes('overcast')
        );
    }

    /**
     * Runde Zahl auf Dezimalstellen
     *
     * @param {number} value - Wert zum Runden
     * @param {number} decimals - Anzahl Dezimalstellen
     */
    round(value, decimals = 2) {
        if (value === null || value === undefined || isNaN(value)) {
            return 0;
        }
        return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
    }

    /**
     * Parse a time string "HH:MM"
     *
     * @param {string} value - Time string
     * @returns {{ hours: number, minutes: number } | null} Parsed time or null if invalid
     */
    parseTime(value) {
        const match = String(value || '')
            .trim()
            .match(/^(\d{1,2}):(\d{2})/);
        if (!match) {
            return null;
        }
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        return hours < 24 && minutes < 60 ? { hours, minutes } : null;
    }

    /**
     * Parse the value of the sunset object ("HH:MM", ISO date string or timestamp) into local hours/minutes
     *
     * @param {ioBroker.StateValue | undefined} value - State value
     * @returns {{ hours: number, minutes: number } | null} Parsed time or null if invalid
     */
    parseSunsetTime(value) {
        if (value === null || value === undefined || value === '') {
            return null;
        }
        const time = typeof value === 'string' ? this.parseTime(value) : null;
        if (time) {
            return time;
        }
        const date = new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value);
        return isNaN(date.getTime()) ? null : { hours: date.getHours(), minutes: date.getMinutes() };
    }

    /**
     * Check whether the given time equals the configured time string
     *
     * @param {Date} now - Current time
     * @param {string} configTime - Configured time "HH:MM"
     */
    isTime(now, configTime) {
        const time = this.parseTime(configTime);
        return !!time && now.getHours() === time.hours && now.getMinutes() === time.minutes;
    }

    /**
     * Start scheduled tasks
     */
    startScheduledTasks() {
        // Check every minute
        this.scheduledInterval = this.setInterval(() => {
            this.runScheduledTasks(new Date()).catch(e => this.log.error(`Scheduled task failed: ${e.message}`));
        }, 60000); // Jede Minute ausführen

        this.log.info(
            `Scheduled tasks started (Daily: ${this.config.statsDayTime}, Weekly: day ${this.config.statsWeekDay} at ${this.config.statsWeekTime})`,
        );
    }

    /**
     * Run the scheduled tasks for the given minute
     *
     * @param {Date} now - Current time
     */
    async runScheduledTasks(now) {
        const jsDay = now.getDay(); // JavaScript: 0=So, 1=Mo, ..., 6=Sa
        // Umwandeln in ioBroker-Format: 0=Mo, 1=Di, ..., 6=So
        const day = jsDay === 0 ? 6 : jsDay - 1;
        const date = now.getDate();

        // Statistik-Resets bei jedem Durchlauf prüfen (jeweils nur einmal pro Tag/Woche/Monat)
        this.resetDailyStats(now);
        await this.resetWeeklyStats(now);
        await this.resetMonthlyStats(now);

        // Tägliche Statistik — entweder zur konfigurierten Zeit oder zum Sonnenuntergang
        if (this.config.statsUseSunset && this.config.statsSunsetObject) {
            // Sonnenuntergangszeit aus dem konfigurierten Objekt lesen
            try {
                const sunsetState = await this.getForeignStateAsync(this.config.statsSunsetObject);
                const sunset = this.parseSunsetTime(sunsetState ? sunsetState.val : null);
                if (sunset && now.getHours() === sunset.hours && now.getMinutes() === sunset.minutes) {
                    await this.sendDailyStatsMessage();
                }
            } catch (e) {
                this.log.warn(`Could not read sunset object: ${e.message}`);
            }
        } else if (this.isTime(now, this.config.statsDayTime)) {
            await this.sendDailyStatsMessage();
        }

        // Wöchentliche Statistik am konfigurierten Tag und Zeit
        if (day === Number(this.config.statsWeekDay) && this.isTime(now, this.config.statsWeekTime)) {
            this.sendTelegram(this.buildWeeklyStatsMessage());
        }

        // Monatsstatistik am konfigurierten Tag und Zeit
        if (
            this.config.monthlyStatsEnabled &&
            date === Number(this.config.monthlyStatsDay) &&
            this.isTime(now, this.config.monthlyStatsTime)
        ) {
            this.sendTelegram(this.buildMonthlyStatsMessage());
        }
    }

    /**
     * Tägliche Statistik zurücksetzen (bei Tageswechsel, passend zu loadStatistics())
     *
     * @param {Date} [now] - Current time
     */
    resetDailyStats(now = new Date()) {
        const today = now.getDate();

        if (today !== this.stats.lastStatsReset) {
            this.log.info('Resetting daily statistics');
            this.stats.fullCycles = 0;
            this.stats.emptyCycles = 0;
            this.stats.maxSOC = 0;
            this.stats.minSOC = 100;
            this.stats.lastStatsReset = today;
            this.saveStatistics();
        }
    }

    /**
     * Check whether the "before midnight" save window (23:55-23:59) is active
     *
     * @param {Date} now - Current time
     */
    isSaveWindow(now) {
        return now.getHours() === 23 && now.getMinutes() >= 55;
    }

    /**
     * Reset weekly statistics - AUTOMATISCH am Sonntag ab 23:55 (vor sourceanalytix Reset)
     *
     * @param {Date} [now] - Current time
     */
    async resetWeeklyStats(now = new Date()) {
        const jsDay = now.getDay(); // JavaScript: 0=So, 1=Mo, ..., 6=Sa
        const dateKey = now.toDateString();

        // Automatische Speicherung: Jeden Sonntag 23:55-23:59 (vor Mitternacht), einmal pro Woche.
        // Ein Fenster statt einer exakten Minute, damit ein verzögerter Timer-Tick den Abschluss nicht verpasst.
        if (jsDay === 0 && this.isSaveWindow(now) && this.status.lastWeekSave !== dateKey) {
            this.status.lastWeekSave = dateKey;
            this.log.info('Auto-saving weekly statistics (Sunday 23:55, before sourceanalytix reset)');

            // Aktuelle Daten aus externen States lesen (direkter Zugriff)
            // WICHTIG: weeklyProduction/weeklyConsumption/etc. verwenden (sourceanalytix Wochenwerte)
            // NICHT totalProduction/consumption/etc. (das sind Tageswerte!)
            this.stats.lastWeekProduction = await this.readForeignNumber(this.config.weeklyProduction);
            this.stats.lastWeekConsumption = await this.readForeignNumber(this.config.weeklyConsumption);
            this.stats.lastWeekFeedIn = await this.readForeignNumber(this.config.weeklyFeedIn);
            this.stats.lastWeekGridPower = await this.readForeignNumber(this.config.weeklyGridPower);
            this.stats.lastWeekFullCycles = this.stats.weekFullCycles;
            this.stats.lastWeekEmptyCycles = this.stats.weekEmptyCycles;

            // Wöchentliche Statistik zurücksetzen
            this.stats.weekFullCycles = 0;
            this.stats.weekEmptyCycles = 0;

            await this.saveStatistics();
            this.log.info(
                `Weekly stats saved: Production=${this.stats.lastWeekProduction} kWh, FeedIn=${this.stats.lastWeekFeedIn} kWh`,
            );
            // KEIN Senden hier - Senden erfolgt nur in runScheduledTasks() zur konfigurierten Zeit
        }
    }

    /**
     * Monatsstatistik zurücksetzen - AUTOMATISCH am letzten Tag des Monats ab 23:55 (vor sourceanalytix Reset).
     * Die Monatszyklen werden auch bei deaktivierter Monatsstatistik zurückgesetzt.
     *
     * @param {Date} [now] - Current time
     */
    async resetMonthlyStats(now = new Date()) {
        const today = now.getDate();
        const dateKey = now.toDateString();

        // Letzten Tag des aktuellen Monats berechnen
        // new Date(Jahr, Monat+1, 0) gibt den letzten Tag des aktuellen Monats zurück
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

        // Automatische Speicherung: Letzter Tag des Monats 23:55-23:59 (vor Mitternacht), einmal pro Monat
        if (today === lastDayOfMonth && this.isSaveWindow(now) && this.status.lastMonthSave !== dateKey) {
            this.status.lastMonthSave = dateKey;
            this.log.info(
                `Auto-saving monthly statistics (last day of month ${today}. ${now.getMonth() + 1}.${now.getFullYear()} 23:55, before sourceanalytix reset)`,
            );

            // Aktuelle Daten aus externen States lesen (direkter Zugriff)
            if (this.config.monthlyStatsEnabled) {
                this.stats.lastMonthProduction = await this.readForeignNumber(this.config.monthlyProduction);
                this.stats.lastMonthConsumption = await this.readForeignNumber(this.config.monthlyConsumption);
                this.stats.lastMonthFeedIn = await this.readForeignNumber(this.config.monthlyFeedIn);
                this.stats.lastMonthGridPower = await this.readForeignNumber(this.config.monthlyGridPower);
            }
            this.stats.lastMonthFullCycles = this.stats.monthFullCycles;
            this.stats.lastMonthEmptyCycles = this.stats.monthEmptyCycles;
            this.stats.monthFullCycles = 0;
            this.stats.monthEmptyCycles = 0;

            this.stats.lastMonthReset = today;
            await this.saveStatistics();
            this.log.info(
                `Monthly stats saved: Production=${this.stats.lastMonthProduction} kWh, FeedIn=${this.stats.lastMonthFeedIn} kWh`,
            );
        }
    }

    /**
     * Systemsprache von ioBroker laden
     */
    async loadSystemLanguage() {
        try {
            const systemConfig = await this.getForeignObjectAsync('system.config');
            if (systemConfig && systemConfig.common && systemConfig.common.language) {
                this.systemLang = systemConfig.common.language;
                this.log.debug(`Systemsprache geladen: ${this.systemLang}`);
            }
        } catch (e) {
            this.log.debug(`Systemsprache konnte nicht geladen werden, verwende Standard (de): ${e.message}`);
        }
    }

    /**
     * Text übersetzen
     *
     * @param {string} key - Translation key
     */
    translate(key) {
        const translations = {
            'Battery full': {
                de: 'Batterie VOLL',
                en: 'Battery FULL',
                ru: 'БАТАРЕЯ ПОЛНА',
            },
            'Battery empty': {
                de: 'Batterie LEER',
                en: 'Battery EMPTY',
                ru: 'БАТАРЕЯ ПУСТА',
            },
            'Battery at': {
                de: 'Batterie bei',
                en: 'Battery at',
                ru: 'Батарея',
            },
            'Daily statistics PV system': {
                de: 'Tagesstatistik PV-Anlage',
                en: 'Daily Statistics PV System',
                ru: 'Дневная статистика PV системы',
            },
            'Weekly statistics PV system': {
                de: 'Wochenstatistik PV-Anlage',
                en: 'Weekly Statistics PV System',
                ru: 'Недельная статистика PV системы',
            },
            'Monthly statistics PV system': {
                de: 'Monatsstatistik PV-Anlage',
                en: 'Monthly Statistics PV System',
                ru: 'Месячная статистика PV системы',
            },
            'Current charge level': {
                de: 'Aktueller Ladestand',
                en: 'Current charge level',
                ru: 'Текущий уровень заряда',
            },
            'Current energy': {
                de: 'Aktuelle Energie',
                en: 'Current energy',
                ru: 'Текущая энергия',
            },
            'Total capacity': {
                de: 'Gesamt',
                en: 'Total capacity',
                ru: 'Общая емкость',
            },
            Production: {
                de: 'Produktion',
                en: 'Production',
                ru: 'Производство',
            },
            'Own consumption': {
                de: 'Eigenverbrauch',
                en: 'Own consumption',
                ru: 'Собственное потребление',
            },
            'Feed-in': {
                de: 'Einspeisung',
                en: 'Feed-in',
                ru: 'Подача в сеть',
            },
            'Grid consumption': {
                de: 'Netzbezug',
                en: 'Grid consumption',
                ru: 'Потребление из сети',
            },
            'Full cycles last week': {
                de: 'Vollzyklen letzte Woche',
                en: 'Full cycles last week',
                ru: 'Полные циклы на прошлой неделе',
            },
            'Empty cycles last week': {
                de: 'Leerzyklen letzte Woche',
                en: 'Empty cycles last week',
                ru: 'Пустые циклы на прошлой неделе',
            },
            'Full cycles last month': {
                de: 'Vollzyklen letzter Monat',
                en: 'Full cycles last month',
                ru: 'Полные циклы в прошлом месяце',
            },
            'Empty cycles last month': {
                de: 'Leerzyklen letzter Monat',
                en: 'Empty cycles last month',
                ru: 'Пустые циклы в прошлом месяце',
            },
            'Weather tomorrow': {
                de: 'Wetter morgen',
                en: 'Weather tomorrow',
                ru: 'Погода завтра',
            },
            'Weather today': {
                de: 'Wetter heute',
                en: 'Weather today',
                ru: 'Погода сегодня',
            },
            Currently: {
                de: 'aktuell',
                en: 'currently',
                ru: 'сейчас',
            },
            'Good PV production expected': {
                de: 'Gute PV-Produktion erwartet',
                en: 'Good PV production expected',
                ru: 'Ожидается хорошее производство PV',
            },
            'Less PV production expected': {
                de: 'Weniger PV-Produktion erwartet',
                en: 'Less PV production expected',
                ru: 'Ожидается меньшее производство PV',
            },
            'Current production': {
                de: 'Aktuelle Produktion',
                en: 'Current production',
                ru: 'Текущее производство',
            },
            'Current consumption': {
                de: 'Aktueller Verbrauch',
                en: 'Current consumption',
                ru: 'Текущее потребление',
            },
            'Production today': {
                de: 'Produktion heute',
                en: 'Production today',
                ru: 'Производство сегодня',
            },
            'Feed-in today': {
                de: 'Eingespeist heute',
                en: 'Feed-in today',
                ru: 'Подано в сеть сегодня',
            },
            'Grid consumption today': {
                de: 'Netzbezug heute',
                en: 'Grid consumption today',
                ru: 'Потребление из сети сегодня',
            },
            'Consumption today': {
                de: 'Verbrauch heute',
                en: 'Consumption today',
                ru: 'Потребление сегодня',
            },
            'Tip tomorrow little sun use consumers today': {
                de: 'Tipp: Morgen wenig Sonne - heute Verbraucher nutzen',
                en: 'Tip: Little sun tomorrow - use consumers today',
                ru: 'Совет: Завтра мало солнца - используйте потребители сегодня',
            },
            'Good news tomorrow more sun': {
                de: 'Gute Nachricht: Morgen wieder mehr Sonne',
                en: 'Good news: More sun tomorrow',
                ru: 'Хорошая новость: Завтра больше солнца',
            },
            'Now ideal for electric car washing machine dishwasher': {
                de: 'Jetzt ideal für: Elektroauto, Waschmaschine, Spülmaschine',
                en: 'Now ideal for: Electric car, washing machine, dishwasher',
                ru: 'Сейчас идеально для: Электромобиль, стиральная машина, посудомоечная машина',
            },
            'High consumption Turn off unnecessary devices': {
                de: 'Hoher Verbrauch! Nicht benötigte Geräte ausschalten',
                en: 'High consumption! Turn off unnecessary devices',
                ru: 'Высокое потребление! Выключите ненужные устройства',
            },
            'A healthy cycle per day is normal': {
                de: 'Ein gesunder Zyklus pro Tag ist normal',
                en: 'A healthy cycle per day is normal',
                ru: 'Один здоровый цикл в день - это нормально',
            },
            'If there are many cycles check battery settings': {
                de: 'Bei vielen Zyklen: Batterie-Settings prüfen',
                en: 'If there are many cycles, check battery settings',
                ru: 'При большом количестве циклов проверьте настройки батареи',
            },
            'Battery charging': {
                de: '✅ Batterie lädt',
                en: '✅ Battery charging',
                ru: '✅ Батарея заряжается',
            },
            'Battery discharging': {
                de: '⚠️ Batterie entlädt',
                en: '⚠️ Battery discharging',
                ru: '⚠️ Батарея разряжается',
            },
            'Production last week': {
                de: 'Produktion letzte Woche',
                en: 'Production last week',
                ru: 'Производство на прошлой неделе',
            },
        };

        if (translations[key] && translations[key][this.systemLang]) {
            return translations[key][this.systemLang];
        }
        return (translations[key] && translations[key]['en']) || key;
    }

    /**
     * Baue Test-Nachricht
     */
    async buildTestMessage() {
        // Werte aus States lesen
        const socState = await this.getStateAsync('statistics.currentSOC');
        const soc = socState && socState.val !== null ? socState.val : 0;

        const batteryCapacityKWh = this.round(this.config.batteryCapacityWh / 1000, 1);
        const currentKWh = this.round(((soc / 100) * this.config.batteryCapacityWh) / 1000, 1);

        // Weitere Werte aus States lesen
        const totalProdState = await this.getStateAsync('statistics.currentTotalProduction');
        const totalProd = totalProdState && totalProdState.val !== null ? this.round(totalProdState.val, 1) : 0;

        // const consumptionState = await this.getStateAsync('statistics.currentConsumption');  // ESLint: unused
        // const consumption = consumptionState && consumptionState.val !== null ? this.round(consumptionState.val, 1) : 0;

        const feedInState = await this.getStateAsync('statistics.currentFeedIn');
        const feedIn = feedInState && feedInState.val !== null ? this.round(Math.abs(feedInState.val), 0) : 0;

        const gridPowerState = await this.getStateAsync('statistics.currentGridPower');
        const gridPower = gridPowerState && gridPowerState.val !== null ? this.round(gridPowerState.val, 0) : 0;

        // Aktuelle Leistung (W) lesen
        const powerState = await this.getStateAsync('statistics.currentPower');
        const power = powerState && powerState.val !== null ? this.round(powerState.val, 0) : 0;

        // Eigenverbrauch berechnen
        const selfConsumption = this.round(totalProd - feedIn, 1);
        const selfConsumptionRate = totalProd > 0 ? this.round((selfConsumption / totalProd) * 100, 1) : 0;

        let message = `🧪 *${this.translate('Daily statistics PV system')} - TEST*
━━━━━━━━━━━━━━━━━━━━━━
🔋 ${this.translate('Current charge level')}: ${soc}%
⚡ ${this.translate('Current energy')}: ${currentKWh} kWh (${batteryCapacityKWh} kWh ${this.translate('Total capacity')})
━━━━━━━━━━━━━━━━━━━━━━
✅ ${this.translate('Production')}: ${totalProd} kWh
⚡️ ${this.translate('Current production')}: ${power} W
🏠 ${this.translate('Own consumption')}: ${selfConsumption} kWh (${selfConsumptionRate}%)
🔌 ${this.translate('Feed-in')}: ${feedIn} kWh
⚡ ${this.translate('Grid consumption')}: ${gridPower} kWh
━━━━━━━━━━━━━━━━━━━━━━
💡 ${this.translate('A healthy cycle per day is normal')}`;

        // Wetterdaten hinzufügen (heute und morgen) für Test
        if (this.config.weatherEnabled !== false) {
            try {
                // Wetter heute
                if (this.config.weatherTodayText || this.config.weatherTodayTemp) {
                    const weatherTodayTextState = this.config.weatherTodayText
                        ? await this.getForeignStateAsync(this.config.weatherTodayText)
                        : null;
                    const weatherTodayState = this.config.weatherTodayTemp
                        ? await this.getForeignStateAsync(this.config.weatherTodayTemp)
                        : null;

                    const weatherTodayText =
                        weatherTodayTextState && weatherTodayTextState.val !== null ? weatherTodayTextState.val : null;
                    const weatherTodayTemp =
                        weatherTodayState && weatherTodayState.val !== null ? weatherTodayState.val : null;
                    const tempText = weatherTodayTemp !== null ? ` ${this.round(weatherTodayTemp, 1)}°C` : '';

                    if (weatherTodayText || weatherTodayTemp !== null) {
                        const weatherDesc = weatherTodayText ? this.getWeatherDescription(weatherTodayText) : '🌡️';
                        message += `\n\n🌤️ *${this.translate('Weather today')}:* ${weatherDesc}${tempText}`;
                    }
                }

                // Wetter morgen
                if (this.config.weatherTomorrowText || this.config.weatherTomorrowTemp) {
                    const weatherTomorrowTextState = this.config.weatherTomorrowText
                        ? await this.getForeignStateAsync(this.config.weatherTomorrowText)
                        : null;
                    const weatherTomorrowState = this.config.weatherTomorrowTemp
                        ? await this.getForeignStateAsync(this.config.weatherTomorrowTemp)
                        : null;

                    const weatherTomorrowText =
                        weatherTomorrowTextState && weatherTomorrowTextState.val !== null
                            ? weatherTomorrowTextState.val
                            : null;
                    const weatherTomorrowTemp =
                        weatherTomorrowState && weatherTomorrowState.val !== null ? weatherTomorrowState.val : null;
                    const tempText = weatherTomorrowTemp !== null ? ` ${this.round(weatherTomorrowTemp, 1)}°C` : '';

                    if (weatherTomorrowText || weatherTomorrowTemp !== null) {
                        const weatherDesc = weatherTomorrowText
                            ? this.getWeatherDescription(weatherTomorrowText)
                            : '🌡️';
                        message += `\n🌤️ *${this.translate('Weather tomorrow')}:* ${weatherDesc}${tempText}`;
                    }
                }
            } catch (e) {
                this.log.debug(`Weather data for test not available: ${e.message}`);
            }
        }

        message += `\n\n*${this.translate('Test Notification')} - pv-notifications v${this.version}*`;

        return message;
    }

    /**
     * Send test message
     */
    async sendTestMessage() {
        this.log.info('Sending test notification');

        // Check if Telegram is configured
        if (!this.config.telegramInstance) {
            this.log.warn('Test failed: No Telegram instance configured');
            return;
        }

        if (!this.config.telegramUsers) {
            this.log.warn('Test failed: No Telegram users configured');
            return;
        }

        const testMessage = await this.buildTestMessage();
        this.sendTelegram(testMessage, 'info');

        this.log.info('Test notification sent');
    }

    /**
     * Send daily statistics message
     */
    async sendDailyStatsMessage() {
        this.log.info('Sending daily statistics');

        // Check if Telegram is configured
        if (!this.config.telegramInstance) {
            this.log.warn('Daily statistics failed: No Telegram instance configured');
            return;
        }

        if (!this.config.telegramUsers) {
            this.log.warn('Daily statistics failed: No Telegram users configured');
            return;
        }

        const dailyStatsMessage = await this.buildDailyStatsMessage();
        this.sendTelegram(dailyStatsMessage, 'info');

        this.log.info('Daily statistics sent');
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param {() => void} callback - Callback function
     */
    async onUnload(callback) {
        try {
            this.log.info('PV Notifications Adapter is stopping');

            // Clear interval timer
            if (this.scheduledInterval) {
                this.clearInterval(this.scheduledInterval);
                this.scheduledInterval = null;
            }

            // Reset connection
            this.setState('info.connection', false, true);
            await this.saveStatistics();
            callback();
        } catch (e) {
            this.log.error(`Error while stopping: ${e.message}`);
            callback();
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions> | undefined} [options] - Adapter options
     */
    module.exports = options => new PvNotifications(options);
} else {
    // otherwise start the instance directly
    new PvNotifications();
}
