const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};}

test('overlapping MPK fleet and selected-vehicle reads share positions and details without caching a completed feed',async()=>{
 const jobs=new Map(),counts=new Map();
 const raw={id:'811',nb:'811',nr:'3',op:'Centrum',x:'22',y:'50',s:'1',o:'0'};
 const api=load('lib/providers/mpk-vehicles.ts',{
  '../transport/http':{requestJson:url=>{counts.set(url,(counts.get(url)||0)+1);let job=jobs.get(url);if(!job){job=deferred();jobs.set(url,job);}return job.promise;},requestText:async()=>'<Schedules/>'},
 });
 const a=api.fetchMpkRzeszowVehiclesDirect(false),b=api.fetchMpkRzeszowVehicleDetailsDirect('811',false);
 await flush();assert.equal([...counts.values()].reduce((a,b)=>a+b,0),2,'one positions request and one details request');
 for(const [url,job] of jobs)job.resolve(url.includes('type=mpk')?[raw]:[]);
 assert.equal((await a)[0].id,'mpk_rzeszow_811');assert.equal((await b).id,'mpk_rzeszow_811');
 await api.fetchMpkVehicleFeed();
 assert.equal(counts.get('https://www.mpkrzeszow.pl/ztm/new/api.php?type=mpk'),2,'next completed poll remains a fresh request');
});

test('many stale MPK catalog readers issue one background refresh, one cache write and one notification',async()=>{
 const saved=global.window;let calls=0,writes=0,events=0;const job=deferred();
 const rows=[{stop_id:'256',stop_name:'Matuszczaka',stop_lat:50,stop_lon:22}];
 global.window={dispatchEvent:()=>events++};
 try{
  const api=load('lib/providers/mpk-departures-client.ts',{
   '../transport/http':{requestJson:()=>{calls++;return job.promise;}},
   '../transport/cache':{CLIENT_STOP_CACHE_TTL_MS:1,readPersistentClientCache:()=>({savedAt:1,data:rows}),writePersistentClientCache:()=>writes++},
  });
  const results=await Promise.all(Array.from({length:20},()=>api.fetchMpkRzeszowStopsClient()));
  assert.ok(results.every(result=>result===rows));assert.equal(calls,1);
  job.resolve([{...rows[0],stop_name:'Aktualna nazwa'}]);await flush();
  assert.equal(writes,1);assert.equal(events,1);
 }finally{global.window=saved;}
});

test('cancelling one MPK catalog consumer does not cancel another',async()=>{
 const job=deferred(),abort=new AbortController();let calls=0,signal;
 const api=load('lib/providers/mpk-departures-client.ts',{
  '../transport/http':{requestJson:(_,options)=>{calls++;signal=options.signal;return job.promise;}},
  '../transport/cache':{readPersistentClientCache:()=>null,writePersistentClientCache:()=>{}},
 });
 const a=api.fetchMpkRzeszowStopsClient({signal:abort.signal}),b=api.fetchMpkRzeszowStopsClient();
 const rejection=assert.rejects(a,{name:'AbortError'});await flush();abort.abort();await rejection;
 assert.equal(calls,1);assert.equal(signal.aborted,false);
 const rows=[{stop_id:'256',stop_name:'Matuszczaka'}];job.resolve(rows);assert.deepEqual(await b,rows);
});

test('minute countdown ticks reuse live associations and preserve original map labels and expiry',()=>{
 let corrections=0;const real=load('lib/vehicle-stop-timing.ts');
 const api=load('lib/map-stop-departures.ts',{'./vehicle-stop-timing':{departureFromLiveVehicle:(...args)=>{corrections++;return real.departureFromLiveVehicle(...args);}}});
 const now=Date.parse('2026-10-30T05:20:00Z'),planned=now+120_000;
 const row={id:'one',courseId:'course',line:'108',direction:'Centrum',time:'06:22',carrier:{id:'pks'},plannedAtMs:planned};
 const bus={id:'87',provider:'pks',journeyId:'course',routeShortName:'108',delay:60,status:'active',lastSignalTime:new Date(now).toISOString()};
 const live=api.liveMapStopDepartures([row],[bus]);assert.equal(corrections,1);
 const formatted=Array.from({length:240},(_,i)=>api.formatMapStopDepartures(live,now+i*1000));
 assert.equal(corrections,1,'240 clock ticks need no further fleet matching');
 assert.equal(formatted[0][0].time,'3 min');assert.equal(formatted.at(-1).length,0);
 for(const i of [0,60,120,239])assert.deepEqual(formatted[i],api.mapStopDepartureRows([row],[bus],now+i*1000));
 const updated=api.liveMapStopDepartures([row],[{...bus,delay:120}]);
 assert.equal(api.formatMapStopDepartures(updated,now)[0].time,'4 min');
});

