const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {routeMapStopPoint}=load('lib/map-stop-markers.ts');
const stop={id:'shared',name:'Test wspólny peron 01',lat:50.00005,lon:22.00005,providerStopIds:{pks:'1',mpk_rzeszow:'2'}};
const point={n:stop.name,lat:50,lon:22};
test('PKS and MPK route dots share their exact catalog platform without changing routing data',()=>{
 for(const [provider,id]of [['pks','1'],['mpk_rzeszow','2']])assert.deepEqual(routeMapStopPoint([stop],id,point,provider),{...point,lat:stop.lat,lon:stop.lon});assert.deepEqual(point,{n:stop.name,lat:50,lon:22});
});
test('unrelated IDs, ambiguous platforms and excessive displacement cannot merge',()=>{
 assert.equal(routeMapStopPoint([stop],'2',point,'pks'),point);
 assert.equal(routeMapStopPoint([stop,{...stop,id:'opposite'}],'1',point,'pks'),point);
 assert.equal(routeMapStopPoint([{...stop,lat:51}],'1',point,'pks'),point);
 assert.equal(routeMapStopPoint([stop],'1',point,'pkp_intercity'),point);
});

test('automatic route glow uses only unambiguous provider IDs and leaves input untouched',()=>{
 const {routeCatalogStopIds}=load('lib/map-stop-markers.ts');
 assert.deepEqual([...routeCatalogStopIds([stop],['1'],{'1':point},'pks')],['shared']);
 assert.deepEqual([...routeCatalogStopIds([stop],['2'],{'2':point},'pks')],[]);
 assert.deepEqual([...routeCatalogStopIds([stop,{...stop,id:'duplicate'}],['1'],{'1':point},'pks')],[]);
 assert.deepEqual([...routeCatalogStopIds([stop],['1'],{'1':point},'pkp_intercity')],[]);
});

test('Rzeszów D.A. never glows along a vehicle route and can be highlighted explicitly from the stop tab',()=>{
 const {canHighlightMapStop,routeCatalogStopIds}=load('lib/map-stop-markers.ts');
 const terminal={...stop,id:'3731',name:'Rzeszów D.A. st. 1',areaId:'1937',providerStopIds:{pks:'3731'}};
 const terminalPoint={...point,n:'RZESZÓW D.A.'};
 assert.deepEqual([...routeCatalogStopIds([stop,terminal],['1','3731'],{'1':point,'3731':terminalPoint},'pks')],['shared']);
 assert.deepEqual(routeMapStopPoint([terminal],'3731',terminalPoint,'pks'),{...terminalPoint,lat:terminal.lat,lon:terminal.lon});
 for(const candidate of [terminal,{areaId:'1937'},{name:terminalPoint.n},{name:'Rzeszów, Dworzec Autobusowy 02'}]){
  assert.equal(canHighlightMapStop(candidate),false);
  assert.equal(canHighlightMapStop(candidate,true),true);
 }
 assert.equal(canHighlightMapStop({name:'Boguchwała D.A. 1'}),true);
 assert.equal(canHighlightMapStop({name:'Rzeszów, Dworzec Główny PKP 01'}),true);
});
