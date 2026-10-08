'use strict';

const path = require('path');
const { EventEmitter } = require('events');
const { expect } = require('chai');

// Replace @iobroker/adapter-core with a minimal fake so main.js can be instantiated without a js-controller
class FakeAdapter extends EventEmitter {
    constructor(options) {
        super();
        this.options = options;
        this.namespace = 'pv-notifications.0';
        this.config = {};
        this.version = '0.0.0-test';
        this.states = {};
        this.foreign = {};
        this.sent = [];
        this.log = { debug() {}, info() {}, warn() {}, error() {} };
    }
    async setStateAsync(id, val) {
        this.states[id] = { val };
    }
    async setState(id, val) {
        this.states[id] = { val };
    }
    async getStateAsync(id) {
        return this.states[id] || null;
    }
    async getForeignStateAsync(id) {
        if (!id) {
            throw new Error('invalid id');
        }
        return this.foreign[id] || null;
    }
    sendTo(instance, cmd, payload) {
        this.sent.push({ instance, cmd, payload });
    }
}

const coreId = require.resolve('@iobroker/adapter-core');
const mainId = path.resolve(__dirname, '..', 'main.js');
const originalCore = require.cache[coreId];
require.cache[coreId] = { id: coreId, filename: coreId, loaded: true, exports: { Adapter: FakeAdapter } };
delete require.cache[mainId];
const createAdapter = require(mainId);
// restore for other tests in the same mocha run
if (originalCore) {
    require.cache[coreId] = originalCore;
} else {
    delete require.cache[coreId];
}

function make(config = {}) {
    const a = createAdapter();
    a.systemLang = 'en';
    a.config = {
        thresholdFull: 100,
        thresholdEmpty: 0,
        thresholdResetFull: 95,
        thresholdResetEmpty: 5,
        batteryCapacityWh: 10000,
        intermediateSteps: '20,40,60,80',
        nightModeEnabled: false,
        quietModeEnabled: false,
        telegramInstance: 'telegram.0',
        telegramUsers: 'alice, bob',
        highProduction: 3000,
        highConsumption: 2000,
        ...config,
    };
    return a;
}

