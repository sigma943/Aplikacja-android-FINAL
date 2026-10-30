const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {createBusStopPassageTracker}=load('lib/bus-stop-passage.ts');
const now=Date.parse('2026-10-30T05:20:00Z');
const stops=[0,1,2].map(i=>({id:i+1,name:`Stop ${i+1}`,lat:50,lon:22+i*.01,
 planned:new Date(now-300_000+i*60_000).toISOString(),real:new Date(now-300_000+i*60_000).toISOString()}));
const bus=(provider,lon,at=now,extra={})=>({id:'test',provider,tripId:'course',lat:50,lon,
 lastSignalTime:new Date(at).toISOString(),dataAgeSec:0,status:'active',...extra});

for(const provider of ['mpk_rzeszow','marcel']) {
 test(`${provider}: advancing time, passed ETAs and stale GPS cannot remove a stop`,()=>{
  const track=createBusStopPassageTracker(),v=bus(provider,21.999);
  const rows=stops.map(s=>({...s,isPast:true}));
  assert.deepEqual(track(v,rows,now).map(s=>s.id),[1,2,3]);
  assert.deepEqual(track(v,rows,now+600_000).map(s=>s.id),[1,2,3]);
 });
 test(`${provider}: retain on approach and at stop, remove only after GPS departure toward the next`,()=>{
  const track=createBusStopPassageTracker();
  const ids=(lon,offset)=>track(bus(provider,lon,now+offset),stops,now+offset).map(s=>s.id);
  assert.deepEqual(ids(21.999,0),[1,2,3]);
  assert.deepEqual(ids(22,10_000),[1,2,3]);
  assert.deepEqual(ids(22,70_000),[1,2,3],'waiting beyond the ETA retains the stop');
  assert.deepEqual(ids(22.0005,80_000),[1,2,3],'small GPS jitter retains the stop');
  assert.deepEqual(ids(22.002,100_000),[2,3]);
  assert.deepEqual(ids(22.002,100_000),[2,3],'map and panel can consume the same snapshot');
 });
 test(`${provider}: old snapshots, GPS jumps and moving back cannot confirm passage`,()=>{
  for(const change of ['old','jump','back','stale','break']){
   const track=createBusStopPassageTracker();track(bus(provider,22),stops,now);
   const at=now+(change==='old'?-10_000:change==='jump'?1_000:30_000);
   const extra=change==='stale'?{dataAgeSec:121}:change==='break'?{status:'break'}:{};
   const lon=change==='back'?21.998:22.002;
   assert.deepEqual(track(bus(provider,lon,at,extra),stops,Math.max(now,at)).map(s=>s.id),[1,2,3],change);
  }
 });
 test(`${provider}: a different course or service day never inherits passage`,()=>{
  const track=createBusStopPassageTracker();
  track(bus(provider,22),stops,now);
  assert.deepEqual(track(bus(provider,22.002,now+30_000),stops,now+30_000).map(s=>s.id),[2,3]);
  assert.deepEqual(track(bus(provider,22.002,now+40_000,{tripId:'other'}),stops,now+40_000).map(s=>s.id),[1,2,3]);
  const tomorrow=stops.map(s=>({...s,planned:new Date(Date.parse(s.planned)+86400_000).toISOString()}));
  assert.deepEqual(track(bus(provider,22.002,now+86400_000),tomorrow,now+86400_000).map(s=>s.id),[1,2,3]);
 });
 test(`${provider}: missing coordinates and ambiguous loop visits keep dots visible`,()=>{
  for(const rows of [stops.map(s=>({...s,lat:undefined,lon:undefined})),[...stops,{...stops[0],planned:new Date(now+600_000).toISOString()}]]){
   const track=createBusStopPassageTracker();track(bus(provider,22),rows,now);
   assert.equal(track(bus(provider,22.002,now+30_000),rows,now+30_000).length,rows.length);
  }
 });
}

test('myBus explicit remaining sequence is retained independently of clock and GPS',()=>{
 const track=createBusStopPassageTracker();
 const rows=stops.map((s,i)=>({...s,isPast:i===0}));
 assert.deepEqual(track(bus('mpk_rzeszow',22,now,{scheduleSource:'mybus'}),rows,now).map(s=>s.id),[2,3]);
});

test('map and bus panel timing helper ignores Marcel time-derived isPast flags',()=>{
 const {upcomingTimedVehicleStops}=load('lib/vehicle-stop-timing.ts');
 const v=bus('marcel',22,now,{routeStops:stops.map(s=>({...s,isPast:true})),schedule:[]});
 assert.deepEqual(upcomingTimedVehicleStops(v,now+600_000).map(s=>s.id),[1,2,3]);
});
