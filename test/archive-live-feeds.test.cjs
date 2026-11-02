const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function client(respond){
 const source=fs.readFileSync('lib/pks-client.ts','utf8')+'\nexport {currentVehicleDataUrl,fetchCompatibleMpkFeed,fetchPksVehiclesClient,fetchMpkRzeszowVehiclesClient,fetchMpkRzeszowVehicleDetailsDirect};';
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const calls=[],module={exports:{}};
 const core={Capacitor:{isNativePlatform:()=>true},CapacitorHttp:{request:async options=>{calls.push(options.url);return {status:200,data:await respond(options.url,options)};}}};
 const context=vm.createContext({module,exports:module.exports,require:n=>n==='@capacitor/core'?core:require(n),process,console,Date,URL,URLSearchParams,AbortController,DOMException,setTimeout,clearTimeout});
 vm.runInContext(output,context);return {...module.exports,calls};
}
const row=(extra={})=>({nb:'200',nr:'15',op:'Olbrachta',x:'22.01',y:'50.01',is:'0',s:'1',...extra});
test('May client rewrites data host only, preserving paths, query and unrelated providers',()=>{
 const c=client(()=>[]);
 assert.equal(c.currentVehicleDataUrl('https://www.mpkrzeszow.pl/pks/get_vehicles.php?a=1'),'https://kmrzeszow.live/pks/get_vehicles.php?a=1');
 for(const url of ['https://api-site.marcel-bus.pl/client/api/test','/api/pks/vehicles','http://einfo.zgpks.rzeszow.pl/api'])assert.equal(c.currentVehicleDataUrl(url),url);
});
for(const keyed of [true,false])test('May MPK maps '+(keyed?'keyed':'array')+' JSON feed to visible historical vehicle',async()=>{
 const c=client(url=>url.includes('type=mpk')?(keyed?{200:row() }:[row()]):url.includes('get_vehicles.php')?[]:Promise.reject(Error('Unexpected request')));
 const buses=await c.fetchMpkRzeszowVehiclesClient(false);
 assert.equal(buses.length,1);assert.equal(buses[0].id,'mpk_rzeszow_200');assert.equal(buses[0].lat,50.01);assert.equal(buses[0].routeShortName,'15');
 assert.ok(!c.calls.some(u=>u.includes('cloudfunctions.net')),'healthy direct feed does not wait for backend');
 const details=await c.fetchMpkRzeszowVehicleDetailsDirect('mpk_rzeszow_200',false);assert.equal(details.id,buses[0].id);
});
test('May MPK falls back from stale JSON to XML',async()=>{
 const c=client(url=>url.includes('type=mpk')?[row({is:'9999'})]:url.includes('vehicles_proxy')?'<V nb="201" nr="20" op="Centrum" x="22" y="50" is="0" s="1"/>':[]);
 const rows=await c.fetchCompatibleMpkFeed();assert.equal(rows[0].nb,'201');
});
test('May myBus fallback does not mistake countdown is for stale GPS age',async()=>{
 const c=client(url=>url.includes('GetVehicles')?'<V nb="202" nr="20" op="Centrum" x="22" y="50" is="9000" s="1"/>':url.includes('get_vehicles.php')?[]:Promise.reject(Error('Primary unavailable')));
 const buses=await c.fetchMpkRzeszowVehiclesClient(false);assert.equal(buses.length,1);assert.equal(buses[0].vehicleNumber,'202');assert.equal(buses[0].dataAgeSec,0);
});
test('May JSON timestamp takes precedence over legacy age field',async()=>{
 const c=client(url=>url.includes('type=mpk')?[row({timestamp:String(Math.floor(Date.now()/1000)),is:'9999'})]:[]);
 const buses=await c.fetchMpkRzeszowVehiclesClient(false);assert.equal(buses.length,1);assert.ok(buses[0].dataAgeSec<5);
});
test('May PKS uses healthy direct feed while obsolete panel is pending',async()=>{
 const c=client(url=>url.includes('185.214')?new Promise(()=>{}):[{vehicle_id:87,line:'108',position:{lat:50,lon:22,position_date:new Date().toISOString()}}]);
 let timer;try{const buses=await Promise.race([c.fetchPksVehiclesClient(false),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Blocked by panel')),1000);})]);assert.equal(buses.length,1);assert.equal(buses[0].provider,'pks');}finally{clearTimeout(timer);}
 assert.ok(c.calls.some(u=>u==='https://kmrzeszow.live/pks/get_vehicles.php'));
});
test('May aborted MPK request does not start another source',async()=>{
 const c=client(()=>[]),a=new AbortController();a.abort();await assert.rejects(c.fetchCompatibleMpkFeed(a.signal),{name:'AbortError'});assert.equal(c.calls.length,0);
});
module.exports={client};

test('live sources supply map-ready PKS and MPK records',{skip:process.env.ARCHIVE_LIVE_PROBE!=='1'},async()=>{
 const c=client(async(url,options)=>{
  const response=await fetch(url,{headers:options.headers,signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('HTTP '+response.status);
  const text=await response.text();try{return JSON.parse(text);}catch{return text;}
 });
 const results=await Promise.allSettled([c.fetchPksVehiclesClient(false),c.fetchMpkRzeszowVehiclesClient(false)]);
 for(const [i,result] of results.entries()){
  const provider=i===0?'PKS':'MPK';
  console.log('LIVE',provider,result.status==='fulfilled'?result.value.length+' map-ready vehicles':String(result.reason));
  assert.equal(result.status,'fulfilled',provider+' source fetch');
  assert.ok(result.value.length>0,provider+' has map-ready current vehicles');
 }
});
