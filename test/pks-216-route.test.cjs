const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),load=require('./load-ts.cjs');
const fixture=require('./fixtures/pks-216-wolka-route.json'),snapshot=require('../public/data/pks-stop-points.json'),index=require('../public/data/bus-routes/pks.json');
const {formatPksStops,snapshotStopItems,verifiedCachedPksStops}=load('lib/providers/pks-stops.ts');
const {reconcileRouteStopCoordinates}=load('lib/reconcile-route-stops.ts');
const {roadRouteMatchesStops}=load('lib/bus-road-geometry.ts');
const {correctPksStop}=load('lib/pks-stop-corrections.ts');
test('PKS 216 / vehicle 108: corrected source pins and missing GPS recover the full exact course offline',async()=>{
 const {tripId,stopIds}=fixture,shape=require('../public/data/bus-routes/pks/230.json');
 const original=stopIds.flatMap(id=>snapshot.stops[id].lat?[[snapshot.stops[id].lat,snapshot.stops[id].lon]]:[]);
 assert.equal(roadRouteMatchesStops(shape,original,180),false,'reproduce rejected original course');
 const fresh=formatPksStops({items:snapshotStopItems(snapshot)},snapshot);
 const cached=verifiedCachedPksStops(snapshot.stops,snapshot);
 const target=index.patterns[index.tripPatterns[tripId]].map(id=>index.stops[id]);
 const before=global.fetch,requests=[];global.fetch=async url=>{requests.push(String(url));return new Response(fs.readFileSync('public'+url));};
 try {
  for(const catalog of [fresh,cached]){
   const live=stopIds.map(id=>({id,name:catalog[id].n,lat:catalog[id].lat,lon:catalog[id].lon}));
   const fixed=reconcileRouteStopCoordinates(live,target);
   assert.equal(fixed.length,40);assert.ok(fixed.every(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lon)),'all stops have GPS, including 11118');
   assert.equal(roadRouteMatchesStops(shape,fixed.map(s=>[s.lat,s.lon]),180),true);
   const route=await load('lib/official-bus-routes.ts').officialBusRoute('pks',tripId,stopIds,fixed.map(s=>[s.lat,s.lon]),{completePattern:true,coordinateStopIds:stopIds});
   assert.ok(route.length>1000,'complete operator road shape without remote routers');
   assert.deepEqual(route,shape);
  }
  assert.ok(requests.every(u=>u.startsWith('/data/bus-routes/')));
 }finally{global.fetch=before;}
});
test('corrections do not affect reused IDs, other platform sides or relocated stops',()=>{
 for(const id of ['11104','9226','2851']){
  const source=snapshot.stops[id],fixed=correctPksStop(source,id);
  assert.notEqual(fixed,source);
  for(const patch of [{n:'Inny przystanek'},{areaId:'other'},{code:'99'},{lat:49}]){
   const changed={...source,...patch};assert.equal(correctPksStop(changed,id),changed);
  }
 }
});
