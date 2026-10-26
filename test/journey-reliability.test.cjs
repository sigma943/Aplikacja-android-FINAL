const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {scanJourneys}=load('lib/journey-timetable.ts'),{stopDistance}=load('lib/journey-planner.ts');
const carriers=['pks','mpk','marcel'];
const stop=(id,lat)=>({id,name:id,type:'bus',lat,lon:22,carriers:[],lines:[],isFavorite:false});
const base={at:0,arriveBy:false,maxTransfers:2,walkMeters:100,transferMinutes:5,providers:carriers,sort:'fastest'};
const connection=(from,to,dep,arr,provider,course)=>({from,to,departure:dep*60000,arrival:arr*60000,provider,course:provider+':'+course,line:'108'});

// Independent exhaustive oracle: enumerate boardings and each possible alighting,
// then recurse to another whole course. No chronological scan or label dominance.
// Walking is limited per uninterrupted access/transfer/egress, as in the public contract.
function enumerate(from,to,connections,o,graph){
 const earliest=o.arriveBy?o.at-21600000:o.at,latest=o.arriveBy?o.at:o.at+21600000;
 const courses=[...Map.groupBy(connections.filter(c=>o.providers.includes(c.provider)),c=>c.course).values()].map(c=>c.sort((a,b)=>a.departure-b.departure||a.arrival-b.arrival));
 const answers=[];
 const walk=(a,b)=>{if(a.id===b.id)return {meters:0,ms:0};const known=graph?.footpaths.find(p=>p.key===JSON.stringify([a.id,a.lat,a.lon,b.id,b.lat,b.lon]));const meters=known?.meters??Math.ceil(stopDistance(a,b)*1.35);return {meters,ms:(known?.minutes??Math.max(1,Math.ceil(meters/70)))*60000};};
 function visit(current,time,rides,walking,departure){
  const end=walk(current,to),arrival=time+end.ms;
  if(end.meters<=o.walkMeters&&arrival<=latest){
   const duration=arrival-earliest;
   answers.push({arrival:o.arriveBy&&!rides?latest:arrival,departure:rides?departure:o.arriveBy?latest-duration:earliest,walking:walking+end.meters,transfers:Math.max(0,rides-1)});
  }
  if(rides>=o.maxTransfers+1||current.id===to.id)return;
  for(const course of courses)for(let first=0;first<course.length;first++){
   const boarding=course[first],access=walk(current,boarding.from);
   if(boarding.pickup===false||access.meters>o.walkMeters||boarding.departure<time+access.ms+(rides?o.transferMinutes*60000:0)||boarding.departure<earliest)continue;
   let previous;
   for(let last=first;last<course.length;last++){
    const c=course[last];if(previous&&(previous.to.id!==c.from.id||c.departure<previous.arrival))break;previous=c;
    if(c.arrival>latest)break;if(c.dropoff===false)continue;
    visit(c.to,c.arrival,rides+1,walking+access.meters,rides?departure:boarding.departure-access.ms);
   }
  }
 }
 visit(from,earliest,0,0,earliest);return answers;
}
const score=(j,o)=>[o.sort==='walking'?j.walking:o.sort==='transfers'?j.transfers:0,o.arriveBy?-j.departure:j.arrival];
const cmp=(a,b)=>a[0]-b[0]||a[1]-b[1];