test('unrelated Marcel courses do not run delay estimation',async()=>{
 let estimates=0;
 const domain={splitCsvValues:v=>v?v.split(','):[],mergeCsvValues:(...v)=>v.filter(Boolean).join(','),stopPreciseNameKey:v=>v,marcelCourseStopIndexKey:p=>p.nazPr,marcelCourseStopMatchKey:p=>p.nazPr,departureFromMarcelCourseStop:(course)=>({id:String(course.idKu),time:'06:20'})};
 const api=load('lib/providers/marcel-departures.ts',{
  '@/components/stops-panel/stop-domain':domain,
  '../pks-client':{fetchMarcelRoutesClient:async()=>[{idTr:1}],fetchMarcelCoursesClient:async()=>[{idKu:1},{idKu:2}],fetchMarcelPublicCourseStopsClient:async id=>[{nazPr:id===1?'A':'Other'},{nazPr:'Terminus'}],fetchMarcelLivePositionsClient:async()=>[],estimateMarcelCourseDelay:()=>{estimates++;return undefined;}},
 });
 const result=await api.loadMarcelStopDepartures({id:'a',name:'A',providerStopIds:{}},'2026-10-30',true);
 assert.equal(result.departures.length,1);assert.equal(estimates,1);
});

test('admin presence updates keep collection subscriptions; account and permission changes recreate them',()=>{
 const fs=require('node:fs'),ts=require('typescript');
 const src=ts.createSourceFile('admin.tsx',fs.readFileSync('app/admin/AdminDashboard.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let key;const effects=[];
 function visit(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(src)==='adminSubscriptionKey')key=node.initializer.getText(src);
  if(ts.isCallExpression(node)&&node.expression.getText(src)==='useEffect'&&node.arguments[0]?.getText(src).includes('onSnapshot'))effects.push(node.getText(src));
  ts.forEachChild(node,visit);
 }
 visit(src);assert.ok(key);assert.ok(effects.length>=2);
 const body=ts.transpile(`const adminSubscriptionKey=${key};${effects.slice(0,2).join(';')}`,{target:ts.ScriptTarget.ES2022});
 const render=new Function('currentDevice','user','loading','useEffect','canAccessAdminDashboard','effectiveAdminPermissionsForDisplay','agentLog','query','collection','limit','db','onSnapshot',body);
 let slots=[],index=0,subscriptions=0,closed=0;
 const effect=(run,deps)=>{const previous=slots[index];if(!previous||deps.some((v,i)=>v!==previous.deps[i])){previous?.cleanup?.();slots[index]={deps,cleanup:run()};}index++;};
 const rbac=load('lib/admin/rbac.ts');
 const draw=(device,uid='one')=>{index=0;render(device,{uid},false,effect,rbac.canAccessAdminDashboard,rbac.effectiveAdminPermissionsForDisplay,()=>{},(...args)=>args,(...args)=>args,n=>n,{},()=>{subscriptions++;return()=>closed++;});};
 const device={role:'owner',permissions:{monitor:true}};
 draw(device);assert.equal(subscriptions,2);
 for(let i=0;i<20;i++)draw({...device,lastSeenAt:i,displayName:'Updated'});
 assert.equal(subscriptions,2);assert.equal(closed,0);
 draw({...device,permissions:{monitor:true,logs:true}});assert.equal(subscriptions,4);assert.equal(closed,2);
 draw(device,'two');assert.equal(subscriptions,6);assert.equal(closed,4);
});
