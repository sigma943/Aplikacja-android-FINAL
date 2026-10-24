const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {scanJourneys}=load('lib/journey-timetable.ts'),{journeyWindow}=load('lib/journey-planner.ts'),{warsawTimeMs}=load('lib/transit-time.ts');
const day='2026-10-20',clock=s=>warsawTimeMs(day,s),a={id:'a',name:'a',type:'bus',carriers:[],lines:[],isFavorite:false},b={...a,id:'b',name:'b'};
const options={at:clock('08:00'),day,arriveBy:false,maxTransfers:0,walkMeters:0,transferMinutes:5,providers:['pks'],sort:'fastest'};
const connection=(time,i)=>({from:a,to:b,departure:clock(time),arrival:clock(time)+15*60000,course:'pks:'+i,line:'1',provider:'pks'});
test('08:00 search includes afternoon and evening, with more than twelve departures',()=>{
 const times=['07:59','08:00','08:30','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:30','24:15'];
 const results=scanJourneys(a,b,times.map(connection),options);
 assert.equal(results.length,17);assert.equal(results[0].departure,clock('08:00'));assert.equal(results.at(-1).departure,clock('23:30'));
 assert.ok(results.some(j=>j.departure===clock('22:00')));
});
test('arrival mode includes the beginning of the selected day and keeps the arrival deadline',()=>{
 const result=scanJourneys(a,b,['00:30','07:30','08:00'].map(connection),{...options,arriveBy:true});
 assert.equal(result.length,2);assert.ok(result.every(j=>j.arrival<=clock('08:00')));
});
test('Warsaw day bounds follow daylight saving transitions',()=>{
 for(const [date,hours] of [['2026-03-29',23],['2026-10-25',25]]){
  const window=journeyWindow({...options,day:date,at:warsawTimeMs(date,'00:00')});
  assert.equal(window.latest-window.earliest+1,hours*3600000);
 }
});

test('GPS 496m access finds later real 108 rides and a short crossing instead of a return bus',()=>{
 const fs=require('node:fs'),{gunzipSync}=require('node:zlib'),{feedConnections}=load('lib/journey-timetable.ts');
 const feed=JSON.parse(gunzipSync(fs.readFileSync('public/data/journeys/pks.json.gz')));
 const stop=id=>({...feed.stops[id],id:'journey:pks:'+id,type:'bus',carriers:[],lines:[],isFavorite:false});
 const from={...stop('10'),id:'journey:my-location',lat:feed.stops['10'].lat-.0033,name:'Twoja lokalizacja'},to=stop('1789');
 const o={...options,at:clock('10:40'),maxTransfers:1,walkMeters:500};
 const results=scanJourneys(from,to,feedConnections(feed,[],day,o),o),direct=results.filter(j=>j.transfers===0&&j.legs.some(l=>l.line==='108'));
 assert.ok(direct.length>=3,'later 108 departures must remain available');
 assert.equal(results[0].transfers,0);assert.equal(results[0].legs[1].line,'108');
 assert.equal(results[0].legs[1].to.id,'journey:pks:1790');assert.equal(results[0].legs.at(-1).walking,93);
 assert.equal(results[0].legs[0].walking,496);assert.ok(results.every(j=>j.legs.some(l=>l.walking===undefined)),'no 25km pure walk');
 assert.ok(direct.some(j=>j.departure>=clock('16:00')),'afternoon buses are retained');
});
