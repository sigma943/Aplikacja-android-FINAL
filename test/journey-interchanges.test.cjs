const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {scanJourneys}=load('lib/journey-timetable.ts'),{tightenJourneyInterchanges}=load('lib/journey-interchanges.ts');
const stop=(id,name,lat)=>({id,name,lat,lon:21.904,type:'bus',carriers:[],lines:[],isFavorite:false});
// Faithful reverse-corridor fixture, not a claimed live Marcel timetable.
const start=stop('start','Gwoźnica',49.84),niebylec=stop('n','Niebylec',49.856),polomia=stop('p','Połomia',49.90),end=stop('end','Domaradz',49.78);
const o={at:0,arriveBy:false,maxTransfers:1,walkMeters:500,transferMinutes:5,providers:['pks','marcel'],sort:'fastest'};
const edge=(a,b,d,e,course,extra={})=>({from:a,to:b,departure:d*60000,arrival:e*60000,course,line:course,provider:course==='pks'?'pks':'marcel',...extra});
function connections(near=niebylec,flags={}){return [edge(start,niebylec,10,20,'pks'),edge(niebylec,polomia,20,30,'pks'),edge(polomia,near,40,50,'marcel'),edge(near,end,50,70,'marcel',{pickup:flags.pickup})];}
function detour(near=niebylec){const calls=(stops,times)=>stops.map((stop,i)=>({stop,arrival:times[i]*60000,departure:times[i]*60000}));return {id:'old',departure:600000,arrival:4200000,walking:0,transfers:1,legs:[{from:start,to:polomia,departure:600000,arrival:1800000,provider:'pks',course:'pks',line:'108',path:[[49,21],[50,21]],stops:calls([start,niebylec,polomia],[10,20,30])},{from:polomia,to:end,departure:2400000,arrival:4200000,provider:'marcel',course:'marcel',line:'M',stops:calls([polomia,near,end],[40,50,70])}]};}
test('uses Niebylec rather than riding north to Polomia and returning on the same Marcel course',()=>{
 const results=scanJourneys(start,end,connections(),o);assert.ok(results.length);assert.ok(results.every(j=>j.legs.filter(l=>l.walking===undefined)[0].to.id==='n'));
 const j=results[0];assert.equal(j.legs[1].from.id,'n');assert.equal(j.legs[0].arrival,20*60000);assert.equal(j.legs[1].departure,50*60000);assert.equal(j.arrival,70*60000);assert.equal(j.transfers,1);assert.equal(j.walking,0);
});
test('a short, budgeted transfer walk can replace the out-and-back with identical arrival',()=>{
 const near={...niebylec,id:'marcel:n',lat:niebylec.lat+.0004};
 const j=tightenJourneyInterchanges(detour(near),o);assert.equal(j.legs.length,3);assert.equal(j.legs[0].to.id,'n');assert.equal(j.legs[2].from.id,'marcel:n');assert.ok(j.legs[1].walking>0&&j.legs[1].walking<100);assert.equal(j.legs[0].path,undefined,'old detour geometry is invalidated');
 assert.equal(tightenJourneyInterchanges(detour(near),{...o,walkMeters:0}).id,'old');
 assert.equal(tightenJourneyInterchanges(detour(near),{...o,walkMeters:30}).id,'old');
 assert.equal(tightenJourneyInterchanges(detour(near),{...o,sort:'walking'}).id,'old','explicit least-walking preference is respected');
});
test('does not invent boarding or alighting permission or a feasible transfer time',()=>{
 for(const flag of ['pickup','dropoff']){
  const j=detour();j.legs[flag==='dropoff'?0:1].stops[1][flag]=false;assert.equal(tightenJourneyInterchanges(j,o),j);
 }
 const j=detour();j.legs[1].stops[1].departure=22*60000;assert.equal(tightenJourneyInterchanges(j,o),j);
 const noPickup=connections(niebylec,{pickup:false});assert.equal(scanJourneys(start,end,noPickup,o)[0].legs[0].to.id,'p');
 const noAlight=connections();noAlight[0].dropoff=false;assert.equal(scanJourneys(start,end,noAlight,o)[0].legs[0].to.id,'p');
});
test('keeps source objects, IDs, calls, live times and schedules intact',()=>{
 const j=detour();j.legs[0].stops[1].scheduledArrival=19*60000;j.legs[1].stops[1].scheduledDeparture=48*60000;j.legs[1].delaySeconds=120;const before=JSON.stringify(j);
 const fixed=tightenJourneyInterchanges(j,o);assert.equal(JSON.stringify(j),before);assert.equal(fixed.legs[0].to,niebylec);assert.equal(fixed.legs[1].from,niebylec);assert.equal(fixed.legs[0].scheduledArrival,19*60000);assert.equal(fixed.legs[1].scheduledDeparture,48*60000);assert.equal(fixed.legs[1].delaySeconds,120);
 assert.equal(tightenJourneyInterchanges(fixed,o),fixed,'normalization is idempotent');
});

test('the real PKS Gwoznica-Niebylec-Polomia course can interchange before the reverse corridor',()=>{
 const fs=require('node:fs'),z=require('node:zlib'),{feedConnections}=load('lib/journey-timetable.ts'),{warsawTimeMs}=load('lib/transit-time.ts');
 const feed=JSON.parse(z.gunzipSync(fs.readFileSync('public/data/journeys/pks.json.gz'))),day='2026-10-20',options={...o,day,at:warsawTimeMs(day,'14:00')};
 const actual=feedConnections(feed,[],day,options).filter(c=>c.course==='pks:5840:2026-10-20');
 const first=actual.findIndex(c=>c.from.id==='journey:pks:10'),last=actual.findIndex(c=>c.to.id==='journey:pks:28');const inbound=actual.slice(first,last+1);
 assert.ok(first>=0&&last>first);const n=inbound.find(c=>c.to.id==='journey:pks:22').to,p=inbound.at(-1).to;
 const marcelN={...n,id:'marcel:separate-niebylec',carriers:[{id:'marcel'}]},destination={...end,id:'domaradz-test'};
 // Controlled Marcel continuation: its times are a regression fixture, not a live schedule.
 const at=s=>warsawTimeMs(day,s);const extra=[{from:p,to:marcelN,departure:at('15:05'),arrival:at('15:15'),course:'marcel:fixture',line:'M',provider:'marcel'},{from:marcelN,to:destination,departure:at('15:15'),arrival:at('15:45'),course:'marcel:fixture',line:'M',provider:'marcel'}];
 const result=scanJourneys(inbound[0].from,destination,[...inbound,...extra],options);
 assert.ok(result.length);for(const j of result){assert.equal(j.legs.find(l=>l.provider==='pks').to.id,n.id);assert.equal(j.legs.find(l=>l.provider==='marcel').from.id,marcelN.id);assert.equal(j.arrival,at('15:45'));}
});
