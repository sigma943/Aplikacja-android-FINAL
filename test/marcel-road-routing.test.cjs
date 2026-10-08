const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { loadRouteWithRetry } = loadTs('lib/route-load-retry.ts');
function encode(points) {
  let lat = 0, lon = 0, result = '';
  const delta = value => { let n = value < 0 ? ~(value << 1) : value << 1, out = ''; while(n >= 32) {out += String.fromCharCode((32 | (n & 31)) + 63); n >>>= 5;} return out + String.fromCharCode(n + 63); };
  for(const p of points) {const a=Math.round(p[0]*1e6), b=Math.round(p[1]*1e6); result += delta(a-lat)+delta(b-lon); lat=a;lon=b;}
  return result;
}
test('a 20-stop Marcel course respects the real Valhalla 10-location limit without losing stops', async () => {
  const original = global.fetch, requests = [];
  const points = Array.from({length:20}, (_, i) => [50 + i/1000, 22 + i/1000]);
  global.fetch = async url => {
    assert.ok(url.includes('valhalla'));
    const q = JSON.parse(new URL(url).searchParams.get('json')); requests.push(q);
    if(q.locations.length>10) return new Response(JSON.stringify({error_code:150,error:'Exceeded max locations: 10'}),{status:400});
    return new Response(JSON.stringify({trip:{legs:[{shape:encode(q.locations.map(p=>[p.lat,p.lon]))}]}}));
  };
  try {
    const { fetchRouteGeometryClient } = loadTs('lib/pks-client.ts', {'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}}});
    const response = await fetchRouteGeometryClient({carrier:'marcel',line:'M',direction:'Rymanów Zdrój',mode:'road',stops:points.map(([lat,lon],i)=>({id:i+1,lat,lon}))});
    assert.equal(requests.length,3);
    assert.deepEqual(requests.map(q=>q.locations.length),[10,10,2]);
    assert.ok(requests.every(q=>q.costing==='bus'));
    assert.equal(requests[0].locations[0].radius,35);
    assert.equal(requests[0].locations.at(-1).radius,35,'shared chunk boundaries use a consistent nearby snap');
    assert.equal(requests[1].locations[0].radius,35);
    assert.equal(requests[2].locations.at(-1).radius,35);
    assert.deepEqual(response.geometry.coordinates, points.map(([lat,lon])=>[lon,lat]));
    assert.equal(response.isSynthetic,false);
  } finally { global.fetch = original; }
});
test('temporary errors including a deadline retry the same selection', async () => {
  let calls = 0;
  const result = await loadRouteWithRetry(async()=>{if(++calls===1) throw new DOMException('timeout','AbortError'); if(calls===2) throw Error('503'); return 'road';},new AbortController().signal,[1,1]);
  assert.equal(result,'road'); assert.equal(calls,3);
});
test('changing selection cancels a queued retry and exhausted attempts report failure', async () => {
  const controller = new AbortController(); let calls = 0;
  const pending = loadRouteWithRetry(async()=>{calls++;throw Error('offline');},controller.signal,[10000]);
  const rejected = assert.rejects(pending,{name:'AbortError'});
  await new Promise(resolve=>setImmediate(resolve));controller.abort();await rejected;assert.equal(calls,1);
  calls=0;await assert.rejects(loadRouteWithRetry(async()=>{calls++;throw Error('offline');},new AbortController().signal,[1]),/offline/); assert.equal(calls,2);
});

test('Marcel stop in a side road permits a return without an artificial circuit and preserves the real turnaround', async () => {
  const original = global.fetch;
  const start=[50,22], junction=[50,22.001], stop=[50.001,22.001], end=[50,22.002];
  const intended=[start,junction,stop,junction,end];
  global.fetch = async url => {
    const q=JSON.parse(new URL(url).searchParams.get('json'));
    // A through waypoint forbids a reversal at the stop. Model the resulting
    // detour around the block; a stop waypoint can return to the junction.
    const middle=q.locations[1];
    const road=middle.type==='through'
      ? [start,junction,stop,[50.005,22.001],[50.005,22.005],end]
      : intended;
    return new Response(JSON.stringify({trip:{legs:[{shape:encode(road)}]}}));
  };
  try {
    const {fetchRouteGeometryClient}=loadTs('lib/pks-client.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}}});
    const response=await fetchRouteGeometryClient({carrier:'marcel',line:'M',direction:'Sanok',mode:'road',stops:[start,stop,end].map(([lat,lon],i)=>({id:i+1,lat,lon}))});
    assert.deepEqual(response.geometry.coordinates,intended.map(([lat,lon])=>[lon,lat]));
    assert.equal(response.isSynthetic,false);
  } finally {global.fetch=original;}
});

test('actual Jasło–Rzeszów Marcel course rebuilds disconnected primary chunks on one road network',async()=>{
 const raw=require('./fixtures/marcel-jaslo-rzeszow-1181798.json');
 const {decodePolyline,joinRouteChunks,roadRouteMatchesStops}=loadTs('lib/bus-road-geometry.ts');
 const primary=raw.chunks.map(c=>joinRouteChunks(c.primary.map(l=>decodePolyline(l.shape))));
 assert.throws(()=>joinRouteChunks(primary),/Disconnected/,'real primary responses reproduced the invisible route');
 const original=global.fetch;let secondaryCalls=0;
 global.fetch=async url=>{
  url=String(url);let points;
  if(url.includes('valhalla')) points=JSON.parse(new URL(url).searchParams.get('json')).locations.map(p=>[p.lat,p.lon]);
  else {secondaryCalls++;points=new URL(url).pathname.split('/driving/')[1].split(';').map(p=>p.split(',').map(Number).reverse());}
  const chunk=raw.chunks.find(c=>JSON.stringify(c.stops)===JSON.stringify(points));assert.ok(chunk,'every request follows the full actual course');
  return new Response(JSON.stringify(url.includes('valhalla')?{trip:{legs:chunk.primary}}:{code:'Ok',routes:[{geometry:{coordinates:decodePolyline(chunk.secondary).map(([a,b])=>[b,a])}}]}));
 };
 try {
  const client=loadTs('lib/pks-client.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}}});
  const request={carrier:'marcel',line:'M',direction:'Rzeszów',mode:'road',stops:raw.course.map((s,id)=>({id,lat:s.szGps,lon:s.dlGps}))};
  const response=await client.fetchRouteGeometryClient(request);
  const route=response.geometry.coordinates.map(([b,a])=>[a,b]);
  assert.ok(route.length>2000);assert.ok(roadRouteMatchesStops(route,request.stops.map(s=>[s.lat,s.lon]),150));
  assert.equal(secondaryCalls,raw.chunks.length);await client.fetchRouteGeometryClient(request);assert.equal(secondaryCalls,raw.chunks.length,'successful route is reused');
 }finally{global.fetch=original;}
});
