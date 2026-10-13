const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const route=require('../public/data/bus-routes/pks/288.json');
const {correctPksStationJunction}=load('lib/pks-station-junction.ts');
const {roadRouteMatchesStops}=load('lib/bus-road-geometry.ts');
test('actual PKS shape retains the route and endpoints while removing only the station zigzag in both directions',()=>{
 for(const input of [route,[...route].reverse()]){
  const fixed=correctPksStationJunction(input,'pks');
  assert.equal(fixed.length,input.length-2);assert.deepEqual(fixed[0],input[0]);assert.deepEqual(fixed.at(-1),input.at(-1));
  assert.ok(!fixed.some(p=>p[0]===50.041991&&p[1]===22.002377));
  const local=fixed.filter(p=>p[0]>50.0417&&p[0]<50.0422&&p[1]>22.0023&&p[1]<22.0027);
  assert.ok(roadRouteMatchesStops(local,[local[0],local.at(-1)],10));
  assert.deepEqual(correctPksStationJunction(fixed,'pks'),fixed);
 }
});
test('other providers, nearby turns and deliberate return legs are preserved',()=>{
 assert.strictEqual(correctPksStationJunction(route,'marcel'),route);assert.strictEqual(correctPksStationJunction(route,'mpk_rzeszow'),route);
 const turn=[[50.041788,22.002516],[50.041946,22.002446],[50.041991,22.0021],[50.042018,22.002521]];
 assert.strictEqual(correctPksStationJunction(turn,'pks'),turn);
 const loop=[[50,22],[50.001,22.001],[50,22],[50,22.002]];assert.strictEqual(correctPksStationJunction(loop,'pks'),loop);
});
