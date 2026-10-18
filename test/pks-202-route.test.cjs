const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const load=require('./load-ts.cjs');
const {tripId,stopIds}=require('./fixtures/pks-202-medynia-route.json');
const snapshot=require('../public/data/pks-stop-points.json').stops;
const index=require('../public/data/bus-routes/pks.json');
const shape=require('../public/data/bus-routes/pks/370.json');
const stops=stopIds.map(id=>[snapshot[id].lat,snapshot[id].lon]);
const {roadRouteMatchesStops,roadDistance}=load('lib/bus-road-geometry.ts');

test('PKS 202 vehicle 128 renders its complete live course from the bundled shape despite an unused GTFS prefix',async()=>{
  const previous=global.fetch;const requests=[];
  global.fetch=async url=>{requests.push(String(url));return new Response(fs.readFileSync('public'+url));};
  try{
    assert.equal(index.tripShapes[tripId],'370');
    assert.equal(index.patterns[index.tripPatterns[tripId]].length,stops.length);
    assert.ok(roadDistance(shape[0],stops[0])>680);
    assert.equal(roadRouteMatchesStops(shape,stops,180),false,'reproduce the rejected original shape');
    const {officialBusRoute}=load('lib/official-bus-routes.ts');
    const route=await officialBusRoute('pks',tripId,stopIds,stops);
    assert.ok(route.length>1000,'complete road geometry is available without either external router');
    assert.deepEqual(route,shape.slice(55),'only remove the unused prefix, preserving every remaining road point');
    assert.ok(roadDistance(route[0],stops[0])<6);
    assert.equal(roadRouteMatchesStops(route,stops,180),true,'all 37 ordered live stops are covered');
    assert.ok(requests.every(url=>url.startsWith('/data/bus-routes/')));
    assert.deepEqual(await officialBusRoute('pks',tripId,stopIds.slice(1),stops.slice(1)),[],'a partial stop list is still rejected');
    assert.deepEqual(await officialBusRoute('pks',tripId,[...stopIds].reverse(),[...stops].reverse()),[],'reversed stops are still rejected');
    const wrong=stops.map(p=>[...p]);wrong[20][0]+=.02;
    assert.deepEqual(await officialBusRoute('pks',tripId,stopIds,wrong),[],'an interior stop outside the road geometry is still rejected');
  }finally{global.fetch=previous;}
});
