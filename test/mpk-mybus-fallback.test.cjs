const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
const primary='https://www.mpkrzeszow.pl/ztm/new/api.php?type=mpk';
const legacy='https://www.mpkrzeszow.pl/mpk/vehicles_proxy.php';
const backup=load('lib/transport/endpoints.ts').MPK_RZESZOW_MYBUS_VEHICLES_URL;
const raw={id:'811',nb:'811',nr:'3 ',op:'Krakowska',x:'21.95647',y:'49.99245',o:'-167',s:'1',ik:'5565',kwi:'8/2',is:'0'};
const xml='<VL><V '+Object.entries(raw).map(([k,v])=>`${k}="${v}"`).join(' ')+'/></VL>';
function client(primaryResult,textResults){
 const calls=[];
 const api=load('lib/providers/mpk-vehicles.ts',{
 '../transport/http':{requestJson:async url=>{calls.push(url);if(primaryResult instanceof Error)throw primaryResult;return primaryResult;},requestText:async url=>{calls.push(url);const value=textResults[url];if(value instanceof Error)throw value;return value;}},
 });return {api,calls};
}
test('healthy primary avoids every backup',async()=>{
 const {api,calls}=client([raw],{});assert.deepEqual(await api.fetchMpkVehicleFeed(),[raw]);assert.deepEqual(calls,[primary]);
});
for(const primaryResult of [{},new Error('HTTP 503')])test(`myBus recovers ${primaryResult instanceof Error?'failed':'empty'} primary and unavailable legacy XML`,async()=>{
 const {api,calls}=client(primaryResult,{[legacy]:new Error('HTTP 404'),[backup]:xml});
 const rows=await api.fetchMpkVehicleFeed();assert.equal(rows.length,1);assert.deepEqual(calls,[primary,legacy,backup]);
 const mapped=api.mapMpkDirectVehicle(rows[0],new Map(),Date.now(),false);
 assert.equal(mapped.id,'mpk_rzeszow_811');assert.equal(mapped.routeShortName,'3');assert.equal(mapped.tripId,'5565');assert.equal(mapped.direction,'Krakowska');assert.equal(mapped.lat,49.99245);assert.equal(mapped.lon,21.95647);assert.equal(mapped.delay,167);
});
test('healthy legacy XML avoids myBus',async()=>{
 const {api,calls}=client({}, {[legacy]:xml});assert.equal((await api.fetchMpkVehicleFeed()).length,1);assert.deepEqual(calls,[primary,legacy]);
});
test('abort never starts another source; all failed sources remain an error',async()=>{
 const {api,calls}=client(new DOMException('Request aborted','AbortError'),{});await assert.rejects(api.fetchMpkVehicleFeed(),{name:'AbortError'});assert.deepEqual(calls,[primary]);
 const failed=client(Error('primary down'),{[legacy]:Error('legacy down'),[backup]:Error('myBus down')});await assert.rejects(failed.api.fetchMpkVehicleFeed(),/myBus down/);
 const aborted=new AbortController();aborted.abort();const idle=client({},{});await assert.rejects(idle.api.fetchMpkVehicleFeed(aborted.signal),{name:'AbortError'});assert.deepEqual(idle.calls,[]);
});
test('myBus XML appears in MPK diagnostics with the vehicle count',async()=>{
 const cache=new Map(),mocks={'@capacitor/core':{Capacitor:{isNativePlatform:()=>true},CapacitorHttp:{request:async()=>({status:200,data:xml})}}};
 const http=load('lib/transport/http.ts',mocks,'',cache),diagnostics=load('lib/transport-diagnostics.ts',mocks,'',cache);
 await http.requestText(backup);const row=diagnostics.getTransportDiagnostics()[0];assert.equal(row.provider,'mpk_rzeszow');assert.equal(row.kind,'vehicles');assert.equal(row.count,1);
});
test('backend uses the same fallback after an empty primary',async()=>{
 const previous=global.fetch,calls=[];
 global.fetch=async url=>{calls.push(url);return {ok:url!==legacy,status:url===legacy?404:200,text:async()=>url===primary?'{}':url===backup?xml:'not found'};};
 try{
 const api=load('functions/src/transport/mpk-rzeszow-provider.ts',{'./cache':{getCachedValue:async(key,{loader})=>({value:await loader()})}},'\nexport {loadRawVehicles};');
 const result=await api.loadRawVehicles();assert.equal(result.value.length,1);assert.equal(result.value[0].nb,'811');assert.equal(calls.at(-1),backup);
 }finally{global.fetch=previous;}
});
