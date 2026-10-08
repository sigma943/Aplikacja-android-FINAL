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
test('same numbered city platform has one pin at its precise MPK position',()=>{
  const pks=[{id:'10',name:'Rzeszów Testowa 01',lat:50.04,lon:22.00,lines:['108']}];
  const mpk=[{id:'20',name:'Testowa 01',lat:50.04025,lon:22.00,lines:['2']}];
  const list=buildStopsCatalog(pks,mpk,[],'coordinates-shared-key');assert.equal(list.length,1);
  const map=buildStopsCatalog(pks,mpk,[],'coordinates-shared-key',true);assert.equal(map.length,1);
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

test('physical catalog merges provider aliases and duplicate IDs but retains different platforms and distant namesakes',()=>{
  const pks=[{id:'p1',name:'Rzeszów Podkarp. Matuszczaka 03',lat:50.01,lon:22,lines:['108']},
    {id:'p2',name:'Rzeszów Podkarpacka / Matuszczaka 3',lat:50.0101,lon:22,lines:['223']},
    {id:'p3',name:'Rzeszów Podkarpacka / Matuszczaka 04',lat:50.01015,lon:22,lines:['228']},
    {id:'p4',name:'Rzeszów Podkarpacka / Matuszczaka 03',lat:50.011,lon:22,lines:['288']}];
  const mpk=[{id:'m1',name:'Podkarpacka / Matuszczaka 03',lat:50.01025,lon:22,lines:['11']}];
  const map=buildStopsCatalog(pks,mpk,[],'platform-aliases',true);
  assert.equal(map.length,3);
  const shared=map.find(s=>s.providerStopIds.mpk_rzeszow==='m1');
  assert.equal(shared.providerStopIds.pks,'p1,p2');assert.deepEqual(shared.lines,['11','108','223']);
  assert.equal(shared.lat,50.01025);assert.equal(shared.pksStopPoints.length,2);
  assert.ok(map.some(s=>s.id==='p3'));assert.ok(map.some(s=>s.id==='p4'));
});

test('close stops in one provider need full identity, not merely a shared locality',()=>{
  const stops=[{id:'a',name:'Konieczkowa szkoła',lat:49.84,lon:21.92,lines:[]},
    {id:'b',name:'Konieczkowa kościół',lat:49.84001,lon:21.92,lines:[]},
    {id:'c',name:'Konieczkowa szkoła',lat:49.84002,lon:21.92,lines:[]}];
  const map=buildStopsCatalog([stops[1],stops[0],stops[2]],[],[],'nearby-different-landmarks',true);
  assert.equal(map.length,2);assert.equal(map.find(s=>s.id==='a').providerStopIds.pks,'a,c');
});

test('real Podkarpacka/Matuszczaka records merge like the list while retaining both directions',()=>{
  const client=loadTs('lib/pks-client.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}}},'\nexport {formatPksStops};');
  const data={items:['3794','3795'].map(id=>{const point=snapshot.stops[id];return {stop_point_id:id,name:point.n,stop_area_name:point.n,stop_point_code:point.code,stop_area_id:point.areaId,location:point};})};
  const pks=Object.entries(client.formatPksStops(data,snapshot)).map(([id,s])=>({id,name:s.n,lat:s.lat,lon:s.lon,lines:['108']}));
  const gtfs=JSON.parse(fs.readFileSync('public/data/bus-routes/mpk_rzeszow.json','utf8')).stops;
  const mpk=['213','256'].map(id=>({id,...gtfs[id],lines:['11']}));
  const map=buildStopsCatalog(pks,mpk,[],'actual-podkarpacka-map',true);
  const list=buildStopsCatalog(pks,mpk,[],'actual-podkarpacka-list');
  assert.equal(map.length,2);assert.equal(list.length,2);
  for(const [pksId,mpkId] of [['3794','213'],['3795','256']]){
    const stop=map.find(s=>s.providerStopIds.pks===pksId);
    assert.equal(stop.providerStopIds.mpk_rzeszow,mpkId);assert.deepEqual(stop.lines,['11','108']);
    assert.equal(stop.lat,gtfs[mpkId].lat);assert.equal(stop.lon,gtfs[mpkId].lon);
    assert.deepEqual(stop.providerStopIds,list.find(s=>s.providerStopIds.pks===pksId).providerStopIds);
  }
});
test('map and list share cross-provider proximity rules for differently abbreviated rural names',()=>{
  const pks=[{id:'school',name:'Konieczkowa, Szk. 08',lat:49.84,lon:21.92,lines:['108']}];
  const mpk=[{id:'school-city',name:'Konieczkowa szkoła 08',lat:49.84015,lon:21.92,lines:['2']}];
  assert.equal(buildStopsCatalog(pks,mpk,[],'rural-abbreviations-map',true).length,1);
  assert.equal(buildStopsCatalog(pks,mpk,[],'rural-abbreviations-list').length,1);
});

test('map uses exactly the list identities when provider coordinates differ beyond the former marker threshold',()=>{
  const mpk=[{id:'a',name:'Podkarpacka / Matuszczaka 03',lat:50.01,lon:22,lines:['11']},
    {id:'b',name:'Podkarpacka / Matuszczaka 03',lat:50.01055,lon:22,lines:['23']},
    {id:'c',name:'Podkarpacka / Matuszczaka 04',lat:50.01056,lon:22,lines:['30']}];
  const list=buildStopsCatalog([],mpk,[],'shared-canonical-threshold');
  const map=buildStopsCatalog([],mpk,[],'shared-canonical-threshold',true);
  assert.equal(list.length,2);assert.equal(map.length,2);
  assert.deepEqual(map.map(s=>s.providerStopIds),list.map(s=>s.providerStopIds));
  assert.equal(map.find(s=>s.providerStopIds.mpk_rzeszow.includes('a')).lat,50.01);
});
test('complete bundled PKS/MPK catalogs have identical provider groups on the map and list',()=>{
  const pks=Object.entries(snapshot.stops).map(([id,s])=>({id,name:s.n+(s.code?' '+s.code:''),lat:s.lat,lon:s.lon,areaId:s.areaId,code:s.code,lines:[]}));
  const gtfs=JSON.parse(fs.readFileSync('public/data/bus-routes/mpk_rzeszow.json')).stops;
  const mpk=Object.entries(gtfs).map(([id,s])=>({id,...s,lines:[]}));
  const list=buildStopsCatalog(pks,mpk,[],'complete-shared-identities');
  const map=buildStopsCatalog(pks,mpk,[],'complete-shared-identities',true);
  assert.deepEqual(map.map(s=>[s.id,s.providerStopIds]),list.map(s=>[s.id,s.providerStopIds]));
});
