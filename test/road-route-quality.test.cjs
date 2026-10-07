const {test}=require('node:test');
const assert=require('node:assert/strict');
const loadTs=require('./load-ts.cjs');
const encode=require('./encode-polyline.cjs');
const {roadRouteMatchesStops,joinRouteChunks,simplifyRoadRoute}=loadTs('lib/bus-road-geometry.ts');
const native={'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}}};

test('route validation checks stop order, endpoint coverage and disconnected chunks while retaining real loops',()=>{
  const a=[50,22],b=[50,22.01],c=[50.01,22.01];
  assert.equal(roadRouteMatchesStops([a,b,c],[a,b,c]),true);
  assert.equal(roadRouteMatchesStops([a,c,b],[a,b,c]),false);
  assert.equal(roadRouteMatchesStops([a,b,c,b,a],[a,b,c,b,a]),true);
  assert.equal(roadRouteMatchesStops([a,b],[a,c,b]),false);
  assert.equal(roadRouteMatchesStops([a,[NaN,22],b],[a,b]),false);
  assert.equal(roadRouteMatchesStops([a,[91,22],b],[a,b]),false);
  assert.throws(()=>joinRouteChunks([[a,b],[c,a]]),/Disconnected/);
});

test('long route simplification preserves sharp road corners and return legs',()=>{
  const corners=[[50,22],[50,22.02],[50.02,22.02],[50.02,22],[50,22]];
  const points=[];
  for(let leg=0;leg<4;leg++)for(let i=0;i<1500;i++)points.push(corners[leg].map((v,k)=>v+(corners[leg+1][k]-v)*i/1500));
  points.push(corners.at(-1));
  assert.deepEqual(simplifyRoadRoute(points),corners);
});

test('PKS and MPK stops in side roads can turn back instead of routing around an artificial block',async()=>{
  const previous=global.fetch;
  const start=[50,22],junction=[50,22.001],stop=[50.002,22.001],end=[50,22.003];
  const road=[start,junction,stop,junction,end];let calls=0;
  global.fetch=async url=>{
    const q=JSON.parse(new URL(url).searchParams.get('json'));calls++;
    assert.equal(q.locations[1].type,'via');
    return new Response(JSON.stringify({trip:{legs:[{shape:encode(road)}]}}));
  };
  try{
    const client=loadTs('lib/pks-client.ts',native);
    for(const carrier of ['pks','mpk_rzeszow']) {
      const result=await client.fetchRouteGeometryClient({carrier,line:'108',direction:'Rzeszów',mode:'road',stops:[start,stop,end].map(([lat,lon],id)=>({id,lat,lon}))});
      assert.deepEqual(result.geometry.coordinates,road.map(([lat,lon])=>[lon,lat]));
    }
    assert.equal(calls,2);
  }finally{global.fetch=previous;}
});

test('invalid primary road geometry falls back to another router and only complete geometry is cached',async()=>{
  const previous=global.fetch;const calls=[];const road=[[50,22],[50.005,22.004],[50.01,22.01]];
  global.fetch=async url=>{
    calls.push(String(url));
    return new Response(JSON.stringify(String(url).includes('valhalla')?{trip:{legs:[{shape:encode([[51,24],[51.01,24.01]])}]}}:{code:'Ok',routes:[{geometry:{coordinates:road.map(([lat,lon])=>[lon,lat])}}]}));
  };
  try{
    const client=loadTs('lib/pks-client.ts',native);
    const request={carrier:'pks',line:'108',direction:'Rzeszów',mode:'road',stops:[road[0],road.at(-1)].map(([lat,lon],id)=>({id,lat,lon}))};
    assert.deepEqual((await client.fetchRouteGeometryClient(request)).geometry.coordinates,road.map(([lat,lon])=>[lon,lat]));
    assert.equal(calls.length,2);await client.fetchRouteGeometryClient(request);assert.equal(calls.length,2);
  }finally{global.fetch=previous;}
});

test('official routes never borrow an ambiguous trip prefix or a shape for the opposite stop order',async()=>{
  const previous=global.fetch;const road=[[50,22],[50.01,22.01]];const urls=[];
  global.fetch=async url=>{
    urls.push(String(url));
    return new Response(JSON.stringify(String(url).endsWith('/pks.json')?{tripShapes:{'41':'old'},stopShapes:{},tripPatterns:{'41':0},patterns:[['1','2']],stops:{'1':{lat:50,lon:22},'2':{lat:50.01,lon:22.01}}}:road));
  };
  try{
    const api=loadTs('lib/official-bus-routes.ts');
    assert.deepEqual(await api.officialBusRoute('pks','41_return',[1,2]),[]);
    assert.deepEqual(await api.officialBusRoute('pks','41',[2,1]),[]);
    assert.equal(urls.length,1);
    assert.deepEqual(await api.officialBusRoute('pks','41',[1,2]),road);
    assert.deepEqual(await api.officialBusRoute('pks','41',[1,2],[[51,24],[51.01,24.01]]),[]);
  }finally{global.fetch=previous;}
});

test('nearby offset stop pins do not force a driveway excursion; routing stays on real roads',async()=>{
 const previous=global.fetch;const start=[50,22],junction=[50,22.001],pin=[50.00045,22.001],end=[50,22.004];const spur=[start,junction,pin,junction,end],corridor=[start,junction,end];const calls=[];
 global.fetch=async url=>{const q=JSON.parse(new URL(url).searchParams.get('json'));calls.push(q);if(q.locations.length===3){assert.equal(q.locations[1].radius,150);assert.equal(q.locations[1].rank_candidates,false);}return new Response(JSON.stringify({trip:{legs:[{shape:encode(q.locations.length===3?spur:corridor)}]}}));};
 try{const client=loadTs('lib/pks-client.ts',native);const result=await client.fetchRouteGeometryClient({carrier:'pks',line:'108',direction:'Konieczkowa',mode:'road',stops:[start,pin,end].map(([lat,lon],id)=>({id,lat,lon}))});assert.deepEqual(result.geometry.coordinates,corridor.map(([lat,lon])=>[lon,lat]));assert.equal(calls.length,2);}finally{global.fetch=previous;}
});
test('corridor selection preserves distant stop visits, reverse legs and endpoints',()=>{
 const {preferRoadCorridor,roadRoutingLocations}=loadTs('lib/bus-road-geometry.ts');const start=[50,22],middle=[50,22.004],far=[50.003,22.004],end=[50,22.008];const detour=[start,middle,far,middle,end],direct=[start,middle,end];
 assert.equal(preferRoadCorridor(detour,direct,[start,far,end]),detour);
 assert.equal(preferRoadCorridor(detour,direct,[start,middle,start,end]),detour);
 assert.equal(preferRoadCorridor(detour,[middle,end],[start,middle,end]),detour);
 assert.equal(roadRoutingLocations([start,middle,end],true)[0].radius,35);
});
