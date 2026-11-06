const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs'),reply=require('./fixtures/warszawska-foot-route.json');
const from={id:'523',name:'Warszawska ZS. Samoch. 04 nż',lat:50.05531,lon:21.99611},to={id:'point',name:'Punkt na mapie',lat:50.0625,lon:21.994};
const http={requestJson:async url=>{if(url.includes('routed-foot'))return reply;throw Error('backup unavailable');}};
test('nearby real foot geometry is renderable without certifying a missing final access',async()=>{
 const {journeyWalkingRoute}=load('lib/journey-walking.ts',{'./transport/http':http});
 await assert.rejects(journeyWalkingRoute(from,to));
 const result=await journeyWalkingRoute(from,to,{allowNearbyEndpoints:true});
 assert.ok(result.points.length>20);assert.equal(result.meters,856);
 assert.notDeepEqual(result.points.at(-1),[to.lat,to.lon],'do not invent a straight connector to the selected point');
 await assert.rejects(journeyWalkingRoute(from,to),'permissive display cache must never certify planner geometry');
});
test('the journey map loader accepts the snapped foot path but keeps remote pins rejected',async()=>{
 const {journeyLegPath}=load('lib/journey-leg-path.ts',{'./transport/http':http});
 const path=await journeyLegPath({from,to,walking:871,provider:'walk',course:'walk',line:'Pieszo'});
 assert.ok(path.length>20);
 await assert.rejects(journeyLegPath({from,to:{...to,lat:to.lat+.005},walking:1000,provider:'walk',course:'walk',line:'Pieszo'}));
});
