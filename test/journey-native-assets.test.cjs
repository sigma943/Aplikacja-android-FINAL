const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{gunzipSync}=require('node:zlib'),{execFileSync}=require('node:child_process'),load=require('./load-ts.cjs');

test('Android packages plain JSON feeds identical to the compressed source',()=>{
 execFileSync(process.execPath,['scripts/prepare-journey-assets.mjs']);
 for(const provider of ['pks','mpk']){
  const plain=fs.readFileSync(`public/data/journeys/${provider}.json`);
  assert.deepEqual(plain,gunzipSync(fs.readFileSync(`public/data/journeys/${provider}.json.gz`)));
  assert.ok(JSON.parse(plain).trips.length>100);
 }
});
test('Albigowa route works when the worker cannot fetch any Android assets',async()=>{
 const oldFetch=global.fetch;const requests=[];
 try{
  global.fetch=async url=>{requests.push(url);const bytes=fs.readFileSync('public'+url);return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};};
  const {prepareTimetableSearch,executeTimetableSearch}=load('lib/journey-schedules.ts');
  const {warsawTimeMs}=load('lib/transit-time.ts');
  const feed=JSON.parse(fs.readFileSync('public/data/journeys/mpk.json','utf8'));
  const stop=id=>({...feed.stops[id],id:'journey:mpk:'+id,type:'bus',carriers:[{id:'mpk'}],lines:[],isFavorite:false});
  const input={from:stop('1119'),to:stop('1063'),catalog:[],date:'2026-10-19',options:{at:warsawTimeMs('2026-10-19','17:44'),arriveBy:false,maxTransfers:1,walkMeters:500,transferMinutes:5,providers:['pks','mpk'],sort:'fastest'}};
  const prepared=await prepareTimetableSearch(input);
  assert.deepEqual(requests.sort(),['/data/journeys/mpk.json','/data/journeys/pks.json']);
  global.fetch=async()=>{throw Error('Android worker cannot access virtual localhost');};
  const result=await executeTimetableSearch(structuredClone(prepared));
  assert.deepEqual(result.warnings,[]);assert.ok(result.journeys.length,'real selected Albigowa stops produce a connection');
  assert.equal(result.journeys[0].legs.find(l=>l.provider==='mpk').line,'46');
 }finally{global.fetch=oldFetch;}
});
test('compressed files remain a fallback for web servers without expanded JSON',async()=>{
 const oldFetch=global.fetch;try{
  global.fetch=async url=>{if(url.endsWith('.json'))return {ok:false,status:404};const bytes=fs.readFileSync('public'+url);return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};};
  const {loadJourneyFeed}=load('lib/journey-feed.ts');assert.equal((await loadJourneyFeed('mpk')).provider,'mpk');
 }finally{global.fetch=oldFetch;}
});
