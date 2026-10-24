const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
const {roadRouteMatchesStops,routedRoadRouteMatchesStops,joinRouteChunks,preferRoadCorridor}=load('lib/bus-road-geometry.ts');

test('inferred routing rejects a parallel street 111m from the stop without changing legacy shape tolerance',()=>{
  const a=[50,22],b=[50,22.01],c=[50,22.02];
  const parallel=[a,[50.001,22],[50.001,22.02],c];
  assert.equal(roadRouteMatchesStops(parallel,[a,b,c],180),true);
  assert.equal(routedRoadRouteMatchesStops(parallel,[a,b,c]),false);
  assert.equal(routedRoadRouteMatchesStops([a,b,c],[a,b,c]),true);
});

test('shortcuts preserve a real stop access 111m off the main road and return legs',()=>{
  const a=[50,22],b=[50,22.01],stop=[50.001,22.01],c=[50,22.02];
  const access=[a,b,stop,b,c],direct=[a,b,c];
  assert.equal(preferRoadCorridor(access,direct,[a,stop,c]),access);
  assert.equal(preferRoadCorridor(access,direct,[a,b,a,c]),access);
  // A router artifact without a stop on it can still be removed.
  assert.equal(preferRoadCorridor(access,direct,[a,b,c]),direct);
});

test('chunk boundaries reject straight connectors across 55m gaps and opposite lanes',()=>{
  const a=[50,22],b=[50,22.01],c=[50,22.02];
  for(const offset of [.0005,.0001])
    assert.throws(()=>joinRouteChunks([[a,b],[[50+offset,22.01],c]]),/Disconnected/);
  assert.deepEqual(joinRouteChunks([[a,b],[b,c]]),[a,b,c]);
  assert.equal(joinRouteChunks([[a,b],[[50.000001,22.01],c]]).length,4,'submetre encoding noise is allowed');
});

test('validated bus primary wins over a faster car backup within its deadline',async()=>{
  const {roadRouteWithFallback}=load('lib/transport/road-route-fallback.ts');
  let primaryResolve,backupResolve;
  const result=roadRouteWithFallback(()=>new Promise(resolve=>{primaryResolve=resolve;}),()=>new Promise(resolve=>{backupResolve=resolve;}),0,1000);
  await new Promise(resolve=>setTimeout(resolve,5));
  backupResolve('car');
  await new Promise(resolve=>setImmediate(resolve));
  primaryResolve('bus');
  assert.equal(await result,'bus');
});

test('ready car backup is released on bus failure or bounded preference timeout',async()=>{
  const {roadRouteWithFallback}=load('lib/transport/road-route-fallback.ts');
  let failPrimary;
  const result=roadRouteWithFallback(()=>new Promise((_,reject)=>{failPrimary=reject;}),async()=> 'car',0,1000);
  await new Promise(resolve=>setTimeout(resolve,5));
  failPrimary(Error('bus unavailable'));
  assert.equal(await result,'car');
  assert.equal(await roadRouteWithFallback(()=>new Promise(()=>{}),async()=> 'car',0,5),'car');
});

test('course-specific geometry never reads another course cache with the same stops',async()=>{
  const {routeGeometryKey}=load('lib/route-geometry-key.ts');
  const {preferredLocalRoute}=load('lib/map/preferred-route.ts');
  const stops=[[50,22],[50.02,22]],a=[stops[0],[50.01,22.001],stops[1]];
  const key=course=>routeGeometryKey('road','pks','301','Rzeszów',stops.map(([lat,lon])=>({lat,lon})),course);
  const cache=new Map([[key('one'),a]]);
  assert.notEqual(key('one'),key('two'));
  assert.deepEqual(await preferredLocalRoute({mode:'road',stops,bundled:async()=>[],cached:async()=>cache.get(key('two'))||[]}),[]);
  assert.deepEqual(await preferredLocalRoute({mode:'road',stops,bundled:async()=>[],cached:async()=>cache.get(key('one'))||[]}),a);
});
