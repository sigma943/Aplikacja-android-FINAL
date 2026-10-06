const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { warsawTimeMs, warsawDateIso } = loadTs('lib/transit-time.ts');
const { withRequestDeadline } = loadTs('lib/request-deadline.ts');
const { mpkServicesOnDate, mpkBoardEntries } = loadTs('lib/mpk-departures.ts');
const calendar = require('../public/data/mpk-service-calendar.json');
const rbac = loadTs('lib/admin/rbac.ts');
const stops = loadTs('components/stops-panel/stop-domain.ts', {
  '@/Panel/src/components/StopList': {}, '@/Panel/src/components/BusStopDetail': {}, '@/lib/pks-client': { fetchVehicleDetailsClient: async () => null },
});

test('Warsaw times do not depend on device timezone, including winter and GTFS hours > 23', () => {
  assert.equal(new Date(warsawTimeMs('2026-10-05', '15:46')).toISOString(), '2026-10-05T13:46:00.000Z');
  assert.equal(new Date(warsawTimeMs('2026-12-05', '15:46')).toISOString(), '2026-12-05T14:46:00.000Z');
  assert.equal(new Date(warsawTimeMs('2026-10-24', '25:10')).toISOString(), '2026-10-24T23:10:00.000Z');
  assert.equal(warsawDateIso(1, new Date('2026-10-04T22:30:00Z')), '2026-10-06');
});

test('official MPK calendar selects school, Saturday, Sunday and holiday exceptions', () => {
  assert.deepEqual(mpkServicesOnDate(calendar, '2026-10-05'), ['2']);
  assert.deepEqual(mpkServicesOnDate(calendar, '2026-10-10'), ['3']);
  assert.deepEqual(mpkServicesOnDate(calendar, '2026-10-11'), ['4']);
  assert.deepEqual(mpkServicesOnDate(calendar, '2026-11-11'), ['4']);
  assert.deepEqual(mpkServicesOnDate(calendar, '2030-01-01'), []);
});

test('MPK board prediction is displayed at the exact stop-board time', async () => {
  const [entry] = mpkBoardEntries([{ trip_id: 123, linia: '46', kierunek: 'Dworzec', czas_odjazdu: '15:46', czas_odjazdu_real: '15:51' }]);
  const departure = stops.departureFromMpkSchedule(entry, '2026-10-05', 0);
  assert.equal(departure.time, '15:51');
  assert.equal(departure.delayMins, 5);
  assert.equal(departure.realtimeSource, 'stop-board');
  assert.deepEqual(mpkBoardEntries([{ linia: '46', czas_odjazdu: '15:46', is_last_stop: true }]), []);

});

function stop(provider, id, name, extra = {}) {
  return { id, name, type: 'bus', lines: [], carriers: [{ id: provider }], isFavorite: false,
    sourceProviderIds: [provider], providerStopIds: { [provider]: id }, ...extra };
}
test('identical names without GPS and Polish spelling variants consolidate', () => {
  assert.equal(stops.shouldMergeStopsByGps(stop('pks','a','Rzeszów Boguchwała 01'), stop('mpk_rzeszow','b','Rzeszow Boguchwala 1')), true);
  assert.equal(stops.shouldMergeStopsByGps(stop('pks','a','Rzeszów Warszawska'), stop('mpk_rzeszow','b','Warszawska')), true);
  assert.equal(stops.shouldMergeStopsByGps(stop('pks','a','Rzeszów Warszawska 01'), stop('mpk_rzeszow','b','Warszawska 02')), false);
  assert.equal(stops.shouldMergeStopsByGps(stop('pks','a','Boguchwała szkoła'), stop('mpk_rzeszow','b','Czudec szkoła')), false);
});
test('merged stop keeps PKS name and exact PKS point/area/code pairs', () => {
  const left = stop('pks','a','Rzeszów D.A. st. 1', { pksStopPoints: [{ id:'a', areaId:'x', code:'01' }] });
  const right = stop('marcel','b','Rzeszów Dworzec Autobusowy (Marcel)');
  const merged = stops.mergeStopsCluster([right,left]);
  assert.equal(merged.name,left.name);
  assert.deepEqual(merged.pksStopPoints,left.pksStopPoints);
  assert.deepEqual(new Set(merged.sourceProviderIds),new Set(['pks','marcel']));
});
test('modern revoked permission does not come back through legacy flag', () => {
  assert.equal(rbac.buildDevicePermissions('admin',{ ban:false, canBan:true }).canBan,false);
  assert.equal(rbac.buildDevicePermissions('admin',{ canBan:true }).ban,true);
  assert.equal(rbac.canAccessAdminDashboard('admin',{}),true);
  assert.equal(rbac.canAccessAdminDashboard('user',{ monitor:true }),false);
});
test('native requests release callers on abort and deadline', async () => {
  const controller = new AbortController();
  const request = withRequestDeadline(() => new Promise(() => {}), controller.signal);
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
  await assert.rejects(withRequestDeadline(() => new Promise(() => {}), undefined, 10), { name:'AbortError' });
});

