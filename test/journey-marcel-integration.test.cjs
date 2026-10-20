const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs'),fs=require('node:fs'),z=require('node:zlib');
const {scanJourneys,feedConnections}=load('lib/journey-timetable.ts'),{warsawTimeMs}=load('lib/transit-time.ts'),{marcelCourseStopIndexKey}=load('components/stops-panel/stop-domain.ts');
const date='2026-10-20',rows=require('./fixtures/marcel-jaslo-rzeszow-1181798.json').course;
const catalog=rows.map((p,i)=>({id:'marcel-point:'+i,name:p.nazMi+' '+p.nazPr,type:'bus',lat:p.szGps,lon:p.dlGps,carriers:[{id:'marcel'}],sourceProviderIds:['marcel'],providerStopIds:{marcelRouteIds:'JASLO-RZ',marcelCityMatchKeys:marcelCourseStopIndexKey(p)},isFavorite:false,lines:['M']}));
const options={at:warsawTimeMs(date,'04:20'),arriveBy:false,maxTransfers:1,walkMeters:300,transferMinutes:5,providers:['marcel','mpk'],sort:'fastest'};
const mpk=JSON.parse(z.gunzipSync(fs.readFileSync('public/data/journeys/mpk.json.gz'))),to={...mpk.stops['158'],id:'journey:mpk:158',type:'bus',lines:[],carriers:[],isFavorite:false};
function create(api,run){return load('lib/journey-loader.ts',{'./pks-client':{fetchVehiclesClient:async()=>[],...api},'./journey-worker-client':{runTimetableSearch:run}}).searchConnections;}
test('Marcel API adapter joins the recorded real course to MPK, with one fetch per course',async()=>{
 let courseCalls=0,segments=0;
 const search=create({fetchMarcelCoursesClient:async(id,d)=>{assert.equal(id,'JASLO-RZ');assert.equal(d,date);return [{idKu:'1181798',godz:'04:30'},{idKu:'1181798',godz:'04:30'}];},fetchMarcelPublicCourseStopsClient:async id=>{assert.equal(id,'1181798');courseCalls++;return rows;}},async input=>{
  segments=input.extra.length;const con=[...feedConnections(mpk,input.catalog,date,input.options),...input.extra];return {journeys:scanJourneys(input.from,input.to,con,input.options),warnings:input.warnings,limited:false};
 });
 const result=await search(catalog[0],to,catalog,date,options,new AbortController().signal,()=>{});
 assert.equal(courseCalls,1);assert.equal(segments,rows.length-1);assert.ok(result.journeys.some(j=>j.legs.some(l=>l.provider==='marcel')&&j.legs.some(l=>l.provider==='mpk')));assert.deepEqual(result.warnings,[]);
});
test('Marcel service failure preserves other providers and reports missing online data',async()=>{
 const fallback={id:'mpk-fallback',legs:[{provider:'mpk',line:'1',course:'mpk:1',from:to,to:{...to,id:'other'},departure:options.at,arrival:options.at+600000}],departure:options.at,arrival:options.at+600000,walking:0,transfers:0};const search=create({fetchMarcelCoursesClient:async()=>{throw Error('Unavailable');}},async input=>({journeys:[fallback],warnings:input.warnings,limited:false}));
 const result=await search(catalog[0],to,catalog,date,options,new AbortController().signal,()=>{});assert.equal(result.journeys[0].id,'mpk-fallback');assert.match(result.warnings.join(' '),/Marcel.*niedostępny/);
});
test('missing Marcel stop index produces an explicit warning',async()=>{
 const search=create({},async input=>({journeys:[],warnings:input.warnings,limited:false}));
 const result=await search({...to,id:'a'},to,[],date,options,new AbortController().signal,()=>{});assert.match(result.warnings.join(' '),/lista przystanków jest niedostępna/);
});
test('excluding Marcel makes no online Marcel requests',async()=>{
 const search=create({fetchMarcelCoursesClient:async()=>{throw Error('Should not run');}},async input=>({journeys:[],warnings:input.warnings,limited:false}));
 const result=await search(catalog[0],to,catalog,date,{...options,providers:['mpk']},new AbortController().signal,()=>{});assert.deepEqual(result.warnings,[]);
});
test('Marcel consecutive stops in the same minute remain connected',async()=>{
 const stops=[{...rows[0],godz:'04:30',szGps:50,dlGps:22},{...rows[1],godz:'04:30',szGps:50.02,dlGps:22},{...rows[2],godz:'04:45',szGps:50.04,dlGps:22}];
 const known=stops.map((p,i)=>({...catalog[i],lat:p.szGps,lon:p.dlGps,providerStopIds:{marcelRouteIds:'JASLO-RZ',marcelCityMatchKeys:marcelCourseStopIndexKey(p)}}));
 const search=create({fetchMarcelCoursesClient:async()=>[{idKu:'1',godz:'04:30'}],fetchMarcelPublicCourseStopsClient:async()=>stops},async input=>({journeys:scanJourneys(input.from,input.to,input.extra,input.options),warnings:[],limited:false}));
 const result=await search(known[0],known[2],known,date,{...options,providers:['marcel'],maxTransfers:0},new AbortController().signal,()=>{});assert.equal(result.journeys[0].arrival,warsawTimeMs(date,'04:45'));assert.equal(result.journeys[0].transfers,0);
});
test('cancelling a Marcel request releases the caller and never starts the timetable worker',async()=>{
 let entered;const started=new Promise(resolve=>{entered=resolve;});let workerStarted=false;
 const search=create({fetchMarcelCoursesClient:async()=>{entered();return new Promise(()=>{});}},async()=>{workerStarted=true;throw Error('Should not run');});
 const controller=new AbortController(),pending=search(catalog[0],to,catalog,date,options,controller.signal,()=>{});await started;controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(workerStarted,false);
});

