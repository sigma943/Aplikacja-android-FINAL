const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
const jsonUrl='https://www.mpkrzeszow.pl/ztm/new/api.php?type=mpk';
const xmlUrl='https://www.mpkrzeszow.pl/mpk/vehicles_proxy.php';
test('a successful MPK details read does not erase the position feed error; recovery keeps last failure',async()=>{
 const api=load('lib/transport-diagnostics.ts');
 await assert.rejects(api.measuredTransport('mpk_rzeszow','vehicles',async()=>{throw Error('HTTP 403');},undefined,undefined,'request',jsonUrl));
 await api.measuredTransport('mpk_rzeszow','vehicles',async()=>[],r=>r.length,undefined,'request','https://www.mpkrzeszow.pl/mpk/get_vehicles.php');
 assert.equal(api.getTransportDiagnostics().find(r=>r.source===jsonUrl).error,'HTTP 403');
 await api.measuredTransport('mpk_rzeszow','vehicles',async()=>[1],r=>r.length,undefined,'request',jsonUrl);
 const row=api.getTransportDiagnostics().find(r=>r.source===jsonUrl);
 assert.equal(row.error,undefined);assert.equal(row.lastErrorMessage,'HTTP 403');assert.ok(row.lastError);assert.equal(row.count,1);
 assert.equal(api.diagnosticSource(jsonUrl+'&device=private'),jsonUrl);
});
test('Android reports HTTP status and readable response details, without HTML markup',async()=>{
 const api=load('lib/transport/http.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>true},CapacitorHttp:{request:async()=>({status:429,data:'<html><style>hidden</style><h1>Too many requests</h1></html>'})}}});
 await assert.rejects(api.requestJson(jsonUrl),e=>/HTTP 429/.test(e.message)&&/Too many requests/.test(e.message)&&!/<html>|hidden/.test(e.message));
 await assert.rejects(api.requestText(xmlUrl),/HTTP 429/);
});
test('an empty successful keyed MPK feed is visible as zero vehicles, not an HTTP failure',async()=>{
 const cache=new Map();
 const mocks={'@capacitor/core':{Capacitor:{isNativePlatform:()=>true},CapacitorHttp:{request:async()=>({status:200,data:{}})}}};
 const http=load('lib/transport/http.ts',mocks,'',cache),diagnostics=load('lib/transport-diagnostics.ts',mocks,'',cache);
 assert.deepEqual(await http.requestJson(jsonUrl),{});
 const row=diagnostics.getTransportDiagnostics()[0];assert.equal(row.count,0);assert.equal(row.source,jsonUrl);assert.equal(row.error,undefined);
});
test('empty MPK success is not retried against an undeployed default backend; failed direct reads still try fallback',async()=>{
 let directCalls=0,backendCalls=0,fail=false;
 const api=load('lib/pks-client.ts',{
  '@capacitor/core':{Capacitor:{isNativePlatform:()=>false}},
  './providers/mpk-vehicles':{fetchMpkRzeszowVehiclesDirect:async()=>{directCalls++;if(fail)throw Error('offline');return []; }},
  './transport/http':{requestJson:async()=>{backendCalls++;return {vehicles:[]};},transportApiUrl:()=>'/vehicles'},
 },'\nexport {fetchMpkRzeszowVehiclesClient};');
 assert.deepEqual(await api.fetchMpkRzeszowVehiclesClient(false),[]);assert.equal(directCalls,1);assert.equal(backendCalls,0);
 fail=true;await assert.rejects(api.fetchMpkRzeszowVehiclesClient(false),/offline/);assert.equal(backendCalls,1);
});
