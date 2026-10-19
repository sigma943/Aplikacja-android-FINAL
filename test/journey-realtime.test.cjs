const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {applyJourneyDelays}=load('lib/journey-realtime.ts');
const {scanJourneys}=load('lib/journey-timetable.ts');
const {warsawTimeMs}=load('lib/transit-time.ts');
const now=warsawTimeMs('2026-10-19','12:00'),min=60000;
const stop=id=>({id,name:id,type:'bus',carriers:[],lines:[],isFavorite:false});
const a=stop('a'),b=stop('b'),c=stop('c');
const connection=(from,to,departure,arrival,course='pks:123:2026-10-19')=>({from,to,departure:now+departure*min,arrival:now+arrival*min,course,line:'108',provider:'pks'});
const vehicle={id:'bus',tripId:'123',provider:'pks',routeShortName:'108',delay:600,status:'active',lastSignalTime:new Date(now).toISOString()};
const options={at:now,arriveBy:false,maxTransfers:1,transferMinutes:5,walkMeters:0,providers:['pks'],sort:'fastest'};

test('a delayed bus can still be boarded after its scheduled departure and retains every call',()=>{
 const rows=[connection(a,b,-5,5),connection(b,c,6,15)];
 const result=scanJourneys(a,c,applyJourneyDelays(rows,[vehicle],now),options)[0];
 assert.equal(result.departure,now+5*min);assert.equal(result.arrival,now+25*min);
 assert.deepEqual(result.legs[0].stops.map(x=>x.stop.id),['a','b','c']);
 assert.equal(result.legs[0].stops[1].arrival,now+15*min);
 assert.equal(result.legs[0].stops[1].departure,now+16*min);
 assert.equal(result.legs[0].stops[1].scheduledArrival,now+5*min);
 assert.equal(result.legs[0].delaySeconds,600);
});
test('delay invalidates an impossible transfer and arrival deadline',()=>{
 const rows=[connection(a,b,0,10),connection(b,c,15,25,'pks:other:2026-10-19')];
 assert.equal(scanJourneys(a,c,rows,options).length,1);
 assert.equal(scanJourneys(a,c,applyJourneyDelays(rows,[vehicle],now),options).length,0);
 assert.equal(scanJourneys(a,b,applyJourneyDelays(rows,[vehicle],now),{...options,arriveBy:true,at:now+15*min}).length,0);
});
test('fresh, unambiguous exact-course observations only; never a line-wide delay',()=>{
 const row=connection(a,b,0,10);
 for(const patch of [{tripId:'different'},{provider:'mpk_rzeszow'},{routeShortName:'109'},{isHistorical:true},{status:'break'},{delay:undefined},{lastSignalTime:new Date(now-121000).toISOString()},{lastSignalTime:undefined},{journeyId:'mybus:123'},{scheduleSource:'mybus'}])assert.equal(applyJourneyDelays([row],[{...vehicle,...patch}],now)[0],row);
 assert.equal(applyJourneyDelays([row],[vehicle,vehicle],now)[0],row);
 assert.equal(applyJourneyDelays([{...row,course:'pks:123:2026-10-20'}],[vehicle],now)[0].departure,row.departure);
});
test('offline schedules still retain ordered intermediate stop arrivals',()=>{
 const rows=[connection(a,b,0,10),connection(b,c,12,20)];
 const leg=scanJourneys(a,c,applyJourneyDelays(rows,[],now),options)[0].legs[0];
 assert.deepEqual(leg.stops.map(x=>[x.stop.id,x.arrival,x.departure]),[['a',now,now],['b',now+10*min,now+12*min],['c',now+20*min,now+20*min]]);
 assert.equal(leg.delaySeconds,undefined);
});
