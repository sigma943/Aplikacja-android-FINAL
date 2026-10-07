const {test}=require('node:test');const assert=require('node:assert/strict');const loadTs=require('./load-ts.cjs');
function fixture(role='owner',native=false,permissions={}) {
  const records=new Map([['devices/caller',{role,status:'active',permissions}]]);let seq=0;let queue=Promise.resolve();const nativeCalls=[];
  const ref=(name,id)=>({path:name+'/'+(id||'id'+(++seq)),id:id||'id'+seq});
  const snap=r=>({exists:()=>records.has(r.path),data:()=>records.get(r.path)});
  const sdk={collection:(_,name)=>({name}),doc:(...args)=>args.length===1?ref(args[0].name):ref(args[1],args[2]),getDoc:async r=>snap(r),serverTimestamp:()=>new Date(),
    runTransaction:(_,fn)=>{const run=queue.then(async()=>{const writes=[];let wrote=false;const result=await fn({get:async r=>{assert.equal(wrote,false);return snap(r);},set:(r,data,options)=>{wrote=true;writes.push([r,data,options?.merge]);},update:(r,data)=>{wrote=true;writes.push([r,data,true]);}});for(const [r,data,merge]of writes)records.set(r.path,merge?{...records.get(r.path),...data}:data);return result;});queue=run.catch(()=>{});return run;}};
  const auth={currentUser:{uid:'caller'}};
  const client=loadTs('lib/maintenance-spark.ts',{'firebase/firestore':sdk,'./firebase':{db:{},auth},'@capacitor/core':{Capacitor:{isNativePlatform:()=>native},CapacitorHttp:{request:async request=>{nativeCalls.push(request);return {status:200,data:request.url.endsWith('/pks/get_vehicles.php')?[]:{providers:{pks:{state:'ok'}}}};}}}});
  return {client,records,nativeCalls,auth};
}
const draft={id:'',name:'Backup',url:'https://backup.example/api',role:'backup',priority:2,region:'PL',enabled:true,active:false,fallbackEnabled:true,source:'Firestore'};
test('Spark web adapter saves generated IDs and atomically switches configuration without callables',async()=>{
  const {client,records}=fixture();const old=global.fetch;const urls=[];
  global.fetch=async url=>{urls.push(url);return new Response(JSON.stringify(String(url).endsWith('/pks/get_vehicles.php')?[]:{providers:{pks:{state:'ok'}}}));};
  try{
    await client.callInitialize({});const saved=await client.callSaveEndpoint({endpoint:draft});const id=saved.data.endpointId;
    assert.ok(id);await client.callTestEndpoint({endpointId:id});await client.callSetActive({endpointId:id});
    assert.equal(records.get('admin_settings/transport_runtime').endpointUrl,draft.url);
    assert.equal(records.get('maintenance_endpoints/default-transport-api').active,false);
    await client.callRollback({});await client.callDisable({endpointId:id});
    assert.equal(records.get('maintenance_endpoints/'+id).enabled,false);
    assert.ok(urls.every(url=>String(url).endsWith('/health/providers')||String(url).endsWith('/pks/get_vehicles.php')));
    assert.ok(urls.some(url=>String(url)==='https://www.mpkrzeszow.pl/pks/get_vehicles.php'));
    assert.ok(urls.every(url=>!String(url).includes('cloudfunctions.net')));
    assert.ok([...records].filter(([key])=>key.startsWith('maintenance_changes/')).length>=6);
    assert.ok([...records.values()].filter(row=>row.updatedBy).every(row=>row.updatedBy==='caller'));
  }finally{global.fetch=old;}
});
test('Spark Android diagnostics use native HTTP and validate actual provider JSON',async()=>{
  const {client,nativeCalls}=fixture('owner',true);await client.callInitialize({});
  const result=await client.callTestEndpoint({url:draft.url});assert.equal(result.data.result.ok,true);
  assert.equal(nativeCalls[0].url,draft.url+'/health/providers');assert.equal(nativeCalls[0].readTimeout,9000);
});
test('read-only diagnostics do not write; users, banned owners and anonymous callers cannot mutate',async()=>{
  const old=global.fetch;global.fetch=async()=>new Response(JSON.stringify({providers:{pks:{state:'ok'}}}));
  try{
    const viewer=fixture('admin',false,{globalSettings:true});await viewer.client.callInitialize({});
    assert.equal((await viewer.client.callTestEndpoint({url:draft.url})).data.result.ok,true);
    assert.equal(viewer.records.size,1);
    await assert.rejects(viewer.client.callSaveEndpoint({endpoint:draft}),error=>error.code==='permission-denied');
    const user=fixture('user');await assert.rejects(user.client.callInitialize({}),error=>error.code==='permission-denied');
    const banned=fixture();banned.records.get('devices/caller').status='banned';await assert.rejects(banned.client.callSaveEndpoint({endpoint:draft}),error=>error.code==='permission-denied');
    const anonymous=fixture();anonymous.auth.currentUser=null;await assert.rejects(anonymous.client.callInitialize({}),/Zaloguj/);
  }finally{global.fetch=old;}
});

test('legacy default function profile migrates on Spark while custom API profiles are retained',async()=>{
  const {client,records}=fixture('owner',true);
  const legacy='https://us-central1-aplikacja-b20fa.cloudfunctions.net/transportApi';
  records.set('maintenance_endpoints/default-transport-api',{...draft,id:undefined,name:'Old',url:legacy,active:true,createdAt:new Date(),lastTest:{ok:true}});
  records.set('admin_settings/maintenance',{activeEndpointId:'default-transport-api',previousEndpointId:''});
  records.set('admin_settings/transport_runtime',{endpointId:'default-transport-api',endpointUrl:legacy,fallbackEnabled:true});
  await client.callInitialize({});
  assert.equal(records.get('admin_settings/transport_runtime').endpointUrl,'https://www.mpkrzeszow.pl/pks');
  assert.equal(records.get('maintenance_endpoints/default-transport-api').lastTest,null);
  assert.equal((await client.callTestEndpoint({endpointId:'default-transport-api'})).data.result.ok,true);
  records.get('maintenance_endpoints/default-transport-api').url='https://custom.example/api';
  await client.callInitialize({});
  assert.equal(records.get('admin_settings/transport_runtime').endpointUrl,'https://custom.example/api');
});
