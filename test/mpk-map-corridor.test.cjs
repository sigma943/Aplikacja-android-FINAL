const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),load=require('./load-ts.cjs');
const {mpkRouteForPaint}=load('lib/map/mpk-route-paint.ts');
const index=require('../public/data/bus-routes/mpk_rzeszow.json'),feed=require('../public/data/journeys/mpk.json');
const pins=Object.values(index.stops).map(s=>[s.lat,s.lon]);
test('all packaged MPK 28 variants lose only short stop-pin spurs without moving original data',()=>{
 const shapes=[...new Set(feed.trips.filter(t=>String(t[1])==='28').map(t=>index.tripShapes[t[0]]).filter(Boolean))];assert.equal(shapes.length,8);
 for(const shape of shapes){const route=JSON.parse(fs.readFileSync('public/data/bus-routes/mpk_rzeszow/'+shape+'.json')),before=JSON.stringify(route),clean=mpkRouteForPaint(route,'mpk_rzeszow',pins);
  assert.ok(clean.length<route.length,shape+' has corrected pin spurs');assert.ok(clean.length>route.length*.85,'ordinary road geometry remains');assert.equal(JSON.stringify(route),before);assert.deepEqual(clean[0],route[0]);assert.deepEqual(clean.at(-1),route.at(-1));assert.ok(clean.every(p=>route.includes(p)));assert.deepEqual(mpkRouteForPaint(clean,'mpk_rzeszow',pins),clean,'idempotent '+shape);
 }
});
test('PKS, Marcel, rail, real bends and return legs are preserved',()=>{
 const route=[[50,22],[50.0001,22],[50.00015,22.00015],[50.0002,22],[50.0003,22]];
 for(const provider of ['pks','marcel','pkp_intercity',undefined])assert.equal(mpkRouteForPaint(route,provider,[route[2]]),route);
 const corner=[[50,22],[50.0001,22],[50.0002,22],[50.0002,22.0001],[50.0002,22.0002]];
 assert.deepEqual(mpkRouteForPaint(corner,'mpk_rzeszow',[corner[2]]),corner);
 const hairpin=[[50,22],[50.0001,22],[50.0002,22],[50.0001,22.00002],[50,22.00002]];
 assert.deepEqual(mpkRouteForPaint(hairpin,'mpk_rzeszow',[hairpin[2]]),hairpin);
});
