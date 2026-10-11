const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}

test('overlapping callers share work, completed values are never reused',async()=>{
  const {sharedInflight}=load('lib/shared-inflight.ts');let calls=0;const jobs=[];
  const get=sharedInflight(()=>{calls++;const job=deferred();jobs.push(job);return job.promise;});
  const a=get(),b=get();await tick();assert.equal(calls,1);
  const value=[{id:1,lat:50,lon:22}];jobs[0].resolve(value);
  assert.deepEqual(await Promise.all([a,b]),[value,value]);
  const next=get();await tick();assert.equal(calls,2);jobs[1].resolve([]);assert.deepEqual(await next,[]);
});

test('one cancellation leaves the other caller running; last cancellation starts a fresh flight',async()=>{
  const {sharedInflight}=load('lib/shared-inflight.ts');const jobs=[];
  const get=sharedInflight(signal=>{const job={...deferred(),signal};jobs.push(job);return job.promise;});
  const first=new AbortController(),second=new AbortController();
  const a=get(first.signal),b=get(second.signal);const rejected=assert.rejects(a,{name:'AbortError'});
  await tick();first.abort();await rejected;assert.equal(jobs[0].signal.aborted,false);
  jobs[0].resolve('fresh');assert.equal(await b,'fresh');
  const last=new AbortController();const c=get(last.signal);const rejectedLast=assert.rejects(c,{name:'AbortError'});
  await tick();last.abort();await rejectedLast;assert.equal(jobs[1].signal.aborted,true);
  const d=get();await tick();jobs[1].resolve('late old response');await tick();
  const e=get();await tick();assert.equal(jobs.length,3,'old completion must not clear the new flight');
  jobs[2].resolve('new');assert.deepEqual(await Promise.all([d,e]),['new','new']);
});

test('failures reach every caller and allow retry; pre-aborted callers do not fetch',async()=>{
  const {sharedInflight}=load('lib/shared-inflight.ts');let calls=0;
  const get=sharedInflight(()=>{calls++;throw new Error('offline');});
  const c=new AbortController();c.abort();await assert.rejects(get(c.signal),{name:'AbortError'});assert.equal(calls,0);
  await Promise.all([assert.rejects(get(),/offline/),assert.rejects(get(),/offline/)]);assert.equal(calls,1);
  await assert.rejects(get(),/offline/);assert.equal(calls,2);
});

test('PKS callers share both HTTP sources, retain fastest nonempty response and refresh after settlement',async()=>{
  const requests=[];
  const api=load('lib/pks-client.ts',{
    '@capacitor/core':{Capacitor:{isNativePlatform:()=>false}},
    './transport/http':{isNative:()=>false,requestJson:(url,options)=>{const job={...deferred(),url,signal:options.signal};requests.push(job);return job.promise;}},
  },'\nexport {fetchPksVehiclesSnapshot};');
  const a=api.fetchPksVehiclesSnapshot(),b=api.fetchPksVehiclesSnapshot();await tick();
  assert.equal(requests.length,2);assert.match(requests[0].url,/api\/pks\/vehicles/);assert.match(requests[1].url,/get_vehicles/);
  requests[0].resolve({items:[]});const rows=[{vehicle_id:1,position:{lat:50,long:22}}];requests[1].resolve(rows);
  assert.deepEqual(await Promise.all([a,b]),[rows,rows]);
  const next=api.fetchPksVehiclesSnapshot();await tick();assert.equal(requests.length,4);
  requests[2].resolve({items:[{vehicle_id:2}]});requests[3].reject(new Error('backup unavailable'));
  assert.deepEqual(await next,[{vehicle_id:2}]);
});


test('native PKS retains required host header and WebSocket fallback after both HTTP sources fail',async()=>{
  const previousWindow=global.window,previousSocket=global.WebSocket;
  let sockets=0,closed=0;const requests=[];
  global.window={setTimeout,clearTimeout};
  global.WebSocket=class {
    constructor(url){sockets++;assert.equal(url,'ws://185.214.67.112:3000/rist');setImmediate(()=>this.onmessage({data:JSON.stringify({items:[{vehicle_id:42}]})}));}
    close(){closed++;}
  };
  try {
    const api=load('lib/pks-client.ts',{
      '@capacitor/core':{Capacitor:{isNativePlatform:()=>true}},
      './transport/http':{isNative:()=>true,requestJson:async(url,options)=>{requests.push({url,options});throw new Error('HTTP unavailable');}},
    },'\nexport {fetchPksVehiclesSnapshot};');
    const [map,panel]=await Promise.all([api.fetchPksVehiclesSnapshot(),api.fetchPksVehiclesSnapshot()]);
    assert.deepEqual(map,[{vehicle_id:42}]);assert.deepEqual(panel,map);
    assert.equal(requests.length,2);assert.equal(sockets,1);assert.equal(closed,1);
    assert.equal(requests[0].url,'http://185.214.67.112/api/its/vehicles');
    assert.equal(requests[0].options.headers.Host,'einfo.zgpks.rzeszow.pl');
  } finally {global.window=previousWindow;global.WebSocket=previousSocket;}
});

test('abort before a new flight starts does not issue network work',async()=>{
  const {sharedInflight}=load('lib/shared-inflight.ts');let calls=0;
  const get=sharedInflight(async()=>{calls++;return [];});
  const controller=new AbortController(),result=get(controller.signal);
  const rejected=assert.rejects(result,{name:'AbortError'});controller.abort();await rejected;await tick();
  assert.equal(calls,0);assert.deepEqual(await get(),[]);assert.equal(calls,1);
});
