const test=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),{gunzipSync}=require('node:zlib'),load=require('./load-ts.cjs');
const {mpkGtfsStopSchedule}=load('lib/mpk-gtfs-runtime.ts');
const transitTime=load('lib/transit-time.ts');
const feed=JSON.parse(gunzipSync(readFileSync('public/data/journeys/mpk.json.gz')));
const monday='2026-11-09',sunday='2026-11-08';

function client({snapshot=feed,today=sunday,requestJson}){
 return load('lib/providers/mpk-departures-client.ts',{
  '../mpk-gtfs-runtime':{loadMpkGtfs:async()=>snapshot,mpkGtfsStopSchedule},
  '../transit-time':{...transitTime,warsawDateIso:()=>today},
  '../transport/http':{requestJson},
 });
}

test('the stop board reads the Albigowa weekday schedule using IDs from its own GTFS calendar',async()=>{
 const current=structuredClone(feed);
 // A current export can name the working-day service PS. The legacy HTTP
 // endpoint silently returns an empty schedule for that identifier.
 current.calendars.PS=current.calendars['2'];
 delete current.calendars['2'];
 for(const trip of current.trips)if(trip[2]==='2')trip[2]='PS';
 for(const exceptions of Object.values(current.exceptions))if(Object.hasOwn(exceptions,'2')){
  exceptions.PS=exceptions['2'];delete exceptions['2'];
 }
 const calls=[];
 const api=client({snapshot:current,requestJson:async url=>{calls.push(url);return {schedule:[]};}});
 const original=global.window;global.window={};
 try{
  const {loadStopDepartures}=load('lib/stop-departures.ts',{
   '@/lib/pks-client':{fetchMpkRzeszowDeparturesClient:api.fetchMpkRzeszowDeparturesClient},
   '@/components/stops-panel/stop-domain':{...load('components/stops-panel/stop-domain.ts'),selectedDateIso:()=>monday},
  });
  const stop={id:'mpk_rzeszow:1119',name:'Albigowa I 21 nż',type:'bus',sourceProviderIds:['mpk_rzeszow'],providerStopIds:{mpk_rzeszow:'1119'}};
  const board=await loadStopDepartures(stop,1);
  assert.deepEqual(board.warnings,[]);
  assert.deepEqual(board.departures.map(row=>row.time),['05:40','06:40','07:40','15:46','17:01','18:01','19:35']);
  assert.ok(board.departures.every(row=>row.line==='46'&&row.direction==='Dworzec Lokalny'&&row.realtimeSource===undefined));
  const neighbour=await api.fetchMpkRzeszowDeparturesClient('1117',monday);
  assert.ok(neighbour.length>0&&neighbour.every(row=>row.line==='46'));
  assert.deepEqual(await api.fetchMpkRzeszowDeparturesClient('1119','2026-11-11'),[]);
  assert.deepEqual(calls,[],'valid timetables and genuine holidays never query the legacy endpoint');
 }finally{global.window=original;}
});

test('today combines GTFS with the live board and keeps live metadata without duplicates',async()=>{
 const planned=mpkGtfsStopSchedule(feed,'1119',monday);
 const [first]=planned;
 const calls=[];
 const api=client({today:monday,requestJson:async url=>{
  calls.push(url);
  assert.match(url,/departures\.php/);
  return [{linia:'46',kierunek:'Dworzec Lokalny',trip_id:Number(first.trip_id),czas_odjazdu:'05:40',czas_odjazdu_real:'05:42'}];
 }});
 const original=global.window;global.window={};
 try{
  const rows=await api.fetchMpkRzeszowDeparturesClient('1119',monday);
  assert.equal(rows.length,planned.length);
  assert.equal(rows[0].real_departure_time,'05:42');
  assert.equal(rows[0].realtime_source,'stop-board');
  assert.equal(calls.length,1);
 }finally{global.window=original;}
});

test('an unknown stop or a date outside GTFS coverage keeps the legacy path',async()=>{
 assert.equal(mpkGtfsStopSchedule(feed,'1119','2027-01-01'),undefined);
 assert.equal(mpkGtfsStopSchedule(feed,'missing',monday),undefined);
 const original=global.window,oldFetch=global.fetch;global.window={};
 try{
  const calendar=JSON.parse(readFileSync('public/data/mpk-service-calendar.json'));
  global.fetch=async()=>({ok:true,json:async()=>calendar});
  const api=client({requestJson:async url=>{
   assert.match(url,/offline_schedule\.php\?stop_id=missing&service_id=2$/);
   return {schedule:{'05':[{line:'46',trip_id:7,departure_time:'05:40:00'}]}};
  }});
  assert.equal((await api.fetchMpkRzeszowDeparturesClient('missing',monday))[0].trip_id,7);
 }finally{global.window=original;global.fetch=oldFetch;}
});
