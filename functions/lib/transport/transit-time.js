"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.warsawDateIso = warsawDateIso;
exports.warsawTimeMs = warsawTimeMs;
const WARSAW = 'Europe/Warsaw';
function warsawDateIso(dayOffset = 0, now = new Date()) {
    const today = now.toLocaleDateString('en-CA', { timeZone: WARSAW });
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + dayOffset);
    return date.toISOString().slice(0, 10);
}
/** GTFS hours can exceed 23: 25:10 belongs to the next calendar day. */
function warsawTimeMs(dateIso, time) {
    const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(time ?? '').trim());
    if (!match || Number(match[2]) > 59 || Number(match[3] || 0) > 59)
        return NaN;
    const wall = new Date(`${dateIso}T00:00:00Z`);
    if (!Number.isFinite(wall.getTime()))
        return NaN;
    wall.setUTCHours(Number(match[1]), Number(match[2]), Number(match[3] || 0), 0);
    const target = wall.getTime();
    let result = target;
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: WARSAW, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    for (let i = 0; i < 3; i++) {
        const parts = formatter.formatToParts(new Date(result));
        const read = (type) => Number(parts.find((part) => part.type === type)?.value);
        const rendered = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'), read('second'));
        const adjustment = target - rendered;
        result += adjustment;
        if (!adjustment)
            break;
    }
    return result;
}
