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
  const live=departureFromLiveVehicle(departure,[bus],now);
  assert.equal(live.realAtMs,planned+delay*1000);
  assert.equal(live.realtimeSource,'vehicle-feed');
  assert.equal(mapStopDepartureRows([departure],[bus],now)[0].delayMinutes,delay/60);
  assert.equal(departureFromLiveVehicle(departure,[{...bus,journeyId:999}],now),departure);
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

test('a fresh confirmed call fills an empty stop board, but never the opposite side or a duplicate',()=>{
  const {stopDeparturesWithLiveVehicles}=loadTs('lib/vehicle-stop-timing.ts');
  const now=Date.parse('2026-11-06T14:36:00Z'),planned=now+180_000;
  const stop={id:'1353',providerStopIds:{pks:'1353,gtfs:923'}};
  const call={id:1353,name:'Medynia Głog. Zad. Pętl. 89',planned:new Date(planned).toISOString(),real:null};
  const bus={id:'120',provider:'pks',operatorName:'PKS Rzeszów',routeShortName:'202',journeyId:811,
    direction:'Medynia Głogowska, Pawilon',delay:0,status:'active',
    lastSignalTime:new Date(now-25_000).toISOString(),liveNextStops:[call]};
  const rows=stopDeparturesWithLiveVehicles([], [bus],stop,now);
  assert.equal(rows.length,1);
  assert.equal(rows[0].line,'202');
  assert.equal(rows[0].realAtMs,planned);
  assert.equal(rows[0].realtimeSource,'vehicle-feed');
  assert.equal(loadTs('lib/map-stop-departures.ts').formatMapStopDepartures(rows,now)[0].time,'3 min');
  assert.equal(stopDeparturesWithLiveVehicles(rows,[bus],stop,now).length,1);
  assert.equal(stopDeparturesWithLiveVehicles([], [bus],{id:'1354',providerStopIds:{pks:'1354'}},now).length,0);
  assert.equal(stopDeparturesWithLiveVehicles([], [bus],undefined,now).length,0);
  assert.equal(stopDeparturesWithLiveVehicles([], [{...bus,lastSignalTime:new Date(now-121_000).toISOString()}],stop,now).length,0);
  assert.equal(stopDeparturesWithLiveVehicles([], [{...bus,liveNextStops:[{...call,isPast:true}]}],stop,now).length,0);
});

test('Boguchwała 68 keeps the published 15:00 course after 15:02 and shows the 15:04 prediction on both boards',()=>{
  const {readFileSync}=require('node:fs'),{gunzipSync}=require('node:zlib');
  const {pksGtfsDepartures}=loadTs('lib/pks-gtfs.ts');
  const {stopDeparturesWithLiveVehicles}=loadTs('lib/vehicle-stop-timing.ts');
  const {liveMapStopDepartures,formatMapStopDepartures}=loadTs('lib/map-stop-departures.ts');
  const feed=JSON.parse(gunzipSync(readFileSync('public/data/journeys/pks.json.gz')));
  const day='2026-11-09',planned=warsawTimeMs(day,'15:00'),now=warsawTimeMs(day,'15:02');
  const stop={id:'11124',name:'Boguchwała 68',providerStopIds:{pks:'1017,11124,gtfs:70'}};
  const course=pksGtfsDepartures(feed,['70'],day).find(row=>row.line_name==='108'&&Date.parse(row.timetable_time)===planned);
  assert.ok(course.journey_id.startsWith('gtfs:'));
  const schedule=mapJourneyToDeparture(course,0,'gtfs:70');
  const call={id:11124,planned:course.timetable_time,real:course.timetable_time};
  const bus={id:'87',provider:'pks',status:'active',routeShortName:'108',journeyId:22928,delay:240,
    lastSignalTime:new Date(now-20_000).toISOString(),liveNextStops:[call]};
  const list=stopDeparturesWithLiveVehicles([schedule],[bus],stop,now);
  assert.equal(list.length,1);
  assert.equal(list[0].id,schedule.id);
  assert.equal(list[0].time,'15:04');
  assert.equal(list[0].realAtMs,planned+240_000);
  const map=formatMapStopDepartures(liveMapStopDepartures([schedule],[bus],stop,now),now);
  assert.deepEqual(map.map(({line,time,delayMinutes})=>[line,time,delayMinutes]),[['108','2 min',4]]);
  assert.equal(formatMapStopDepartures(liveMapStopDepartures([schedule],[bus],{...stop,providerStopIds:{pks:'1018'}},now),now).length,0);
  const stale={...bus,lastSignalTime:new Date(now-121_000).toISOString()};
  assert.equal(formatMapStopDepartures(liveMapStopDepartures([schedule],[stale],stop,now),now).length,0);
  const other={...bus,id:'88',journeyId:22929,delay:180};
  assert.deepEqual(stopDeparturesWithLiveVehicles([schedule],[bus,other],stop,now),[schedule]);
  assert.deepEqual(stopDeparturesWithLiveVehicles([schedule,{...schedule,id:'other-course'}],[bus],stop,now).map(row=>row.time),['15:00','15:00']);
  const past={...bus,delay:-120};
  assert.equal(formatMapStopDepartures(liveMapStopDepartures([schedule],[past],stop,now),now).length,0);
});

