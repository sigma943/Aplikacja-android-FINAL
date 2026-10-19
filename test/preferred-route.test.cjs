const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const load=require('./load-ts.cjs');
const {preferredLocalRoute}=load('lib/map/preferred-route.ts');
const {roadRouteMatchesStops}=load('lib/bus-road-geometry.ts');

test('actual PKS 301 replaces a cached detour even when it visits every stop in order',async()=>{
  const vehicle=require('./fixtures/pks-301-37-2026-10-19.json');
  const snapshot=require('../public/data/pks-stop-points.json').stops;
  const ids=vehicle.journey.route.stop_points,stops=ids.map(id=>[snapshot[id].lat,snapshot[id].lon]);
  const road=require('../public/data/bus-routes/pks/67.json');
  const detour=[...road.slice(0,300),[road[299][0]+.005,road[299][1]+.005],road[299],...road.slice(300)];
  assert.equal(roadRouteMatchesStops(detour,stops,180),true,'stop coverage alone cannot detect wrong streets');
  const previous=global.fetch;
  global.fetch=async url=>new Response(fs.readFileSync('public'+url));
  try {
    const {officialBusRoute}=load('lib/official-bus-routes.ts');
    let cacheReads=0;
    const result=await preferredLocalRoute({mode:'road',stops,
      bundled:()=>officialBusRoute('pks',vehicle.trip_id,ids,stops),
      cached:async()=>{cacheReads++;return detour;},
    });
    assert.deepEqual(result,road);
    assert.equal(cacheReads,0,'neither memory nor persistent fallback may override the operator');
  } finally {global.fetch=previous;}
});

test('both PKS and MPK resolve the new official course before a shared stop-pattern cache',async()=>{
  const stops=[[50,22],[50.02,22]],a=[stops[0],[50.01,22.001],stops[1]],b=[stops[0],[50.01,21.999],stops[1]];
  const previous=global.fetch;
  global.fetch=async url=>new Response(JSON.stringify(/\/(pks|mpk_rzeszow)\.json$/.test(url)
    ? {tripShapes:{one:'a',two:'b'},tripPatterns:{one:0,two:0},patterns:[['1','2']],stopShapes:{},stops:{'1':{lat:50,lon:22},'2':{lat:50.02,lon:22}}}
    : String(url).endsWith('/a.json')?a:b));
  try {
    const {officialBusRoute}=load('lib/official-bus-routes.ts');
    for(const provider of ['pks','mpk_rzeszow']) {
      let memory=[];
      for(const [trip,expected] of [['one',a],['two',b]]) {
        memory=await preferredLocalRoute({mode:'road',stops,
          bundled:()=>officialBusRoute(provider,trip,[1,2],stops),cached:async()=>memory});
        assert.deepEqual(memory,expected);
      }
    }
  } finally {global.fetch=previous;}
});

test('offline caches remain available, but reversed or incomplete geometry cannot be painted',async()=>{
  const stops=[[50,22],[50.02,22]],road=[stops[0],[50.01,22],stops[1]];
  for(const bundled of [async()=>[],async()=>{throw Error('asset unavailable');},async()=>[road[0],road[1]]]) {
    assert.deepEqual(await preferredLocalRoute({mode:'road',stops,bundled,cached:async()=>road}),road);
    assert.deepEqual(await preferredLocalRoute({mode:'road',stops,bundled,cached:async()=>[...road].reverse()}),[]);
  }
  assert.deepEqual(await preferredLocalRoute({mode:'road',stops,bundled:async()=>[],cached:async()=>{throw Error('storage unavailable');}}),[]);
  assert.deepEqual(await preferredLocalRoute({mode:'rail',stops,bundled:async()=>[],cached:async()=>road}),road);
});
