const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs'),fixture=require('./pks-gtfs-fixtures.cjs');
const {parsePksGtfs}=load('lib/pks-gtfs.ts');
const {assessTimetableUpdate:assess,TIMETABLE_CONFIRMATION_MS:interval}=load('lib/timetable-update-guard.ts');
const date='2026-11-04',now=Date.parse(date+'T07:00:00Z');
for(const provider of ['pks','mpk']){
 test(provider+': additions are immediate; withdrawals need the same confirmation after 15 minutes',()=>{
  const old=parsePksGtfs(fixture(1),provider),next=parsePksGtfs(fixture(2),provider);
  const first=assess(old,next,undefined,now,date);assert.equal(first.accept,false);assert.equal(first.reason,'confirming');
  assert.equal(assess(old,next,first.pending,now+interval-1,date).accept,false,'rapid clicks cannot confirm removals');
  assert.equal(assess(old,next,first.pending,now+interval,date).accept,true);
  const added=structuredClone(old);added.trips.push(['extra','999','PS',50000,0]);assert.equal(assess(old,added,undefined,now,date).accept,true);
  assert.equal(assess(old,old,first.pending,now+interval,date).reason,'additions','a restored course cancels the candidate');
 });
 test(provider+': renumbered trip IDs, changed source metadata and calendar additions do not delete courses',()=>{
  const old=parsePksGtfs(fixture(1),provider),renumbered=structuredClone(old);
  renumbered.trips.forEach((trip,i)=>{trip[0]='new-id-'+i;});renumbered.revision='new-zip';
  assert.equal(assess(old,renumbered,undefined,now,date).accept,true);
  renumbered.calendars.PS.days='1111111';assert.equal(assess(old,renumbered,undefined,now,date).accept,true);
  const holiday=structuredClone(old);holiday.exceptions['20261106']={PS:2};assert.equal(assess(old,holiday,undefined,now,date).accept,false,'an exception removing future service needs confirmation');
 });
 test(provider+': large partial responses stay blocked even when they repeat',()=>{
  const old=parsePksGtfs(fixture(1),provider);old.trips=Array.from({length:100},(_,i)=>['id'+i,'108','PS',8*3600+i*60,0]);
  const next=structuredClone(old);next.trips=next.trips.slice(0,65);
  const first=assess(old,next,undefined,now,date);assert.equal(first.reason,'large-drop');assert.equal(first.accept,false);
  assert.equal(assess(old,next,first.pending,now+interval,date).accept,false);
 });
 test(provider+': a changing omission never confirms a different missing course',()=>{
  const old=parsePksGtfs(fixture(1),provider),a=structuredClone(old),b=structuredClone(old);a.trips=a.trips.slice(1);b.trips=b.trips.slice(0,1);
  const first=assess(old,a,undefined,now,date),second=assess(old,b,first.pending,now+interval,date);
  assert.equal(second.accept,false);assert.notEqual(second.pending.signature,first.pending.signature);
  assert.equal(second.pending.firstSeenAt,now+interval);
 });
}
test('MPK stop API rereads courses on every request, including additions and withdrawals',async()=>{
 const oldFetch=global.fetch,day=load('lib/transit-time.ts').warsawDateIso(1);let rows=[{line:'15',trip_id:'old',trip_headsign:'A',departure_time:'23:50:00'}],calls=0;
 try{
  global.fetch=async()=>({ok:true,json:async()=>({})});
  const api=load('lib/providers/mpk-departures-client.ts',{'../transport/http':{requestJson:async url=>{if(!url.includes('offline_schedule'))throw Error('Unexpected '+url);calls++;return {schedule:{1:rows}};}},'../mpk-departures':{mpkBoardEntries:()=>[],mpkServicesOnDate:()=>['1']}});
  assert.deepEqual((await api.fetchMpkRzeszowDeparturesClient('777',day)).map(r=>r.trip_id),['old']);
  rows=[...rows,{line:'15',trip_id:'new',trip_headsign:'A',departure_time:'23:55:00'}];
  assert.deepEqual((await api.fetchMpkRzeszowDeparturesClient('777',day)).map(r=>r.trip_id),['old','new']);
  rows=rows.slice(1);assert.deepEqual((await api.fetchMpkRzeszowDeparturesClient('777',day)).map(r=>r.trip_id),['new']);
  assert.equal(calls,3);
 }finally{global.fetch=oldFetch;}
});
test('MPK catalog follows only the accepted GTFS version and keeps existing names and unrelated API labels',async()=>{
 const parse=load('lib/pks-gtfs.ts').parsePksGtfs;let feed=parse(fixture(1),'mpk');
 const runtime=load('lib/mpk-gtfs-runtime.ts',{'./gtfs-runtime':{createGtfsRuntime:()=>({load:async()=>feed,peek:()=>feed,refresh:async()=>feed,status:()=>''})}});
 const base=[{stop_id:'777',stop_name:'Existing correct platform name',stop_lat:53.1,stop_lon:19.9,lines:'108,109,999,doj'}];
 let rows=await runtime.withMpkGtfsStops(base);assert.equal(rows[0].stop_name,base[0].stop_name);assert.equal(rows[0].lines,'999,108,109');
 feed=parse(fixture(2),'mpk');feed.managedLines.push('108');rows=await runtime.withMpkGtfsStops(base);
 assert.equal(rows[0].lines,'999,109,245');assert.equal(rows[0].stop_name,base[0].stop_name);assert.equal(base[0].lines,'108,109,999,doj');
});
