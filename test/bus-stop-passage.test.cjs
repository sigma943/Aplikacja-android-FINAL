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

const geometry=stops.map(s=>[s.lat,s.lon]);
for(const provider of ['mpk_rzeszow','marcel']){
 test(`${provider}: opening mid-course removes already passed stops without an observed arrival`,()=>{
  const track=createBusStopPassageTracker();
  assert.deepEqual(track(bus(provider,22.015,now,{routeGeometry:geometry}),stops,now).map(s=>s.id),[3]);
 });
 test(`${provider}: sparse fixes can pass a stop without hitting its 60 metre circle`,()=>{
  const track=createBusStopPassageTracker(),v=(lon,t)=>bus(provider,lon,now+t,{routeGeometry:geometry});
  assert.deepEqual(track(v(22.0085,0),stops,now).map(s=>s.id),[2,3]);
  assert.deepEqual(track(v(22.0115,30_000),stops,now+30_000).map(s=>s.id),[3]);
 });
 test(`${provider}: approach, a road bend and a current stop remain visible despite passed ETAs`,()=>{
  for(const lon of [22.008,22.0095,22.01,22.0105]){
   const track=createBusStopPassageTracker();
   assert.deepEqual(track(bus(provider,lon,now,{routeGeometry:geometry}),stops,now).map(s=>s.id),[2,3],String(lon));
  }
  const bend=[[50,22],[50.01,22],[50.01,22.01],[50,22.01],[50,22.02]];
  const track=createBusStopPassageTracker();
  assert.deepEqual(track({...bus(provider,22.008),lat:50.01,routeGeometry:bend},stops,now).map(s=>s.id),[2,3]);
 });
 test(`${provider}: stale, estimated, off-route and jumping positions cannot seed route passage`,()=>{
  for(const extra of [{dataAgeSec:121},{isHistorical:true},{positionQuality:'estimated'},{status:'break'},{lastSignalTime:new Date(now-121_000).toISOString()}]){
   const track=createBusStopPassageTracker();
   assert.deepEqual(track(bus(provider,22.015,now,{routeGeometry:geometry,...extra}),stops,now).map(s=>s.id),[1,2,3]);
  }
  const off=createBusStopPassageTracker();
  assert.deepEqual(off({...bus(provider,22.015),lat:50.01,routeGeometry:geometry},stops,now).map(s=>s.id),[1,2,3]);
  const jump=createBusStopPassageTracker();jump(bus(provider,21.999,now,{routeGeometry:geometry}),stops,now);
  const jumped=bus(provider,22.015,now+1000,{routeGeometry:geometry});
  assert.deepEqual(jump(jumped,stops,now+1000).map(s=>s.id),[1,2,3]);
  assert.deepEqual(jump(jumped,stops,now+1000).map(s=>s.id),[1,2,3],'second consumer cannot bypass the jump check');
 });
 test(`${provider}: crossing and overlapping outward/return geometry remain ambiguous`,()=>{
  for(const route of [
   [[50,22],[50,22.02],[50.01,22.02],[50.01,22],[50,22],[50,22.02]],
   [[50,22],[50,22.02],[50,22]],
  ]){
   const track=createBusStopPassageTracker();
   assert.deepEqual(track(bus(provider,22.015,now,{routeGeometry:route}),stops,now).map(s=>s.id),[1,2,3]);
  }
 });
 test(`${provider}: late map geometry shares progress with the panel on the same GPS snapshot`,()=>{
  const track=createBusStopPassageTracker(),v=bus(provider,22.015);
  assert.deepEqual(track(v,stops,now).map(s=>s.id),[1,2,3]);
  assert.deepEqual(track({...v,routeGeometry:geometry},stops,now).map(s=>s.id),[3]);
  assert.deepEqual(track(v,stops,now).map(s=>s.id),[3]);
  assert.deepEqual(track({...v,tripId:'new'},stops,now).map(s=>s.id),[1,2,3],'course changes clear inherited geometry');
 });
}

test('map geometry is forwarded through the timing helper used by map and panel',()=>{
 const {upcomingTimedVehicleStops}=load('lib/vehicle-stop-timing.ts');
 const vehicle=bus('mpk_rzeszow',22.015,now,{id:'late-map-geometry',routeStops:stops});
 assert.deepEqual(upcomingTimedVehicleStops(vehicle,now).map(s=>s.id),[1,2,3]);
 assert.deepEqual(upcomingTimedVehicleStops(vehicle,now,geometry).map(s=>s.id),[3]);
 assert.deepEqual(upcomingTimedVehicleStops(vehicle,now).map(s=>s.id),[3]);
});

