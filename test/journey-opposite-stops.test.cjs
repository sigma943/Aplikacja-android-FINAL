const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),z=require('node:zlib'),load=require('./load-ts.cjs');
const {scanJourneys,feedConnections}=load('lib/journey-timetable.ts'),{warsawTimeMs,warsawClock}=load('lib/transit-time.ts');
const stop=(id,lat=50,lon=22,name=id)=>({id,name,type:'bus',lat,lon,carriers:[{id:'pks'}],sourceProviderIds:['pks'],lines:[],isFavorite:false});
const options={at:0,arriveBy:false,maxTransfers:1,walkMeters:500,transferMinutes:3,providers:['pks'],sort:'fastest'};
const c=(from,to,dep,arr,course='pks:out')=>({from,to,departure:dep*60000,arrival:arr*60000,course,line:'108',provider:'pks'});
const a=stop('A'),opposite=stop('opposite',50.00015),terminal=stop('terminal',50.02),origin=stop('origin',50.1);

test('opposite stops offer walking alone instead of requiring a trip to the terminal and back',()=>{
 const connections=[c(a,terminal,5,20),c(terminal,opposite,60,75,'pks:back')];
 const result=scanJourneys(a,opposite,connections,options);assert.ok(result[0].legs.every(l=>l.walking!==undefined));assert.equal(result[0].arrival,60000);assert.equal(result[0].transfers,0);
 const deadline=100*60000,arrival=scanJourneys(a,opposite,connections,{...options,arriveBy:true,at:deadline});const walking=arrival.find(j=>j.legs.every(l=>l.walking!==undefined));assert.equal(walking.arrival,deadline);assert.equal(walking.departure,deadline-60000);
 assert.equal(scanJourneys(a,opposite,[],{...options,walkMeters:0}).length,0);
});
test('a short initial walk selects the bus on the correct side of the road',()=>{
 const results=scanJourneys(a,origin,[c(a,terminal,5,20),c(terminal,origin,60,90,'pks:return'),c(opposite,origin,5,15,'pks:correct-side')],options);
 assert.equal(results[0].arrival,15*60000);assert.equal(results[0].legs[0].walking>0,true);assert.equal(results[0].legs[1].course,'pks:correct-side');
});
test('same departure does not produce a terminal return when alighting nearby and walking arrives earlier',()=>{
 const connections=[c(origin,a,5,20),c(a,terminal,20,30),c(terminal,opposite,60,75,'pks:back')];
 const results=scanJourneys(origin,opposite,connections,options);assert.equal(results.length,1);assert.equal(results[0].arrival,21*60000);assert.equal(results[0].transfers,0);
 const explicitWalkingPreference=scanJourneys(origin,opposite,connections,{...options,sort:'walking'});assert.ok(explicitWalkingPreference.some(j=>j.walking===0));
});
test('PKS GTFS names and platform codes prevent matching an opposite stop by coordinates alone',()=>{
 const left=stop('live13',50.0002,22,'Wieś SKR 13'),right=stop('live14',50.00001,22,'Wieś SKR 14');left.code='13';right.code='14';
 const feed={version:1,provider:'pks',stops:{x:{name:'Wieś SKR 13',lat:50,lon:22},y:{name:'Inna wieś 2',lat:50.02,lon:22}},calendars:{s:{start:'20261001',end:'20261231',days:'1111111'}},exceptions:{},patterns:[[['x',0,0,0,0],['y',600,600,0,0]]],trips:[['1','108','s',12*3600,0]]};
 const con=feedConnections(feed,[left,right],'2026-10-19',{...options,at:warsawTimeMs('2026-10-19','11:30')});assert.equal(con[0].from.id,'live13');assert.equal(con[0].from.lat,left.lat,'matched platform retains its catalog position');
});
test('real Gwoznica SKR 13 and 14 do not require the 15:52 return from the terminal',()=>{
 const f=JSON.parse(z.gunzipSync(fs.readFileSync('public/data/journeys/pks.json.gz'))),o={...options,at:warsawTimeMs('2026-10-19','12:11')};
 const from={...stop('journey:rzeszow-da',50.042,22.003),name:'Rzeszów D.A.'};
 for(const [id,time] of [['10','14:22'],['11','14:21']]){
  const to={...stop('journey:pks:'+id),...f.stops[id]},results=scanJourneys(from,to,feedConnections(f,[],'2026-10-19',o),o);
  assert.equal(warsawClock(results[0].arrival),time);assert.ok(results.every(j=>j.transfers===0),'avoid worse return trips for each outbound departure');
  if(id==='10')assert.ok(results[0].legs.at(-1).walking>0);
 }
});
test('a confirmed short footpath replaces long loops, but a footpath over budget leaves the bus option',async()=>{
 const walking={id:'estimated',departure:0,arrival:60000,walking:30,transfers:0,legs:[{from:a,to:opposite,departure:0,arrival:60000,walking:30,provider:'walk',course:'walk',line:'Pieszo'}]};
 const bus={id:'loop',departure:300000,arrival:4500000,walking:0,transfers:1,legs:[{from:a,to:opposite,departure:300000,arrival:4500000,provider:'pks',course:'pks:loop',line:'108'}]};
 for(const meters of [25,900]){
  const {searchConnections}=load('lib/journey-loader.ts',{'./journey-worker-client':{runTimetableSearch:async()=>({journeys:[walking,bus],warnings:[],limited:false})},'./journey-walking':{journeyWalkingRoute:async()=>({points:[[50,22],[50.00015,22]],meters,minutes:Math.ceil(meters/70)})}});
  const result=await searchConnections(a,opposite,[],'2026-10-19',options,new AbortController().signal,()=>{});
  assert.equal(result.journeys.length,1);assert.equal(result.journeys[0].id,meters===25?'walk-only':'loop');
 }
});