test('one failed Marcel course preserves completed courses and still connects to PKS',async()=>{
 const feed=JSON.parse(z.gunzipSync(fs.readFileSync('public/data/journeys/pks.json.gz')));
 const target={...feed.stops['20'],id:'journey:pks:20',type:'bus',lines:[],carriers:[{id:'pks'}],isFavorite:false};
 const search=create({fetchMarcelCoursesClient:async()=>[{idKu:'1181798',godz:'04:30'},{idKu:'broken',godz:'04:35'}],fetchMarcelPublicCourseStopsClient:async id=>{if(id==='broken')throw Error('one course unavailable');return rows;}},async input=>({journeys:scanJourneys(input.from,input.to,[...feedConnections(feed,input.catalog,date,input.options),...input.extra],input.options),warnings:input.warnings,limited:false}));
 const result=await search(catalog[0],target,catalog,date,{...options,providers:['marcel','pks'],walkMeters:500},new AbortController().signal,()=>{});
 assert.ok(result.journeys.some(j=>j.legs.some(l=>l.provider==='marcel')&&j.legs.some(l=>l.provider==='pks')),'recorded Marcel calls connect to the real PKS timetable');
 assert.match(result.warnings.join(' '),/część kursów/);
});

test('failed Marcel route does not erase a different route, and unlimited mode loads intermediate routes',async()=>{
 const isolated={...catalog[0],id:'isolated',lat:49.1,lon:21.1,providerStopIds:{marcelRouteIds:'broken'}};
 const remote={...catalog[1],id:'remote',lat:49.2,lon:21.2,providerStopIds:{...catalog[1].providerStopIds,marcelRouteIds:'remote'}};
 const requested=[];
 const search=create({fetchMarcelCoursesClient:async id=>{requested.push(id);if(id==='broken')throw Error('route unavailable');return [{idKu:'1181798',godz:'04:30'}];},fetchMarcelPublicCourseStopsClient:async()=>rows},async input=>{assert.equal(input.extra.length,rows.length-1);return {journeys:[],warnings:input.warnings,limited:false};});
 const result=await search(isolated,{...isolated,id:'end'},[isolated,remote],date,{...options,maxTransfers:-1},new AbortController().signal,()=>{});
 assert.deepEqual(new Set(requested),new Set(['broken','remote']));assert.match(result.warnings.join(' '),/część kursów/);
});

