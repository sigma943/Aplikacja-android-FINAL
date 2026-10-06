const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { upcomingVehicleStops } = loadTs('lib/vehicle-upcoming-stops.ts');
const { departureCountdown, departureIsPast } = loadTs('lib/departure-display.ts');
const { mpkBoardEntries } = loadTs('lib/mpk-departures.ts');
const domain = loadTs('components/stops-panel/stop-domain.ts', { '@/lib/pks-client': {} });
const native = { '@capacitor/core': { Capacitor: { isNativePlatform: () => false } } };

test('bus panel shows only the upcoming suffix, including a later return on a loop', () => {
  const stops = [
    { id: 1, planned: '2026-10-06T07:59:00Z' },
    { id: 2, planned: '2026-10-06T08:01:00Z' },
    { id: 1, planned: '2026-10-06T08:05:00Z' },
  ];
  assert.deepEqual(upcomingVehicleStops(stops, Date.parse('2026-10-06T08:00:00Z'), 1).map(s => s.id), [2, 1]);
  assert.deepEqual(upcomingVehicleStops(stops, Date.parse('2026-10-06T08:06:00Z')), []);
  assert.deepEqual(upcomingVehicleStops([{ id: 1 }, { id: 2 }, { id: 3 }], 1, 2).map(s => s.id), [3]);
});

test('MPK minute precision keeps an imminent bus visible throughout its departure minute', () => {
  const observed = Date.parse('2026-10-06T08:00:30Z');
  const [row] = mpkBoardEntries([{ linia: '17', trip_id: 4, kierunek: 'Dworzec',
    czas_odjazdu: '10:00', czas_odjazdu_real: '10:00', is_past: false }], observed);
  const departure = domain.departureFromMpkSchedule(row, '2026-10-06', 0);
  assert.equal(departureIsPast(departure, observed, 0), false);
  assert.equal(departureCountdown(departure, observed), '<1 min');
  assert.equal(departureIsPast(departure, observed + 30_000, 0), true);
});

test('MPK countdown uses floor at minute boundaries and preserves 1 min and <1 min', () => {
  const now = Date.parse('2026-10-06T08:00:00Z');
  const departure = { time: '10:08', realtimeSource: 'stop-board', realAtMs: now + 8 * 60_000 };
  assert.equal(departureCountdown(departure, now + 1000), '7 min');
  assert.equal(departureCountdown({ ...departure, realAtMs: now + 90_000 }, now), '1 min');
  assert.equal(departureCountdown({ ...departure, realAtMs: now + 59_000 }, now), '<1 min');
});

test('departed board rows cannot be revived; fresh at-stop rows remain visible', () => {
  const now = Date.now();
  const row = { time: '10:00', realtimeSource: 'stop-board', realAtMs: now - 120_000,
    boardAtStop: true, boardObservedAtMs: now };
  assert.equal(departureIsPast(row, now, 0), false);
  assert.equal(departureIsPast({ ...row, boardIsPast: true }, now, 0), true);
  assert.equal(departureIsPast(row, now + 46_000, 0), true);
  assert.equal(departureIsPast({ ...row, realtimeSource: undefined }, now, 0), true);
});

test('Marcel fleet polling avoids per-bus route downloads; selection loads only that course', async () => {
  const original = global.fetch;
  const calls = [];
  const vehicles = Array.from({ length: 100 }, (_, i) => ({ idKu: 100 + i, szGps: 50, dlGps: 22, nazTr: 'Krosno-Rzeszów' }));
  const stops = [{ kol: 1, szGps: 50, dlGps: 22, godz: '09:40', nazPr: 'Początek' },
    { kol: 2, szGps: 50.1, dlGps: 22.1, godz: '10:40', nazPr: 'Koniec' }];
  global.fetch = async url => {
    calls.push(String(url));
    return new Response(JSON.stringify(String(url).includes('/kurs/') ? stops : vehicles));
  };
  try {
    const api = loadTs('lib/pks-client.ts', native);
    assert.equal((await api.fetchVehiclesClient(true, ['marcel'])).length, 100);
    assert.equal(calls.length, 1);
    const selected = await api.fetchVehicleDetailsClient('marcel', 'marcel_142');
    assert.equal(selected.id, 'marcel_142');
    assert.equal(selected.routeStops.length, 2);
    assert.equal(calls.filter(url => url.includes('/kurs/')).length, 1);
    assert.ok(calls.some(url => url.includes('/kurs/142?')));
  } finally { global.fetch = original; }
});

test('an aborted road route does not poison a replacement request with the same cache key', async () => {
  const original = global.fetch;
  const controller = new AbortController();
  let calls = 0;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  global.fetch = async (url, options) => {
    calls++;
    if (calls === 1) {
      started();
      return new Promise((resolve, reject) => options.signal.addEventListener('abort',
        () => reject(new DOMException('aborted', 'AbortError')), { once: true }));
    }
    return new Response(JSON.stringify({ trip: { legs: [{ shape: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' }] } }));
  };
  try {
    const { fetchRoadRouteForStops } = loadTs('lib/pks-client.ts', native, '\nexport { fetchRoadRouteForStops };');
    const points = [[50, 22], [50.1, 22.1]];
    const first = fetchRoadRouteForStops(points, 'same-course', { signal: controller.signal });
    const rejected = assert.rejects(first, { name: 'AbortError' });
    await ready;
    controller.abort();
    const replacement = await fetchRoadRouteForStops(points, 'same-course');
    await rejected;
    assert.ok(replacement.length > 1);
    assert.equal(calls, 2);
    assert.deepEqual(await fetchRoadRouteForStops(points, 'same-course'), replacement);
    assert.equal(calls, 2);
  } finally { global.fetch = original; }
});
