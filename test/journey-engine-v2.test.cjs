const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),z=require('node:zlib'),load=require('./load-ts.cjs');
const {scanJourneys}=load('lib/journey-timetable.ts');
const stop=(id,lat,lon=22)=>({id,name:id,type:'bus',lat,lon,carriers:[],lines:[],isFavorite:false});
const options={at:0,arriveBy:false,maxTransfers:1,walkMeters:100,transferMinutes:1,providers:['pks','mpk'],sort:'fastest'};
const edge=(from,to,departure,arrival,course,provider='pks')=>({from,to,departure:departure*60000,arrival:arrival*60000,course,provider,line:'108'});
const {roadDistance}=load('lib/bus-road-geometry.ts');
const path=(points)=>{const meters=Math.ceil(points.slice(1).reduce((sum,p,i)=>sum+roadDistance(points[i],p),0));return {points,meters,minutes:Math.max(1,Math.ceil(meters/70))};};
const asPoint=s=>[s.lat,s.lon];

test('a routed river crossing removes an impossible interchange and finds the next feasible bus',async()=>{
 const a=stop('a',50),b=stop('b',50.02),c=stop('c',50.0202),d=stop('d',50.04);
 const connections=[edge(a,b,10,20,'one'),edge(c,d,22,30,'fast','mpk'),edge(b,d,40,50,'safe')];
 let calls=0;
 const {refineJourneyFootpaths}=load('lib/journey-footpath-refinement.ts',{'./journey-walking':{journeyWalkingRoute:async(from,to)=>{calls++;return path([asPoint(from),[from.lat+.003,from.lon+.002],asPoint(to)]);}}});
 const scan=async input=>({journeys:scanJourneys(a,d,connections,options,()=>{},input.graph),warnings:[],limited:false});
 assert.equal((await scan({})).journeys[0].arrival,30*60000);
 const result=await refineJourneyFootpaths({from:a,to:d,options,catalog:[],date:'2026-10-20'},scan,new AbortController().signal);
 assert.equal(result.journeys[0].arrival,50*60000);assert.ok(result.journeys.every(j=>j.legs.every(l=>l.course!=='fast')));assert.ok(calls>0);
});

test('candidate discovery finds a real 89m footpath that the old inflated distance excluded',async()=>{
 const a=stop('origin',50),b=stop('platform',50.0008),d=stop('destination',50.04),connections=[edge(b,d,2,20,'bus')];
 const {refineJourneyFootpaths}=load('lib/journey-footpath-refinement.ts',{'./journey-walking':{journeyWalkingRoute:async(from,to)=>path([asPoint(from),asPoint(to)])}});
 assert.equal(scanJourneys(a,d,connections,options).length,0);
 const result=await refineJourneyFootpaths({from:a,to:d,options,catalog:[],date:'2026-10-20'},async input=>({journeys:scanJourneys(a,d,connections,options,()=>{},input.graph),warnings:[],limited:false}),new AbortController().signal);
 assert.equal(result.journeys.length,1);assert.equal(result.journeys[0].legs[0].walkingQuality,'verified');assert.ok(result.journeys[0].walking<=100);assert.ok(result.journeys[0].departure>=0);
});

test('offline walking stays explicitly estimated and cancellation cannot publish a stale refinement',async()=>{
 const a=stop('a',50),b=stop('b',50.0002),d=stop('d',50.04),connections=[edge(b,d,3,20,'bus')],input={from:a,to:d,options,catalog:[],date:'2026-10-20'};
 const scan=async request=>({journeys:scanJourneys(a,d,connections,options,()=>{},request.graph),warnings:[],limited:false});
 const offline=load('lib/journey-footpath-refinement.ts',{'./journey-walking':{journeyWalkingRoute:async()=>{throw Error('offline');}}});
 const result=await offline.refineJourneyFootpaths(input,scan,new AbortController().signal);
 assert.ok(result.journeys.length);assert.equal(result.limited,true);assert.equal(result.journeys[0].legs[0].walkingQuality,'estimated');assert.match(result.warnings.join(' '),/szacowana/);
 let entered;const ready=new Promise(resolve=>{entered=resolve;});
 const api=load('lib/journey-footpath-refinement.ts',{'./journey-walking':{journeyWalkingRoute:async()=>{entered();return new Promise(()=>{});}}});
 const controller=new AbortController(),pending=api.refineJourneyFootpaths(input,scan,controller.signal);await ready;controller.abort();await assert.rejects(pending,{name:'AbortError'});
});

