const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {reconcileRouteStopCoordinates,sameRouteStopName}=load('lib/reconcile-route-stops.ts');
const {roadRouteMatchesStops}=load('lib/bus-road-geometry.ts');
const point=(i)=>({id:i,name:`Miasto Ulica ${String(i+1).padStart(2,'0')}`,lat:50+i*.02,lon:22});
const official=Array.from({length:10},(_,i)=>point(i));
test('unknown future source errors are reconciled by ordered identity and good anchors, without per-ID overrides',()=>{
 const live=official.map(p=>({...p}));live[3].lon+=.004;live[6].lat+=.003;
 const corrected=reconcileRouteStopCoordinates(live,official);
 assert.deepEqual(corrected,official);assert.equal(corrected[0],live[0]);assert.notEqual(corrected[3],live[3]);assert.equal(live[3].lon,22.004);
 const missing=live.map(p=>({...p}));delete missing[6].lat;delete missing[6].lon;
 assert.deepEqual(reconcileRouteStopCoordinates(missing,official),official);
});
test('ambiguous, partial, reversed and stale patterns cannot move stops',()=>{
 const partial=official.slice(1),reversed=[...official].reverse();
 assert.equal(reconcileRouteStopCoordinates(partial,official),partial);
 assert.equal(reconcileRouteStopCoordinates(reversed,official),reversed);
 const far=official.map(p=>({...p,lon:p.lon+.03}));assert.equal(reconcileRouteStopCoordinates(far,official),far);
 for(const change of [{name:'Inne Miasto 04'},{name:'Miasto Ulica 05'}]){
  const live=official.map(p=>({...p}));live[3]={...live[3],lon:22.004,...change};
  assert.equal(reconcileRouteStopCoordinates(live,official),live);
 }
 assert.equal(sameRouteStopName('Miasto Szpital 02','Miasto Szpital 01'),false);
 assert.equal(sameRouteStopName('Miasto, al. Niepodległości rondo 18','Miasto Niepodległości rondo 18 nż'),true);
});

test('the real PKS 312 pattern repairs shifted interior points and its missing origin using GTFS',()=>{
 const snapshot=require('../public/data/pks-stop-points.json').stops,idx=require('../public/data/bus-routes/pks.json'),{tripId,stopIds}=require('./fixtures/pks-312-bugaj-route.json');
 const pattern=idx.patterns[idx.tripPatterns[tripId]],target=pattern.map(id=>idx.stops[id]);
 const live=stopIds.map(id=>({...snapshot[id],id,name:snapshot[id].n+' '+snapshot[id].code}));
 const fixed=reconcileRouteStopCoordinates(live,target);
 assert.notEqual(fixed,live);assert.deepEqual([fixed[0].lat,fixed[0].lon],[target[0].lat,target[0].lon]);
 for(const id of [9737,9739]){const i=stopIds.indexOf(id);assert.deepEqual([fixed[i].lat,fixed[i].lon],[target[i].lat,target[i].lon]);}
 assert.equal(roadRouteMatchesStops(require('../public/data/bus-routes/pks/658.json'),fixed.map(s=>[s.lat,s.lon]),180),true);
});
