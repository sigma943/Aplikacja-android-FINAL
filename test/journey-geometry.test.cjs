const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {projectJourneyStops,sliceJourneyRoute}=load('lib/journey-route-geometry.ts');
const {roadDistance}=load('lib/bus-road-geometry.ts');
const stop=(id,p)=>({id,name:id,lat:p[0],lon:p[1],type:'bus',carriers:[],lines:[],isFavorite:false});
test('stops project onto road segments without moving catalog pins or drawing spurs',()=>{
 const road=[[50,22],[50,22.01]],stops=[[50.0002,22.002],[49.9999,22.005],[50.0002,22.008]],before=JSON.stringify(stops);
 const dots=projectJourneyStops(road,stops,35);assert.equal(dots.length,3);
 dots.forEach((p,i)=>{assert.equal(p.point[0],50);assert.ok(Math.abs(p.point[1]-stops[i][1])<1e-9);});
 const clipped=sliceJourneyRoute(road,stops);assert.deepEqual(clipped,[[50,22.002],[50,22.008]]);
 assert.equal(JSON.stringify(stops),before);
 assert.deepEqual(projectJourneyStops(road,[[51,22]],35),[]);
});
test('ordered projections preserve circular routes and never trim to a later return visit',()=>{
 const road=[[50,22],[50,22.01],[50.01,22.01],[50.01,22],[50,22]];
 const dots=projectJourneyStops(road,road,1);assert.equal(dots.length,5);
 assert.ok(dots.every((p,i)=>!i||p.position>=dots[i-1].position));
 assert.deepEqual(sliceJourneyRoute(road,road),road);
});
test('journey bus geometry applies the recorded PKS junction correction even offline',async()=>{
 const original=require('../public/data/bus-routes/pks/288.json');
 const leg={provider:'pks',course:'pks:5001:2026-10-19',from:stop('a',original[0]),to:stop('b',original.at(-1))};
 const {journeyLegPath}=load('lib/journey-leg-path.ts',{'./official-bus-routes':{officialBusRoute:async()=>original},'./transport/road-routing':{fetchRoadRouteForStops:async()=>{throw Error('offline');}}});
 const route=await journeyLegPath(leg);
 assert.ok(!route.some(p=>p[0]===50.041991&&p[1]===22.002377));assert.deepEqual(route[0],original[0]);assert.deepEqual(route.at(-1),original.at(-1));
});
test('road routing uses all intermediate calls and rejects a shortcut missing their corridor',async()=>{
 let request;
 const leg={provider:'mpk',course:'mpk:123:2026-10-19',from:stop('a',[50,22]),to:stop('c',[50,22.01]),stops:[{stop:stop('a',[50,22])},{stop:stop('b',[50.01,22.005])},{stop:stop('c',[50,22.01])}]};
 const {journeyLegPath}=load('lib/journey-leg-path.ts',{'./official-bus-routes':{officialBusRoute:async()=>[]},'./transport/road-routing':{fetchRoadRouteForStops:async(points,key,options)=>{request={points,options};return [[50,22],[50,22.01]];}}});
 await assert.rejects(journeyLegPath(leg));assert.equal(request.points.length,3);assert.equal(request.options.stopWaypoints,true);
});
function encoded(points){let a=0,b=0,result='';for(const p of points){const x=Math.round(p[0]*1e6),y=Math.round(p[1]*1e6);for(let n of [x-a,y-b]){n=n<0?~(n<<1):n<<1;while(n>=32){result+=String.fromCharCode((32|(n&31))+63);n>>=5;}result+=String.fromCharCode(n+63);}a=x;b=y;}return result;}
test('invalid foot geometry falls back to a real pedestrian profile, with exact endpoints and shared cache',async()=>{
 const original=global.fetch,points=[[50,22],[50,22.0005],[50,22.001]],from=stop('a',points[0]),to=stop('b',points.at(-1)),meters=points.slice(1).reduce((n,p,i)=>n+roadDistance(points[i],p),0);let calls=0;
 try{
  global.fetch=async url=>{calls++;if(String(url).includes('routed-foot'))return {ok:true,json:async()=>({code:'Ok',routes:[{distance:meters,geometry:{coordinates:[[23,51],[23.001,51]]}}]})};
   const query=JSON.parse(decodeURIComponent(String(url).split('?json=')[1]));assert.equal(query.costing,'pedestrian');
   return {ok:true,json:async()=>({trip:{summary:{length:meters/1000},legs:[{shape:encoded(points)}]}})};
  };
  const {journeyWalkingRoute}=load('lib/journey-walking.ts');const result=await journeyWalkingRoute(from,to);assert.deepEqual(result.points,points);assert.equal(result.meters,Math.ceil(meters));
  await journeyWalkingRoute(from,to);assert.equal(calls,2);
 }finally{global.fetch=original;}
});
test('both failed foot profiles reject the route instead of inventing a straight connector; retry stays possible',async()=>{
 const original=global.fetch;try{
  global.fetch=async()=>({ok:true,json:async()=>({code:'NoRoute'})});const {journeyWalkingRoute}=load('lib/journey-walking.ts');
  const a=stop('a',[50,22]),b=stop('b',[50,22.001]);await assert.rejects(journeyWalkingRoute(a,b));
  global.fetch=async()=>({ok:true,json:async()=>({code:'Ok',routes:[{distance:72,geometry:{coordinates:[[22,50],[22.001,50]]}}]})});
  assert.equal((await journeyWalkingRoute(a,b)).points.length,2);
 }finally{global.fetch=original;}
});
test('Niebylec PKS courses preserve every bundled road vertex; moving dots cannot reroute the bus',async()=>{
 const fs=require('node:fs'),index=require('../public/data/bus-routes/pks.json');let routed=0;
 const shapes=['343','344','358','359','360','361','362','363','534'];
 for(const shape of shapes){
  const trip=Object.keys(index.tripShapes).find(id=>index.tripShapes[id]===shape),ids=index.patterns[index.tripPatterns[trip]];
  const calls=ids.map(id=>stop(id,[index.stops[id].lat,index.stops[id].lon]));
  const original=JSON.parse(fs.readFileSync('public/data/bus-routes/pks/'+shape+'.json')),before=JSON.stringify(original);
  const {journeyLegPath}=load('lib/journey-leg-path.ts',{'./official-bus-routes':{officialBusRoute:async()=>original},'./transport/road-routing':{fetchRoadRouteForStops:async()=>{routed++;throw Error('must use the course road');}}});
  const route=await journeyLegPath({provider:'pks',course:'pks:'+trip,from:calls[0],to:calls.at(-1),stops:calls.map(stop=>({stop}))});
  assert.deepEqual(route,sliceJourneyRoute(load('lib/pks-station-junction.ts').correctPksStationJunction(original,'pks'),calls.map(s=>[s.lat,s.lon])),shape);
  assert.ok(route.length>100,shape+' keeps actual road bends');
  const dots=projectJourneyStops(route,calls.map(s=>[s.lat,s.lon]));
  assert.equal(dots.length,calls.length);assert.equal(JSON.stringify(original),before);
  for(const p of route.slice(1,-1))assert.ok(original.some(q=>q[0]===p[0]&&q[1]===p[1]),'no synthetic road points');
 }
 assert.equal(routed,0,'stop pins never trigger reconstruction of a known course');
});
test('a sideways stop projects perpendicularly onto a curved road without moving any road vertex',()=>{
 const road=[[49.855,21.902],[49.8555,21.9028],[49.856,21.9038],[49.8565,21.9042]],before=JSON.stringify(road);
 const a=road[1],b=road[2],scale=Math.cos(49.85575*Math.PI/180),dx=(b[1]-a[1])*scale,dy=b[0]-a[0];
 const actual=[(a[0]+b[0])/2-dx*.12,(a[1]+b[1])/2+dy*.12/scale];
 const [dot]=projectJourneyStops(road,[actual],35);assert.ok(dot);
 assert.ok(roadDistance(dot.point,[(a[0]+b[0])/2,(a[1]+b[1])/2])<.01);
 assert.equal(JSON.stringify(road),before);assert.ok(roadDistance(actual,dot.point)>5);
});
test('a slower pedestrian answer replaces a fast ring-road detour; alternative foot paths compete by distance',async()=>{
 const previous=global.fetch,a=stop('a',[50,22]),b=stop('b',[50,22.001]),short=[[50,22],[50,22.0005],[50,22.001]],long=[[50,22],[50.002,22],[50.002,22.001],[50,22.001]];
 const length=points=>points.slice(1).reduce((n,p,i)=>n+roadDistance(points[i],p),0);let requests=0;
 try{
  global.fetch=async url=>{
   requests++;
   if(String(url).includes('routed-foot'))return {ok:true,json:async()=>({code:'Ok',routes:[{distance:length(long),geometry:{coordinates:long.map(([lat,lon])=>[lon,lat])}}]})};
   const query=JSON.parse(decodeURIComponent(String(url).split('?json=')[1]));assert.equal(query.costing_options.pedestrian.shortest,true);
   await new Promise(resolve=>setTimeout(resolve,25));return {ok:true,json:async()=>({trip:{summary:{length:length(short)/1000},legs:[{shape:encoded(short)}]}})};
  };
  const api=load('lib/journey-walking.ts');const result=await api.journeyWalkingRoute(a,b);assert.deepEqual(result.points,short);assert.ok(result.meters<100);assert.equal(requests,2);
  await api.journeyWalkingRoute(a,b);assert.equal(requests,2,'both calls share the validated best path');
  global.fetch=async url=>String(url).includes('routed-foot')?{ok:true,json:async()=>({code:'Ok',routes:[{distance:length(long),geometry:{coordinates:long.map(([lat,lon])=>[lon,lat])}},{distance:length(short),geometry:{coordinates:short.map(([lat,lon])=>[lon,lat])}}]})}:{ok:false};
  assert.deepEqual((await load('lib/journey-walking.ts').journeyWalkingRoute(a,b)).points,short,'OSRM alternatives are considered independently');
 }finally{global.fetch=previous;}
});
test('map roles distinguish real transfers from an initial walk and dots shrink with zoom',()=>{
 const {journeyPointRole,journeyPointSize}=load('lib/journey-map-markers.ts');
 const a=stop('a',[50,22]),b=stop('b',[50,22.001]),c=stop('c',[50,22.002]),d=stop('d',[50,22.003]),e=stop('e',[50,22.004]);
 const journey={legs:[{from:a,to:b,walking:70},{from:b,to:c},{from:c,to:d,walking:70},{from:d,to:e}]};
 assert.equal(journeyPointRole(journey,a),'start');assert.equal(journeyPointRole(journey,e),'end');
 assert.equal(journeyPointRole(journey,b),'stop');assert.equal(journeyPointRole(journey,c),'transfer');assert.equal(journeyPointRole(journey,d),'transfer');
 assert.ok(journeyPointSize(11,'stop')<journeyPointSize(17,'stop'));assert.ok(journeyPointSize(11,'stop')<=1.5);
 assert.ok(journeyPointSize(11,'transfer')>journeyPointSize(11,'stop')*4);
});