test('a real terminating PKS course cannot populate bay 1 or supply delay for an outbound course',()=>{
  const {mapVehicle}=loadTs('lib/pks-client.ts',{},'\nexport {mapVehicle};');
  const {stopDeparturesWithLiveVehicles}=loadTs('lib/vehicle-stop-timing.ts');
  const raw=require('./fixtures/pks-301-37-2026-10-19.json');
  const now=Date.parse('2026-10-19T08:11:00Z');
  const bus={...mapVehicle({...raw,delay:120,position:{...raw.position,position_date:new Date(now).toISOString()}},now,true,{},false),provider:'pks'};
  assert.equal(bus.status,'active');
  assert.equal(bus.liveNextStops.at(-1).id,3731);
  assert.equal(bus.liveNextStops.at(-1).timeType,'arrival');
  const stop={id:'3731',name:'Rzeszów D.A. st. 1',areaId:'1937',code:'1',providerStopIds:{pks:'3731'}};
  assert.deepEqual(stopDeparturesWithLiveVehicles([],[bus],stop,now),[]);
  const call=bus.liveNextStops.at(-1);
  const board=[mapJourneyToDeparture({line_name:'301',route_description:'Krasne',timetable_time:call.planned,journey_id:'gtfs:8000'},0,'3731')];
  assert.deepEqual(stopDeparturesWithLiveVehicles(board,[bus],stop,now),board);
  const ambiguous={...bus,liveNextStops:[{...call,timeType:undefined}]};
  assert.deepEqual(stopDeparturesWithLiveVehicles([],[ambiguous],stop,now),[],'a technical platform ID alone never proves boarding');
  assert.deepEqual(stopDeparturesWithLiveVehicles(board,[ambiguous],stop,now),board);
});

test('a static alias response does not overwrite the PKS live board for the same departure',async()=>{
  const {StopTimetableStore}=loadTs('lib/stop-timetable-store.ts');
  const store=new StopTimetableStore();
  const planned={id:'108:15:00:Gwoźnica',carrier:{id:'pks'},time:'15:00'};
  const live={...planned,time:'15:04',realtimeSource:'stop-board'};
  const source=(key,row)=>({key,label:'PKS',load:async()=>({departures:[row]})});
  assert.deepEqual((await store.load([source('live',live),source('static',planned)])).departures,[live]);
});

test('a current GTFS feed does not hide the PKS timetable of an unmapped EINFO platform',async()=>{
  const oldWindow=global.window;
  global.window={};
  try{
    const day=warsawDateIso();
    const api=loadTs('lib/providers/pks-departures.ts',{
      '../pks-gtfs-runtime':{
        loadPksGtfs:async()=>({validFrom:'20200101',validUntil:'20991231',stops:{},trips:[],managedLines:['108']}),
        pksGtfsIndex:()=>({byStop:{}}),
      },
      '../transport/http':{requestEinfoJson:async path=>path.includes('nearest-departures')?{journeys:[]}:
        {items:[{line_name:'108',description:'Gwoźnica Górna',journeys:[{journey_id:22928,time:'15:00',stop_point_code:'68'}]}]}},
    });
    const result=await api.fetchDeparturesClient('11124','4219','68',day);
    assert.deepEqual(result.journeys.map(row=>row.journey_id),[22928]);
  }finally{
    if(oldWindow===undefined)delete global.window;
    else global.window=oldWindow;
  }
});
