const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const loadTs=require('./load-ts.cjs');
const snapshot=JSON.parse(fs.readFileSync('public/data/pks-stop-points.json','utf8'));
const {buildStopsCatalog}=loadTs('lib/stops-catalog.ts',{'@/lib/pks-client':{}});
test('Konieczkowa school platforms use distinct GTFS positions, not approximate shop coordinates',()=>{
  assert.deepEqual([snapshot.stops['11028'].lat,snapshot.stops['11028'].lon],[49.8418003,21.925578]);
  assert.deepEqual([snapshot.stops['11029'].lat,snapshot.stops['11029'].lon],[49.842406,21.9246928]);
  assert.equal(snapshot.stops['11028'].coordinateSource,'gtfs');assert.equal(snapshot.stops['11029'].coordinateSource,'gtfs');
});
test('a network refresh cannot overwrite verified positions and backend stop identities remain unchanged',()=>{
  const client=loadTs('lib/pks-client.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}}},'\nexport {formatPksStops};');
  const items=[{stop_point_id:11028,stop_point_code:'08',stop_area_id:1061,stop_area_name:'KONIECZKOWA, SZK.',location:{lat:49.842648,lon:21.925345}}];
  const result=client.formatPksStops({items},snapshot)['11028'];assert.equal(result.lat,49.8418003);assert.equal(result.lon,21.925578);assert.equal(result.code,'08');assert.equal(result.areaId,'1061');
  items[0].stop_area_id=999;assert.equal(client.formatPksStops({items},snapshot)['11028'].lat,49.842648,'a reused technical ID must not borrow a different platform');
});
test('map does not move an MPK platform to a nearby PKS/list consolidation point',()=>{
  const pks=[{id:'10',name:'Rzeszów Testowa 01',lat:50.04,lon:22.00,lines:['108']}];
  const mpk=[{id:'20',name:'Testowa 01',lat:50.04025,lon:22.00,lines:['2']}];
  const list=buildStopsCatalog(pks,mpk,[],'coordinates-shared-key');assert.equal(list.length,1);
  const map=buildStopsCatalog(pks,mpk,[],'coordinates-shared-key',true);assert.equal(map.length,2);
  const city=map.find(s=>s.providerStopIds.mpk_rzeszow==='20');assert.equal(city.lat,50.04025);assert.equal(city.lon,22);
});
test('nearby opposite platforms remain separate; a shared physical platform may combine providers',()=>{
  const pks=[{id:'10',name:'Konieczkowa szkoła 07',lat:49.842406,lon:21.9246928,lines:['108']},{id:'11',name:'Konieczkowa szkoła 08',lat:49.8418003,lon:21.925578,lines:['108']}];
  const mpk=[{id:'20',name:'Konieczkowa szkoła 07',lat:49.842406,lon:21.9246928,lines:['2']}];
  const map=buildStopsCatalog(pks,mpk,[],'coordinates-shared',true);assert.equal(map.length,2);assert.ok(map.find(s=>s.id==='10').sourceProviderIds.includes('mpk_rzeszow'));assert.equal(map.find(s=>s.id==='11').lat,49.8418003);
});
test('coordinate matching handles abbreviations but rejects ambiguous, distant and opposite platforms',async()=>{
  const {matchCoordinates}=await import('../scripts/lib/stop-coordinate-matching.mjs');
  const api=[{id:11028,name:'KONIECZKOWA, SZK.',code:'08',lat:49.842648,lon:21.925345}];
  const gtfs=[{id:17,name:'Konieczkowa szkoła 08',lat:49.8418003,lon:21.925578},{id:16,name:'Konieczkowa szkoła 07',lat:49.842406,lon:21.9246928}];
  assert.equal(matchCoordinates(api,gtfs).stops['11028'].gtfsStopId,'17');
  assert.deepEqual(matchCoordinates(api,[...gtfs,{...gtfs[0],id:99}]).stops,{});
  assert.deepEqual(matchCoordinates(api,[gtfs[1]]).stops,{});
  assert.deepEqual(matchCoordinates(api,[{...gtfs[0],lat:50.04,lon:22}]).stops,{});
});
test('catalog migration rejects the old merged geographic snapshot',()=>{
  const cache=loadTs('lib/stops-catalog-cache.ts');assert.equal(cache.validCatalogSnapshot({version:1,pks:[],mpk:[],marcel:[],lines:{},stops:[{id:'1',name:'Old',lines:[],carriers:[]}]}),false);
});
test('locality-only GTFS names match a landmark only with unique codes and a nearby position',async()=>{
  const {matchCoordinates}=await import('../scripts/lib/stop-coordinate-matching.mjs');
  const api=[{id:1,name:'Boguchwała, SKRZYŻOWANIE',code:'93',lat:49.98,lon:21.94}],gtfs=[{id:4,name:'Boguchwała 93 nż',lat:49.9801,lon:21.9401}];
  assert.equal(matchCoordinates(api,gtfs).stops['1'].gtfsStopId,'4');
  assert.deepEqual(matchCoordinates([...api,{...api[0],id:2}],gtfs).stops,{});
});
