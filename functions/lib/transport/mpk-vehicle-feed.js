"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mpkFeedVehicles = mpkFeedVehicles;
exports.mpkSignalTime = mpkSignalTime;
/** Current MPK position feed is JSON keyed by fleet number; `is` is not GPS age. */
function mpkFeedVehicles(payload) {
    if (!payload || typeof payload !== 'object')
        throw new Error('Invalid MPK vehicle feed');
    const rows = Array.isArray(payload) ? payload : Object.values(payload);
    return rows.filter(row => row && typeof row === 'object' && 'x' in row && 'y' in row)
        .map(row => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null && typeof value !== 'object')
        .map(([key, value]) => [key, String(value)])));
}
function mpkSignalTime(raw, now) {
    const timestamp = Number(raw.timestamp);
    if (Number.isFinite(timestamp) && timestamp > 0)
        return timestamp > 1e12 ? timestamp : timestamp * 1000;
    const seconds = Number(raw.is);
    return now - (Number.isFinite(seconds) ? Math.max(0, seconds) : 0) * 1000;
}
