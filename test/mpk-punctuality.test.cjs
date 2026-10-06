const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { mpkBoardEntries } = loadTs('lib/mpk-departures.ts');
const { busPunctuality } = loadTs('lib/bus-punctuality.ts');
const stops = loadTs('components/stops-panel/stop-domain.ts', {
  '@/Panel/src/components/StopList': {}, '@/Panel/src/components/BusStopDetail': {},
  '@/lib/pks-client': { fetchVehicleDetailsClient: async () => null },
});

test('MPK 913 has the same six-minute delay on the map, stop board and route schedule', async () => {
  const originalFetch = global.fetch;
  const raw = { nb: '913', nr: '59', x: '22.003', y: '50.042', o: '-360', s: '1', timestamp: String(Math.floor(Date.now() / 1000)) };
  const detail = { nb: '913', nr: '59', delay: -360, status: '1', trip_id: '234058' };
  const trip = { stops: [{ stop_id: 63, stop_name: 'Trembeckiego ZTM', departure_time: '15:19:00', stop_lat: '50.05', stop_lon: '22.01' }] };
  global.fetch = async url => {
    const target = String(url);
    const data = target.includes('get_trip_stops_advanced') ? trip
      : target.includes('/mpk/get_vehicles.php') ? [detail]
      : target.includes('api.php?type=mpk') ? { 913: raw } : [];
    return new Response(JSON.stringify(data));
  };
  try {
    const client = loadTs('lib/pks-client.ts', { '@capacitor/core': { Capacitor: { isNativePlatform: () => false } } });
    const [vehicle] = await client.fetchVehiclesClient(false, ['mpk_rzeszow']);
    const panel = await client.fetchVehicleDetailsClient('mpk_rzeszow', 'mpk_rzeszow_913');
    const [entry] = mpkBoardEntries([{ trip_id: '234058', nb: '913', linia: '59', kierunek: 'Trembeckiego ZTM', czas_odjazdu: '15:19', czas_odjazdu_real: '15:25' }]);
    const departure = stops.departureFromMpkSchedule(entry, '2026-10-06', 0);
    assert.equal(vehicle.delay, 360);
    assert.equal(panel.delay, 360);
    assert.equal(departure.delayMins, vehicle.delay / 60);
    assert.equal(departure.status, 'delayed');
    assert.equal(busPunctuality(vehicle.delay).status, 'delayed');
    assert.equal(busPunctuality(vehicle.delay).minutes, 6);
    assert.equal(busPunctuality(vehicle.delay).colorClass, 'text-rose-500');
    const routeStop = panel.routeStops[0];
    assert.equal(Date.parse(routeStop.real) - Date.parse(routeStop.planned), 360_000);
  } finally {
    global.fetch = originalFetch;
  }
});

test('MPK normalizes both delay directions once in the client and backend', () => {
  const client = loadTs('lib/pks-client.ts', { '@capacitor/core': { Capacitor: { isNativePlatform: () => false } } }, '\nexport { getEffectiveMpkDelay };');
  const backend = loadTs('functions/src/transport/mpk-rzeszow-provider.ts', {}, '\nexport { getEffectiveMpkDelay };');
  for (const normalize of [client.getEffectiveMpkDelay, backend.getEffectiveMpkDelay]) {
    assert.equal(normalize(-360, '1'), 360);
    assert.equal(normalize(360, '1'), -360);
    assert.equal(normalize(0, '1'), 0);
    assert.equal(normalize(-360, '2'), 0);
    assert.equal(normalize(360, '3'), 0);
    assert.equal(normalize(NaN, '1'), 0);
    assert.equal(normalize(-18_001, '1'), 0);
  }
});

test('on-time stop times stay white on either side of zero until a full minute', () => {
  for (const seconds of [-59, -30, 0, 30, 59]) {
    const punctuality = busPunctuality(seconds);
    assert.equal(punctuality.status, 'on_time');
    assert.equal(punctuality.minutes, 0);
    assert.equal(punctuality.colorClass, 'text-white');
  }
  assert.equal(busPunctuality(-60).colorClass, 'text-emerald-500');
  assert.equal(busPunctuality(60).colorClass, 'text-rose-500');
  assert.equal(busPunctuality(0, 'text-slate-900').colorClass, 'text-slate-900');
});