test('verified pedestrian geometry is reused across searches and scoped to physical coordinates',async()=>{
 const a=stop('a',50),b=stop('b',50.0002),d=stop('d',50.04),connections=[edge(b,d,3,20,'bus')];let calls=0;
 const api=load('lib/journey-footpath-refinement.ts',{'./journey-walking':{journeyWalkingRoute:async(from,to)=>{calls++;return path([asPoint(from),asPoint(to)]);}}});
 const input={from:a,to:d,options,catalog:[],date:'2026-10-20'},scan=async request=>({journeys:scanJourneys(a,d,connections,options,()=>{},request.graph),warnings:[],limited:false});
 await api.refineJourneyFootpaths(input,scan,new AbortController().signal);await api.refineJourneyFootpaths(input,scan,new AbortController().signal);assert.equal(calls,1);
 const {journeyFootpathKey}=load('lib/journey-footpath-network.ts');assert.notEqual(journeyFootpathKey(a,b),journeyFootpathKey(a,{...b,lat:b.lat+.001}));
});

test('normalization keeps both real timetable feeds intact and excludes corrupt complete courses',()=>{
 const {normalizeJourneyFeed}=load('lib/journey-feed-validation.ts');
 for(const provider of ['pks','mpk']){
  const feed=JSON.parse(z.gunzipSync(fs.readFileSync('public/data/journeys/'+provider+'.json.gz'))),before=JSON.stringify(feed);
  const normalized=normalizeJourneyFeed(feed,provider);assert.equal(normalized.trips.length,feed.trips.length);assert.equal(JSON.stringify(feed),before);assert.deepEqual(normalized.diagnostics,[]);
 }
 const feed={version:1,provider:'pks',validFrom:'20261001',validUntil:'20261231',stops:{a:{name:'a',lat:50,lon:22},b:{name:'b',lat:50.02,lon:22}},calendars:{},exceptions:{},patterns:[[['a',0,0,0,0],['b',600,600,0,0]],[['a',0,0,0,0],['missing',300,300,0,0],['b',600,600,0,0]]],trips:[['good','1','s',0,0],['bad','1','s',0,1],['conflict','1','s',0,0],['conflict','2','s',0,0]]};
 assert.deepEqual(normalizeJourneyFeed(feed,'pks').trips.map(t=>t[0]),['good']);assert.throws(()=>normalizeJourneyFeed(feed,'mpk'),/Nieprawidłowy/);
});

test('identical opaque course IDs from different carriers never merge into a single ride',()=>{
 const a=stop('a',50),b=stop('b',50.02),d=stop('d',50.04),connections=[edge(a,b,10,20,'123','pks'),edge(b,d,22,30,'123','mpk')];
 const result=scanJourneys(a,d,connections,options)[0];assert.equal(result.transfers,1);assert.equal(result.legs.length,2);
 assert.equal(scanJourneys(a,d,connections,{...options,maxTransfers:0}).length,0);
});

test('explicit fresh cancellation, skipped calls and platform changes preserve source data',()=>{
 const {applyJourneyTripUpdates}=load('lib/journey-realtime.ts');
 const a=stop('a',50),b=stop('b',50.02),d=stop('d',50.04),now=Date.parse('2026-10-20T10:00:00Z');
 const rows=[{...edge(a,b,10,20,'pks:123:2026-10-20'),sourceFromStopId:'10',sourceToStopId:'20',fromSequence:0,toSequence:1},{...edge(b,d,22,30,'pks:123:2026-10-20'),sourceFromStopId:'20',sourceToStopId:'30',fromSequence:1,toSequence:2}];
 const update={provider:'pks',tripId:'123',serviceDate:'2026-10-20',observedAt:now};const before=JSON.stringify(rows);
 assert.equal(applyJourneyTripUpdates(rows,[{...update,status:'canceled'}],now).length,0);
 for(const patch of [{observedAt:now-121000},{serviceDate:'2026-10-21'},{provider:'mpk'},{tripId:'other'}])assert.deepEqual(applyJourneyTripUpdates(rows,[{...update,...patch,status:'canceled'}],now),rows);
 assert.deepEqual(applyJourneyTripUpdates(rows,[{...update,status:'canceled'},update],now),rows,'conflicting updates cannot silently remove a course');
 assert.equal(applyJourneyTripUpdates(rows,[{...update,status:'canceled'},{...update,status:'canceled'}],now).length,0,'identical observations are deduplicated');
 assert.equal(applyJourneyTripUpdates(rows,[update,{...update,status:'canceled',observedAt:now+1}],now).length,0,'a newer explicit observation supersedes an older one');
 const skipped=applyJourneyTripUpdates(rows,[{...update,stops:[{sequence:1,skipped:true}]}],now);assert.equal(skipped[0].dropoff,false);assert.equal(skipped[1].pickup,false);
 assert.equal(scanJourneys(a,d,skipped,options).length,1);assert.equal(scanJourneys(a,b,skipped,options).length,0);
 const platform=stop('new-platform',50.0201),assigned=applyJourneyTripUpdates(rows,[{...update,stops:[{stopId:'20',assignedStop:platform}]}],now);assert.equal(assigned[0].to.id,platform.id);assert.equal(assigned[1].from.id,platform.id);assert.equal(JSON.stringify(rows),before);
 assert.equal(applyJourneyTripUpdates(rows,[{...update,stops:[{stopId:'20',assignedStop:stop('wrong-city',52)}]}],now)[0].to.id,b.id,'a platform update cannot teleport a call to another city');
 const delayed=rows.map(c=>({...c,scheduledDeparture:c.departure,scheduledArrival:c.arrival,departure:c.departure+60000,arrival:c.arrival+60000}));
 assert.equal(applyJourneyTripUpdates(delayed,[{...update,stops:[{sequence:1,assignedStop:platform}]}],now)[0].arrival,delayed[0].arrival,'platform-only updates retain existing live delay');
});

