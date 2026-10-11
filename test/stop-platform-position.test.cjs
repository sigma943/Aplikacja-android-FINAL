const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
const {createPlatformResolver}=load('lib/stop-platform-position.ts');
test('platform markers use confirmed passenger locations without mutating routing coordinates',()=>{
  const resolve=createPlatformResolver([{id:'n/1',name:'Konieczkowa szkoła 08',lat:49.84,lon:21.99},
    {id:'n/2',name:'Konieczkowa szkoła 07',lat:49.8401,lon:21.9901}]);
  const stop={name:'Konieczkowa Szk. 8',lat:49.84004,lon:21.99004};
  assert.deepEqual(resolve(stop),{lat:49.84,lon:21.99});
  assert.equal(stop.lat,49.84004);
  assert.equal(resolve({...stop,name:'Konieczkowa szkoła'}),null);
  assert.equal(resolve({...stop,name:'Konieczkowa szkoła 09'}),null);
  assert.equal(resolve({...stop,lat:50.84}),null);
  assert.equal(resolve({...stop,lat:0,lon:0}),null);
});
test('ambiguous platforms and different landmarks retain provider coordinates',()=>{
  const points=[{id:'a',name:'Babica za torami 53',lat:49.9,lon:22.0},
    {id:'b',name:'Babica za torami 53',lat:49.9001,lon:22.0001}];
  const resolve=createPlatformResolver(points);
  assert.equal(resolve({name:'Babica - Za torami 53',lat:49.9,lon:22}),null);
  assert.equal(resolve({name:'Babica szkoła 53',lat:49.9,lon:22}),null);
  assert.deepEqual(createPlatformResolver(points.slice(0,1))({name:'Babica - Za torami',lat:49.90001,lon:22}),{lat:49.9,lon:22});
});
test('the packaged catalog contains only named validated passenger platforms',()=>{
  const catalog=require('../public/data/stop-platforms.json');
  assert.ok(catalog.points.length>1000);
  for(const p of catalog.points){assert.ok(p.name&&p.id);assert.ok(p.lat>=48&&p.lat<=56&&p.lon>=14&&p.lon<=25);}
});

test('named Mochnackiego platforms accept the provider abbreviation but never the opposite code',()=>{
  const point={id:'platform/03',name:'Lisa-Kuli / Mochnackiego 03',lat:50.035944,lon:21.99708};
  const resolve=createPlatformResolver([point]);
  const stop={name:'Rzeszów, Lisa Kuli/Mochn. 03',lat:50.0359,lon:21.9971};
  assert.deepEqual(resolve(stop),{lat:point.lat,lon:point.lon});
  assert.equal(resolve({...stop,name:'Rzeszów, Lisa Kuli/Mochn. 04'}),null);
});

test('a matched map platform wins and a missing or ambiguous match preserves established catalog coordinates',()=>{
  const {positionWithPlatforms}=load('lib/stop-platform-position.ts');
  const stop={name:'Example school 12',lat:49.8373126,lon:21.9552326,apiLat:49.837199,apiLon:21.95569};
  const platform={id:'example/12',name:stop.name,lat:stop.lat,lon:stop.lon};
  assert.deepEqual(positionWithPlatforms(stop,createPlatformResolver([platform])),{lat:platform.lat,lon:platform.lon});
  for(const points of [[],[{...platform,name:'Example school 11'}],[platform,{...platform,id:'duplicate'}]]){
    assert.deepEqual(positionWithPlatforms(stop,createPlatformResolver(points)),{lat:stop.lat,lon:stop.lon});
  }
  assert.equal(stop.lat,platform.lat,'presentation must not replace routing coordinates');
});

test('reviewed basemap points win over OSM, including before the async catalog loads',()=>{
  const {positionWithPlatforms,platformPosition}=load('lib/stop-platform-position.ts');
  const snapshot=require('../public/data/pks-stop-points.json');
  const reviewed=require('../lib/reviewed-map-platforms.json');
  const osm=createPlatformResolver(require('../public/data/stop-platforms.json').points);
  const {formatPksStops,snapshotStopItems}=load('lib/providers/pks-stops.ts');
  const stops=formatPksStops({items:snapshotStopItems(snapshot)},snapshot);
  for(const point of reviewed.points){
    const stop=stops[point.id.replace('pks:','')];
    assert.ok(stop,point.id);
    const expected={lat:point.lat,lon:point.lon};
    assert.deepEqual(positionWithPlatforms(stop,osm),expected,point.name);
    assert.deepEqual(platformPosition(stop),expected,'works offline before platform fetch');
    assert.deepEqual(platformPosition({...stop,...expected}),expected,'clicking the displayed marker is stable');
    assert.notDeepEqual(platformPosition({...stop,lat:stop.lat+1,apiLat:stop.lat+1}),expected,'distant namesakes are not moved');
    assert.ok(point.sourceUrl.includes('!3d'+point.lat+'!4d'+point.lon),'coordinates retain their observed source');
  }
  assert.deepEqual(positionWithPlatforms(stops['10689'],osm),{lat:49.8373126,lon:21.9552326},'Gwoźnica Dolna 12 stays on its own side');
  assert.deepEqual(positionWithPlatforms(stops['10695'],osm),{lat:49.8300183,lon:21.9977235},'school 19 stays on the school side');
  assert.deepEqual(positionWithPlatforms(stops['10694'],osm),{lat:49.8306762,lon:21.9966906},'school 20 stays separate');
});

