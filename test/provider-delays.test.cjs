const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const domain = loadTs('components/stops-panel/stop-domain.ts', { '@/lib/pks-client': {} });
const { departureTiming } = loadTs('lib/departure-timing.ts');
const { upcomingVehicleStops } = loadTs('lib/vehicle-upcoming-stops.ts');

test('PKS displays one-minute deviations even without a vehicle number', () => {
  const row = domain.mapJourneyToDeparture({ line_name: '108', route_description: 'Rzeszów',
    timetable_time: '2026-10-06T08:00:00Z', deviation: 1 }, 0);
  assert.equal(row.status, 'delayed');
  assert.equal(row.delayMins, 1);
  assert.equal(row.realAtMs, Date.parse('2026-10-06T08:01:00Z'));
  const early = domain.mapJourneyToDeparture({ line_name: '108', timetable_time: '2026-10-06T08:00:00Z', deviation: -1 }, 0);
  assert.equal(early.delayMins, -1);
  assert.equal(early.status, 'delayed');
});

test('explicit predicted time wins and missing deviation is not treated as live zero', () => {
  const planned = Date.parse('2026-10-06T08:00:00Z');
  assert.deepEqual(departureTiming(planned, '10:03', 5), {
    realAtMs: planned + 180_000, delayMins: 3, hasRealtime: true,
  });
  assert.equal(departureTiming(planned, undefined, null).hasRealtime, false);
  assert.equal(departureTiming(planned, undefined, ' ').hasRealtime, false);
  const row = domain.mapJourneyToDeparture({ line_name: '108', timetable_time: '2026-10-06T08:00:00Z', deviation: null }, 0);
  assert.equal(row.realtimeSource, undefined);
  assert.equal(row.delayMins, 0);
});

test('Marcel shows supplied delays and marks only GPS estimates as estimated', () => {
  const course = { idKu: 42, nazTr: 'Krosno-Rzeszów' };
  const stop = { kol: 2, godz: '10:00', nazPr: 'Dworzec' };
  const confirmed = domain.departureFromMarcelCourseStop({ ...course, delayMinutes: 2 }, stop, '2026-10-06', 0, 300);
  assert.equal(confirmed.delayMins, 2);
  assert.equal(confirmed.delayEstimated, undefined);
  const estimated = domain.departureFromMarcelCourseStop(course, stop, '2026-10-06', 0, 180);
  assert.equal(estimated.status, 'delayed');
  assert.equal(estimated.delayMins, 3);
  assert.equal(estimated.delayEstimated, true);
  const scheduled = domain.departureFromMarcelCourseStop(course, stop, '2026-10-06', 0);
  assert.equal(scheduled.realtimeSource, undefined);
  assert.equal(scheduled.delayMins, 0);
});

test('map stop sequence drops passed stops for all bus providers and retains future loop stops', () => {
  for (const provider of ['pks', 'mpk_rzeszow', 'marcel']) {
    const stops = [{ id: 1, real: '2026-10-06T07:59:00Z' },
      { id: 2, real: '2026-10-06T08:01:00Z' }, { id: 1, real: '2026-10-06T08:05:00Z' }];
    const ids = upcomingVehicleStops(stops, Date.parse('2026-10-06T08:00:00Z'), 1).map(stop => String(stop.id));
    assert.deepEqual(ids, ['2', '1'], provider);
  }
});

test('Marcel live feed is shared; estimates reject stale, distant and not-yet-started courses', async () => {
  const originalFetch = global.fetch, originalNow = Date.now;
  const now = Date.parse('2026-10-06T08:08:00Z');
  Date.now = () => now;
  let calls = 0;
  global.fetch = async () => { calls++; return new Response(JSON.stringify([{ idKu: 42, szGps: 50.05, dlGps: 22.05 }])); };
  try {
    const api = loadTs('lib/pks-client.ts', { '@capacitor/core': { Capacitor: { isNativePlatform: () => false } } });
    const [positions, shared] = await Promise.all([api.fetchMarcelLivePositionsClient(), api.fetchMarcelLivePositionsClient()]);
    assert.equal(calls, 1);
    assert.equal(positions, shared);
    const stops = [{ kol: 1, godz: '10:00', szGps: 50, dlGps: 22 }, { kol: 2, godz: '10:10', szGps: 50.1, dlGps: 22.1 }];
    const delay = api.estimateMarcelCourseDelay(42, stops, '2026-10-06', positions);
    assert.ok(Math.abs(delay - 180) < 5);
    assert.equal(api.estimateMarcelCourseDelay(42, stops, '2026-10-06', [{ ...positions[0], observedAtMs: now - 120_000 }]), undefined);
    assert.equal(api.estimateMarcelCourseDelay(42, stops, '2026-10-06', [{ ...positions[0], lat: 51 }]), undefined);
    assert.equal(api.estimateMarcelCourseDelay(42, stops.map(stop => ({ ...stop, godz: '12:00' })), '2026-10-06', positions), undefined);
    assert.equal(api.estimateMarcelCourseDelay(999, stops, '2026-10-06', positions), undefined);
  } finally { global.fetch = originalFetch; Date.now = originalNow; }
});
