const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {busOperatingState}=load('lib/bus-operating-state.ts');
const {removeRedundantRoadCycles,roadRouteMatchesStops}=load('lib/bus-road-geometry.ts');

test('moving to depot before confirmed course departure keeps break and exact countdown',()=>{
 const now=Date.parse('2026-10-21T05:30:00Z'),start=now+3600000;
 for(const speed of [0,16,60])for(const stops of [[],[{id:1,lat:50,lon:22,planned:new Date(start).toISOString()}]]){
  const state=busOperatingState({lat:50.1,lon:22.1,speed,nowMs:now,stops,firstDepartureMs:start,firstStopId:1});
  assert.equal(state.status,'break');assert.equal(state.nextTripStartAtMs,start);assert.equal(state.nextTripFirstStopId,1);
 }
 assert.equal(busOperatingState({lat:50.1,lon:22.1,speed:16,nowMs:now,stops:[{planned:new Date(start).toISOString()}]}).status,'active','intermediate ETA is not a course start');
 assert.equal(busOperatingState({lat:50.1,lon:22.1,speed:16,nowMs:start+1000,stops:[],firstDepartureMs:start}).status,'active');
});

test('all packaged Marcel patterns retain ordered stops after redundant-cycle removal',()=>{
 const index=require('../public/data/marcel-routes/index.json');
 for(const [key,name] of Object.entries(index.patterns)){
  const stops=key.split('|').map(p=>p.split(',').map(Number)),route=require('../public/data/marcel-routes/'+name+'.json');
  const fixed=removeRedundantRoadCycles(route,stops);
  assert.ok(roadRouteMatchesStops(fixed,stops,150),name);
  assert.deepEqual(fixed[0],route[0]);assert.deepEqual(fixed.at(-1),route.at(-1));
  if(['pattern-6','pattern-9','pattern-15','pattern-17'].includes(name))assert.ok(!fixed.some(p=>p[0]===50.022926&&p[1]===21.985840),name+' has no spurious Dąbrowskiego loop');
 }
});

test('a genuine excursion serving a stop and a turnaround remain intact',()=>{
 const a=[50,22],b=[50.001,22],c=[50.002,22],d=[50.002,22.001],e=[50.003,22];
 const route=[a,b,c,d,b,c,e];assert.deepEqual(removeRedundantRoadCycles(route,[a,d,e]),route);
 const turnaround=[a,b,c,b,a];assert.deepEqual(removeRedundantRoadCycles(turnaround,[a,c,a]),turnaround);
});

test('nearby opposite-platform names are not merged and matched catalog positions are retained',()=>{
 const {feedConnections}=load('lib/journey-timetable.ts'),{warsawTimeMs}=load('lib/transit-time.ts');
 const stop=(id,name,lat,lon)=>({id,name,lat,lon,type:'bus',carriers:[{id:'mpk'}],sourceProviderIds:['mpk_rzeszow'],lines:[],isFavorite:false});
 const six=stop('six','Rzeszów Dąbrowskiego Kościół 06',50.024166,21.987097),five=stop('five','Rzeszów Dąbrowskiego Kościół 05',50.024633,21.988428),end=stop('end','Koniec 01',50.01,21.98);
 const feed={version:1,provider:'mpk',stops:{a:{name:six.name,lat:50.024116,lon:21.987501},b:{name:end.name,lat:end.lat,lon:end.lon}},calendars:{s:{start:'20261001',end:'20261231',days:'1111111'}},exceptions:{},patterns:[[['a',0,0,0,0],['b',600,600,0,0]]],trips:[['t','1','s',8*3600,0]]};
 const options={at:warsawTimeMs('2026-10-21','07:00'),arriveBy:false,providers:['mpk'],maxTransfers:1,walkMeters:500,transferMinutes:1,sort:'fastest'};
 const rows=feedConnections(feed,[six,five,end],'2026-10-21',options);
 assert.ok(rows.length);assert.equal(rows[0].from.id,'six');assert.equal(rows[0].from.lon,six.lon);
 feed.stops.a={name:'Inny przystanek 07',lat:six.lat,lon:six.lon};
 assert.notEqual(feedConnections(feed,[six,five,end],'2026-10-21',options)[0].from.id,'six');
});

test('a pedestrian profile snapped across the carriageway cannot certify a transfer',async()=>{
 const original=global.fetch,a={id:'a',lat:50,lon:22},b={id:'b',lat:50.001,lon:22};
 global.fetch=async url=>({ok:true,json:async()=>String(url).includes('valhalla')?{}:{code:'Ok',routes:[{distance:112,geometry:{coordinates:[[22.0003,50],[22.0003,50.001]]}}]}});
 try{await assert.rejects(load('lib/journey-walking.ts',{'./transport/http':{requestJson:async(url,init)=>{const r=await global.fetch(url,init);if(!r.ok)throw Error('HTTP');return r.json();}}}).journeyWalkingRoute(a,b));}finally{global.fetch=original;}
});

test('unconfirmed walking alternatives do not displace confirmed complete journeys',async()=>{
 const verified={id:'safe',legs:[{provider:'pks',course:'bus',from:{id:'a'},to:{id:'b'}}]},estimated={id:'unknown-crossing',legs:[{walking:20,from:{id:'a'},to:{id:'b'},walkingQuality:'estimated'}]};
 const {refineJourneyFootpaths}=load('lib/journey-footpath-refinement.ts');
 const result=await refineJourneyFootpaths({},async()=>({journeys:[estimated,verified],limited:false,warnings:[]}),new AbortController().signal);
 assert.deepEqual(result.journeys,[verified]);assert.equal(result.limited,true);
});