test('an unnumbered Google point must not take a numbered stop across the road',()=>{
  const {hasSameRoadside,positionWithPlatforms,platformPosition}=load('lib/stop-platform-position.ts');
  const {formatPksStops,snapshotStopItems}=load('lib/providers/pks-stops.ts');
  const snapshot=require('../public/data/pks-stop-points.json');
  const stops=formatPksStops({items:snapshotStopItems(snapshot)},snapshot);
  const reviewed=require('../lib/reviewed-map-platforms.json');
  const school=reviewed.rejectedPoints.find(p=>p.id==='pks:10695');
  const dolna=reviewed.points.find(p=>p.id==='pks:10688');
  assert.equal(hasSameRoadside(stops['10695'],school),false);
  assert.equal(createPlatformResolver([school],true)(stops['10695']),null);
  assert.deepEqual(positionWithPlatforms(stops['10695'],createPlatformResolver([school],true)),
    {lat:49.8300183,lon:21.9977235},'rejected Google coordinates retain the established platform');
  assert.deepEqual(platformPosition(stops['10695']),{lat:49.8300183,lon:21.9977235},'before OSM loads the correct catalog side survives');
  assert.equal(hasSameRoadside(stops['10694'],{...stops['10695'],roadBoundary:school.roadBoundary}),false,'19 and 20 are opposite sides');
  assert.equal(hasSameRoadside(stops['10688'],dolna),true);
  assert.equal(hasSameRoadside(stops['10689'],dolna),false,'the closer Dolna 12 is on the wrong side for this Google point');
  assert.equal(createPlatformResolver([{...dolna,roadBoundary:undefined}],true)(stops['10688']),null,'new reviewed points require roadside evidence');
});

test('reviewed positions reach both canonical catalog surfaces and the route stop shape',()=>{
  const {buildStopsCatalog}=load('lib/stops-catalog.ts',{'@/lib/pks-client':{}});
  const {platformPosition}=load('lib/stop-platform-position.ts');
  const raw={id:'10688',name:'Gwoźnica Dolna 11',areaId:'2364',code:'11',lat:49.8373085,lon:21.9558807,
    apiLat:49.837319,apiLon:21.955843,lines:['108']};
  const expected={lat:49.8375014,lon:21.9552742};
  for(const physical of [false,true]){
    const stop=buildStopsCatalog([raw],[],[],'reviewed-map-position',physical)[0];
    assert.deepEqual(platformPosition(stop),expected);
    assert.equal(stop.id,raw.id);
  }
  assert.deepEqual(platformPosition({...raw,name:undefined,n:'GWOŹNICA DOLNA 11'}),expected);
  assert.equal(raw.lat,49.8373085,'routing geometry retains its own coordinates');
});

test('missing raw API coordinates do not hide a valid established GTFS platform',()=>{
  const {positionWithPlatforms}=load('lib/stop-platform-position.ts');
  const stop={name:'Unknown 01',lat:50.1,lon:22.1,apiLat:null,apiLon:null};
  assert.deepEqual(positionWithPlatforms(stop,createPlatformResolver([])),{lat:50.1,lon:22.1});
  assert.deepEqual(positionWithPlatforms(stop,createPlatformResolver([{id:'verified',name:stop.name,lat:50.1,lon:22.1}])),{lat:50.1,lon:22.1});
  // Other providers already expose their API position directly.
  assert.deepEqual(positionWithPlatforms({name:'Other 01',lat:50.1,lon:22.1},createPlatformResolver([])),{lat:50.1,lon:22.1});
});

test('live and bundled PKS records keep API coordinates separately from verified GTFS geometry',()=>{
  const client=load('lib/providers/pks-stops.ts');
  const snapshot=require('../public/data/pks-stop-points.json');
  const point=snapshot.stops['10689'];
  const item={stop_point_id:10689,stop_area_id:2364,stop_point_code:'12',stop_area_name:'GWOŹNICA DOLNA',
    location:{lat:49.837199,lon:21.95569}};
  const live=client.formatPksStops({items:[item]},snapshot)['10689'];
  const local=client.formatPksStops({items:client.snapshotStopItems({stops:{'10689':point}})},snapshot)['10689'];
  assert.deepEqual(live,local);
  assert.deepEqual([live.lat,live.lon],[49.8373126,21.9552326]);
  assert.deepEqual([live.apiLat,live.apiLon],[49.837199,21.95569]);
});

