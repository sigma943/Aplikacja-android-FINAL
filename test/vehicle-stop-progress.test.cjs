const {test}=require('node:test');
const assert=require('node:assert/strict');
const loadTs=require('./load-ts.cjs');
const {upcomingTimedVehicleStops}=loadTs('lib/vehicle-stop-timing.ts');
const {vehicleRouteDetailsCacheKey,latestPksRemainingSchedule}=loadTs('lib/home/vehicle-display.ts');
const now=Date.parse('2026-10-23T04:19:30Z');
const stop=(id,time)=>({id,name:`Stop ${id}`,planned:`2026-10-23T04:${time}:00Z`,real:null});
const previous=stop(1,'17'),next=stop(2,'19'),later=stop(3,'20');
const vehicle={id:'117',provider:'pks',delay:0,lastStopId:1,
  lastSignalTime:'2026-10-23T04:18:00Z',
  routeStops:[previous,next,later],schedule:[next,later]};

test('PKS 108 retains the next stop after its scheduled minute with an older GPS signal',()=>{
  assert.deepEqual(upcomingTimedVehicleStops(vehicle,now).map(s=>s.id),[2,3]);
  assert.deepEqual(upcomingTimedVehicleStops(vehicle,now+10*60_000).map(s=>s.id),[2,3]);
});
test('PKS removes the stop only when a new feed snapshot advances the remaining sequence',()=>{
  assert.deepEqual(upcomingTimedVehicleStops({...vehicle,lastStopId:2,schedule:[later]},now).map(s=>s.id),[3]);
});
test('PKS passage invalidates cached remaining stops even within the same journey',()=>{
  const key=bus=>vehicleRouteDetailsCacheKey(bus,'pks',false);
  const current={...vehicle,journeyId:42};
  assert.notEqual(key(current),key({...current,lastStopId:2}));
  assert.notEqual(key({...current,lastStopId:undefined}),key(current));
  assert.equal(key(current),key({...current,lastSignalTime:'2026-10-23T04:19:00Z'}));
  assert.notEqual(key(current),key({...current,journeyId:43}));
});
test('fresh shorter PKS details replace cached stops instead of losing to a completeness score',()=>{
  const fresh={...vehicle,lastStopId:2,lastSignalTime:'2026-10-23T04:20:00Z',schedule:[later]};
  const merged={...vehicle,schedule:latestPksRemainingSchedule(vehicle,fresh)};
  assert.deepEqual(upcomingTimedVehicleStops(merged,now).map(s=>s.id),[3]);
  assert.deepEqual(latestPksRemainingSchedule(fresh,vehicle),[later],'older details cannot restore a passed stop');
  assert.deepEqual(latestPksRemainingSchedule({...fresh,schedule:[],routeStops:[]},vehicle),vehicle.schedule,'fleet-only telemetry preserves detailed stops');
  assert.deepEqual(latestPksRemainingSchedule(vehicle,{...fresh,schedule:[]}),[],'a completed remaining sequence can be empty');
});
test('PKS keeps corrected departure times without treating early predictions as passage',()=>{
  const result=upcomingTimedVehicleStops({...vehicle,delay:-180},now);
  assert.deepEqual(result.map(s=>s.id),[2,3]);
  assert.equal(result[0].real,'2026-10-23T04:16:00.000Z');
});
test('PKS remaining sequence preserves a return to the last passed stop on a loop',()=>{
  const returning=stop(1,'25');
  assert.deepEqual(upcomingTimedVehicleStops({...vehicle,schedule:[next,later,returning]},now).map(s=>s.id),[2,3,1]);
});
test('PKS route-only fallback uses reported progress, including before the first passage',()=>{
  assert.deepEqual(upcomingTimedVehicleStops({...vehicle,schedule:[]},now).map(s=>s.id),[2,3]);
  assert.deepEqual(upcomingTimedVehicleStops({...vehicle,schedule:[],lastStopId:undefined},now).map(s=>s.id),[1,2,3]);
});
test('other bus providers retain their current timetable and explicit passage behaviour',()=>{
  for(const provider of ['mpk_rzeszow','marcel']) {
    assert.deepEqual(upcomingTimedVehicleStops({...vehicle,provider},now).map(s=>s.id),[3]);
    assert.deepEqual(upcomingTimedVehicleStops({...vehicle,provider,routeStops:[previous,{...next,isPast:true},later]},now-60_000).map(s=>s.id),[3]);
  }
});

// Exercise the actual map visibility expression, not only the timing helper.
test('map route dots retain PKS stops until confirmed progress, regardless of the clock',()=>{
  const fs=require('node:fs'),ts=require('typescript');
  const source=ts.createSourceFile('BusMap.tsx',fs.readFileSync('components/BusMap.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let expression;
  function visit(node){
    if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='visibleRouteStopIds')expression=node.initializer.getText(source);
    ts.forEachChild(node,visit);
  }
  visit(source);assert.ok(expression,'map marker visibility expression exists');
  const script=ts.transpile(`const result = ${expression};`,{target:ts.ScriptTarget.ES2022});
  const visible=new Function('selectedVehicle','routeStopIds','routeStopsSource','clockMs','upcomingTimedVehicleStops','upcomingVehicleStops',script+';return result;');
  const timing=loadTs('lib/vehicle-stop-timing.ts');
  const upcoming=loadTs('lib/vehicle-upcoming-stops.ts').upcomingVehicleStops;
  const ids=(bus,clock)=>visible(bus,[1,2,3],timing.timedVehicleStops(bus),clock,upcomingTimedVehicleStops,upcoming);
  assert.deepEqual(ids(vehicle,now),['2','3']);
  assert.deepEqual(ids({...vehicle,delay:-480},now+600_000),['2','3']);
  assert.deepEqual(ids({...vehicle,lastStopId:2,schedule:[later]},now),['3']);
  assert.deepEqual(ids({...vehicle,provider:'mpk_rzeszow'},now),['3']);
  assert.deepEqual(ids({...vehicle,provider:'pkp_intercity',type:'train'},now),[1,2,3]);
});
