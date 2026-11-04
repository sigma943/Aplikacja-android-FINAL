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
