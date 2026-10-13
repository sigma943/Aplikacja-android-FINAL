const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {buildStopsCatalog}=load('lib/stops-catalog.ts',{'@/lib/pks-client':{}});
const {mpkCatalogDisplayName}=load('lib/mpk-stop-label.ts');
const pks=require('../public/data/pks-stop-points.json').stops;
const mpk=require('../public/data/mpk-stop-points.json').stops;
test('Matuszczaka platforms retain shared PKS/MPK identities and PKS list names; MPK names belong only to the map',()=>{
 const inputPks=['3794','3795'].map(id=>({...pks[id],id,name:pks[id].n+' '+pks[id].code,lines:['108']}));
 const inputMpk=mpk.filter(s=>['213','256'].includes(String(s.stop_id))).map(s=>({id:String(s.stop_id),name:s.stop_name,lat:Number(s.stop_lat),lon:Number(s.stop_lon),lines:s.lines.split(',').map(s=>s.trim())}));
 const before=JSON.stringify([inputPks,inputMpk]);
 const list=buildStopsCatalog(inputPks,inputMpk,[],'matuszczaka-pks-names');
 const map=buildStopsCatalog(inputPks,inputMpk,[],'matuszczaka-pks-names',true);
 assert.equal(list.length,2);assert.equal(map.length,2);
 for(const [pksId,mpkId,code] of [['3794','213','04'],['3795','256','03']]){
  const stop=list.find(s=>s.providerStopIds.pks===pksId);
  assert.equal(stop.providerStopIds.mpk_rzeszow,mpkId);
  assert.equal(stop.name,pks[pksId].n+' '+code);
  assert.deepEqual(stop.carriers.map(c=>c.id),['pks','mpk']);assert.ok(stop.lines.includes('108')&&stop.lines.includes('30'));
  assert.equal(mpkCatalogDisplayName(stop),'Rzeszów Podkarpacka / Matuszczaka '+code);
  assert.deepEqual(map.find(s=>s.id===stop.id).providerStopIds,stop.providerStopIds);
 }
 assert.equal(JSON.stringify([inputPks,inputMpk]),before);
 const standalone=buildStopsCatalog([],inputMpk,[],'mpk-only-list-name');
 assert.equal(standalone.length,2);assert.ok(standalone.every(s=>s.name.startsWith('Rzeszów Podkarpacka / Matuszczaka')));
});
function client(cached,request,writes){return load('lib/providers/mpk-departures-client.ts',{
 '../../public/data/mpk-stop-points.json':{stops:mpk.filter(s=>String(s.stop_id)==='256')},
 '../transport/http':{requestJson:request},
 '../transport/cache':{CLIENT_STOP_CACHE_TTL_MS:900000,readPersistentClientCache:()=>cached,writePersistentClientCache:(_,rows)=>writes.push(rows)},
});}
const rows=mpk.filter(s=>String(s.stop_id)==='256');
test('an empty saved MPK catalog cannot hide providers or bypass the working API',async()=>{
 const writes=[];let requests=0;
 const api=client({savedAt:Date.now(),data:[]},async()=>{requests++;return rows;},writes);
 assert.deepEqual(await api.fetchMpkRzeszowStopsClient(),rows);assert.equal(requests,1);assert.deepEqual(writes,[rows]);
});
test('failed or empty MPK API uses the bundled API snapshot without marking it as fresh network data',async()=>{
 const original=global.fetch;global.fetch=async url=>{assert.equal(url,'/data/mpk-stop-points.json');return new Response(JSON.stringify({stops:rows}));};
 try{for(const response of [async()=>[],async()=>{throw Error('Unavailable');}]){
  const writes=[],api=client(null,response,writes);
  assert.deepEqual(await api.fetchMpkRzeszowStopsClient(),rows);assert.equal(writes.length,0);
 }}finally{global.fetch=original;}
});
test('background API refresh notifies both open catalog views',async()=>{
 const original=global.window;const events=[];global.window={dispatchEvent:event=>events.push(event.type)};
 try{
  const writes=[],fresh=[{...rows[0],stop_name:'Nowa nazwa z API'}];
  const api=client({savedAt:1,data:rows},async()=>fresh,writes);
  assert.deepEqual(await api.fetchMpkRzeszowStopsClient(),rows);
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(writes,[fresh]);assert.deepEqual(events,['pks-live:mpk-stops-updated']);
 }finally{global.window=original;}
});