describe('PvNotifications unit tests', () => {
    describe('lifecycle', () => {
        it('registers ready, stateChange and unload handlers', () => {
            const a = make();
            expect(a.listenerCount('ready')).to.equal(1);
            expect(a.listenerCount('stateChange')).to.equal(1);
            expect(a.listenerCount('unload')).to.equal(1);
        });

        it('onStateChange swallows errors and resets the test button flag', async () => {
            const a = make();
            a.sendTestMessage = async () => {
                throw new Error('boom');
            };
            await a.onStateChange(`${a.namespace}.testButton`, { val: true, ack: false });
            expect(a.status.testMessageRunning).to.equal(false);
            expect(a.states.testButton.val).to.equal(false);
        });
    });

    describe('round()', () => {
        const a = make();
        it('rounds to given decimals', () => {
            expect(a.round(1.2345, 2)).to.equal(1.23);
            expect(a.round(1.25, 1)).to.equal(1.3);
        });
        it('returns 0 for invalid values', () => {
            expect(a.round(null)).to.equal(0);
            expect(a.round(undefined)).to.equal(0);
            expect(a.round('abc')).to.equal(0);
        });
    });

    describe('weather helpers', () => {
        const a = make();
        it('classifies good and bad weather', () => {
            expect(a.isWeatherGood('Sonnig')).to.equal(true);
            expect(a.isWeatherGood('clear sky')).to.equal(true);
            expect(a.isWeatherGood('Regen')).to.equal(false);
            expect(a.isWeatherBad('light rain')).to.equal(true);
            expect(a.isWeatherBad('overcast clouds')).to.equal(true);
            expect(a.isWeatherBad('sonnig')).to.equal(false);
            expect(a.isWeatherBad(null)).to.equal(false);
        });
        it('maps descriptions', () => {
            expect(a.getWeatherDescription('Gewitter')).to.contain('Gewitter');
            expect(a.getWeatherDescription('few clouds')).to.contain('bewölkt');
            expect(a.getWeatherDescription('Hagel')).to.equal('🌡️ Hagel');
            expect(a.getWeatherDescription('')).to.contain('unbekannt');
        });
    });

    describe('translate()', () => {
        it('uses system language, falls back to en, then key', () => {
            const a = make();
            a.systemLang = 'de';
            expect(a.translate('Battery full')).to.equal('Batterie VOLL');
            a.systemLang = 'fr';
            expect(a.translate('Battery full')).to.equal('Battery FULL');
            expect(a.translate('does not exist')).to.equal('does not exist');
        });
    });

    describe('time windows', () => {
        function at(a, hh, mm, fn) {
            const RealDate = Date;
            const fixed = new RealDate(2026, 0, 15, hh, mm, 0);
            global.Date = class extends RealDate {
                constructor(...args) {
                    super(...(args.length ? args : [fixed.getTime()]));
                }
                static now() {
                    return fixed.getTime();
                }
            };
            try {
                return fn();
            } finally {
                global.Date = RealDate;
            }
        }

        it('night mode disabled -> never night', () => {
            const a = make({ nightModeEnabled: false });
            expect(at(a, 3, 0, () => a.isNightTime())).to.equal(false);
        });
        it('handles overnight window', () => {
            const a = make({ nightModeEnabled: true, nightModeStart: '23:00', nightModeEnd: '06:00' });
            expect(at(a, 23, 30, () => a.isNightTime())).to.equal(true);
            expect(at(a, 2, 0, () => a.isNightTime())).to.equal(true);
            expect(at(a, 6, 0, () => a.isNightTime())).to.equal(false);
            expect(at(a, 12, 0, () => a.isNightTime())).to.equal(false);
        });
        it('handles same-day quiet window', () => {
            const a = make({ quietModeEnabled: true, quietModeStart: '12:00', quietModeEnd: '15:00' });
            expect(at(a, 12, 0, () => a.isQuietTime())).to.equal(true);
            expect(at(a, 14, 59, () => a.isQuietTime())).to.equal(true);
            expect(at(a, 15, 0, () => a.isQuietTime())).to.equal(false);
        });
    });

    describe('canNotify()', () => {
        it('respects minimum interval', () => {
            const a = make({ minIntervalFull: 10 });
            expect(a.canNotify('full')).to.equal(true);
            a.status.lastNotification.full = Date.now() - 5 * 60 * 1000;
            expect(a.canNotify('full')).to.equal(false);
            a.status.lastNotification.full = Date.now() - 11 * 60 * 1000;
            expect(a.canNotify('full')).to.equal(true);
        });
    });

    describe('sendTelegram()', () => {
        it('sends to configured users', () => {
            const a = make();
            a.sendTelegram('hello');
            expect(a.sent).to.have.length(1);
            expect(a.sent[0].instance).to.equal('telegram.0');
            // telegram adapter reads "user" - "users" would be ignored and the message broadcast to everyone
            expect(a.sent[0].payload.user).to.equal('alice,bob');
            expect(a.sent[0].payload).to.not.have.property('users');
            expect(a.sent[0].payload.text).to.contain('hello');
        });
        it('sends HTML with bold text instead of literal asterisks', () => {
            const a = make();
            a.sendTelegram('📊 *Tagesstatistik PV-Anlage*\n🌤️ *Wetter heute:* Regen');
            const { text, parse_mode } = a.sent[0].payload;
            expect(parse_mode).to.equal('HTML');
            expect(text).to.contain('<b>Tagesstatistik PV-Anlage</b>');
            expect(text).to.contain('<b>Wetter heute:</b> Regen');
            expect(text).to.not.contain('*');
        });
        it('escapes HTML from foreign values', () => {
            const a = make();
            expect(a.formatTelegramHtml('Wetter: <b>sun & rain</b> *x')).to.equal(
                'Wetter: &lt;b&gt;sun &amp; rain&lt;/b&gt; *x',
            );
        });
        it('does nothing without instance or users', () => {
            const a = make({ telegramInstance: '' });
            a.sendTelegram('x');
            const b = make({ telegramUsers: ' , ' });
            b.sendTelegram('x');
            expect(a.sent).to.have.length(0);
            expect(b.sent).to.have.length(0);
        });
    });

    describe('onBatterySOCChange()', () => {
        it('ignores invalid values', async () => {
            const a = make();
            await a.onBatterySOCChange(null);
            await a.onBatterySOCChange('abc');
            await a.onBatterySOCChange('');
            expect(a.sent).to.have.length(0);
            expect(a.states['statistics.currentSOC']).to.equal(undefined);
        });

        it('sends "full" once and counts cycles for day/week/month', async () => {
            const a = make();
            await a.onBatterySOCChange(100);
            await a.onBatterySOCChange(100);
            expect(a.sent).to.have.length(1);
            expect(a.sent[0].payload.text).to.contain('Battery FULL');
            expect(a.stats.fullCycles).to.equal(1);
            expect(a.stats.weekFullCycles).to.equal(1);
            expect(a.stats.monthFullCycles).to.equal(1);
        });

        it('accepts SOC delivered as string', async () => {
            const a = make();
            await a.onBatterySOCChange('100');
            expect(a.sent).to.have.length(1);
        });

        it('re-arms "full" after SOC drops below reset threshold', async () => {
            const a = make({ minIntervalFull: 0.0001 });
            await a.onBatterySOCChange(100);
            await a.onBatterySOCChange(90);
            expect(a.status.full).to.equal(false);
        });

        it('sends "empty" at threshold', async () => {
            const a = make();
            await a.onBatterySOCChange(0);
            expect(a.sent).to.have.length(1);
            expect(a.sent[0].payload.text).to.contain('Battery EMPTY');
            expect(a.stats.monthEmptyCycles).to.equal(1);
        });

        it('sends intermediate notification once per step and re-arms after leaving it', async () => {
            const a = make({ minIntervalIntermediate: 0.0001 });
            await a.onBatterySOCChange(40);
            await a.onBatterySOCChange(40);
            expect(a.sent).to.have.length(1);
            expect(a.status.intermediateNotified).to.deep.equal([40]);
            await a.onBatterySOCChange(50);
            expect(a.status.intermediateNotified).to.deep.equal([]);
        });

        it('detects intermediate steps when the SOC jumps over them (39 -> 41)', async () => {
            const a = make();
            await a.onBatterySOCChange(39);
            expect(a.sent).to.have.length(0);
            await a.onBatterySOCChange(41);
            expect(a.sent).to.have.length(1);
            expect(a.sent[0].payload.text).to.contain('41%');
            expect(a.sent[0].payload.text).to.contain('⬆️');
            expect(a.status.intermediateNotified).to.deep.equal([40]);
        });

        it('detects intermediate steps with decimal SOC values, also when discharging', async () => {
            const a = make();
            await a.onBatterySOCChange(60.4);
            await a.onBatterySOCChange(59.8);
            expect(a.sent).to.have.length(1);
            expect(a.sent[0].payload.text).to.contain('⬇️');
        });

        it('sends one message when several steps are crossed at once', async () => {
            const a = make();
            await a.onBatterySOCChange(18);
            await a.onBatterySOCChange(45);
            expect(a.sent).to.have.length(1);
            expect(a.status.intermediateNotified).to.have.members([20, 40]);
        });

        it('does not repeat a step while the SOC oscillates around it', async () => {
            const a = make({ minIntervalIntermediate: 0.0001 });
            await a.onBatterySOCChange(39.5);
            await a.onBatterySOCChange(40.2);
            await a.onBatterySOCChange(39.7);
            await a.onBatterySOCChange(40.1);
            expect(a.sent).to.have.length(1);
        });

        it('does not send intermediate messages on adapter start between steps', async () => {
            const a = make();
            await a.onBatterySOCChange(47);
            expect(a.sent).to.have.length(0);
        });

        it('treats a SOC above/below the thresholds as full/empty', async () => {
            const a = make({ thresholdFull: 98, thresholdEmpty: 5 });
            await a.onBatterySOCChange(99);
            expect(a.sent).to.have.length(1);
            expect(a.sent[0].payload.text).to.contain('Battery FULL');

            const b = make({ thresholdFull: 100, thresholdEmpty: 5 });
            await b.onBatterySOCChange(4);
            expect(b.sent).to.have.length(1);
            expect(b.sent[0].payload.text).to.contain('Battery EMPTY');
        });

        it('suppresses full notification during quiet time', async () => {
            const a = make({ quietModeEnabled: true });
            a.isQuietTime = () => true;
            await a.onBatterySOCChange(100);
            expect(a.sent).to.have.length(0);
        });

        it('empty notification at night depends on nightModeIgnoreEmpty', async () => {
            const a = make({ nightModeEnabled: true, nightModeIgnoreEmpty: true });
            a.isNightTime = () => true;
            await a.onBatterySOCChange(0);
            expect(a.sent).to.have.length(1);

            const b = make({ nightModeEnabled: true, nightModeIgnoreEmpty: false });
            b.isNightTime = () => true;
            await b.onBatterySOCChange(0);
            expect(b.sent).to.have.length(0);
        });

        it('tracks min/max SOC and energy', async () => {
            const a = make();
            await a.onBatterySOCChange(50);
            await a.onBatterySOCChange(30);
            await a.onBatterySOCChange(70);
            expect(a.stats.maxSOC).to.equal(70);
            expect(a.stats.minSOC).to.equal(30);
            expect(a.states['statistics.currentEnergyKWh'].val).to.equal(7);
        });
    });

    describe('statistics persistence', () => {
        it('restores daily values after restart on the same day', async () => {
            const a = make();
            const today = new Date().getDate();
            a.states = {
                'statistics.lastStatsReset': { val: today },
                'statistics.fullCyclesToday': { val: 2 },
                'statistics.emptyCyclesToday': { val: 1 },
                'statistics.maxSOCToday': { val: 100 },
                'statistics.minSOCToday': { val: 12 },
                'statistics.fullCyclesWeek': { val: 5 },
                'statistics.fullCyclesMonth': { val: 9 },
            };
            await a.loadStatistics();
            expect(a.stats.fullCycles).to.equal(2);
            expect(a.stats.emptyCycles).to.equal(1);
            expect(a.stats.maxSOC).to.equal(100);
            expect(a.stats.minSOC).to.equal(12);
            expect(a.stats.weekFullCycles).to.equal(5);
            expect(a.stats.monthFullCycles).to.equal(9);
        });

        it('does not overwrite last week/month values with 0 on the first start of a new day', async () => {
            const a = make();
            const today = new Date().getDate();
            a.states = {
                'statistics.lastStatsReset': { val: today === 1 ? 2 : 1 },
                'statistics.lastWeekProduction': { val: 123.4 },
                'statistics.lastMonthFullCycles': { val: 17 },
            };
            await a.loadStatistics();
            expect(a.stats.lastWeekProduction).to.equal(123.4);
            expect(a.states['statistics.lastWeekProduction'].val).to.equal(123.4);
            expect(a.states['statistics.lastMonthFullCycles'].val).to.equal(17);
            expect(a.states['statistics.lastStatsReset'].val).to.equal(today);
        });

        it('persists min/max SOC immediately', async () => {
            const a = make();
            await a.onBatterySOCChange(55);
            expect(a.states['statistics.maxSOCToday'].val).to.equal(55);
            expect(a.states['statistics.minSOCToday'].val).to.equal(55);
        });

        it('resets daily values on a new day but keeps week/month counters', async () => {
            const a = make();
            const today = new Date().getDate();
            a.states = {
                'statistics.lastStatsReset': { val: today === 1 ? 2 : 1 },
                'statistics.fullCyclesToday': { val: 2 },
                'statistics.fullCyclesWeek': { val: 5 },
            };
            await a.loadStatistics();
            expect(a.stats.fullCycles).to.equal(0);
            expect(a.stats.minSOC).to.equal(100);
            expect(a.stats.weekFullCycles).to.equal(5);
        });
    });

    describe('readForeignNumber()', () => {
        it('returns 0 for empty id, missing state and non numeric values', async () => {
            const a = make();
            a.foreign['x.num'] = { val: '12.5' };
            a.foreign['x.bad'] = { val: 'abc' };
            expect(await a.readForeignNumber('')).to.equal(0);
            expect(await a.readForeignNumber('x.missing')).to.equal(0);
            expect(await a.readForeignNumber('x.bad')).to.equal(0);
            expect(await a.readForeignNumber('x.num')).to.equal(12.5);
        });
    });

    describe('weekly / monthly stats messages', () => {
        it('never reports negative own consumption', () => {
            const a = make();
            a.stats.lastWeekProduction = 10;
            a.stats.lastWeekFeedIn = -15;
            const msg = a.buildWeeklyStatsMessage();
            expect(msg).to.contain('Own consumption: 0 kWh (0%)');
        });
        it('monthly message contains cycle counts', () => {
            const a = make();
            a.stats.lastMonthFullCycles = 17;
            expect(a.buildMonthlyStatsMessage()).to.contain('Full cycles last month: 17');
        });
    });

    describe('scheduler', () => {
        it('parses times and sunset values', () => {
            const a = make();
            expect(a.parseTime('22:03')).to.deep.equal({ hours: 22, minutes: 3 });
            expect(a.parseTime('7:05')).to.deep.equal({ hours: 7, minutes: 5 });
            expect(a.parseTime('')).to.equal(null);
            expect(a.parseTime(undefined)).to.equal(null);
            expect(a.parseTime('25:00')).to.equal(null);
            expect(a.parseSunsetTime('18:42')).to.deep.equal({ hours: 18, minutes: 42 });
            const ts = new Date(2026, 9, 8, 18, 42).getTime();
            expect(a.parseSunsetTime(ts)).to.deep.equal({ hours: 18, minutes: 42 });
            expect(a.parseSunsetTime(String(ts))).to.deep.equal({ hours: 18, minutes: 42 });
            expect(a.parseSunsetTime(new Date(ts).toISOString())).to.deep.equal({ hours: 18, minutes: 42 });
            expect(a.parseSunsetTime('n/a')).to.equal(null);
        });

        it('resets daily statistics at day change, independent of the stats time', () => {
            const a = make({ statsDayTime: '22:03' });
            a.stats.lastStatsReset = 7;
            a.stats.fullCycles = 3;
            a.resetDailyStats(new Date(2026, 9, 7, 23, 59));
            expect(a.stats.fullCycles).to.equal(3);
            a.resetDailyStats(new Date(2026, 9, 8, 0, 1));
            expect(a.stats.fullCycles).to.equal(0);
            expect(a.stats.lastStatsReset).to.equal(8);
        });

        it('sends daily stats at a time that is not a multiple of 5 minutes', async () => {
            const a = make({ statsDayTime: '22:03', statsWeekTime: '10:00', statsWeekDay: 0 });
            a.stats.lastStatsReset = 8;
            await a.runScheduledTasks(new Date(2026, 9, 8, 22, 3));
            expect(a.sent).to.have.length(1);
            expect(a.sent[0].payload.text).to.contain('Daily Statistics');
        });

        it('does not crash with missing time configuration', async () => {
            const a = make({ statsDayTime: undefined, statsWeekTime: undefined });
            await a.runScheduledTasks(new Date(2026, 9, 8, 22, 0));
            expect(a.sent).to.have.length(0);
        });

        it('saves the week once in the window 23:55-23:59 on Sunday (missed tick tolerated)', async () => {
            const a = make({ weeklyProduction: 'sa.week.prod' });
            a.foreign['sa.week.prod'] = { val: 88 };
            a.stats.weekFullCycles = 4;
            // 2026-10-11 is a Sunday; the 23:55 tick is "missed", 23:57 must still save
            await a.resetWeeklyStats(new Date(2026, 9, 11, 23, 57));
            expect(a.stats.lastWeekProduction).to.equal(88);
            expect(a.stats.lastWeekFullCycles).to.equal(4);
            expect(a.stats.weekFullCycles).to.equal(0);
            // second tick in the window must not overwrite last week's cycles with 0
            await a.resetWeeklyStats(new Date(2026, 9, 11, 23, 58));
            expect(a.stats.lastWeekFullCycles).to.equal(4);
        });

        it('rolls over monthly cycles even when monthly statistics are disabled', async () => {
            const a = make({ monthlyStatsEnabled: false });
            a.stats.monthFullCycles = 9;
            await a.resetMonthlyStats(new Date(2026, 9, 31, 23, 55));
            expect(a.stats.lastMonthFullCycles).to.equal(9);
            expect(a.stats.monthFullCycles).to.equal(0);
        });
    });

    describe('message builders', () => {
        it('shows 0 °C (0 is a valid temperature)', async () => {
            const a = make({ weatherTodayTemp: 'w.today' });
            a.foreign['w.today'] = { val: 0 };
            const msg = await a.buildDailyStatsMessage();
            expect(msg).to.contain('0°C');
        });
        it('handles numeric weather values', () => {
            const a = make();
            expect(a.getWeatherDescription(800)).to.equal('🌡️ 800');
            expect(a.isWeatherGood(800)).to.equal(false);
            expect(a.isWeatherBad(500)).to.equal(false);
        });
        it('full message shows live consumption power when configured', async () => {
            const a = make({ currentConsumptionPower: 'x.cons' });
            a.states['statistics.currentPower'] = { val: 3500 };
            a.states['statistics.currentConsumptionPower'] = { val: 420 };
            a.states['statistics.currentTotalProduction'] = { val: 21.5 };
            a.states['statistics.currentFeedIn'] = { val: -4 };
            const msg = await a.buildFullMessage(100);
            expect(msg).to.contain('Current consumption: 420 W');
            expect(msg).to.contain('Production today: 21.5 kWh');
            expect(msg).to.contain('Electric car'); // power > highProduction
        });
        it('full message falls back to daily kWh without live datapoint', async () => {
            const a = make();
            a.states['statistics.currentConsumption'] = { val: 12.34 };
            expect(await a.buildFullMessage(100)).to.contain('Consumption today: 12.3 kWh');
        });
        it('test message works when only the tomorrow temperature is configured', async () => {
            const a = make({ weatherTomorrowTemp: 'w.temp' });
            a.foreign['w.temp'] = { val: 18 };
            const msg = await a.buildTestMessage();
            expect(msg).to.contain('18°C');
        });
    });
});