test('all six ordered carrier pairs respect exact interchange margins and provider exclusions',()=>{
 const a=stop('a',50),b=stop('b',50.02),c=stop('c',50.04);
 for(const first of carriers)for(const second of carriers){if(first===second)continue;
  const legs=[connection(a,b,10,20,first,'one'),connection(b,c,25,35,second,'two')];
  const result=scanJourneys(a,c,legs,base);assert.equal(result[0].transfers,1,first+' -> '+second);assert.deepEqual(result[0].legs.map(l=>l.provider),[first,second]);
  assert.equal(scanJourneys(a,c,legs,{...base,maxTransfers:0}).length,0);
  assert.equal(scanJourneys(a,c,legs,{...base,providers:[first]}).length,0);
  assert.equal(scanJourneys(a,c,[legs[0],{...legs[1],departure:legs[1].departure-1}],base).length,0,'one second too little interchange time');
  const arrival=scanJourneys(a,c,legs,{...base,arriveBy:true,at:35*60000});assert.equal(arrival[0].departure,10*60000);
 }
});
test('all six orders of PKS, MPK and Marcel work with two transfers, never one',()=>{
 const stops=[0,1,2,3].map(i=>stop('s'+i,50+i*.02));
 for(const a of carriers)for(const b of carriers)for(const c of carriers){if(new Set([a,b,c]).size!==3)continue;
  const legs=[connection(stops[0],stops[1],10,20,a,'same-id'),connection(stops[1],stops[2],25,35,b,'same-id'),connection(stops[2],stops[3],40,50,c,'same-id')];
  const result=scanJourneys(stops[0],stops[3],legs,base);assert.equal(result[0].transfers,2);assert.deepEqual(result[0].legs.map(l=>l.provider),[a,b,c]);
  assert.equal(scanJourneys(stops[0],stops[3],legs,{...base,maxTransfers:1}).length,0);
 }
});
test('720 deterministic mixed-provider searches agree with an exhaustive independent oracle',t=>{
 let searches=0,reachable=0,mixed=0;
 for(let seed=1;seed<=120;seed++){
  let state=seed;const rand=n=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%n;};
  const stops=Array.from({length:8},(_,i)=>stop('s'+i,50+Math.floor(i/2)*.02+(i%2)*.0002)),legs=[];
  for(let trip=0;trip<10;trip++){
   const provider=carriers[rand(3)];let time=5+rand(85),current=rand(8);
   for(let segment=0;segment<1+trip%3;segment++){
    const next=(current+1+rand(7))%8,arrival=time+rand(13);
    legs.push({...connection(stops[current],stops[next],time,arrival,provider,'trip'+trip),pickup:rand(10)!==0,dropoff:rand(10)!==0});current=next;time=arrival+rand(4);
   }
  }
  // Interchange on opposite sides of the road across all three providers.
  legs.push(connection(stops[0],stops[2],10,20,'pks','guaranteed'),connection(stops[3],stops[4],30,40,'mpk','guaranteed'),connection(stops[5],stops[6],50,60,'marcel','guaranteed'));
  const from=stops[seed%2],to=stops[6+(seed>>1)%2];
  for(const arriveBy of [false,true]){
   const options={...base,arriveBy,at:(arriveBy?110+seed%20:seed%15)*60000,maxTransfers:seed%3,walkMeters:[0,80,150][seed%3],transferMinutes:[0,3,5,10][seed%4],providers:seed%4===0?['pks','mpk']:carriers};
   const oracle=enumerate(from,to,legs,options);
   for(const sort of ['fastest','transfers','walking']){
    const o={...options,sort},actual=scanJourneys(from,to,legs,o),expected=oracle.slice().sort((a,b)=>cmp(score(a,o),score(b,o)))[0];searches++;
    assert.equal(actual.length>0,Boolean(expected),JSON.stringify({seed,arriveBy,sort,reason:'reachability'}));
    if(expected){reachable++;if(new Set(actual[0].legs.filter(l=>l.walking===undefined).map(l=>l.provider)).size>1)mixed++;}
    if(expected)assert.deepEqual(score(actual[0],o),score(expected,o),JSON.stringify({seed,arriveBy,sort,actual:actual[0],expected}));
    for(const j of actual){for(const l of j.legs.filter(l=>l.walking!==undefined))assert.ok(l.walking<=o.walkMeters);assert.ok(j.transfers<=o.maxTransfers);assert.ok(j.legs.filter(l=>l.walking===undefined).every(l=>o.providers.includes(l.provider)));}
   }
  }
 }
 assert.equal(searches,720);assert.ok(reachable>100);assert.ok(mixed>0);t.diagnostic(`${searches} searches; ${reachable} reachable variants; ${mixed} optimal mixed-provider variants`);
});
test('real PKS and MPK schedules plus the recorded Marcel course support mixed-carrier journeys',()=>{
 const fs=require('node:fs'),z=require('node:zlib'),{feedConnections}=load('lib/journey-timetable.ts'),{warsawTimeMs}=load('lib/transit-time.ts');
 const feeds=Object.fromEntries(['pks','mpk'].map(p=>[p,JSON.parse(z.gunzipSync(fs.readFileSync('public/data/journeys/'+p+'.json.gz')))]));
 const dated='2026-10-20',point=(p,id)=>({...feeds[p].stops[id],id:'journey:'+p+':'+id,type:'bus',lines:[],carriers:[],isFavorite:false});
 const recorded=require('./fixtures/marcel-jaslo-rzeszow-1181798.json').course.map((s,i)=>({stop:{id:'marcel:'+i,name:s.nazMi+' '+s.nazPr,type:'bus',lat:s.szGps,lon:s.dlGps,carriers:[],lines:[],isFavorite:false},time:warsawTimeMs(dated,s.godz)}));
 const marcel=recorded.slice(1).map((b,i)=>({from:recorded[i].stop,to:b.stop,departure:recorded[i].time,arrival:b.time,course:'marcel:1181798:'+dated,provider:'marcel',line:'M'}));
 const cases=[
  ['PKS → MPK',point('pks','566'),point('mpk','256'),'09:30',['pks','mpk'],300],
  ['MPK → PKS',point('mpk','159'),point('pks','566'),'09:30',['mpk','pks'],300],
  ['Marcel → MPK',recorded[0].stop,point('mpk','158'),'04:20',['marcel','mpk'],300],
  ['Marcel → PKS',recorded[0].stop,point('pks','566'),'04:20',['marcel','pks'],800],
 ];
 for(const [name,from,to,time,providers,walkMeters] of cases){
  const o={...base,at:warsawTimeMs(dated,time),providers,walkMeters},connections=[...feedConnections(feeds.pks,[],dated,o),...feedConnections(feeds.mpk,[],dated,o),...marcel];
  const result=scanJourneys(from,to,connections,o),mixed=result.find(j=>providers.every(p=>j.legs.some(l=>l.provider===p)));
  assert.ok(mixed,name+' must have a real mixed-provider itinerary');
  for(const j of result){for(const l of j.legs.filter(l=>l.walking!==undefined))assert.ok(l.walking<=walkMeters);for(let i=1;i<j.legs.length;i++)assert.ok(j.legs[i].departure>=j.legs[i-1].arrival);}
  const arrivalOptions={...o,arriveBy:true,at:mixed.arrival},arrivalConnections=[...feedConnections(feeds.pks,[],dated,arrivalOptions),...feedConnections(feeds.mpk,[],dated,arrivalOptions),...marcel];
  const reverse=scanJourneys(from,to,arrivalConnections,arrivalOptions);assert.ok(reverse[0].arrival<=mixed.arrival);assert.ok(reverse[0].departure>=mixed.departure,name+' arrive-by must retain an equally good or later departure');
 }
});
test('zero-duration stops do not depend on the order in which carrier timetables finish loading',()=>{
 const a=stop('a',50),b=stop('b',50.02),c=stop('c',50.04),o={...base,transferMinutes:0,walkMeters:0};
 const legs=[connection(b,c,10,10,'mpk','second'),connection(a,b,10,10,'pks','first')];
 assert.equal(enumerate(a,c,legs,o).length>0,true);
 const result=scanJourneys(a,c,legs,o);assert.equal(result.length>0,true);assert.equal(result[0].arrival,10*60000);assert.equal(result[0].transfers,1);
});

