const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const a={id:'a',lat:50,lon:22},b={id:'b',lat:50.001,lon:22};
test('pedestrian requests use Android HTTP when browser fetch is unavailable',async()=>{
 const old=global.fetch;let calls=0;global.fetch=async()=>{throw Error('WebView CORS');};
 try{
  const api=load('lib/journey-walking.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>true},CapacitorHttp:{request:async({url})=>{calls++;return {status:200,data:url.includes('valhalla')?{}:{code:'Ok',routes:[{distance:112,geometry:{coordinates:[[22,50],[22,50.001]]}}]}};}}}});
  const [one,two]=await Promise.all([api.journeyWalkingRoute(a,b),api.journeyWalkingRoute(a,b)]);
  assert.deepEqual(one.points,[[50,22],[50.001,22]]);assert.deepEqual(one,two);assert.equal(calls,2);
 }finally{global.fetch=old;}
});
test('walking candidates share a bounded queue instead of saturating every router',async()=>{
 let active=0,max=0,calls=0;
 const api=load('lib/journey-walking.ts',{'./transport/http':{requestJson:async(url)=>{
  calls++;active++;max=Math.max(max,active);await new Promise(setImmediate);active--;
  if(url.includes('valhalla'))return {};
  const coords=url.split('/foot/')[1].split('?')[0].split(';').map(p=>p.split(',').map(Number));return {code:'Ok',routes:[{distance:112,geometry:{coordinates:coords}}]};
 }}});
 const results=await Promise.all(Array.from({length:12},(_,i)=>api.journeyWalkingRoute({...a,lat:50+i*.01},{...b,lat:50.001+i*.01})));
 assert.equal(results.length,12);assert.equal(calls,24);assert.ok(max<=6,max);
});
test('a failed operator asset cannot suppress road recovery for any bus provider',async()=>{
 for(const provider of ['pks','mpk','marcel']){
  let calls=0;const api=load('lib/journey-leg-path.ts',{
   './official-bus-routes':{officialBusRoute:async()=>{throw Error('asset offline');},officialBusStopPoints:async()=>{throw Error('pins offline');}},
   './marcel-route-assets':{bundledMarcelJourneyRoute:async()=>{throw Error('asset offline');},bundledMarcelStopPoints:async()=>{throw Error('pins offline');}},
   './transport/road-routing':{fetchRoadRouteForStops:async()=>{calls++;return [[50,22],[50.001,22]];}}
  });
  const path=await api.journeyLegPath({provider,course:provider+':trip',from:a,to:b});assert.equal(path.length,2);assert.equal(calls,1,provider);
 }
});
