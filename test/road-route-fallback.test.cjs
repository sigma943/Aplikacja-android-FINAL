const {test}=require('node:test');
const assert=require('node:assert/strict');
const loadTs=require('./load-ts.cjs');
const encode=require('./encode-polyline.cjs');

test('fast validated primary avoids an unnecessary backup request',async()=>{
  const {roadRouteWithFallback}=loadTs('lib/transport/road-route-fallback.ts');
  let backup=0;
  assert.equal(await roadRouteWithFallback(async()=> 'primary',async()=>{backup++;return 'backup';},5),'primary');
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(backup,0);
});

test('a slow or failed primary automatically yields to a successful backup',async()=>{
  const {roadRouteWithFallback}=loadTs('lib/transport/road-route-fallback.ts');
  assert.equal(await roadRouteWithFallback(()=>new Promise(()=>{}),async()=> 'backup',5),'backup');
  assert.equal(await roadRouteWithFallback(async()=>{throw Error('primary unavailable');},async()=> 'backup',60_000),'backup');
  await assert.rejects(roadRouteWithFallback(async()=>{throw Error('primary');},async()=>{throw Error('backup');}),/backup/);
});

test('a backup failure still allows the primary to finish successfully',async()=>{
  const {roadRouteWithFallback}=loadTs('lib/transport/road-route-fallback.ts');
  let finish;
  const pending=roadRouteWithFallback(()=>new Promise(resolve=>{finish=resolve;}),async()=>{throw Error('backup');},1);
  await new Promise(resolve=>setTimeout(resolve,10));
  finish('primary');
  assert.equal(await pending,'primary');
});

test('retrying a long route reuses completed road chunks and never caches a failed full route',async()=>{
  const points=Array.from({length:11},(_,i)=>[50+i*.002,22]);
  let recover=false,firstChunkRequests=0;
  const {fetchRoadRouteForStops,roadRouteCache}=loadTs('lib/transport/road-routing.ts',{
    '../transport/http':{requestJson:async url=>{
      if(String(url).includes('valhalla')){
        const q=JSON.parse(new URL(url).searchParams.get('json'));
        if(q.locations[0].lat===points[0][0]){
          firstChunkRequests++;
          return {trip:{legs:[{shape:encode(points.slice(0,10))}]}};
        }
        if(recover)return {trip:{legs:[{shape:encode(points.slice(9))}]}};
      }
      throw Error('routing unavailable');
    }},
  });
  await assert.rejects(fetchRoadRouteForStops(points,'long-route'),/routing unavailable/);
  assert.equal(roadRouteCache.has('long-route'),false);
  recover=true;
  assert.deepEqual(await fetchRoadRouteForStops(points,'long-route'),points);
  assert.equal(firstChunkRequests,1);
  assert.equal(roadRouteCache.has('long-route'),true);
});

test('different snaps at chunk boundaries recover a continuous full-course route without drawing a connector',async()=>{
 const points=Array.from({length:15},(_,i)=>[50+i*.002,22]);let complete=0;
 const {fetchRoadRouteForStops}=loadTs('lib/transport/road-routing.ts',{'../transport/http':{requestJson:async url=>{
  if(String(url).includes('valhalla')){
   const q=JSON.parse(new URL(url).searchParams.get('json')),chunk=q.locations.map(p=>[p.lat,p.lon]);
   if(chunk[0][0]!==points[0][0])chunk[0]=[chunk[0][0],22.0002];
   return {trip:{legs:[{shape:encode(chunk)}]}};
  }
  const coords=String(url).split('/driving/')[1].split('?')[0].split(';').map(p=>p.split(',').map(Number).reverse());
  assert.equal(coords.length,15,'recovery requests the whole course');complete++;
  return {routes:[{geometry:{coordinates:points.map(([lat,lon])=>[lon,lat])}}]};
 }}});
 assert.deepEqual(await fetchRoadRouteForStops(points,'snap-recovery'),points);assert.equal(complete,1);
});
