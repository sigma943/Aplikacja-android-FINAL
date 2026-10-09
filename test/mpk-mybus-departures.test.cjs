const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),load=require('./load-ts.cjs');
const now=Date.parse('2026-10-09T03:25:50Z'),date='2026-10-09';
const {parseMybusDepartures,mergeMybusDepartures}=load('lib/mpk-mybus-departures.ts');
const xml=fs.readFileSync('test/fixtures/mpk-mybus-stop-100.xml','utf8');
const domain=load('components/stops-panel/stop-domain.ts',{'@/Panel/src/components/StopList':{},'@/Panel/src/components/BusStopDetail':{},'@/lib/pks-client':{}});
test('Matuszczaka SIP100 resolves real line 15 prediction independently of the offline timetable',()=>{
 const board=parseMybusDepartures(xml,'100',now),forecast=board[0];
 assert.equal(forecast.line,'15');assert.equal(forecast.vehicle,'815');assert.equal(forecast.atMs,Date.parse('2026-10-09T03:34:19Z'));assert.equal(forecast.realtime,true);
 assert.equal(board[1].realtime,false);
 const rows=mergeMybusDepartures([{line:'15',trip_headsign:'Olbrachta p. Jarową',departure_time:'05:33:00',trip_id:234592},{line:'15',trip_headsign:'Olbrachta p. Jarową',departure_time:'06:02:00',trip_id:226275}],board,date,now);
 assert.equal(rows.length,2);assert.equal(rows[0].real_departure_at_ms,forecast.atMs);assert.equal(rows[1].real_departure_at_ms,undefined);
 const departure=domain.departureFromMpkSchedule(rows[0],date,0);
 assert.equal(departure.time,'05:34');assert.equal(departure.delayMins,1);assert.equal(departure.status,'delayed');assert.equal(departure.boardTimePrecisionMs,0);
});
test('delayed or early buses update only their unique course; ambiguous headways never receive invented delays',()=>{
 const board=[{id:'sip:123',line:'3',direction:'Dworzec',atMs:Date.parse('2026-10-09T03:36:00Z'),realtime:true,atStop:false,vehicle:'836'}];
 const plan=[{line:'3',trip_headsign:'Dworzec',departure_time:'05:30:00',trip_id:1},{line:'3',trip_headsign:'Dworzec',departure_time:'06:00:00',trip_id:2}];
 const rows=mergeMybusDepartures(plan,board,date,now);assert.equal(rows.length,2);assert.equal(domain.departureFromMpkSchedule(rows[0],date,0).delayMins,6);assert.equal(rows[1].real_departure_at_ms,undefined);
 const early=mergeMybusDepartures(plan,[{...board[0],atMs:Date.parse('2026-10-09T03:28:00Z')}],date,now);assert.equal(domain.departureFromMpkSchedule(early[0],date,0).delayMins,-2);
 const ambiguous=mergeMybusDepartures([...plan,{...plan[0],departure_time:'05:40:00',trip_id:3}],board,date,now);
 assert.ok(ambiguous.every(row=>!row.trip_id||row.real_departure_at_ms===undefined));
 const live=domain.departureFromMpkSchedule(ambiguous.at(-1),date,0);assert.equal(live.realAtMs,board[0].atMs);assert.equal(live.plannedAtMs,undefined);assert.equal(live.status,'unknown');
 assert.ok(!ambiguous.at(-1).trip_id,'SIP course IDs never leak into GTFS trip identity');
});
test('two forecasts cannot claim the same planned course, and a healthy primary prediction stays authoritative',()=>{
 const plan=[{line:'3',trip_headsign:'Dworzec',departure_time:'05:30:00',trip_id:1}];
 const row={id:'a',line:'3',direction:'Dworzec',atMs:Date.parse('2026-10-09T03:30:00Z'),realtime:true,atStop:false};
 const rows=mergeMybusDepartures(plan,[row,{...row,id:'b',atMs:row.atMs+60_000}],date,now);assert.equal(rows[0].real_departure_at_ms,undefined);
 const primary={...plan[0],real_departure_time:'05:35'};
 assert.equal(mergeMybusDepartures([primary],[row],date,now)[0].real_departure_time,'05:35');
});
test('midnight rollover, exact seconds, at-stop status and scheduled-only rows remain distinct',()=>{
 const midnight=Date.parse('2026-10-09T21:59:50Z');
 const board=parseMybusDepartures('<Departures i="100"><D i="1" iks="2" r="3" d="Dworzec" n="815" t="130" vr="140" m="1"/><D i="3" r="4" d="Dworzec" n="0" t="300" vr="310" m="3"/></Departures>','100',midnight);
 assert.equal(board[0].atMs,Date.parse('2026-10-09T22:02:10Z'));assert.equal(board[0].atStop,true);assert.equal(board[1].realtime,false);
 assert.equal(parseMybusDepartures('<Departures i="100"><D r="3" d="Dworzec" n="0" t="300" vr="310" m="2"/></Departures>','100',midnight)[0].realtime,true,'an explicit prediction does not require vehicle metadata');
 assert.throws(()=>parseMybusDepartures(xml,'101',now),/mismatch/);assert.throws(()=>parseMybusDepartures('<html/>','100',now),/Invalid/);
 assert.deepEqual(parseMybusDepartures('<Departures i="100"><D r="3" d="Dworzec" n="1" t="NaN" vr="1" m="2"/></Departures>','100',now),[]);
});
function api(primary,offline,backup){
 const calls=[];const client=load('lib/providers/mpk-departures-client.ts',{'../transit-time':{...load('lib/transit-time.ts'),warsawDateIso:(offset=0)=>load('lib/transit-time.ts').warsawDateIso(offset,new Date(now))},'../transport/http':{
 requestJson:async url=>{calls.push(url);if(url.includes('get_current_service'))return {service_ids:[2],date_used:date.replaceAll('-','')};if(url.includes('departures.php')){if(primary instanceof Error)throw primary;return primary;}if(offline instanceof Error)throw offline;return {schedule:{15:offline}};},
 requestText:async url=>{calls.push(url);if(backup instanceof Error)throw backup;return backup;}
 }});return {client,calls};
}
// The public API chooses "today" by Warsaw; fake the clock only within these sequential tests.
const planned=[{line:'15',trip_headsign:'Olbrachta p. Jarową',departure_time:'05:33:00',trip_id:234592}];
for(const primary of [[],[{linia:'15',kierunek:'Olbrachta p. Jarową',czas_odjazdu:'05:33',trip_id:234592,czas_odjazdu_real:null}],Error('primary down')])test('valid-empty, scheduled-only and failed primary all recover from the SIP stop board',async()=>{
 const original=Date.now;Date.now=()=>now;
 try{const {client,calls}=api(primary,planned,xml),rows=await client.fetchMpkRzeszowDeparturesClient('256',date);assert.equal(rows[0].real_departure_at_ms,Date.parse('2026-10-09T03:34:19Z'));assert.ok(calls.some(url=>url.endsWith('nBusStopId=100')));assert.ok(!calls.some(url=>url.endsWith('nBusStopId=256')));}finally{Date.now=original;}
});
test('forecast-only recovery works when both old sources fail; both live sources failing shows an honest schedule warning',async()=>{
 const original=Date.now;Date.now=()=>now;
 try{
  const recovered=await api(Error('primary down'),Error('schedule down'),xml).client.fetchMpkRzeszowDeparturesClient('256',date);assert.ok(recovered.some(row=>row.real_departure_at_ms));
  const fallback=await api([],planned,Error('myBus down')).client.fetchMpkRzeszowDeparturesClient('256',date);assert.match(fallback.warning,/prognozy.*niedostępne/);assert.equal(fallback[0].real_departure_at_ms,undefined);
  await assert.rejects(api(Error('primary down'),Error('schedule down'),Error('myBus down')).client.fetchMpkRzeszowDeparturesClient('256',date));
 }finally{Date.now=original;}
});
test('healthy primary, cancellation and unmapped stops do not query an unrelated SIP stop',async()=>{
 const original=Date.now;Date.now=()=>now;
 try{
  const healthy=api([{linia:'15',kierunek:'Olbrachta p. Jarową',czas_odjazdu:'05:33',czas_odjazdu_real:'05:39',trip_id:234592}],planned,Error('must not run'));
  const rows=await healthy.client.fetchMpkRzeszowDeparturesClient('256',date);assert.equal(rows[0].real_departure_time,'05:39');assert.ok(!healthy.calls.some(url=>url.includes('GetTimeTableReal')));
  const unknown=api([],planned,xml);assert.match((await unknown.client.fetchMpkRzeszowDeparturesClient('999999',date)).warning,/niedostępne/);assert.ok(!unknown.calls.some(url=>url.includes('GetTimeTableReal')));
  const aborted=new AbortController();aborted.abort();await assert.rejects(healthy.client.fetchMpkRzeszowDeparturesClient('256',date,{signal:aborted.signal}),{name:'AbortError'});
 }finally{Date.now=original;}
});
