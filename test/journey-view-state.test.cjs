const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {stableJourneyResults,journeyMapKey}=load('lib/journey-view-state.ts');
const journey={id:'old:100',departure:100,arrival:200,walking:0,transfers:0,legs:[{course:'pks:123:2026-10-19',from:{id:'a',lat:50,lon:22},to:{id:'b',lat:50.1,lon:22.1},departure:100,arrival:200,line:'108',provider:'pks'}]};
test('updated delays preserve journey selection and map geometry without mutating the search result',()=>{
 const updated={...journey,id:'new:160',departure:160,arrival:260,legs:[{...journey.legs[0],departure:160,arrival:260,delaySeconds:60}]};
 assert.equal(stableJourneyResults([journey])[0].id,stableJourneyResults([updated])[0].id);
 assert.equal(journeyMapKey(journey),journeyMapKey(updated));
 assert.equal(journey.id,'old:100');
 for(const leg of [{...journey.legs[0],course:'pks:456:2026-10-19'},{...journey.legs[0],to:{id:'other',lat:50.1,lon:22.1}}])assert.notEqual(stableJourneyResults([journey])[0].id,stableJourneyResults([{...journey,legs:[leg]}])[0].id);
 for(const leg of [{...journey.legs[0],to:{...journey.legs[0].to,lat:51}},{...journey.legs[0],path:[[50,22],[50.2,22.2]]}])assert.notEqual(journeyMapKey(journey),journeyMapKey({...journey,legs:[leg]}));
 assert.notEqual(journeyMapKey(journey),journeyMapKey({...journey,legs:[{...journey.legs[0],stops:[{stop:{id:'middle',lat:50.05,lon:22.05},arrival:150,departure:150}]}]}),'a changed intermediate stop updates route dots and geometry');
});