test('clock renders and alternating map/panel consumers reuse route analysis and the same GPS projection',()=>{
 const real=load('lib/bus-route-progress.ts');let preparations=0,projections=0;
 const {createBusStopPassageTracker}=load('lib/bus-stop-passage.ts',{'./bus-route-progress':{
  ...real,prepareBusRouteProgress:(...args)=>{preparations++;return real.prepareBusRouteProgress(...args);},
  routeConfirmedPassedStop:(...args)=>{projections++;return real.routeConfirmedPassedStop(...args);},
 }});
 const track=createBusStopPassageTracker(),v=bus('mpk_rzeszow',22.015);
 for(let i=0;i<240;i++){
  track({...v,routeGeometry:geometry.map(p=>[...p])},stops,now+i*100);
  track(v,stops,now+i*100);
 }
 assert.equal(preparations,1);assert.equal(projections,1);
});

// A short MPK terminal loop can put the outbound and return roads within GPS
// tolerance. Heading comes from successive observations, never old ETAs.
const loopRoute=[[50,22],[50,22.02],[50.00012,22.02],[50.00012,22]];
const loopStops=loopRoute.map(([lat,lon],i)=>({...stops[0],id:i+10,name:`Loop ${i}`,lat,lon,planned:new Date(now+i*60000).toISOString()}));
const loopBus=(lon,offset,extra={})=>({...bus('mpk_rzeszow',lon,now+offset),lat:50.00012,routeGeometry:loopRoute,...extra});
test('MPK terminal loop: two return-leg fixes remove old outbound stops and keep the next stop',()=>{
 const track=createBusStopPassageTracker();
 assert.deepEqual(track(loopBus(22.012,0),loopStops,now).map(s=>s.id),[10,11,12,13],'one ambiguous position is insufficient');
 assert.deepEqual(track(loopBus(22.008,30000),loopStops,now+30000).map(s=>s.id),[13]);
 assert.deepEqual(track(loopBus(22.008,30000),loopStops,now+30000).map(s=>s.id),[13],'second consumer sees the same confirmed suffix');
});
test('MPK terminal loop: outbound motion keeps the return stops instead of jumping across the loop',()=>{
 const track=createBusStopPassageTracker();
 const outbound=(lon,t)=>loopBus(lon,t,{lat:50});
 track(outbound(22.008,0),loopStops,now);
 assert.deepEqual(track(outbound(22.012,30000),loopStops,now+30000).map(s=>s.id),[11,12,13]);
});
test('MPK terminal loop: jitter, stale gaps, course switches and GPS jumps cannot disambiguate the leg',()=>{
 for(const kind of ['jitter','gap','course','jump']){
  const track=createBusStopPassageTracker();track(loopBus(22.012,0),loopStops,now);
  const offset=kind==='gap'?121000:kind==='jump'?1000:30000;
  const v=loopBus(kind==='jitter'?22.0119:22.008,offset,kind==='course'?{tripId:'different'}:{});
  assert.deepEqual(track(v,loopStops,now+offset).map(s=>s.id),[10,11,12,13],kind);
 }
});
test('MPK repeated same-direction legs remain ambiguous even with two fixes',()=>{
 const route=[[50,22],[50,22.02],[50.01,22.02],[50.01,22],[50,22],[50,22.02]];
 const track=createBusStopPassageTracker();
 track(bus('mpk_rzeszow',22.008,now,{routeGeometry:route}),stops,now);
 assert.deepEqual(track(bus('mpk_rzeszow',22.012,now+30000,{routeGeometry:route}),stops,now+30000).map(s=>s.id),[1,2,3]);
});
test('map geometry and bus list share motion-confirmed MPK loop progress',()=>{
 const {upcomingTimedVehicleStops}=load('lib/vehicle-stop-timing.ts');
 const vehicle=(lon,t)=>({...loopBus(lon,t),id:'loop-map-panel',routeGeometry:undefined,routeStops:loopStops});
 upcomingTimedVehicleStops(vehicle(22.012,0),now,loopRoute);
 assert.deepEqual(upcomingTimedVehicleStops(vehicle(22.008,30000),now+30000,loopRoute).map(s=>s.id),[13]);
 assert.deepEqual(upcomingTimedVehicleStops(vehicle(22.008,30000),now+30000).map(s=>s.id),[13]);
});
