const {test}=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),load=require('./load-ts.cjs');
const board=fs.readFileSync('test/fixtures/mpk-mybus-0a-timetable.xml','utf8'), geometry=fs.readFileSync('test/fixtures/mpk-mybus-0a-route.xml','utf8');
for(const prefix of ['lib','functions/src/transport']) {
 test(`${prefix}: real 0A loop renders full route with correct SIP coordinates and upcoming occurrences`,async()=>{
  const {parseMybusTimetable}=load(prefix+'/mpk-mybus-timetable.ts'),{enrichMybusRoute}=load(prefix+'/mpk-mybus-route.ts');
  const schedule=parseMybusTimetable(board,Date.now(),'0A'), calls=[];
  const result=await enrichMybusRoute(board,schedule,async url=>{calls.push(url);return geometry;});
  assert.ok(load('lib/bus-road-geometry.ts').roadRouteMatchesStops(result.routeGeometry,result.routeStops.map(s=>[s.lat,s.lon]),180),'map accepts the ordered loop geometry');
  assert.equal(result.routeStops.length,21);assert.ok(result.routeGeometry.length>100);
  assert.equal(result.routePath[0],result.routePath.at(-1));
  assert.equal(result.schedule[0].id,122); // SIP 108 is NOT old catalogue 108.
  assert.equal(result.schedule[0].lat,50.021);assert.equal(result.schedule[0].lon,21.98375);
  assert.equal(result.routeStops.filter(s=>s.isPast).length,7);
  assert.ok(result.routeStops.slice(7).every(s=>s.lat>49&&s.lon>20&&!s.isPast));
  assert.ok(calls[0].includes('cRoute=0A&cRouteVariant=0'));
  await enrichMybusRoute(board,schedule,async()=>{throw Error('should use cache');});assert.equal(calls.length,1);
 });
 test(`${prefix}: invalid geometry preserves next-stop coordinates and can recover`,async()=>{
  const {parseMybusTimetable}=load(prefix+'/mpk-mybus-timetable.ts'),{enrichMybusRoute}=load(prefix+'/mpk-mybus-route.ts');
  const stops=parseMybusTimetable(board,Date.now(),'0A');
  const missing=await enrichMybusRoute(board,stops,async()=>'<R r="0A" t="wrong"></R>');
  assert.equal(missing.routeGeometry.length,0);assert.ok(missing.routeStops.every(s=>s.lat&&s.lon));
  const recovered=await enrichMybusRoute(board,stops,async()=>geometry);assert.ok(recovered.routeGeometry.length>100);
 });
 test(`${prefix}: wrong line, Africa coordinates, disjoint segments and empty shape are rejected`,()=>{
  const {parseMybusRoute}=load(prefix+'/mpk-mybus-route.ts');
  assert.throws(()=>parseMybusRoute(geometry,'3','0'),/mismatch/);
  assert.throws(()=>parseMybusRoute(geometry.replace('y="50.04233"','y="0"'),'0A','0'),/invalid/);
  assert.throws(()=>parseMybusRoute('<R r="0A" t="0"><T i1="1" i2="2"/></R>','0A','0'),/Missing/);
 });
}
test('backup vehicle resolves its route end to end without querying a GTFS trip using a SIP course ID',async()=>{
 const calls=[],raw='<VL><V nb="102" nr="0A" op="Dworzec Główny PKP" x="21.985" y="50.021" ik="2500" s="1" is="0"/></VL>';
 const api=load('lib/providers/mpk-vehicles.ts',{'../transport/http':{
 requestJson:async url=>{calls.push(url);if(url.includes('api.php'))return {};if(url.includes('get_trip_stops'))throw Error('SIP course must not be queried as GTFS');return [];},
 requestText:async url=>{calls.push(url);if(url.includes('vehicles_proxy'))throw Error('404');return url.includes('GetVehicles?')?raw:url.includes('GetVehicleTimeTable?')?board:geometry;}
 }});
 const vehicle=await api.fetchMpkRzeszowVehicleDetailsDirect('mpk_rzeszow_102',true);
 assert.equal(vehicle.routeStops.length,21);assert.equal(vehicle.schedule[0].id,122);assert.ok(vehicle.routeGeometry.length>100);
 assert.ok(!calls.some(url=>url.includes('get_trip_stops')));
 const adapted=load('lib/transport/vehicle-adapter.ts').mapTransportVehicleToClient({...vehicle,line:'0A',lng:vehicle.lon});
 assert.deepEqual(adapted.routeGeometry,vehicle.routeGeometry);assert.equal(adapted.routeStops.length,21);
});
