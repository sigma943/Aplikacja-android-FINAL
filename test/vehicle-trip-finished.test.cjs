const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {vehicleTripFinished}=load('lib/vehicle-trip-finished.ts'),now=Date.now();
for(const provider of ['pks','mpk_rzeszow','marcel'])test(provider+': terminal break never leaves an endless upcoming-stop placeholder',()=>{
 const vehicle={provider,id:'1',speed:0,lat:50,lon:22,status:'break',schedule:[]};
 assert.equal(vehicleTripFinished(vehicle,now),true);
 assert.equal(vehicleTripFinished({...vehicle,nextTripStartAtMs:now+600000},now),false,'new known course can show its future stops');
 assert.equal(vehicleTripFinished({...vehicle,status:'active',routeStops:[{id:1,lat:50,lon:22,planned:new Date(now-60000).toISOString()}]},now),true);
 assert.equal(vehicleTripFinished({...vehicle,status:'active',routeStops:[{id:1,lat:51,lon:22,planned:new Date(now-60000).toISOString()}]},now),false,'late running bus is not assumed finished');
 assert.equal(vehicleTripFinished({...vehicle,schedule:[{id:1,planned:new Date(now+600000).toISOString()}]},now),false);
 assert.equal(vehicleTripFinished({...vehicle,speed:20},now),false);
});

test('PKS reports a completed course at the final one-based stop number, never the penultimate stop',async()=>{
 const original=global.fetch,raw=structuredClone(require('./fixtures/pks-vehicle.json'));
 raw.position.position_date=new Date().toISOString();raw.position.speed=0;raw.position.last_stop_point_distance=0;raw.next_stop_points=[];
 raw.journey.departure_time='00:00:00';raw.journey.vehicle_journey_date='2026-01-01';
 global.fetch=async()=>new Response(JSON.stringify([raw]));
 try{
  const api=load('lib/pks-client.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}}});
  raw.position.last_stop_point_number=raw.journey.route.stop_points.length-1;
  const [before]=await api.fetchVehiclesClient(true,['pks']);assert.equal(before.status,'active');
  raw.position.last_stop_point_number=raw.journey.route.stop_points.length;
  const [ended]=await api.fetchVehiclesClient(true,['pks']);assert.equal(ended.status,'break');
  assert.equal(ended.lastStopId,raw.journey.route.stop_points.at(-1),'terminal identity uses the same one-based ordinal');
 }finally{global.fetch=original;}
});
