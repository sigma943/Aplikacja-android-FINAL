const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const pks=Object.entries(require('../public/data/pks-stop-points.json').stops).map(([id,s])=>({...s,id,name:s.n+' '+s.code,lines:[]}));
const mpk=Object.entries(require('../public/data/bus-routes/mpk_rzeszow.json').stops).map(([id,s])=>({...s,id,lines:[]}));
const marcel=[{id:'m1',name:'Gwoźnica Górna Szkoła 19',matchName:'Gwoźnica Górna Szkoła 19',lat:49.85484,lon:21.98034,routeIds:['1'],matchKey:'school'}];

test('worker protocol preserves every field, alias, coordinate and ordering in complete catalogs',()=>{
 const previous=global.self;const messages=[];global.self={postMessage:result=>messages.push(result)};
 try {
  load('lib/stops-catalog.worker.ts',{'@/lib/pks-client':{}});
  const {buildStopsCatalog}=load('lib/stops-catalog.ts',{'@/lib/pks-client':{}});
  for(const [index,rows] of [pks,[...pks].reverse(),pks.map((s,i)=>i? s:{...s,name:s.name+' test',lon:s.lon+.0001})].entries()) {
   const request={id:index,key:'dataset-'+index,pks:rows,mpk,marcel};
   global.self.onmessage({data:structuredClone(request)});const result=messages.at(-1);
   assert.equal(result.id,index);assert.deepEqual(structuredClone(result.list),buildStopsCatalog(rows,mpk,marcel,request.key));
   assert.deepEqual(structuredClone(result.physical),buildStopsCatalog(rows,mpk,marcel,request.key,true));
  }
 } finally {global.self=previous;}
});

function setup(t,mode='ok') {
 const originalWorker=global.Worker;global.Worker=function(){};t.after(()=>global.Worker=originalWorker);
 const cache=new Map(),sent=[],workers=[];
 const nativeSetTimeout=global.setTimeout;
 // Idle disposal should not keep the Node test runner alive.
 global.setTimeout=(fn,ms,...args)=>{const timer=nativeSetTimeout(fn,ms,...args);timer.unref();timers.push({timer,fn,ms});return timer;};
 t.after(()=>global.setTimeout=nativeSetTimeout);
 const fallback=[];const timers=[];
 const api=load('lib/stops-catalog-async.ts',{
  './stops-catalog-worker-factory':{createCatalogWorker:()=>{
   if(mode==='constructor')throw Error('unsupported');
   const worker={terminate(){this.terminated=true;},postMessage(request){if(mode==='clone')throw Error('clone error');sent.push(request);}};
   workers.push(worker);return worker;
  }},
  './stops-catalog':{buildStopsCatalog:(p,m,r,key,physical)=>{fallback.push({key,physical});return [{id:key,name:physical?'map':'list'}];}},
  '@/components/stops-panel/stop-domain':{MERGED_STOPS_RUNTIME_CACHE:cache,MERGED_STOPS_RUNTIME_CACHE_LIMIT:3},
 });
 return {...api,cache,sent,workers,fallback,timers};
}

test('map and list share a job, populate both caches and reuse results',async t=>{
 const s=setup(t);const a=s.buildStopsCatalogAsync([],[],[],'key'),b=s.buildStopsCatalogAsync([],[],[],'key',true);
 assert.equal(s.sent.length,1);const result={id:s.sent[0].id,list:[{id:'list'}],physical:[{id:'map'}]};
 s.workers[0].onmessage({data:result});assert.equal(await a,result.list);assert.equal(await b,result.physical);
 assert.equal(await s.buildStopsCatalogAsync([],[],[],'key'),result.list);assert.equal(s.sent.length,1);assert.equal(s.fallback.length,0);
});

