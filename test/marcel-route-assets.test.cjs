const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const load=require('./load-ts.cjs');
const catalog=require('../public/data/marcel-routes/index.json');
const geometry=load('lib/bus-road-geometry.ts');
test('all 18 packaged Marcel road variants cover complete ordered stops, including both Jasło directions',()=>{
  assert.equal(Object.keys(catalog.patterns).length,18);
  for(const [key,shape] of Object.entries(catalog.patterns)){
    const points=key.split('|').map(p=>p.split(',').map(Number));
    const road=JSON.parse(fs.readFileSync(`public/data/marcel-routes/${shape}.json`));
    assert.ok(geometry.roadRouteMatchesStops(road,points,150),shape);
    assert.ok(road.length>points.length,'actual road geometry is not a stop-to-stop chord');
  }
});
test('a complete Marcel course renders from local assets without an external router and rejects different patterns',async()=>{
  const previous=global.fetch,urls=[];
  global.fetch=async url=>{urls.push(String(url));assert.ok(String(url).startsWith('/data/marcel-routes/'));return new Response(fs.readFileSync('public'+url));};
  try{
    const api=load('lib/marcel-route-assets.ts');
    const key=Object.keys(catalog.patterns).find(k=>k.split('|').length===45);
    const points=key.split('|').map(p=>p.split(',').map(Number));
    assert.ok((await api.bundledMarcelRoute(points)).length>45);
    assert.equal(urls.length,2);
    await api.bundledMarcelRoute(points);assert.equal(urls.length,2,'reuse only successful index and shape reads');
    assert.deepEqual(await api.bundledMarcelRoute(points.slice(1)),[],'partial course cannot borrow full geometry');
    assert.deepEqual(await api.bundledMarcelRoute([...points].reverse()),[],'opposite direction requires its own full pattern');
    const changed=points.map(p=>p.slice());changed[5][0]+=.001;
    assert.deepEqual(await api.bundledMarcelRoute(changed),[],'changed variant falls back to live routing');
  }finally{global.fetch=previous;}
});
test('missing or corrupt Marcel assets fail safely and a later attempt can recover',async()=>{
  const previous=global.fetch;const [key,shape]=Object.entries(catalog.patterns)[0];const points=key.split('|').map(p=>p.split(',').map(Number));
  let fail=true;
  global.fetch=async url=>fail?new Response('',{status:503}):new Response(fs.readFileSync('public'+url));
  try{
    const api=load('lib/marcel-route-assets.ts');
    assert.deepEqual(await api.bundledMarcelRoute(points),[]);fail=false;
    assert.ok((await api.bundledMarcelRoute(points)).length>2);
    const invalid=load('lib/marcel-route-assets.ts');
    global.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('index.json')?catalog:[[0,0],[0,1]]));
    assert.deepEqual(await invalid.bundledMarcelRoute(points),[]);
  }finally{global.fetch=previous;}
});
test('journey subroutes use contiguous real stops and preserve the packaged road',async()=>{
 const previous=global.fetch;
 global.fetch=async url=>new Response(fs.readFileSync('public'+url));
 try{
  const api=load('lib/marcel-route-assets.ts');
  const [key,shape]=Object.entries(catalog.patterns).find(([k])=>k.split('|').length===45),points=key.split('|').map(p=>p.split(',').map(Number));
  const partial=points.slice(10,25),route=await api.bundledMarcelJourneyRoute(partial);
  assert.ok(route.length>partial.length,'subroute retains road geometry');
  const expected=load('lib/journey-route-geometry.ts').sliceJourneyRoute(JSON.parse(fs.readFileSync('public/data/marcel-routes/'+shape+'.json')),partial);
  assert.deepEqual(route,expected);
  assert.deepEqual(await api.bundledMarcelJourneyRoute([points[10],points[12],points[13]]),[],'must not guess a different course from endpoints');
 }finally{global.fetch=previous;}
});

test('Rzeszów–Domaradz 27-stop journey selects the complete course instead of ambiguous partial roads, offline',async()=>{
 const previous=global.fetch;
 global.fetch=async url=>{assert.ok(String(url).startsWith('/data/marcel-routes/'));return new Response(fs.readFileSync('public'+url));};
 try{
  const api=load('lib/journey-leg-path.ts',{'./transport/road-routing':{fetchRoadRouteForStops:async()=>{throw Error('No external router offline');}}});
  const expectedRoutes=[];
  for(const shape of ['pattern-9','pattern-15']){
   const key=Object.keys(catalog.patterns).find(k=>catalog.patterns[k]===shape),pattern=key.split('|').map(p=>p.split(',').map(Number));
   // The catalog merges platforms and supplies slightly different coordinates.
   const calls=pattern.slice(0,27).map((point,i)=>({routePoint:point,stop:{id:'alias:'+i,name:'Stop '+i,lat:point[0]+.00008,lon:point[1]-.00006}}));
   const leg={provider:'marcel',course:'marcel:'+shape,routePattern:pattern,from:calls[0].stop,to:calls.at(-1).stop,stops:calls};
   const route=await api.journeyLegPath(leg);expectedRoutes.push(route);
   const full=require('../public/data/marcel-routes/'+shape+'.json');
   assert.ok(route.length>300);assert.ok(route.length<full.length,'clip the trip to Domaradz, do not show the full course');
   assert.ok(geometry.roadRouteMatchesStops(route,calls.map(c=>c.routePoint),150));
   assert.deepEqual(api.journeyLegRoutePoints(leg),pattern.slice(0,27));
  }
  assert.notDeepEqual(expectedRoutes[0],expectedRoutes[1],'different known courses keep their own roads');
 }finally{global.fetch=previous;}
});
