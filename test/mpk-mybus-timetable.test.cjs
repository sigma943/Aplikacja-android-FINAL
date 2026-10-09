const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const load=require('./load-ts.cjs');
const xml=fs.readFileSync('test/fixtures/mpk-mybus-timetable.xml','utf8');
const now=Date.parse('2026-10-08T15:57:00Z');
for(const path of ['lib/mpk-mybus-timetable.ts','functions/src/transport/mpk-mybus-timetable.ts']) {
 test(`${path}: live vehicle 971 has eight next stops and real times, without invented planned times`,()=>{
  const {parseMybusTimetable:parse}=load(path),stops=parse(xml,now,'3');
  assert.equal(stops.length,8);assert.equal(stops[0].id,1345);assert.equal(stops[0].name,'Boguchwała 70');assert.equal(stops.at(-1).name,'Lutoryż pętla 04');
  assert.equal(stops[0].planned,null);assert.equal(Date.parse(stops[0].real)-now,44000);assert.equal(Date.parse(stops.at(-1).real)-now,644000);
  assert.deepEqual(parse(xml,now,'7'),[]);assert.throws(()=>parse('<html>Error</html>',now),/Invalid/);
 });
 test(`${path}: scheduled midnight, invalid IDs and missing estimates`,()=>{
  const {parseMybusTimetable:parse}=load(path);
  const result=parse('<Schedules nr="3"><Stop id="12" name="A &amp; B" th="00" tm="02" s="" m="0"/><Stop id="0" name="bad"/><Stop id="13" name="No time" th="" tm="" s="" m="2"/></Schedules>',Date.parse('2026-10-08T21:59:00Z'),'3');
  assert.equal(result.length,2);assert.equal(result[0].name,'A & B');assert.equal(result[0].planned,'2026-10-08T22:02:00.000Z');assert.equal(result[0].real,null);assert.equal(result[1].real,null);
 });
}
function api(trip,fail=false){
 const calls=[],raw={nb:'971',nr:'3',op:'Lutoryż',x:'21.96',y:'50.01',ik:'358',s:'1',is:'0'};
 return {calls,client:load('lib/providers/mpk-vehicles.ts',{
 '../transport/http':{requestJson:async url=>{calls.push(url);if(url.includes('api.php'))return [raw];if(url.includes('get_vehicles'))return [];if(fail)throw Error('old API down');return {stops:trip};},requestText:async url=>{calls.push(url);return xml;}},
 '../providers/mpk-departures-client':{fetchMpkRzeszowStopsClient:async()=>[]},
 })};
}
for(const fail of [false,true])test(`details use myBus after ${fail?'failed':'empty'} old schedule`,async()=>{
 const {client,calls}=api([],fail);const vehicle=await client.fetchMpkRzeszowVehicleDetailsDirect('mpk_rzeszow_971',true);
 assert.equal(vehicle.schedule.length,8);assert.equal(vehicle.scheduleSource,'mybus');assert.equal(vehicle.id,'mpk_rzeszow_971');assert.equal(vehicle.schedule[0].planned,null);assert.ok(calls.some(u=>u.includes('GetVehicleTimeTable?nNb=971')));
});
test('healthy old timetable never queries myBus',async()=>{
 const {client,calls}=api([{stop_id:1345,stop_name:'Boguchwała 70',departure_time:'17:59:00'}]);
 const vehicle=await client.fetchMpkRzeszowVehicleDetailsDirect('mpk_rzeszow_971',true);assert.equal(vehicle.schedule.length,1);assert.equal(vehicle.scheduleSource,undefined);assert.equal(calls.some(u=>u.includes('GetVehicleTimeTable')),false);
});
test('empty primary schedule is retried on recovery',async()=>{
 const {client}=api([]);const stops=await client.fetchMpkTripStops('358');assert.deepEqual(stops,[]);assert.equal(client.mpkTripStopsByTripCache.has('358'),false);
});
test('backend details recover next stops from myBus when old trip is empty',async()=>{
 const previous=global.fetch;
 global.fetch=async url=>({ok:true,status:200,text:async()=>url.includes('api.php')?JSON.stringify([{nb:'971',nr:'3',op:'Lutoryż',x:'21.96',y:'50.01',ik:'358',s:'1',is:'0'}]):url.includes('GetVehicleTimeTable')?xml:url.includes('get_trip_stops')?'{"stops":[]}':'[]'});
 try {
  const api=load('functions/src/transport/mpk-rzeszow-provider.ts',{'./cache':{getCachedValue:async(key,{loader})=>({value:await loader(),cache:'miss'})}});
  const vehicle=await api.mpkRzeszowProvider.getVehicleDetails('mpk_rzeszow_971');assert.equal(vehicle.schedule.length,8);assert.equal(vehicle.scheduleSource,'mybus');assert.equal(vehicle.schedule[0].planned,null);
 }finally{global.fetch=previous;}
});
test('backup failure preserves vehicle telemetry instead of dropping the bus',async()=>{
 const client=load('lib/providers/mpk-vehicles.ts',{
  '../transport/http':{requestJson:async url=>url.includes('api.php')?[{nb:'971',nr:'3',op:'Lutoryż',x:'21.96',y:'50.01',ik:'358',s:'1',is:'0'}]:url.includes('get_trip_stops')?{stops:[]}:[],requestText:async()=>{throw Error('backup down');}},
  '../providers/mpk-departures-client':{fetchMpkRzeszowStopsClient:async()=>[]},
 });
 const vehicle=await client.fetchMpkRzeszowVehicleDetailsDirect('mpk_rzeszow_971',true);assert.equal(vehicle.id,'mpk_rzeszow_971');assert.equal(vehicle.lat,50.01);assert.equal(vehicle.scheduleSource,undefined);
});
