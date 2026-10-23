const {test}=require('node:test');
const assert=require('node:assert/strict');
const loadTs=require('./load-ts.cjs');
const {upcomingTimedVehicleStops}=loadTs('lib/vehicle-stop-timing.ts');
const {vehicleRouteDetailsCacheKey}=loadTs('lib/home/vehicle-display.ts');
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
