const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const load=require('./load-ts.cjs');
const {correctMarcelNiebylecRoute:correct}=load('lib/marcel-niebylec-route.ts');
const {roadRouteMatchesStops,roadDistance}=load('lib/bus-road-geometry.ts');
const index=require('../public/data/marcel-routes/index.json');
test('Niebylec northbound follows the Magnolia link and the stop road, preserving every ordered stop',()=>{
  let changed=0;
  for(const [key,shape] of Object.entries(index.patterns)) {
    const stops=key.split('|').map(p=>p.split(',').map(Number));
    const original=JSON.parse(fs.readFileSync(`public/data/marcel-routes/${shape}.json`));
    const road=correct(original,'marcel');
    assert.ok(roadRouteMatchesStops(road,stops,150),shape);
    assert.equal(correct(original,'pks'),original);
    assert.equal(correct(original,'mpk_rzeszow'),original);
    if(road===original)continue;
    changed++;
    assert.deepEqual(road[0],original[0]);assert.deepEqual(road.at(-1),original.at(-1));
    const entry=road.findIndex(p=>roadDistance(p,[49.8555022,21.9028155])<1);
    const platform=road.findIndex(p=>roadDistance(p,[49.856043,21.9036462])<1);
    const exit=road.findIndex((p,i)=>i>platform&&roadDistance(p,[49.8562756,21.9034073])<1);
    assert.ok(entry>=0&&entry<platform&&platform<exit,shape);
    assert.equal(correct(road,'marcel'),road,'correction is idempotent');
    assert.equal(road.filter(p=>roadDistance(p,[49.8562756,21.9034073])<1).length,1,'no return to the same junction');
    assert.equal(road.length-original.length,11,'only the local three-point excursion is replaced');
  }
  assert.equal(changed,4,'only the four northbound patterns change');
});
