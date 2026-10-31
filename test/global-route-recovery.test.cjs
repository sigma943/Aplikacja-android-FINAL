const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),load=require('./load-ts.cjs');
const {buildBusRoadNetwork,prepareBusRoadNetwork}=require('../scripts/build-bus-road-network.cjs');
const {routeOnBusRoadNetwork}=load('lib/bus-road-network.ts'),{roadRouteMatchesStops}=load('lib/bus-road-geometry.ts');
test('directed operator roads recover a new stop pattern without inventing connectors, crossing gaps or reversing one-way roads',()=>{
 const a=[50,22],b=[50.001,22],c=[50.002,22],d=[50.001,22.001];
 const network=buildBusRoadNetwork([[a,b,c],[b,d,c]]);
 assert.ok(routeOnBusRoadNetwork(network,[a,d,c]).length>=4);
 assert.deepEqual(routeOnBusRoadNetwork(network,[c,a]),[]);
 assert.deepEqual(routeOnBusRoadNetwork(buildBusRoadNetwork([[a,b],[[50.00105,22],c]]),[a,c]),[],'5m gaps are not connected');
 assert.deepEqual(routeOnBusRoadNetwork(network,[a,[51,23],c]),[],'uncovered stops cannot be skipped');
});
test('all captured active PKS courses resolve offline through shared reconciliation and operator road recovery',async()=>{
 const snapshot=require('../public/data/pks-stop-points.json'),fleet=require('./fixtures/pks-fleet-routes.json');
 const {formatPksStops,snapshotStopItems}=load('lib/providers/pks-stops.ts'),dict=formatPksStops({items:snapshotStopItems(snapshot)},snapshot);
 const network=prepareBusRoadNetwork(),previous=global.fetch;
 global.fetch=async url=>{assert.ok(String(url).startsWith('/data/'));return new Response(fs.readFileSync('public'+url));};
 try{
  const api=load('lib/official-bus-routes.ts');let recovered=0;
  for(const v of fleet){
   const live=v.stopIds.map(id=>({id,name:dict[id]?.n||'Przystanek '+id,lat:dict[id]?.lat,lon:dict[id]?.lon}));
   const fixed=await api.resolvePksRouteStops(v.tripId,live),known=fixed.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lon));
   const coords=known.map(s=>[s.lat,s.lon]);
   assert.ok(known.length>=live.length*.7,'sufficient GPS coverage '+v.tripId);
   let route=await api.officialBusRoute('pks',v.tripId,v.stopIds,coords,{completePattern:true,coordinateStopIds:known.map(s=>s.id)});
   let tolerance=180;
   if(route.length<2){route=routeOnBusRoadNetwork(network,coords);recovered++;tolerance=60;}
   assert.ok(roadRouteMatchesStops(route,coords,tolerance),'complete ordered road route: '+JSON.stringify({line:v.line,vehicle:v.vehicleId,trip:v.tripId}));
  }
  assert.equal(fleet.length,82);assert.ok(recovered>0,'test must exercise the generic network fallback');
 }finally{global.fetch=previous;}
});
