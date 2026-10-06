"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transitTimestamp = transitTimestamp;
exports.busOperatingState = busOperatingState;
const transit_time_1 = require("./transit-time");
function transitTimestamp(value) {
    const raw = String(value || '').trim();
    const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(raw);
    return match ? (0, transit_time_1.warsawTimeMs)(match[1], match[2]) : Date.parse(raw);
}
function near(input, stop) {
    if (!stop || !Number.isFinite(stop.lat) || !Number.isFinite(stop.lon))
        return false;
    const dy = (input.lat - stop.lat) * 111320;
    const dx = (input.lon - stop.lon) * 111320 * Math.cos(input.lat * Math.PI / 180);
    return Math.hypot(dx, dy) <= 150;
}
/** A later intermediate stop is never evidence of a break between trips. */
function busOperatingState(input) {
    const first = input.stops[0], last = input.stops[input.stops.length - 1];
    const firstMs = input.firstDepartureMs ?? transitTimestamp(first?.planned);
    const stopped = (input.speed ?? 0) <= 3;
    const atFirst = input.atFirstStop === true || near(input, first);
    const atLast = input.atLastStop === true || near(input, last);
    const waiting = Number.isFinite(firstMs) && firstMs > input.nowMs + 15000;
    const lastMs = transitTimestamp(last?.real || last?.planned);
    const ended = Number.isFinite(lastMs) && lastMs <= input.nowMs + 60000;
    if (stopped && waiting && (atFirst || input.reportedBreak))
        return {
            status: 'break',
            statusText: `Przerwa do ${new Date(firstMs).toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' })}`,
            nextTripStartAtMs: firstMs,
            nextTripFirstStopId: input.firstStopId ?? first?.id,
        };
    if (stopped && (input.reportedBreak || (atLast && ended) || (input.atLastStop && !waiting)))
        return { status: 'break', statusText: 'Przerwa' };
    return { status: 'active', statusText: 'W trasie' };
}