test('an express can overtake a local service and reconnect to the same local course later',()=>{
 const a=stop('a',50),b=stop('b',50.02),c=stop('c',50.04),d=stop('d',50.06);
 const rows=[edge(a,b,10,20,'local'),edge(b,c,20,50,'local'),edge(c,d,55,65,'local'),edge(b,c,22,30,'express','mpk')];
 const result=scanJourneys(a,d,rows,{...options,maxTransfers:2,transferMinutes:1,sort:'fastest'});
 assert.equal(result[0].arrival,65*60000);assert.ok(result.some(j=>j.transfers===0));
 assert.ok(result.every(j=>j.legs.every((l,i)=>!i||l.departure>=j.legs[i-1].arrival)));
});

test('network preparation rejects malformed edges without rewriting or reordering its input',()=>{
 const {prepareJourneyNetwork}=load('lib/journey-network.ts');
 const a=stop('a',50),b=stop('b',50.02),valid=edge(a,b,10,20,'valid'),rows=[{...valid,arrival:NaN},{...valid,course:'negative',arrival:valid.departure-1},valid,{...valid}];
 const network=prepareJourneyNetwork(rows);assert.equal(network.rejected,2);assert.equal(network.connections.length,1);assert.equal(rows[2],valid);assert.equal(prepareJourneyNetwork(rows),network);
});

test('comfort breaks equal-arrival ties without replacing a faster journey',()=>{
 const {rankJourneyAlternatives}=load('lib/journey-ranking.ts');
 const a=stop('a',50),b=stop('b',50.02),d=stop('d',50.04);
 const make=(id,firstArrival,lastDeparture,lastArrival)=>({id,departure:0,arrival:lastArrival*60000,walking:0,transfers:1,legs:[edge(a,b,0,firstArrival,id+'first'),edge(b,d,lastDeparture,lastArrival,id+'last')]});
 const tight=make('tight',20,25,40),comfortable=make('comfortable',10,30,40),fast=make('fast',20,25,35);
 const result=rankJourneyAlternatives([tight,comfortable,fast],a,d,options);
 assert.equal(result[0].id,'fast');assert.ok(result.findIndex(j=>j.id==='comfortable')<result.findIndex(j=>j.id==='tight'));assert.equal(result.find(j=>j.id==='comfortable').legs[1].transferSlackSeconds,1200);
});

test('worker refinement messages retain the same timetable snapshot and only replace its graph',async()=>{
 const previous=global.self,calls=[];
 global.self={postMessage:()=>{}};
 try{
  load('lib/journey.worker.ts',{'./journey-schedules':{executeTimetableSearch:async(input)=>{calls.push(input);return {journeys:[],warnings:[],limited:false};}}});
  const input={feedData:{pks:{marker:'snapshot'}},catalog:[],options},firstGraph={footpaths:[]},nextGraph={footpaths:[{key:'verified'}]};
  await global.self.onmessage({data:{input:{...input,graph:firstGraph}}});await global.self.onmessage({data:{graph:nextGraph}});
  assert.equal(calls.length,2);assert.equal(calls[0].feedData,calls[1].feedData);assert.equal(calls[1].graph,nextGraph);assert.equal(calls[0].graph,firstGraph);
 }finally{if(previous===undefined)delete global.self;else global.self=previous;}
});