test('both catalog surfaces retain API fallback and cache signatures notice an API position change',()=>{
  const {buildStopsCatalog}=load('lib/stops-catalog.ts',{'@/lib/pks-client':{}});
  const {stopCollectionSignature}=load('components/stops-panel/stop-domain.ts',{'@/lib/pks-client':{}});
  const raw={id:'10689',name:'Gwoźnica Dolna 12',areaId:'2364',code:'12',lat:49.8373126,lon:21.9552326,
    apiLat:49.837199,apiLon:21.95569,lines:['108']};
  for(const physical of [false,true]){
    const stop=buildStopsCatalog([raw],[],[],'api-fallback',physical)[0];
    assert.deepEqual([stop.apiLat,stop.apiLon],[raw.apiLat,raw.apiLon]);
    assert.deepEqual(stop.providerStopIds,{pks:'10689',pksNames:raw.name,pksAreaIds:'2364',pksCodes:'12'});
  }
  assert.notEqual(stopCollectionSignature([raw]),stopCollectionSignature([{...raw,apiLat:49.8372}]));
});

test('viewport filtering uses the established displayed position and hides only invalid geometry',()=>{
  const {visibleMapStops}=load('lib/map-stop-markers.ts');
  const stop={id:'test',name:'Unmapped 01',type:'bus',lat:50.2,lon:22.2,apiLat:50,apiLon:22};
  assert.equal(visibleMapStops([stop],[21.99,49.99,22.01,50.01],18).length,0);
  assert.equal(visibleMapStops([stop],[22.19,50.19,22.21,50.21],18).length,1);
  assert.equal(visibleMapStops([{...stop,apiLat:null,apiLon:null}],[22.19,50.19,22.21,50.21],18).length,1);
  assert.equal(visibleMapStops([{...stop,lat:NaN,lon:0}],[21.99,49.99,22.01,50.01],18).length,0);
});

test('Lisa-Kuli Mochnackiego 03 retains its verified position on the catalog and selected route surfaces',()=>{
  const {platformPosition}=load('lib/stop-platform-position.ts');
  const {visibleMapStops}=load('lib/map-stop-markers.ts');
  const {buildStopsCatalog}=load('lib/stops-catalog.ts',{'@/lib/pks-client':{}});
  const {formatPksStops,snapshotStopItems}=load('lib/providers/pks-stops.ts');
  const snapshot=require('../public/data/pks-stop-points.json');
  const point=formatPksStops({items:snapshotStopItems({stops:{'11461':snapshot.stops['11461']}})},snapshot)['11461'];
  const expected={lat:50.035944,lon:21.99708};
  assert.deepEqual(platformPosition(point),expected,'selected PKS route stop');
  assert.notDeepEqual(expected,{lat:point.apiLat,lon:point.apiLon},'the old API position is the reported regression');
  const raw={...point,id:'11461',name:point.n,lines:['232']};
  for(const physical of [false,true]){
    const stop=buildStopsCatalog([raw],[],[],'lisa-03-position-regression',physical)[0];
    assert.deepEqual(platformPosition(stop),expected);
    assert.equal(visibleMapStops([stop],[21.9969,50.0358,21.9973,50.0361],19).length,1);
    assert.equal(visibleMapStops([stop],[21.9980,50.0348,21.9983,50.0351],19).length,0);
  }
});

test('all 1795 PKS stops outside the reviewed registry retain the pre-regression positions',()=>{
  const {positionWithPlatforms}=load('lib/stop-platform-position.ts');
  const {readBusCoordinates}=load('lib/bus-coordinates.ts');
  const {formatPksStops,snapshotStopItems}=load('lib/providers/pks-stops.ts');
  const snapshot=require('../public/data/pks-stop-points.json');
  const reviewed=new Set(require('../lib/reviewed-map-platforms.json').points.map(p=>p.id.slice(4)));
  const osm=createPlatformResolver(require('../public/data/stop-platforms.json').points);
  let checked=0;
  for(const [id,stop] of Object.entries(formatPksStops({items:snapshotStopItems(snapshot)},snapshot))){
    if(reviewed.has(id))continue;
    const previous=osm(stop)||readBusCoordinates(stop.lat,stop.lon);
    assert.deepEqual(positionWithPlatforms(stop,osm),previous,id+' '+stop.n);
    checked++;
  }
  assert.equal(checked,Object.keys(snapshot.stops).length-reviewed.size);
  assert.equal(checked,1795);
});
