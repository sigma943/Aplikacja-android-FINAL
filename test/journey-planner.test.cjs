const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {buildJourneyLegs,findJourneys}=load('lib/journey-planner.ts');
const stop=(id,lat=50,lon=22)=>({id,name:id,lat,lon,type:'bus',lines:[],carriers:[],isFavorite:false});
const a=stop('A'),b=stop('B',50.02),c=stop('C',50.04);
const row=(course,time,provider='pks',line='108')=>({id:course+':'+time,courseId:course,plannedAtMs:time*60000,carrier:{id:provider},line});
const options={at:60*60000,arriveBy:false,maxTransfers:1,walkMeters:0,transferMinutes:5,providers:['pks','mpk'],sort:'fastest'};
test('planner connects exact courses in order, never just matching line labels',()=>{
 const legs=buildJourneyLegs([{stop:a,departures:[row('one',60)]},{stop:b,departures:[row('one',70),row('other',75)]},{stop:c,departures:[row('other',90),row('wrong',80)]}],options.providers);
 const results=findJourneys(a,c,legs,options);assert.equal(results.length,1);assert.equal(results[0].transfers,1);assert.equal(results[0].arrival,90*60000);
 assert.equal(findJourneys(a,c,legs,{...options,maxTransfers:0}).length,0);
 assert.equal(findJourneys(a,c,legs,{...options,transferMinutes:6}).length,0);
});
test('provider namespaces, missing identifiers and missing times cannot invent a direct trip',()=>{
 const legs=buildJourneyLegs([{stop:a,departures:[row('same',60)]},{stop:c,departures:[row('same',70,'mpk'),{...row('same',80),courseId:undefined}]}],options.providers);assert.equal(legs.length,0);
});
test('arrival searches enforce deadline and prefer latest feasible departure',()=>{
 const legs=buildJourneyLegs([{stop:a,departures:[row('one',60),row('two',70)]},{stop:c,departures:[row('one',80),row('two',90)]}],options.providers);
 assert.equal(findJourneys(a,c,legs,{...options,arriveBy:true,at:89*60000})[0].departure,60*60000);
 assert.equal(findJourneys(a,c,legs,{...options,arriveBy:true,at:90*60000})[0].departure,70*60000);
});
test('walking cannot bridge missing coordinates or exceed total budget',()=>{
 const near=stop('near',50.0005),legs=buildJourneyLegs([{stop:near,departures:[row('one',70)]},{stop:c,departures:[row('one',90)]}],options.providers);
 assert.equal(findJourneys(a,c,legs,{...options,walkMeters:100}).length,1);
 assert.equal(findJourneys(a,c,legs,{...options,walkMeters:10}).length,0);
 assert.equal(findJourneys({...a,lat:undefined},c,legs,{...options,walkMeters:2000}).length,0);
});
