const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const load=require('./load-ts.cjs');
const {correctMarcelNiebylecRoute:correct}=load('lib/marcel-niebylec-route.ts');
const {roadRouteMatchesStops,roadDistance,cleanRoadJunctionLoops}=load('lib/bus-road-geometry.ts');
const {simplifyRouteForPaint}=load('lib/map/route-presentation.ts');
const {journeyBusCorridor}=load('lib/journey-bus-corridor.ts');
const index=require('../public/data/marcel-routes/index.json');
const north=new Set(['pattern-0','pattern-3','pattern-12','pattern-13']);
const south=new Set(['pattern-6','pattern-9','pattern-14','pattern-15']);
const southernEntry=[49.8555022,21.9028155],platformPoint=[49.856043,21.9036462],junction=[49.8562756,21.9034073];
function assertPassage(road,northbound,shape){
  const entry=road.findIndex(p=>roadDistance(p,southernEntry)<1);
  const platform=road.findIndex(p=>roadDistance(p,platformPoint)<1);
  const exit=road.findIndex(p=>roadDistance(p,junction)<1);
  assert.ok(entry>=0&&platform>=0&&exit>=0,shape+' retains both road links and the platform');
  assert.ok(northbound?entry<platform&&platform<exit:exit<platform&&platform<entry,shape+' follows its own direction');
  assert.equal(road.filter(p=>roadDistance(p,junction)<1).length,1,shape+' does not reverse back to the junction');
}
test('all Marcel patterns preserve ordered stops; Niebylec uses the connected corridor in both directions',()=>{
  const changed=[];
  for(const [key,shape] of Object.entries(index.patterns)) {
    const stops=key.split('|').map(p=>p.split(',').map(Number));
    const original=JSON.parse(fs.readFileSync(`public/data/marcel-routes/${shape}.json`));
    const snapshot=JSON.stringify(original);
    const road=correct(original,'marcel');
    assert.ok(roadRouteMatchesStops(road,stops,150),shape);
    assert.equal(JSON.stringify(original),snapshot,'shared source geometry is never mutated');
    assert.equal(correct(original,'pks'),original);
    assert.equal(correct(original,'mpk_rzeszow'),original);
    if(road===original){assert.ok(!north.has(shape)&&!south.has(shape),shape);continue;}
    changed.push(shape);
    assert.deepEqual(road[0],original[0]);assert.deepEqual(road.at(-1),original.at(-1));
    assertPassage(road,north.has(shape),shape);
    assert.equal(correct(road,'marcel'),road,'correction is idempotent');
    assert.equal(road.length-original.length,11,'only the local three-point excursion is replaced');
    const first=original.findIndex((p,i)=>p!==road[i]);
    assert.deepEqual(road.slice(first+13),original.slice(first+2),'all geometry after the two replaced vertices stays exact');
    // Use the same cleanup and paint pipeline as BusMap, plus journey display cleanup.
    const painted=simplifyRouteForPaint(cleanRoadJunctionLoops(road,stops));
    assertPassage(painted,north.has(shape),shape+' map');
    assertPassage(journeyBusCorridor(road,stops,8),north.has(shape),shape+' journey');
  }
  assert.deepEqual(changed.sort(),[...north,...south].sort(),'only the eight known Niebylec variants change');
});
test('real stop turnarounds, truncated routes and other nearby roads stay untouched',()=>{
  const southEnd=[49.855519,21.902749],northEnd=[49.856276,21.903407],stop=[49.856049,21.90364];
  for(const route of [[],[northEnd],[northEnd,stop],[northEnd,stop,northEnd],
    [southEnd,northEnd,stop], [northEnd,stop,northEnd,[49.8551,21.9031]],
    [northEnd,stop,northEnd,[49.856795,21.903836]],
    [southEnd,northEnd,[49.856049,21.9041],northEnd]]){
    assert.equal(correct(route,'marcel'),route);
  }
  const route=[northEnd,stop,northEnd,southEnd];
  for(const provider of [undefined,'pks','mpk','mpk_rzeszow'])assert.equal(correct(route,provider),route);
  const corrected=correct(route,'marcel');
  assert.equal(corrected.length,15,'a correction at either array boundary adds no duplicate tail');
  assert.deepEqual(corrected[0],northEnd);assert.deepEqual(corrected.at(-1),southEnd);
  assertPassage(corrected,false,'standalone southbound segment');
});
test('a course visiting Niebylec in both directions preserves the intervening return leg',()=>{
  const s=[49.855519,21.902749],n=[49.856276,21.903407],p=[49.856049,21.90364];
  const otherStops=[[49.86,21.91],[49.87,21.92],[49.86,21.91]];
  const road=correct([s,n,p,n,...otherStops,n,p,n,s],'marcel');
  assert.deepEqual(road.slice(15,18),otherStops);
  assert.equal(road.length,33);
  assert.equal(correct(road,'marcel'),road);
});
test('bundled journey display applies both direction corrections without external routing',async()=>{
  const previous=global.fetch;
  global.fetch=async url=>{assert.ok(String(url).startsWith('/data/marcel-routes/'));return new Response(fs.readFileSync('public'+url));};
  try{
    const {bundledMarcelJourneyRoute}=load('lib/marcel-route-assets.ts');
    for(const [key,shape] of Object.entries(index.patterns)){
      if(!north.has(shape)&&!south.has(shape))continue;
      const stops=key.split('|').map(p=>p.split(',').map(Number));
      const road=await bundledMarcelJourneyRoute(stops,true);
      assertPassage(road,north.has(shape),shape+' bundled journey');
      assert.ok(roadRouteMatchesStops(road,stops,150),shape);
    }
  }finally{global.fetch=previous;}
});
