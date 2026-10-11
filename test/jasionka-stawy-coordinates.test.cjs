const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
const fixture=require('./fixtures/jasionka-stawy-coordinates.json');
const snapshot=require('../public/data/pks-stop-points.json');
const api=fixture.api,gtfs=fixture.gtfs;
const raw={id:String(api.stop_point_id),name:api.name+' 2',areaId:String(api.stop_area_id),code:api.stop_point_code,...api.location,lines:[]};

test('Jasionka Stawy 02 uses its verified platform in the bundle, live refresh and offline cache',()=>{
  const client=load('lib/providers/pks-stops.ts');
  const bundled=snapshot.stops[raw.id];
  assert.equal(bundled.gtfsStopId,gtfs.id);
  for(const point of [bundled,client.formatPksStops({items:[api]},snapshot)[raw.id],
    client.verifiedCachedPksStops({[raw.id]:{...raw,n:raw.name}},snapshot)[raw.id]]){
    assert.equal(point.lat,gtfs.lat);assert.equal(point.lon,gtfs.lon);
    assert.equal(point.areaId,raw.areaId);assert.equal(point.code,'02');
  }
  assert.equal(raw.lat,50.035257,'migration must not mutate the cached record');
});

test('reviewed long-distance correction cannot apply to another identity or a newly moved stop',()=>{
  const {correctPksStop}=load('lib/pks-stop-corrections.ts');
  for(const changed of [{areaId:'999'},{code:'01'},{name:'Jasionka, Szkoła 2'},
    {lat:50.08,lon:22.01}]){
    const stop={...raw,...changed};assert.equal(correctPksStop(stop,raw.id),stop);
  }
  assert.equal(correctPksStop(raw,'999'),raw);
  assert.equal(correctPksStop(raw,raw.id).lat,gtfs.lat);
});

test('both catalog surfaces separate Jasionka from Mochnackiego even with old raw coordinates',()=>{
  const {buildStopsCatalog}=load('lib/stops-catalog.ts',{'@/lib/pks-client':{}});
  for(const physical of [false,true]){
    const stops=buildStopsCatalog([raw],[fixture.mpk],[],'jasionka-source-error',physical);
    assert.equal(stops.length,2);
    const jasionka=stops.find(s=>s.id===raw.id);
    assert.equal(jasionka.lat,gtfs.lat);assert.equal(jasionka.lon,gtfs.lon);
    assert.equal(jasionka.providerStopIds.mpk_rzeszow,undefined);
    assert.deepEqual(jasionka.lines,[]);
    assert.deepEqual(stops.find(s=>s.id==='mpk_rzeszow:246').lines,['10','35']);
  }
});

test('commas in locality names cannot hide a cross-city conflict even at the same position',()=>{
  const {buildStopsCatalog}=load('lib/stops-catalog.ts',{'@/lib/pks-client':{}});
  const domain=load('components/stops-panel/stop-domain.ts',{'@/lib/pks-client':{}});
  assert.equal(domain.hasConflictingCityToken('Jasionka, Stawy 02','Rzeszów, Mochnackiego 02'),true);
  // Use an unknown ID to exercise the general merge safeguards, not the reviewed correction.
  for(const name of ['Jasionka, Stawy 02','Jasionka Stawy 02']){
    const stops=buildStopsCatalog([{...raw,id:'unknown',name}],[fixture.mpk],[],name,true);
    assert.equal(stops.length,2);assert.equal(stops.find(s=>s.id==='unknown').providerStopIds.mpk_rzeszow,undefined);
  }
});

test('generators retain the reviewed 9.9 km correction without relaxing other distance or ambiguity guards',async()=>{
  const {matchCoordinates}=await import('../scripts/lib/stop-coordinate-matching.mjs');
  const stop={...raw,name:api.name};
  assert.equal(matchCoordinates([stop],[gtfs]).stops[raw.id].gtfsStopId,gtfs.id);
  for(const changed of [{id:'999'},{areaId:'999'},{code:'01'},{name:'Other'}, {lat:50.01}]){
    assert.deepEqual(matchCoordinates([{...stop,...changed}],[gtfs]).stops,{});
  }
  assert.deepEqual(matchCoordinates([stop],[{...gtfs,id:'999'}]).stops,{});
  assert.deepEqual(matchCoordinates([stop],[{...gtfs,lat:50.2}]).stops,{});
  assert.deepEqual(matchCoordinates([stop],[gtfs,{...gtfs,id:'duplicate'}]).stops,{});
});

test('old merged catalog is invalidated so the false MPK alias is not restored',()=>{
  const {validCatalogSnapshot}=load('lib/stops-catalog-cache.ts');
  const snapshot={version:2,pks:[raw],mpk:[fixture.mpk],marcel:[],lines:{},
    stops:[{id:raw.id,name:raw.name,lines:['10','35'],carriers:[],providerStopIds:{pks:raw.id,mpk_rzeszow:'246'}}]};
  assert.equal(validCatalogSnapshot(snapshot),false);
  assert.equal(validCatalogSnapshot({...snapshot,version:3}),true);
});
