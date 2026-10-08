const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const loadTs = require('./load-ts.cjs');

const snapshot = JSON.parse(fs.readFileSync('public/data/pks-stop-points.json', 'utf8'));
const gtfs = JSON.parse(fs.readFileSync('public/data/bus-routes/pks.json', 'utf8')).stops;
const ids = ['1017', '1018', '11124'];
const raw = () => ids.map(id => ({id, name: snapshot.stops[id].n + ' ' + snapshot.stops[id].code,
  ...snapshot.stops[id], lines: id === '1017' ? ['293'] : ['108']}));
const {buildStopsCatalog} = loadTs('lib/stops-catalog.ts', {'@/lib/pks-client': {}});

test('Boguchwala legacy terminal alias produces one roadside platform and a separate actual terminal on both surfaces', () => {
  const old = loadTs('lib/stops-catalog.ts', {'@/lib/pks-client': {}, './pks-stop-corrections': {correctPksStop: s => s}});
  assert.equal(old.buildStopsCatalog(raw(), [], [], 'boguchwala-before').length, 3, 'reproduce the uploaded duplicate');
  const list = buildStopsCatalog(raw(), [], [], 'boguchwala-fixed');
  const map = buildStopsCatalog(raw(), [], [], 'boguchwala-fixed', true);
  assert.equal(list.length, 2);
  assert.deepEqual(map.map(s => s.providerStopIds), list.map(s => s.providerStopIds));
  const roadside = map.find(s => s.providerStopIds.pks.includes('11124'));
  assert.equal(roadside.name, 'Boguchwała 68');
  assert.deepEqual([roadside.lat, roadside.lon], [gtfs['71'].lat, gtfs['71'].lon]);
  assert.deepEqual(roadside.providerStopIds.pks.split(',').sort(), ['1017', '11124']);
  assert.deepEqual(roadside.lines, ['108', '293']);
  assert.deepEqual(roadside.pksStopPoints.map(p => [p.id, p.areaId, p.code]), [['1017', '650', '68'], ['11124', '4219', '68']]);
  const terminal = map.find(s => s.providerStopIds.pks === '1018');
  assert.match(terminal.name, /D\.A/);
  assert.deepEqual([terminal.lat, terminal.lon], [gtfs['47'].lat, gtfs['47'].lon]);
  const markers = loadTs('lib/map-stop-markers.ts');
  assert.equal(markers.visibleMapStops(map, [21.944, 49.984, 21.947, 49.986], 18).length, 1);
  for (const id of ['1017', '11124']) assert.equal(markers.canonicalMapStopId(map, 'pks:' + id), roadside.id);
});

test('fresh API and existing offline cache correct the obsolete name without mutating records or losing timetable IDs', () => {
  const client = loadTs('lib/providers/pks-stops.ts', {'@capacitor/core': {Capacitor: {isNativePlatform: () => false}}});
  const items = ids.map(id => ({stop_point_id: id, stop_area_name: snapshot.stops[id].n,
    stop_area_id: snapshot.stops[id].areaId, stop_point_code: snapshot.stops[id].code, location: snapshot.stops[id]}));
  assert.equal(client.formatPksStops({items}, snapshot)['1017'].n, 'Boguchwała 68');
  const old = {n: 'Boguchwała D.A. 68', areaId: '650', code: '68', lat: gtfs['71'].lat, lon: gtfs['71'].lon};
  const cached = {'1017': old};
  const corrected = client.verifiedCachedPksStops(cached, snapshot);
  assert.equal(corrected['1017'].n, 'Boguchwała 68', 'name must migrate even when cached coordinates are already correct');
  assert.equal(old.n, 'Boguchwała D.A. 68');
  assert.notEqual(corrected, cached);
});

test('identity correction never relabels the actual terminal, another locality or a reused technical ID', () => {
  const {correctPksStop} = loadTs('lib/pks-stop-corrections.ts');
  const original = {name: 'Boguchwała D.A. 68', areaId: '650', code: '68', lat: 49.984953, lon: 21.945522};
  for (const stop of [{...original, areaId: '999'}, {...original, code: '01'},
    {...original, name: 'Boguchwała szkoła 68'}, {...original, lat: 50.04, lon: 22}]) {
    assert.equal(correctPksStop(stop, '1017'), stop);
  }
  assert.equal(correctPksStop(original, '1018'), original);
  const corrected = correctPksStop(original, '1017');
  assert.equal(correctPksStop(corrected, '1017'), corrected, 'repeated cache reads keep an already-correct record');
});

test('merged roadside stop still requests departures from both PKS IDs and their distinct areas', async () => {
  const roadside = buildStopsCatalog(raw(), [], [], 'boguchwala-departures').find(s => s.name === 'Boguchwała 68');
  const calls = [];
  const {loadStopDepartures} = loadTs('lib/stop-departures.ts', {'@/lib/pks-client': {
    fetchDeparturesClient: async (id, areaId, code) => {calls.push([id, areaId, code]); return {journeys: []};},
  }});
  await loadStopDepartures(roadside);
  assert.deepEqual(calls.sort(), [['1017', '650', '68'], ['11124', '4219', '68']]);
});
