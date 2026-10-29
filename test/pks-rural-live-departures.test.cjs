const {test}=require('node:test');
const assert=require('node:assert/strict');
const loadTs=require('./load-ts.cjs');
const {warsawDateIso,warsawTimeMs}=loadTs('lib/transit-time.ts');
const {mapJourneyToDeparture}=loadTs('components/stops-panel/stop-domain.ts');
const {departureFromLiveVehicle}=loadTs('lib/vehicle-stop-timing.ts');
const {mapStopDepartureRows}=loadTs('lib/map-stop-departures.ts');

async function ruralBoard(ids,boardExtra={}) {
  const day=warsawDateIso();
  const board={line_name:'108',route_description:'Gwoźnica Górna',timetable_time:`${day} 21:40:00`,deviation:null,...boardExtra};
  const api=loadTs('lib/providers/pks-departures.ts',{'../transport/http':{requestEinfoJson:async path=>
    path.includes('nearest-departures')?{journeys:[board]}:{items:[{line_name:'108',description:'Gwoźnica Górna',journeys:ids.map(journey_id=>({journey_id,time:'21:40',stop_point_code:'08',legends:[]}))}]}}});
  return (await api.fetchDeparturesClient('11028','1061','08',day)).journeys;
}

for(const delay of [-480,300,0]) test(`rural board without course ID uses live vehicle deviation ${delay}s`,async()=>{
  const rows=await ruralBoard([22836]);
  assert.equal(rows.length,1,'keep one departure when the board and timetable overlap');
  assert.equal(rows[0].journey_id,22836);
  const planned=warsawTimeMs(warsawDateIso(),'21:40');
  const now=planned-10*60_000;
  const bus={id:'87',provider:'pks',routeShortName:'108',journeyId:22836,delay,status:'active',dataAgeSec:5,lastSignalTime:new Date(now).toISOString(),schedule:[],routeStops:[]};
  const departure=mapJourneyToDeparture(rows[0],0,'11028');
  const live=departureFromLiveVehicle(departure,[bus]);
  assert.equal(live.realAtMs,planned+delay*1000);
  assert.equal(live.realtimeSource,'vehicle-feed');
  assert.equal(mapStopDepartureRows([departure],[bus],now)[0].delayMinutes,delay/60);
  assert.equal(departureFromLiveVehicle(departure,[{...bus,journeyId:999}]),departure);
});

test('rural merge preserves board telemetry and explicit course identity',async()=>{
  const [row]=await ruralBoard([22836],{journey_id:999,deviation:3,vehicle_id:87});
  assert.equal(row.journey_id,999);
  assert.equal(row.deviation,3);
  assert.equal(row.vehicle_id,87);
});

test('ambiguous same-time rural courses do not supply an arbitrary identity',async()=>{
  const [row]=await ruralBoard([22836,999]);
  assert.equal(row.journey_id,undefined);
});
