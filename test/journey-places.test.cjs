const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {journeyPickerStops,STATION_ID,LOCATION_ID}=load('lib/journey-places.ts');
const {scanJourneys}=load('lib/journey-timetable.ts');
const stop=(id,name,lat=50.042,lon=22.003)=>({id,name,type:'bus',lat,lon,lines:['301'],carriers:[{id:'pks'}],isFavorite:false});
const p2=stop('p2','Rzeszów D.A. st. 2'),p10=stop('p10','Rzeszów D.A. st. 10',50.0421),other=stop('a','Głogów',50.15);
const o={at:1000000,arriveBy:false,maxTransfers:1,walkMeters:0,transferMinutes:5,providers:['pks'],sort:'fastest'};
const c=(from,to,departure=1100000,arrival=2000000)=>({from,to,departure,arrival,course:'pks:1',line:'301',provider:'pks'});
test('one station picker entry searches all platforms and retains actual boarding and arrival stands',()=>{
 const input=[p2,p10,other],places=journeyPickerStops(input),station=places.find(s=>s.id===STATION_ID);
 assert.equal(places.length,2);assert.equal(station.name,'Rzeszów D.A.');assert.equal(input[0].name,'Rzeszów D.A. st. 2');
 const arrival=scanJourneys(other,station,[c(other,p10)],o);assert.equal(arrival[0].legs[0].to.id,'p10');assert.equal(arrival[0].walking,0);
 const departure=scanJourneys(station,other,[c(p2,other)],o);assert.equal(departure[0].legs[0].from.name,'Rzeszów D.A. st. 2');
});
test('a geographic origin can walk to a nearby bus but cannot teleport to a distant stop',()=>{
 const location=stop(LOCATION_ID,'Twoja lokalizacja',50.041,22.003);
 const nearby=scanJourneys(location,other,[c(p2,other,1600000,2400000)],{...o,walkMeters:500});assert.ok(nearby[0].legs[0].walking>0);assert.equal(nearby[0].legs[1].from.id,'p2');
 assert.equal(scanJourneys(location,other,[c(stop('far','far',50.1),other)],{...o,walkMeters:500}).length,0);
});
test('a foot route rejects missing geometry instead of returning a straight connector',async()=>{
 let available=true;
 const {journeyWalkingRoute}=load('lib/journey-walking.ts',{'./transport/http':{requestJson:async()=>available?({code:'Ok',routes:[{distance:200,geometry:{coordinates:[[22.003,50.042],[22.003,50.04205],[22.003,50.0421]]}}]}):({code:'NoRoute'})}});
 const r=await journeyWalkingRoute(p2,p10);assert.equal(r.points.length,3);assert.equal(r.meters,200);
 available=false;await assert.rejects(journeyWalkingRoute(other,p10));
});

test('walking geometry retries with a pedestrian router and preserves a bend instead of a straight line',async()=>{
 const requests=[],points=[[50.042,22.003],[50.043,22.004],[50.0421,22.003]];
 const {journeyWalkingRoute}=load('lib/journey-walking.ts',{'./transport/http':{requestJson:async url=>{
  requests.push(url);if(url.includes('routed-foot'))throw Error('Unavailable');
  return {trip:{status:0,legs:[{shape:require('./encode-polyline.cjs')(points)}],summary:{length:.35}}};
 }}});
 const result=await journeyWalkingRoute(p2,p10);
 assert.deepEqual(result.points,points);assert.equal(result.meters,350);
 const query=JSON.parse(new URL(requests[1]).searchParams.get('json'));
 assert.equal(query.costing,'pedestrian');assert.equal(requests.length,2);
 await journeyWalkingRoute(p2,p10);assert.equal(requests.length,2,'reuse confirmed route geometry');
});
