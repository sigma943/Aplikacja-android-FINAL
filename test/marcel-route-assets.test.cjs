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
