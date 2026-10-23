const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const loadTs=require('./load-ts.cjs');
const fixture=require('./fixtures/pks-314-102-2026-10-19.json');

test('actual PKS 314 / vehicle 102 renders offline with 42 live stops and 41 GTFS stops',async()=>{
  const previous=global.fetch,urls=[];
  global.fetch=async url=>{
    urls.push(String(url));
    assert.ok(String(url).startsWith('/data/bus-routes/'),'bundled geometry must work without a routing server');
    return new Response(fs.readFileSync('public'+url));
  };
  try{
    const index=JSON.parse(fs.readFileSync('public/data/bus-routes/pks.json'));
    assert.equal(fixture.stops.length,42);
    assert.equal(index.patterns[index.tripPatterns[fixture.tripId]].length,41);
    const {officialBusRoute}=loadTs('lib/official-bus-routes.ts');
    const ids=fixture.stops.map(stop=>stop.id),coords=fixture.stops.map(stop=>[stop.lat,stop.lon]);
    const points=await officialBusRoute('pks',fixture.tripId,ids,coords);
    assert.deepEqual(points,JSON.parse(fs.readFileSync('public/data/bus-routes/pks/490.json')));
    assert.equal(loadTs('lib/bus-road-geometry.ts').roadRouteMatchesStops(points,coords,150),true);
    assert.deepEqual(urls,['/data/bus-routes/pks.json','/data/bus-routes/pks/490.json']);
  }finally{global.fetch=previous;}
});

test('changed stop counts still require complete ordered live geometry, including return legs',async()=>{
  const previous=global.fetch;
  const a=[50,22],b=[50.01,22],c=[50.02,22],road=[a,b,c,b,a];
  global.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/pks.json')
    ? {tripShapes:{known:'shape'},tripPatterns:{known:0},patterns:[['1','2','3']],stopShapes:{},stops:{'1':{lat:50,lon:22},'2':{lat:50.01,lon:22},'3':{lat:50,lon:22}}}
    : road));
  try{
    const {officialBusRoute}=loadTs('lib/official-bus-routes.ts');
    const ids=[10,20,30,40,10];
    assert.deepEqual(await officialBusRoute('pks','known',ids,road),road);
    assert.deepEqual(await officialBusRoute('pks','known',ids,[a,c,b,c,a]),[],'must preserve the order of repeated stops');
    assert.deepEqual(await officialBusRoute('pks','known',ids,[a,b,[51,24],b,a]),[],'must not skip an off-route stop');
    assert.deepEqual(await officialBusRoute('pks','known',ids,road.slice(1)),[],'must not accept incomplete coordinates');
  }finally{global.fetch=previous;}
});

test('a new course ID can find a unique road shape despite different metadata counts',async()=>{
  const previous=global.fetch;
  const road=[[50,22],[50.01,22],[50.02,22]];
  global.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/pks.json')
    ? {tripShapes:{old:'shape'},tripPatterns:{old:0},patterns:[['1','2']],stopShapes:{},stops:{'1':{lat:50,lon:22},'2':{lat:50.02,lon:22}}}
    : road));
  try{
    const {officialBusRoute}=loadTs('lib/official-bus-routes.ts');
    assert.deepEqual(await officialBusRoute('pks','new',[10,20,30],road),road);
    assert.deepEqual(await officialBusRoute('pks','new',[30,20,10],[...road].reverse()),[]);
  }finally{global.fetch=previous;}
});

test('every packaged PKS variant validates its complete stop order offline',async()=>{
 const index=require('../public/data/bus-routes/pks.json'),previous=global.fetch,checked=new Set();
 global.fetch=async url=>new Response(fs.readFileSync('public'+url));
 try{
  const {officialBusRoute}=loadTs('lib/official-bus-routes.ts'),{roadRouteMatchesStops}=loadTs('lib/bus-road-geometry.ts');
  for(const [trip,shape] of Object.entries(index.tripShapes)){
   const pattern=index.patterns[index.tripPatterns[trip]],key=shape+':'+pattern.join(',');if(checked.has(key))continue;checked.add(key);
   const coords=pattern.map(id=>[index.stops[id].lat,index.stops[id].lon]);
   const route=await officialBusRoute('pks',trip,pattern,coords);
   assert.ok(roadRouteMatchesStops(route,coords,180),`PKS trip ${trip}, shape ${shape}`);
  }
  assert.equal(checked.size,576);
 }finally{global.fetch=previous;}
});

test('exact courses trim unused prefixes AND suffixes with changed live stop counts, while rejecting foreign stops',async()=>{
 const previous=global.fetch,road=Array.from({length:21},(_,i)=>[50+i*.002,22]);
 global.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/pks.json')?{tripShapes:{known:'shape'},tripPatterns:{known:0},patterns:[['1','2','3']],stopShapes:{},stops:{}}:road));
 try{
  const {officialBusRoute}=loadTs('lib/official-bus-routes.ts');
  for(const [start,end] of [[1,18],[5,16],[9,20]]){
   const stops=road.slice(start,end+1),ids=stops.map((_,i)=>100+i);
   assert.deepEqual(await officialBusRoute('pks','known',ids,stops,{completePattern:true}),stops);
   const invalid=stops.map(p=>p.slice());invalid[2][1]+=.02;
   assert.deepEqual(await officialBusRoute('pks','known',ids,invalid,{completePattern:true}),[]);
  }
 }finally{global.fetch=previous;}
});