for(const mode of ['constructor','clone','error','messageerror','malformed'])test('worker failure falls back to the original pipeline: '+mode,async t=>{
 const s=setup(t,mode);const result=s.buildStopsCatalogAsync([],[],[],'key');
 if(mode==='error')s.workers[0].onerror({preventDefault(){}});
 if(mode==='messageerror')s.workers[0].onmessageerror();
 if(mode==='malformed')s.workers[0].onmessage({data:{id:s.sent[0].id,error:true}});
 assert.deepEqual(await result,[{id:'key',name:'list'}]);assert.deepEqual(await s.buildStopsCatalogAsync([],[],[],'next',true),[{id:'next',name:'map'}]);
 assert.equal(s.sent.length,mode==='constructor'||mode==='clone'?0:1);
});

test('late unrelated results do not resolve another input and cache stays bounded',async t=>{
 const s=setup(t);const a=s.buildStopsCatalogAsync([],[],[],'a'),b=s.buildStopsCatalogAsync([],[],[],'b',true);
 s.workers[0].onmessage({data:{id:999,list:[],physical:[]}});
 for(const request of [...s.sent].reverse())s.workers[0].onmessage({data:{id:request.id,list:[{id:request.key}],physical:[{id:request.key}]}});
 assert.deepEqual(await a,[{id:'a'}]);assert.deepEqual(await b,[{id:'b'}]);assert.ok(s.cache.size<=3);await tick();
});

test('devices without Worker use the original synchronous calculation',async t=>{
 const s=setup(t);global.Worker=undefined;assert.deepEqual(await s.buildStopsCatalogAsync([],[],[],'offline',true),[{id:'offline',name:'map'}]);assert.equal(s.sent.length,0);
});


test('worker timeout falls back and idle completion releases the thread',async t=>{
 const s=setup(t);const a=s.buildStopsCatalogAsync([],[],[],'slow');
 const timeout=s.timers.find(row=>row.ms===15000);clearTimeout(timeout.timer);timeout.fn();
 assert.deepEqual(await a,[{id:'slow',name:'list'}]);assert.equal(s.workers[0].terminated,true);
});

test('idle worker is released and can be recreated for a changed catalog',async t=>{
 const s=setup(t);const a=s.buildStopsCatalogAsync([],[],[],'first');
 s.workers[0].onmessage({data:{id:s.sent[0].id,list:[],physical:[]}});await a;
 const idle=s.timers.find(row=>row.ms===30000);clearTimeout(idle.timer);idle.fn();assert.equal(s.workers[0].terminated,true);
 const b=s.buildStopsCatalogAsync([],[],[],'changed');assert.equal(s.workers.length,2);
 s.workers[1].onmessage({data:{id:s.sent[1].id,list:[],physical:[]}});await b;
});

test('map ignores a late result from an older catalog after inputs change',async()=>{
 const original=global.window;const tasks=[];global.window={setTimeout:fn=>{tasks.push(fn);return tasks.length;},clearTimeout(){},addEventListener(){},removeEventListener(){}};
 let effect;const displayed=[],jobs=[];
 const hook=load('lib/use-map-stops.ts',{
  react:{useState:()=>[[],value=>displayed.push(value)],useEffect:fn=>{effect=fn;}},
  './stops-catalog-async':{buildStopsCatalogAsync:()=>new Promise(resolve=>jobs.push(resolve))},
  './stops-catalog-cache':{readStopsCatalogCache:async()=>null,peekStopsCatalogCache:()=>null},
  './pks-client':{fetchMpkRzeszowStopsClient:()=>new Promise(()=>{})},
  '@/components/stops-panel/stop-domain':{stopCollectionSignature:rows=>String(rows[0]?.id),ensureMpkCityPrefix:name=>name},
 });
 try {
  hook.useMapStops(true,[{id:'old',name:'old'}]);const cleanup=effect();await tick();tasks.at(-1)();cleanup();
  hook.useMapStops(true,[{id:'new',name:'new'}]);const nextCleanup=effect();await tick();tasks.at(-1)();
  jobs[1]([{id:'new'}]);await tick();jobs[0]([{id:'old'}]);await tick();
  assert.deepEqual(displayed,[[{id:'new'}]]);nextCleanup();
 } finally {global.window=original;}
});
