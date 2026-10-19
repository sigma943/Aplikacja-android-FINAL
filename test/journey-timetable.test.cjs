const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{gunzipSync,strFromU8}=require('fflate'),load=require('./load-ts.cjs');
const {scanJourneys,feedConnections,serviceRuns}=load('lib/journey-timetable.ts');
const {warsawTimeMs}=load('lib/transit-time.ts');
const stop=(id,lat=50)=>({id,name:id,type:'bus',lat,lon:22,carriers:[{id:'pks'}],sourceProviderIds:['pks'],lines:[],isFavorite:false});
const a=stop('A'),b=stop('B',50.02),c=stop('C',50.04),d=stop('D',50.06);
const options={at:60*60000,arriveBy:false,maxTransfers:1,walkMeters:0,transferMinutes:5,providers:['pks','mpk'],sort:'fastest'};
const leg=(from,to,dep,arr,course='pks:one',provider='pks')=>({from,to,departure:dep*60000,arrival:arr*60000,line:'301',course,provider});

test('complete courses reach their terminus and intermediate stops without invented transfers',()=>{
 const connections=[leg(a,b,60,70),leg(b,c,70,80),leg(c,d,81,90)];
 const results=scanJourneys(a,d,connections,{...options,maxTransfers:0});
 assert.equal(results.length,1);assert.equal(results[0].transfers,0);assert.equal(results[0].legs.length,1);assert.equal(results[0].arrival,90*60000);
 assert.equal(results[0].legs[0].to.id,'D');
 assert.equal(scanJourneys(b,d,connections,options)[0].departure,70*60000);
});
test('transfers respect minimum interchange time, provider choices and arrival deadline',()=>{
 const connections=[leg(a,b,60,70),leg(b,c,74,80,'mpk:short','mpk'),leg(b,c,75,90,'mpk:good','mpk')];
 assert.equal(scanJourneys(a,c,connections,options)[0].arrival,90*60000);
 assert.equal(scanJourneys(a,c,connections,{...options,maxTransfers:0}).length,0);
 assert.equal(scanJourneys(a,c,connections,{...options,providers:['pks']}).length,0);
 assert.equal(scanJourneys(a,c,connections,{...options,arriveBy:true,at:89*60000}).length,0);
});
test('arrival mode retains a later departure even when an earlier journey arrives sooner',()=>{
 const connections=[leg(a,c,60,80,'pks:early'),leg(a,c,70,90,'pks:late')];
 assert.equal(scanJourneys(a,c,connections,{...options,arriveBy:true,at:90*60000})[0].departure,70*60000);
 assert.equal(scanJourneys(a,c,connections,options).length,2,'show alternative departures too');
});
test('walking budget is total across initial, interchange and final walks',()=>{
 const near=stop('near',50.0005),end=stop('end',50.0405),connections=[leg(near,c,70,90)];
 assert.equal(scanJourneys(a,end,connections,{...options,walkMeters:100}).length,0);
 const result=scanJourneys(a,end,connections,{...options,walkMeters:200})[0];
 assert.ok(result.walking>100&&result.walking<=200);assert.equal(result.legs[0].arrival,70*60000);assert.ok(result.legs[0].departure>options.at);
 assert.equal(scanJourneys({...a,lat:undefined},end,connections,{...options,walkMeters:2000}).length,0);
});
test('no-pickup and no-dropoff stops allow staying on the bus but not boarding or alighting',()=>{
 const first={...leg(a,b,60,70),dropoff:false},second={...leg(b,c,70,80),pickup:false};
 assert.equal(scanJourneys(a,c,[first,second],options).length,1);
 assert.equal(scanJourneys(a,b,[first,second],options).length,0);
 assert.equal(scanJourneys(b,c,[first,second],options).length,0);
});
test('calendar exceptions and previous service day retain a real after-midnight trip',()=>{
 const feed={version:1,provider:'pks',validFrom:'20261001',validUntil:'20261231',stops:{a:{name:'a',lat:50,lon:22},c:{name:'c',lat:50.04,lon:22}},calendars:{work:{start:'20261001',end:'20261231',days:'1111100'}},exceptions:{20261020:{work:2},20261018:{work:1}},patterns:[[['a',0,0,0,0],['c',1200,1200,0,0]]],trips:[['night','N','work',25*3600,0]]};
 assert.equal(serviceRuns(feed,'work','2026-10-20'),false);assert.equal(serviceRuns(feed,'work','2026-10-18'),true);
 const o={...options,at:warsawTimeMs('2026-10-20','00:40')},connections=feedConnections(feed,[],'2026-10-20',o);
 assert.equal(connections.length,1);assert.equal(connections[0].departure,warsawTimeMs('2026-10-20','01:00'));
});
test('real PKS 301 finds its complete direct course to Rzeszow D.A. without any departure-board API',()=>{
 const feed=JSON.parse(strFromU8(gunzipSync(fs.readFileSync('public/data/journeys/pks.json.gz'))));
 const from={...stop('journey:pks:566'),...feed.stops['566']},to=load('lib/pks-terminal-identity.ts').pksTerminalStop('58',feed.stops['58'],[]);
 const o={...options,maxTransfers:0,at:warsawTimeMs('2026-10-19','09:30')};
 const result=scanJourneys(from,to,feedConnections(feed,[],'2026-10-19',o),o);
 const course=result.find(j=>j.legs[0].course==='pks:7807:2026-10-19');assert.ok(course);assert.equal(course.departure,warsawTimeMs('2026-10-19','09:40'));assert.equal(course.transfers,0);assert.equal(course.legs[0].line,'301');assert.equal(course.legs[0].to.id,to.id);
});
