const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { busDelayMinutes, busPunctuality } = loadTs('lib/bus-punctuality.ts');
const { marcelDepartureFromVehicle } = loadTs('lib/marcel-stop-punctuality.ts');
const map = loadTs('components/BusMap.tsx', {
  'react-leaflet': {}, leaflet: { divIcon: options => ({ options }) },
  'leaflet/dist/leaflet.css': {}, '@/lib/official-bus-routes': {}, '@/lib/pks-client': {},
}, '\nexport { BusMarker };');
const client = loadTs('lib/pks-client.ts', {
  '@capacitor/core': { Capacitor: { isNativePlatform: () => false } },
}, '\nexport { estimateMarcelDelaySeconds, buildMarcelRouteStops };');
const domain = loadTs('components/stops-panel/stop-domain.ts', { '@/lib/pks-client': {} });
const plannedAtMs = Date.parse('2026-10-06T13:45:00Z');
const scheduled = domain.departureFromMarcelCourseStop({ idKu: '87', nazTr: 'Rzeszów', godz: '15:45' },
  { kol: 1, godz: '15:45', nazPr: 'Example' }, '2026-10-06', 0);
const routeStop = { id: 1, name: 'Example', lat: 50, lon: 22, plannedMs: plannedAtMs, planned: new Date(plannedAtMs).toISOString() };
const vehicle = delay => ({ id: 'marcel_bus', provider: 'marcel', routeShortName: 'M', tripId: '87',
  lat: 50, lon: 22, delay, status: 'active', dataAgeSec: 0,
  routeStops: client.buildMarcelRouteStops([routeStop], delay, plannedAtMs + delay * 1000) });

test('Marcel GPS estimates show the same 5 and 9 minutes on the marker, card and stop board', () => {
  for (const [seconds, expected] of [[-285, -5], [-525, -9], [285, 5], [525, 9]]) {
    const delay = client.estimateMarcelDelaySeconds(50, 22, [routeStop], plannedAtMs + seconds * 1000);
    const bus = vehicle(delay);
    const departure = marcelDepartureFromVehicle(scheduled, [bus]);
    const card = busPunctuality(delay);
    const icon = map.getCachedBusIcon('M', bus.id, delay);
    assert.equal(departure.delayMins, expected);
    assert.equal(card.minutes, Math.abs(expected));
    assert.equal(card.status, expected < 0 ? 'early' : 'delayed');
    assert.equal(departure.realAtMs - departure.plannedAtMs, seconds * 1000);
    assert.equal(departure.realtimeSource, 'position-estimate');
    assert.match(icon.options.html, new RegExp(`>\\s*${expected > 0 ? '\\+' : '-'}${Math.abs(expected)}\\s*</div>`));
  }
  assert.equal(scheduled.delayMins, 0); // Never persist GPS estimates in the timetable cache.
});

test('minute rounding is symmetric, including half-minute ties, and below a minute stays neutral', () => {
  for (const [seconds, minutes] of [[0, 0], [59, 0], [60, 1], [89, 1], [90, 2], [269, 4], [270, 5]]) {
    for (const sign of [-1, 1]) {
      assert.equal(busDelayMinutes(seconds * sign), minutes === 0 ? 0 : minutes * sign);
    }
  }
  for (const seconds of [NaN, Infinity, -Infinity, 18_001, -18_001, -59, 0, 59]) {
    assert.equal(busPunctuality(seconds).colorClass, 'text-white');
  }
});

test('marker cache and React memo refresh exactly when the displayed rounded minute changes', () => {
  const first = map.getCachedBusIcon('M', 'cache_bus', -269);
  const next = map.getCachedBusIcon('M', 'cache_bus', -270);
  assert.notEqual(first, next);
  assert.equal(next, map.getCachedBusIcon('M', 'cache_bus', -285));
  const props = delay => ({ markerKey: 'cache_bus', vehicle: vehicle(delay), zoom: 14 });
  assert.equal(map.BusMarker.compare(props(-269), props(-270)), false);
  assert.equal(map.BusMarker.compare(props(-270), props(-285)), true);
  assert.match(map.getCachedBusIcon('M', 'threshold_bus', -60).options.html, />\s*-1\s*<\/div>/);
  assert.doesNotMatch(map.getCachedBusIcon('M', 'threshold_bus', -59).options.html, />\s*-1\s*<\/div>/);
});

test('Marcel estimates cannot attach to another course, day, stale or inactive vehicle', () => {
  const bus = vehicle(-285);
  for (const candidate of [
    { ...bus, tripId: '88' }, { ...bus, dataAgeSec: 421 }, { ...bus, status: 'break' },
    { ...bus, isHistorical: true }, { ...bus, delay: NaN }, { ...bus, delay: 18_001 },
    { ...bus, routeStops: [{ ...bus.routeStops[0], planned: '2026-10-07T13:45:00Z' }] },
  ]) assert.equal(marcelDepartureFromVehicle(scheduled, [candidate]), scheduled);
  assert.equal(marcelDepartureFromVehicle(scheduled, []), scheduled);
  const otherCarrier = { ...scheduled, carrier: { id: 'mpk' } };
  assert.equal(marcelDepartureFromVehicle(otherCarrier, [bus]), otherCarrier);
  assert.equal(marcelDepartureFromVehicle(scheduled, [vehicle(0)]).delayMins, 0);
});

test('MPK and PKS stop boards use the same minute rounding as map and card', () => {
  for (const [planned, real, expected] of [['15:45:00', '15:40:30', -5], ['15:45:00', '15:49:30', 5], ['15:45:00', '15:45:59', 0]]) {
    const mpk = domain.departureFromMpkSchedule({ line: '59', departure_time: planned, real_departure_time: real }, '2026-10-06', 0);
    assert.equal(mpk.delayMins, expected);
  }
  for (const minutes of [-4.5, 4.5, -1, 1, 0]) {
    const pks = domain.mapJourneyToDeparture({ line_name: '108', vehicle_id: 'bus', deviation: minutes, timetable_time: '2026-10-06T13:45:00Z' }, 0);
    assert.equal(pks.delayMins, busDelayMinutes(minutes * 60));
    assert.equal(pks.status, minutes === 0 ? 'on_time' : 'delayed');
  }
});