test('local PKS results are published while Marcel is still pending and enriched afterwards',async()=>{
 let release,partialReady;const waiting=new Promise(r=>{release=r}),published=new Promise(r=>{partialReady=r});let scans=0;
 const local={id:'local',departure:options.at+600000,arrival:options.at+1200000,walking:0,transfers:0,legs:[{from:catalog[0],to,line:'108',provider:'pks',course:'pks:direct',departure:options.at+600000,arrival:options.at+1200000}]};
 const search=create({fetchMarcelCoursesClient:async()=>{await waiting;return [{idKu:'1181798',godz:'04:30'}];},fetchMarcelPublicCourseStopsClient:async()=>rows},async input=>{scans++;if(scans===1)assert.equal(input.extra.length,0);else assert.equal(input.extra.length,rows.length-1);return {journeys:[local],warnings:[],limited:false};});
 const pending=search(catalog[0],to,catalog,date,{...options,providers:['pks','marcel']},new AbortController().signal,()=>{},result=>{assert.equal(result.journeys[0],local);partialReady();});
 await published;assert.equal(scans,1,'PKS was available before the online request completed');release();const result=await pending;assert.equal(scans,2);assert.equal(result.journeys[0].id,'local');
});

test('cancelling after local results never publishes a stale enrichment',async()=>{
 let published;const ready=new Promise(r=>{published=r});let scans=0;
 const search=create({fetchMarcelCoursesClient:async()=>new Promise(()=>{})},async()=>{scans++;return {journeys:[{id:'local',legs:[{provider:'pks'}]}],warnings:[],limited:false};});
 const controller=new AbortController();const pending=search(catalog[0],to,catalog,date,options,controller.signal,()=>{},()=>published());await ready;controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(scans,1);
});

test('a hanging unrelated Marcel route cannot block completed courses before the deadline',async()=>{
 const {withRequestDeadline}=load('lib/request-deadline.ts');
 const search=load('lib/journey-loader.ts',{
  './request-deadline':{withRequestDeadline:(run,signal,timeout)=>withRequestDeadline(run,signal,timeout===25000?100:timeout)},
  './pks-client':{fetchVehiclesClient:async()=>[],fetchMarcelCoursesClient:async id=>id==='hanging'?new Promise(()=>{}):[{idKu:'1181798',godz:'04:30'}],fetchMarcelPublicCourseStopsClient:async()=>rows},
  './journey-worker-client':{runTimetableSearch:async input=>{assert.equal(input.extra.length,rows.length-1);return {journeys:[],warnings:input.warnings,limited:false};}}
 }).searchConnections;
 const known=[...catalog,{...catalog[0],id:'hang',providerStopIds:{marcelRouteIds:'hanging'}}];
 const result=await search(catalog[0],to,known,date,{...options,maxTransfers:2},new AbortController().signal,()=>{});
 assert.match(result.warnings.join(' '),/przekroczyło limit czasu/);
});

test('Marcel keeps the complete source pattern through catalog aliases and worker reconstruction',async()=>{
 const aliases=catalog.map(s=>({...s,lat:Number(s.lat)+.00008,lon:Number(s.lon)-.00006}));
 const search=create({fetchMarcelCoursesClient:async()=>[{idKu:'1181798',godz:'04:30'}],fetchMarcelPublicCourseStopsClient:async()=>rows},async input=>({journeys:scanJourneys(input.from,input.to,input.extra,input.options),warnings:[],limited:false}));
 const result=await search(aliases[0],aliases[26],aliases,date,{...options,providers:['marcel'],maxTransfers:0,walkMeters:0},new AbortController().signal,()=>{});
 assert.ok(result.journeys.length);const leg=result.journeys[0].legs[0];
 assert.equal(leg.stops.length,27);assert.equal(leg.routePattern.length,rows.length);
 assert.equal(leg.from.id,aliases[0].id,'interchange identity is unchanged');
 assert.deepEqual(leg.stops[0].routePoint,[Number(rows[0].szGps),Number(rows[0].dlGps)]);
 assert.notEqual(leg.stops[0].routePoint[0],leg.from.lat);
});
