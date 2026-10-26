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
 const old=global.fetch;try{global.fetch=async()=>({ok:true,json:async()=>({code:'Ok',routes:[{distance:12,geometry:{coordinates:[[22.003,50.042],[22.003,50.04205],[22.003,50.0421]]}}]})});
 const {journeyWalkingRoute}=load('lib/journey-walking.ts',{'./transport/http':{requestJson:async(url,init)=>{const r=await global.fetch(url,init);if(!r.ok)throw Error('HTTP');return r.json();}}});const r=await journeyWalkingRoute(p2,p10);assert.equal(r.points.length,3);assert.equal(r.meters,12);
 global.fetch=async()=>({ok:true,json:async()=>({code:'NoRoute'})});await assert.rejects(journeyWalkingRoute(other,p10));
 }finally{global.fetch=old;}
});

test('a map point can be the origin or destination, retaining walks and arrival deadlines',()=>{
 const {journeyMapPoint}=load('lib/journey-places.ts');
 const point=journeyMapPoint(50.041,22.003),near=journeyMapPoint(50.151,22.003);
 assert.equal(point.name,'Punkt na mapie');assert.equal(journeyMapPoint(50.041,22.003).id,point.id);
 const rows=[c(p2,other,1600000,2400000)];
 const options={...o,walkMeters:500};
 const outward=scanJourneys(point,near,rows,options)[0];
 assert.ok(outward);assert.equal(outward.legs[0].from.id,point.id);assert.ok(outward.legs[0].walking>0);
 assert.equal(outward.legs.at(-1).to.id,near.id);assert.ok(outward.legs.at(-1).walking>0);
 assert.equal(scanJourneys(point,near,rows,{...options,walkMeters:0}).length,0);
 assert.equal(scanJourneys(point,near,rows,{...options,arriveBy:true,at:outward.arrival-1}).length,0);
});
test('map points reject invalid coordinates and current location works as the destination',()=>{
 const {journeyMapPoint,isJourneyCoordinate}=load('lib/journey-places.ts');
 assert.throws(()=>journeyMapPoint(NaN,22));assert.throws(()=>journeyMapPoint(91,22));assert.throws(()=>journeyMapPoint(50,181));
 assert.equal(isJourneyCoordinate(journeyMapPoint(50,22)),true);
 const location=stop(LOCATION_ID,'Twoja lokalizacja',50.151,22.003);
 assert.equal(isJourneyCoordinate(location),true);assert.equal(isJourneyCoordinate(p2),false);
 const result=scanJourneys(p2,location,[c(p2,other,1600000,2400000)],{...o,walkMeters:500})[0];
 assert.equal(result.legs.at(-1).to.id,LOCATION_ID);assert.ok(result.legs.at(-1).walking>0);
});

test('map picker shares the main map zoom threshold and an accent-colored pin',()=>{
 const {visibleMapStops,MAP_STOPS_MIN_ZOOM,mapStopPinHtml}=load('lib/map-stop-markers.ts');
 const bounds=[21.9,50,22.1,50.1];
 assert.deepEqual(visibleMapStops([p2],bounds,MAP_STOPS_MIN_ZOOM-1),[]);
 assert.equal(visibleMapStops([p2],bounds,MAP_STOPS_MIN_ZOOM).length,1);
 const pin=mapStopPinHtml('var(--cn-accent)');
 assert.match(pin,/color:var\(--cn-accent\)/);assert.match(pin,/fill="currentColor"/);assert.match(pin,/map-stop-pin/);
});