test('a zero-time no-dropoff stop keeps the actual onboard passenger and the latest departure',()=>{
 const a=stop('a',50),b=stop('b',50.02),c=stop('c',50.04),d=stop('d',50.06);
 const legs=[connection(a,b,10,20,'mpk','early'),{...connection(a,b,76,78,'pks','late'),dropoff:false},connection(b,c,81,81,'pks','late'),connection(c,d,83,94,'pks','late')];
 const result=scanJourneys(a,d,legs,{...base,arriveBy:true,at:122*60000,transferMinutes:0,walkMeters:0,sort:'walking'});
 assert.equal(result[0].departure,76*60000);assert.equal(result[0].legs.length,1);assert.equal(result[0].transfers,0);
});
test('instantaneous cycles terminate without losing a reachable transfer',()=>{
 const a=stop('a',50),b=stop('b',50.02),c=stop('c',50.04),o={...base,transferMinutes:0,walkMeters:0};
 const legs=[connection(b,c,10,10,'mpk','second'),connection(a,b,10,10,'pks','loop'),connection(b,a,10,10,'pks','loop')];
 const result=scanJourneys(a,c,legs,o);assert.ok(result.length>0);assert.equal(result[0].arrival,10*60000);
});

test('180 searches with routed footpath costs agree with exhaustive whole-course enumeration',()=>{
 for(let seed=1;seed<=30;seed++){
  const points=[stop('a',50),stop('b',50.0002),stop('c',50.02),stop('d',50.0202),stop('e',50.04)];
  const legs=[connection(points[0],points[2],10,20,'pks','one'),connection(points[1],points[3],12,23,'mpk','two'),connection(points[2],points[4],30,50,'marcel','three'),connection(points[3],points[4],25,40,'mpk','four')];
  const footpaths=points.flatMap((a,i)=>points.filter(b=>a.id!==b.id).map(b=>{const meters=Math.ceil(stopDistance(a,b))+(seed*(i+1)%4)*30;return {key:JSON.stringify([a.id,a.lat,a.lon,b.id,b.lat,b.lon]),meters,minutes:Math.max(1,Math.ceil(meters/70)),points:[[a.lat,a.lon],[b.lat,b.lon]],checkedAt:0};}));
  const graph={footpaths};
  for(const arriveBy of [false,true])for(const sort of ['fastest','walking','transfers']){
   const o={...base,arriveBy,sort,at:(arriveBy?70:0)*60000,walkMeters:100,transferMinutes:seed%4,maxTransfers:1};
   const expected=enumerate(points[0],points[4],legs,o,graph).sort((a,b)=>cmp(score(a,o),score(b,o)))[0],actual=scanJourneys(points[0],points[4],legs,o,()=>{},graph)[0];
   assert.equal(Boolean(actual),Boolean(expected));if(expected)assert.deepEqual(score(actual,o),score(expected,o),JSON.stringify({seed,arriveBy,sort}));
  }
 }
});