test('today MPK uses server service ID and merges board predictions with schedule', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    let data;
    if (String(url).includes('get_current_service')) data = { service_ids: [2], date_used: warsawDateIso().replace(/-/g,'') };
    else if (String(url).includes('departures.php')) data = [{ trip_id:123, linia:'46', kierunek:'Dworzec', czas_odjazdu:'15:46', czas_odjazdu_real:'15:51' }];
    else data = { schedule:{ '46':[{ trip_id:123,line:'46',departure_time:'15:46:30' },{ trip_id:124,line:'46',departure_time:'17:01:00' }] }};
    return new Response(JSON.stringify(data));
  };
  try {
    const client = loadTs('lib/pks-client.ts', { '@capacitor/core': { Capacitor: { isNativePlatform:()=>false } }});
    const result = await client.fetchMpkRzeszowDeparturesClient('1119',warsawDateIso());
    assert.equal(result.length,2);
    assert.equal(result.find(entry=>entry.trip_id===123).real_departure_time,'15:51');
    assert.ok(calls.some(url=>url.includes('service_id=2')));
  } finally { global.fetch = originalFetch; }
});

test('a slow provider does not hold back PKS markers', async () => {
  const originalFetch = global.fetch;
  let finishMarcel;
  const pendingMarcel = new Promise(resolve => { finishMarcel = resolve; });
  const seen = [];
  global.fetch = async url => {
    if (String(url).includes('marcel')) return pendingMarcel;
    return new Response(JSON.stringify([{vehicle_id:'1',position:{lat:50.04,lon:22.0},line_name:'233'}]));
  };
  try {
    const client = loadTs('lib/pks-client.ts', { '@capacitor/core': { Capacitor:{isNativePlatform:()=>false} }});
    const all = client.fetchVehiclesClient(false,['pks','marcel'],{onProviderLoaded:(provider, vehicles)=>seen.push({provider,vehicles})});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(seen[0]?.provider,'pks');
    assert.equal(seen[0]?.vehicles.length,1);
    finishMarcel(new Response('[]'));
    await all;
  } finally { global.fetch=originalFetch; }
});

test('future MPK dates use calendar exceptions and never fetch today board', async () => {
  const originalFetch = global.fetch;
  const calls=[];
  global.fetch=async url => {
    calls.push(String(url));
    return new Response(JSON.stringify(String(url).includes('mpk-service-calendar') ? calendar : {schedule:{}}));
  };
  try {
    const client=loadTs('lib/pks-client.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}}});
    await client.fetchMpkRzeszowDeparturesClient('1119','2026-11-11');
    assert.ok(calls.some(url=>url.includes('service_id=4')));
    assert.ok(calls.every(url=>!url.includes('departures.php')&&!url.includes('get_current_service')));
  } finally { global.fetch=originalFetch; }
});
