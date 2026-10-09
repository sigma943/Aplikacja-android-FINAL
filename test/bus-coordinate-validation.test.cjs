const {test}=require('node:test');const assert=require('node:assert/strict');const load=require('./load-ts.cjs');
const {readBusCoordinates,sanitizeBusStop}=load('lib/bus-coordinates.ts');
test('local bus GPS rejects missing, zero, swapped and out-of-region coordinates',()=>{
 for(const value of [null,undefined,'','  ',false,true,[],{},NaN,Infinity,0]) assert.equal(readBusCoordinates(value,value),null);
 for(const [a,b] of [[49.9,null],[0,22],[49.9,0],[21.9,49.9],[1,2],[49.9,120]])assert.equal(readBusCoordinates(a,b),null);
 assert.deepEqual(readBusCoordinates('49,935108','21.893058'),{lat:49.935108,lon:21.893058});
 assert.deepEqual(sanitizeBusStop({name:'Za torami',lat:0,lon:0}),{name:'Za torami',lat:undefined,lon:undefined});
});
test('stale catalog coordinates cannot paint a marker at 0,0 or poison the merged location',()=>{
 const {buildStopsCatalog}=load('lib/stops-catalog.ts',{'@/lib/pks-client':{}});
 const raw={id:'M',name:'Babica - Za torami',lat:0,lon:0,matchName:'za torami',matchKey:'za torami',cityMatchKey:'babica za torami',routeIds:['1']};
 const stops=buildStopsCatalog([],[],[raw],'null-cache-regression',true);
 assert.equal(stops.length,1);assert.equal(stops[0].lat,undefined);assert.equal(stops[0].lon,undefined);
 const {visibleMapStops}=load('lib/map-stop-markers.ts');
 assert.equal(visibleMapStops([{...stops[0],lat:0,lon:0}],[-180,-90,180,90],18,'M').length,0);
});
