const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),load=require('./load-ts.cjs');
const {mpkRouteForPaint}=load('lib/map/mpk-route-paint.ts');
const index=require('../public/data/bus-routes/mpk_rzeszow.json'),feed=require('../public/data/journeys/mpk.json');
const pins=Object.values(index.stops).map(s=>[s.lat,s.lon]);
test('all packaged MPK 28 variants lose only short stop-pin spurs without moving original data',()=>{
 const shapes=[...new Set(feed.trips.filter(t=>String(t[1])==='28').map(t=>index.tripShapes[t[0]]).filter(Boolean))];assert.equal(shapes.length,8);
 for(const shape of shapes){const route=JSON.parse(fs.readFileSync('public/data/bus-routes/mpk_rzeszow/'+shape+'.json')),before=JSON.stringify(route),clean=mpkRouteForPaint(route,'mpk_rzeszow',pins);
  assert.ok(clean.length<route.length,shape+' has corrected pin spurs');assert.ok(clean.length>route.length*.85,'ordinary road geometry remains');assert.equal(JSON.stringify(route),before);assert.deepEqual(clean[0],route[0]);assert.deepEqual(clean.at(-1),route.at(-1));assert.ok(clean.every(p=>route.includes(p)));assert.deepEqual(mpkRouteForPaint(clean,'mpk_rzeszow',pins),clean,'idempotent '+shape);
 }
});
test('PKS, Marcel, rail, real bends and return legs are preserved',()=>{
 const route=[[50,22],[50.0001,22],[50.00015,22.00015],[50.0002,22],[50.0003,22]];
 for(const provider of ['pks','marcel','pkp_intercity',undefined])assert.equal(mpkRouteForPaint(route,provider,[route[2]]),route);
 const corner=[[50,22],[50.0001,22],[50.0002,22],[50.0002,22.0001],[50.0002,22.0002]];
 assert.deepEqual(mpkRouteForPaint(corner,'mpk_rzeszow',[corner[2]]),corner);
 const hairpin=[[50,22],[50.0001,22],[50.0002,22],[50.0001,22.00002],[50,22.00002]];
 assert.deepEqual(mpkRouteForPaint(hairpin,'mpk_rzeszow',[hairpin[2]]),hairpin);
});

test('MPK 35 Staroniwska small teeth missed by build 612 become a straight road segment',()=>{
 const {journeyBusCorridor}=load('lib/journey-bus-corridor.ts');
 for(const [shape,ids]of [['67',['300','301','305']],['107',['538','539','541','542','543']]]){
  const route=JSON.parse(fs.readFileSync('public/data/bus-routes/mpk_rzeszow/'+shape+'.json')),old=journeyBusCorridor(route,pins),clean=mpkRouteForPaint(route,'mpk_rzeszow',pins);
  for(const id of ids){const stop=index.stops[id],k=route.findIndex(p=>Math.abs(p[0]-stop.lat)<.000001&&Math.abs(p[1]-stop.lon)<.000001);assert.ok(k>1&&k<route.length-2,id);
   assert.ok(old.includes(route[k]),'reproduces the missed small tooth '+id);
   assert.ok(!clean.includes(route[k]),'removes only the inserted platform vertex '+id);
   const before=clean.indexOf(route[k-1]);assert.ok(before>=0);assert.equal(clean[before+1],route[k+1],'direct road chord between original anchors '+id);
  }
  if(shape==='107'){const p=index.stops['540'],k=route.findIndex(v=>Math.abs(v[0]-p.lat)<.000001&&Math.abs(v[1]-p.lon)<.000001);assert.ok(clean.includes(route[k]),'the actual curved approach at Staroniwska pętla stays');}
  assert.deepEqual(clean[0],route[0]);assert.deepEqual(clean.at(-1),route.at(-1));assert.deepEqual(mpkRouteForPaint(clean,'mpk_rzeszow',pins),clean,'stable cleanup '+shape);
  for(const provider of ['pks','marcel'])assert.equal(mpkRouteForPaint(route,provider,pins),route,'no changes to '+provider);
 }
});
test('small genuine turns, off-pin bumps and road-centre stops are not flattened',()=>{
 const corner=[[50,22],[50.0002,22],[50.00021,22.00001],[50.00021,22.00003],[50.00021,22.0003]];
 assert.deepEqual(mpkRouteForPaint(corner,'mpk_rzeszow',[corner[2]]),corner);
 const bump=[[50,22],[50.0002,22],[50.00022,22.00002],[50.00024,22],[50.0005,22]];
 assert.deepEqual(mpkRouteForPaint(bump,'mpk_rzeszow',[[50.01,22]]),bump,'requires an exact platform pin');
 const straight=[[50,22],[50.0002,22],[50.00022,22],[50.00024,22],[50.0005,22]];
 assert.deepEqual(mpkRouteForPaint(straight,'mpk_rzeszow',[straight[2]]),straight);
});

test('every packaged MPK shape retains its endpoints and is stable across repeated painting',()=>{
 const files=fs.readdirSync('public/data/bus-routes/mpk_rzeszow').filter(name=>name.endsWith('.json'));assert.ok(files.length>200);
 for(const name of files){const route=JSON.parse(fs.readFileSync('public/data/bus-routes/mpk_rzeszow/'+name)),clean=mpkRouteForPaint(route,'mpk_rzeszow',pins);
  assert.deepEqual(clean[0],route[0],name);assert.deepEqual(clean.at(-1),route.at(-1),name);assert.deepEqual(mpkRouteForPaint(clean,'mpk_rzeszow',pins),clean,'stable '+name);
 }
});
