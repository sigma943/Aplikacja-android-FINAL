const {test}=require('node:test');
const assert=require('node:assert/strict');
const loadTs=require('./load-ts.cjs');
const snapshot={version:2,pks:[{id:'1',name:'Stop'}],mpk:[],marcel:[],lines:{'1':['108']},stops:[{id:'pks:1',name:'Stop',lines:['108'],carriers:[{id:'pks'}],providerStopIds:{pks:'1'}}]};

test('invalid or old catalog caches are ignored; provider references and badges remain available',async()=>{
  const cache=loadTs('lib/stops-catalog-cache.ts');
  assert.equal(cache.validCatalogSnapshot({...snapshot,version:0}),false);
  assert.equal(cache.validCatalogSnapshot({...snapshot,mpk:[{id:'2',name:'MPK'}]}),false);
  assert.equal(cache.validCatalogSnapshot({...snapshot,stops:[null]}),false);
  assert.equal(await cache.readStopsCatalogCache(),null);
  await cache.writeStopsCatalogCache(snapshot);
  assert.deepEqual((await cache.readStopsCatalogCache()).stops,snapshot.stops);
});

test('unavailable IndexedDB keeps the session cache usable',async()=>{
  const previous=global.indexedDB;
  global.indexedDB={open(){throw Error('storage disabled');}};
  try {
    const cache=loadTs('lib/stops-catalog-cache.ts');
    assert.equal(await cache.readStopsCatalogCache(),null);
    await cache.writeStopsCatalogCache(snapshot);
    assert.deepEqual(cache.peekStopsCatalogCache(),snapshot);
  } finally {global.indexedDB=previous;}
});

test('bundled PKS stops load before the slow endpoint; fresh endpoint data then replaces them',async()=>{
  const oldFetch=global.fetch,oldWindow=global.window;
  const storage=new Map(),events=[];let finishNetwork;
  global.window={localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},dispatchEvent:event=>events.push(event.type)};
  global.fetch=async url=>{
    if(String(url).includes('/data/pks-stop-points.json'))return new Response(JSON.stringify({stops:{'1':{n:'BARYCZKA',areaId:'1054',code:'69',lat:49.85,lon:21.85}}}));
    return new Promise(resolve=>{finishNetwork=()=>resolve(new Response(JSON.stringify({items:[{stop_point_id:1,name:'BARYCZKA CENTRUM',stop_area_name:'BARYCZKA CENTRUM',stop_area_id:1054,stop_point_code:'69',location:{lat:49.85,lon:21.85}}]})));});
  };
  try {
    const client=loadTs('lib/pks-client.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}}},'\nexport {loadStopPointIndex};');
    const local=await client.loadStopPointIndex();
    assert.match(local['1'].n,/Baryczka 69/);
    await new Promise(resolve=>setImmediate(resolve));
    const freshPromise=client.fetchStopsClient({forceRefresh:true});finishNetwork();
    const fresh=await freshPromise;
    assert.match(fresh['1'].n,/Centrum/);
    assert.deepEqual(events,['pks-live:stops-updated']);
    assert.deepEqual(await client.fetchStopsClient(),fresh);
  } finally {global.fetch=oldFetch;global.window=oldWindow;}
});

test('successful validation of unchanged source data renews its cache age',()=>{
  const oldWindow=global.window;const storage=new Map();
  global.window={localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}};
  try {
    const client=loadTs('lib/pks-client.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}}},'\nexport {writePersistentClientCache};');
    client.writePersistentClientCache('test',{'1':{n:'Stop'}});
    const old=JSON.parse(storage.get('test'));old.savedAt=1;storage.set('test',JSON.stringify(old));
    client.writePersistentClientCache('test',{'1':{n:'Stop'}});
    assert.ok(JSON.parse(storage.get('test')).savedAt>1);
  } finally {global.window=oldWindow;}
});
