const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),load=require('./load-ts.cjs');
const {tripId,stopIds}=require('./fixtures/pks-312-bugaj-route.json');
const snapshot=require('../public/data/pks-stop-points.json'),index=require('../public/data/bus-routes/pks.json');
const {correctPksStop}=load('lib/pks-stop-corrections.ts');
const {roadRouteMatchesStops,roadDistance}=load('lib/bus-road-geometry.ts');
const shape=require('../public/data/bus-routes/pks/658.json');
const pattern=index.patterns[index.tripPatterns[tripId]];
const raw=stopIds.map((id,n)=>{const stop=snapshot.stops[id],official=index.stops[pattern[n]];return {...stop,lat:stop.lat??official.lat,lon:stop.lon??official.lon};});
test('PKS 312 vehicle 46: identity-checked corrections restore all 37 stops on the complete bundled road route',async()=>{
 assert.equal(roadRouteMatchesStops(shape,raw.map(s=>[s.lat,s.lon]),180),false,'reproduce the rejected 312 geometry');
 const fixed=raw.map((s,n)=>correctPksStop(s,String(stopIds[n]))),coords=fixed.map(s=>[s.lat,s.lon]);
 assert.equal(roadRouteMatchesStops(shape,coords,180),true);
 for(const id of [9737,9739]){const n=stopIds.indexOf(id);assert.ok(roadDistance([raw[n].lat,raw[n].lon],coords[n])>290);}
 const previous=global.fetch;global.fetch=async url=>new Response(fs.readFileSync('public'+url));
 try{const {officialBusRoute}=load('lib/official-bus-routes.ts');const result=await officialBusRoute('pks',tripId,stopIds,coords);assert.deepEqual(result,shape);assert.equal(result.length,1127);}
 finally{global.fetch=previous;}
});
test('PKS 312 corrected coordinates apply to live and old cached stops, never another identity or a relocated stop',()=>{
 const client=load('lib/providers/pks-stops.ts');
 for(const id of ['9737','9739']){
  const source=snapshot.stops[id],fixed=correctPksStop(source,id);
  assert.notEqual(fixed,source);
  const api={stop_point_id:Number(id),stop_area_id:Number(source.areaId),stop_point_code:source.code,name:source.n,location:{lat:source.lat,lon:source.lon}};
  for(const result of [client.formatPksStops({items:[api]},snapshot)[id],client.verifiedCachedPksStops({[id]:source},snapshot)[id]])assert.deepEqual([result.lat,result.lon],[fixed.lat,fixed.lon]);
  for(const change of [{code:'99'},{areaId:'other'},{n:'Inny przystanek'},{lat:50,lon:22}]){const other={...source,...change};assert.equal(correctPksStop(other,id),other);}
  assert.equal(snapshot.stops[id],source,'do not mutate raw coordinates');
 }
});
