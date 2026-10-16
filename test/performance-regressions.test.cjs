const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
test('fleet reconciliation preserves unchanged identities and detects every nested feed change',()=>{
 const {reconcileVehicles}=load('lib/vehicle-reconcile.ts');
 const original=[{id:'1',provider:'pks',lat:50,lon:22,name:'108',routeStops:[{id:1,name:'A',planned:'10:00'}]},{id:'1',provider:'marcel',lat:50,lon:22,name:'M'}];
 assert.equal(reconcileVehicles(original,structuredClone(original)),original);
 for(const patch of [{delay:-60},{dataAgeSec:90},{status:'break'},{nextTripStartAtMs:1234},{routeStops:[{id:1,name:'A',planned:'10:01'}]}]){
  const incoming=structuredClone(original);Object.assign(incoming[0],patch);const next=reconcileVehicles(original,incoming);
  assert.deepEqual(next,incoming);assert.notEqual(next[0],original[0]);assert.equal(next[1],original[1]);
 }
 const reversed=reconcileVehicles(original,[...original].reverse());assert.deepEqual(reversed,[original[1],original[0]]);
 assert.deepEqual(reconcileVehicles(original,[]),[]);
});
test('prebuilt platform index returns the same coordinates as runtime indexing for all local stops',()=>{
 const {createPlatformIndex,createPlatformResolver}=load('lib/stop-platform-position.ts');
 const points=require('../public/data/stop-platforms.json').points;
 const ordinary=createPlatformResolver(points),prepared=createPlatformResolver([],false,JSON.parse(JSON.stringify(createPlatformIndex(points))));
 const stops=[...Object.values(require('../public/data/pks-stop-points.json').stops),...Object.values(require('../public/data/bus-routes/mpk_rzeszow.json').stops),...points];
 for(const stop of stops)assert.deepEqual(prepared(stop),ordinary(stop));
});
test('cached catalog restoration preserves full list and physical catalog, invalidating changed rules or inputs',()=>{
 const modules=new Map(),overrides={'@/lib/pks-client':{},'./stops-catalog-worker-factory':{}};
 const catalog=load('lib/stops-catalog.ts',overrides,'',modules),domain=load('components/stops-panel/stop-domain.ts',overrides,'',modules),asyncCatalog=load('lib/stops-catalog-async.ts',overrides,'',modules);
 const pks=Object.entries(require('../public/data/pks-stop-points.json').stops).map(([id,s])=>({...s,id,name:s.n+' '+s.code,lines:[]}));
 const mpk=Object.entries(require('../public/data/bus-routes/mpk_rzeszow.json').stops).map(([id,s])=>({...s,id,lines:[]}));
 const key='restored',baseStops=catalog.buildStopsCatalog(pks,mpk,[],key),physical=catalog.buildStopsCatalog(pks,mpk,[],key,true);
 const snapshot=structuredClone({version:4,rulesVersion:asyncCatalog.CATALOG_RULES_VERSION,catalogKey:key,baseStops,pks,mpk,marcel:[],lines:{},stops:baseStops});
 domain.MERGED_STOPS_RUNTIME_CACHE.clear();
 assert.equal(asyncCatalog.restoreStopsCatalog(snapshot,'changed'),null);
 assert.equal(asyncCatalog.restoreStopsCatalog({...snapshot,rulesVersion:0},key),null);
 assert.deepEqual(asyncCatalog.restoreStopsCatalog(snapshot,key),baseStops);
 assert.deepEqual(catalog.buildStopsCatalog(pks,mpk,[],key,true),physical);
});
test('route persistence keeps legacy offline fallback, isolates versions, and expires in-memory entries',async()=>{
 const oldWindow=global.window,clock=Date.now;let now=1000;const storage=new Map();
 global.window={localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}};
 Date.now=()=>now;
 try{
  const cache=load('lib/map/route-cache.ts'),points=[[50,22],[50.01,22.01]];
  await cache.writePersistentRouteGeometry('a',points,'v1');
  assert.deepEqual(await cache.readPersistentRouteGeometry('a','v1'),points);
  assert.deepEqual(await cache.readPersistentRouteGeometry('a','v2'),[]);
  now+=31*24*60*60*1000;assert.deepEqual(await cache.readPersistentRouteGeometry('a','v1'),[]);
  storage.set('routeGeometry:legacy',JSON.stringify({version:'v1',points,expiresAt:now+1000}));
  assert.deepEqual(await cache.readPersistentRouteGeometry('legacy','v1'),points);
 }finally{Date.now=clock;global.window=oldWindow;}
});
test('working IndexedDB writes routes without synchronous localStorage serialization',async()=>{
 const oldWindow=global.window,records=new Map();let writes=0;
 const db={close(){},transaction(){const tx={objectStore(){return {put(row){records.set(row.key,structuredClone(row));queueMicrotask(()=>tx.oncomplete?.());},get(key){const req={};queueMicrotask(()=>{req.result=records.get(key);req.onsuccess?.();});return req;}};}};return tx;}};
 global.window={indexedDB:{open(){const req={result:db};queueMicrotask(()=>req.onsuccess());return req;}},localStorage:{setItem(){writes++;},getItem(){return null;},removeItem(){}}};
 try{
  const cache=load('lib/map/route-cache.ts'),points=[[50,22],[50.01,22.01]];
  await cache.writePersistentRouteGeometry('a',points,'v1');assert.equal(writes,0);
  const restarted=load('lib/map/route-cache.ts');assert.deepEqual(await restarted.readPersistentRouteGeometry('a','v1'),points);
 }finally{global.window=oldWindow;}
});
