const {test}=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),load=require('./load-ts.cjs');
const {scanJourneys}=load('lib/journey-timetable.ts');
const stop=(id,lat)=>({id,name:id,type:'bus',lat,lon:22,carriers:[],lines:[],isFavorite:false});
const options={at:0,arriveBy:false,maxTransfers:2,walkMeters:0,transferMinutes:5,providers:['marcel','pks','mpk'],sort:'fastest'};
const connection=(a,b,departure,arrival,course,provider)=>({from:a,to:b,departure:departure*60000,arrival:arrival*60000,course,line:course,provider});
test('unlimited transfers reaches a five-ride cross-provider journey, finite limits still apply',()=>{
 const stops=Array.from({length:6},(_,i)=>stop('p'+i,49+i*.1));
 const connections=stops.slice(1).map((s,i)=>connection(stops[i],s,i*35+5,i*35+25,'course:'+i,['marcel','pks','mpk'][i%3]));
 assert.equal(scanJourneys(stops[0],stops[5],connections,options).length,0);
 const result=scanJourneys(stops[0],stops[5],connections,{...options,maxTransfers:-1});
 assert.equal(result[0].transfers,4);assert.equal(result[0].legs.length,5);
});
test('unrestricted interchange allows a long wait, zero buffer still requires physical walking time',()=>{
 const a=stop('a',49),b=stop('b',49.1),near=stop('near',49.1005),c=stop('c',49.2);
 const connections=[connection(a,b,5,15,'m','marcel'),connection(near,c,15,25,'too-soon','pks'),connection(near,c,180,190,'later','pks')];
 const result=scanJourneys(a,c,connections,{...options,walkMeters:100,transferMinutes:0});
 assert.ok(result.length);assert.ok(result.every(j=>j.legs.at(-1).course==='later'));assert.ok(result[0].legs.some(l=>l.walking>0));
});
test('zero-time cycles terminate with unlimited transfers and no buffer',()=>{
 const a=stop('a',49),b=stop('b',49.1),c=stop('c',49.2);
 const connections=[connection(a,b,5,5,'m','marcel'),connection(b,a,5,5,'back','pks'),connection(b,c,5,10,'end','pks')];
 const result=scanJourneys(a,c,connections,{...options,maxTransfers:-1,transferMinutes:0});
 assert.equal(result[0].arrival,10*60000);assert.ok(result.length<5);
});
test('full local network with two or unlimited transfers and 2km walks finishes with progress instead of timing out',()=>{
 const child=spawnSync(process.execPath,['test/journey-complex-benchmark.cjs'],{cwd:process.cwd(),encoding:'utf8',timeout:45000,maxBuffer:1024*1024});
 assert.equal(child.error,undefined,String(child.error));assert.equal(child.status,0,child.stderr);console.log(child.stdout.trim());
});

test('transfer preference is a maximum and preserves direct and one-transfer alternatives',()=>{
 const a=stop('a',49),b=stop('b',49.1),c=stop('c',49.2);
 const connections=[connection(a,c,10,90,'direct','pks'),connection(a,b,20,40,'first','marcel'),connection(b,c,45,80,'second','pks')];
 const result=scanJourneys(a,c,connections,{...options,maxTransfers:2});
 assert.deepEqual(new Set(result.map(j=>j.transfers)),new Set([0,1]));
});
test('walking preference has a small bounded tolerance and zero disables it',()=>{
 const {journeyWalkingBudget:budget}=load('lib/journey-planner.ts');
 for(const [requested,allowed] of [[0,0],[50,70],[200,220],[500,550],[2000,2050]])assert.equal(budget(requested),allowed);
});
