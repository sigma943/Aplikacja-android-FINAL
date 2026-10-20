const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const gps={id:'journey:my-location',name:'Twoja lokalizacja',lat:50.04,lon:22},a={id:'a',lat:50.0405,lon:22.0005},b={id:'b',lat:50.041,lon:22.001},end={id:'end'};
const options={at:1000000,arriveBy:false,walkMeters:500};
const journey={id:'bus',departure:1100000,arrival:2000000,walking:140,legs:[{from:gps,to:a,departure:1100000,arrival:1160000,walking:50,provider:'walk',course:'walk'},{from:a,to:b,departure:1160000,arrival:1220000,walking:90,provider:'walk',course:'walk'},{from:b,to:end,departure:1500000,arrival:2000000,provider:'pks',course:'123'}]};
test('GPS access is routed all the way to the first boarding and remains in the search result',async()=>{
 const points=[[gps.lat,gps.lon],[50.0403,22.0006],[b.lat,b.lon]];
 const {resolveJourneyAccess}=load('lib/journey-access-walk.ts',{'./journey-walking':{journeyWalkingRoute:async(from,to)=>{assert.equal(from.id,gps.id);assert.equal(to.id,b.id);return {points,meters:120,minutes:2};}}});
 const result=await resolveJourneyAccess([journey],options,new AbortController().signal),j=result.journeys[0];
 assert.equal(j.legs.length,2);assert.equal(j.legs[0].from.id,gps.id);assert.equal(j.legs[0].to.id,b.id);assert.deepEqual(j.legs[0].path,points);assert.equal(j.departure,1380000);assert.equal(j.legs[0].arrival,j.legs[1].departure);assert.equal(j.walking,120);assert.equal(journey.legs.length,3);
});
test('an unreachable bus is removed using actual access time and failed geometry is reported without dropping GPS',async()=>{
 const api=load('lib/journey-access-walk.ts',{'./journey-walking':{journeyWalkingRoute:async()=>({points:[],meters:700,minutes:10})}});
 assert.equal((await api.resolveJourneyAccess([journey],options,new AbortController().signal)).journeys.length,0);
 const fail=load('lib/journey-access-walk.ts',{'./journey-walking':{journeyWalkingRoute:async()=>{throw Error('offline');}}});
 const result=await fail.resolveJourneyAccess([journey],options,new AbortController().signal);assert.equal(result.failed,true);assert.equal(result.journeys[0].legs[0].from.id,gps.id);
});

test('all later GPS departures are validated and crossing the street has a separate budget',async()=>{
 let calls=0;const api=load('lib/journey-access-walk.ts',{'./journey-walking':{journeyWalkingRoute:async()=>{calls++;return {points:[],meters:496,minutes:8};}}});
 const journeys=Array.from({length:17},(_,i)=>({...journey,id:'bus:'+i,walking:233,legs:[...journey.legs,{from:end,to:{id:'opposite'},walking:93,departure:2000000,arrival:2120000}]}));
 const result=await api.resolveJourneyAccess(journeys,{...options,at:0},new AbortController().signal);
 assert.equal(calls,17);assert.equal(result.journeys.length,17);assert.equal(result.journeys[0].walking,589);
});

test('coordinate searches reject a routed 25km pure walk under a 500m limit',async()=>{
 const near={...gps,id:'journey:point:near',lat:gps.lat+.001};
 const api=load('lib/journey-loader.ts',{
  './journey-walking':{journeyWalkingRoute:async()=>({points:[],meters:25407,minutes:363})},
  './journey-worker-client':{runTimetableSearch:async()=>({journeys:[],warnings:[]})},
  './pks-client':{fetchVehiclesClient:async()=>[]}
 });
 const result=await api.searchConnections(gps,near,[],'2026-10-20',{...options,providers:['pks'],sort:'fastest'},new AbortController().signal,()=>{});
 assert.equal(result.journeys.length,0);
});

test('50m preference accepts a routed 60m access, but not a 90m access',async()=>{
 for(const [meters,expected] of [[40,1],[60,1],[90,0]]){
  const api=load('lib/journey-loader.ts',{
   './journey-walking':{journeyWalkingRoute:async()=>({points:[],meters,minutes:1})},
   './journey-worker-client':{runTimetableSearch:async input=>{assert.equal(input.options.walkMeters,70);return {journeys:[journey],warnings:[],limited:false};}},
   './pks-client':{fetchVehiclesClient:async()=>[]}
  });
  const result=await api.searchConnections(gps,end,[],'2026-10-20',{...options,walkMeters:50,providers:['pks'],sort:'fastest'},new AbortController().signal,()=>{});
  assert.equal(result.journeys.length,expected);if(expected)assert.equal(result.journeys[0].legs[0].walking,meters);
 }
});
