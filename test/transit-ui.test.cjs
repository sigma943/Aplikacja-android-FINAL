const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const encodePolyline = require('./encode-polyline.cjs');
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

test('MPK HH:mm predictions keep board minutes until the next clock minute, including 1 min and <1 min', () => {
  const observed = Date.parse('2026-10-06T12:18:00Z'); // 14:18 Warsaw
  const [row] = mpkBoardEntries([{linia:'17',trip_id:4,kierunek:'Dworzec',
    czas_odjazdu:'14:18',czas_odjazdu_real:'14:21',is_past:false}], observed);
  const departure = domain.departureFromMpkSchedule(row, '2026-10-06', 0);
  for (const seconds of [0, 1, 30, 59]) {
    assert.equal(departureCountdown(departure, observed + seconds * 1000), '3 min');
  }
  assert.equal(departureCountdown(departure, observed + 60_000), '2 min');
  assert.equal(departureCountdown(departure, observed + 119_999), '2 min');
  assert.equal(departureCountdown(departure, observed + 120_000), '1 min');
  assert.equal(departureCountdown(departure, observed + 179_999), '1 min');
  assert.equal(departureCountdown(departure, observed + 180_000), '<1 min');
  assert.equal(departureCountdown(departure, observed + 239_999), '<1 min');
  assert.equal(departureIsPast(departure, observed + 240_000, 0), true);
  assert.equal(departure.delayMins, 3); // Display correction never shifts a prediction or its delay.
});

test('exact predictions retain second precision and other providers keep their existing countdown', () => {
  const now = Date.parse('2026-10-06T08:00:00Z');
  const departure = { time:'10:08',realAtMs:now + 8 * 60_000 };
  assert.equal(departureCountdown(departure, now + 1000), '7 min');
  const precise = {...departure, realtimeSource:'stop-board',boardTimePrecisionMs:0};
  assert.equal(departureCountdown({...precise,realAtMs:now + 90_000}, now), '1 min');
  assert.equal(departureCountdown({...precise,realAtMs:now + 59_000}, now), '<1 min');
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

test('closing a route panel cancels its waiter while the shared geometry finishes for reselect', async () => {
  const original = global.fetch;
  const controller = new AbortController();
  let calls = 0, release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const points = [[50,22],[50.1,22.1]];
  global.fetch = async () => {
    calls++; started();
    await new Promise(resolve => {release=resolve;});
    return new Response(JSON.stringify({trip:{legs:[{shape:encodePolyline(points)}]}}));
  };
  try {
    const {fetchRoadRouteForStops} = loadTs('lib/pks-client.ts',native,'\nexport { fetchRoadRouteForStops };');
    let saved;
    const first = fetchRoadRouteForStops(points,'same-course',{signal:controller.signal,onResolved:route=>{saved=route;}});
    const rejected = assert.rejects(first,{name:'AbortError'});
    await ready; controller.abort(); await rejected;
    const second = fetchRoadRouteForStops(points,'same-course');
    release();
    const replacement = await second;
    assert.deepEqual(replacement,points);
    assert.deepEqual(saved,points,'the closed selection still saves its completed shape');
    assert.equal(calls,1);
    assert.deepEqual(await fetchRoadRouteForStops(points,'same-course'),replacement);
    assert.equal(calls,1);
  } finally {global.fetch=original;}
});
