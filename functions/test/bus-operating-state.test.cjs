const test = require('node:test');
const assert = require('node:assert/strict');
const {warsawTimeMs} = require('../lib/transport/transit-time');
const {busOperatingState} = require('../lib/transport/bus-operating-state');

test('server interprets MPK service times in Warsaw, including winter and next-day GTFS hours', () => {
  assert.equal(warsawTimeMs('2026-10-05', '12:05'), Date.parse('2026-10-05T10:05:00Z'));
  assert.equal(warsawTimeMs('2026-12-05', '25:05'), Date.parse('2026-12-06T00:05:00Z'));
});

test('server reports terminal break with countdown but keeps a scheduled intermediate wait active', () => {
  const now = Date.parse('2026-10-05T10:00:00Z');
  const stops = [
    {id: 1, lat: 50, lon: 22, planned: '2026-10-05T10:05:00Z'},
    {id: 2, lat: 50.1, lon: 22.1, planned: '2026-10-05T10:45:00Z'},
  ];
  const start = busOperatingState({lat: 50, lon: 22, speed: 0, nowMs: now, stops});
  assert.equal(start.status, 'break');
  assert.equal(start.nextTripStartAtMs, now + 300000);
  stops[0].planned = '2026-10-05T09:05:00Z';
  assert.equal(busOperatingState({lat: 50.05, lon: 22.05, speed: 0, nowMs: now, stops}).status, 'active');
});
