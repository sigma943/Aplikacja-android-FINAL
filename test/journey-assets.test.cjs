const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),load=require('./load-ts.cjs');
const {warsawTimeMs}=load('lib/transit-time.ts');
const bytes=p=>new Uint8Array(fs.readFileSync('public/data/journeys/'+p+'.json.gz'));

test('window loads both bundled feeds and Worker searches without fetch access',async()=>{
 const original=global.fetch,requests=[];
 try{
  global.fetch=async url=>{requests.push(url);return new Response(bytes(url.includes('/pks.')?'pks':'mpk'));};
  const {loadTimetableAssets}=load('lib/journey-assets.ts'),signal=new AbortController().signal;
  const assets=await loadTimetableAssets(['pks','mpk','marcel','pks'],signal);
  assert.deepEqual(requests.sort(),['/data/journeys/mpk.json','/data/journeys/pks.json']);
  global.fetch=()=>{throw Error('Worker cannot reach the virtual Android HTTPS server');};
  const {executeTimetableSearch}=load('lib/journey-schedules.ts');
  const feed=JSON.parse(require('node:zlib').gunzipSync(assets.pks));
  const stop=id=>({...feed.stops[id],id:'journey:pks:'+id,type:'bus',carriers:[],lines:[],isFavorite:false});
  const originalPush=Array.prototype.push;
  Array.prototype.push=function(...items){if(items.length>8000)throw new RangeError('Mobile argument stack limit');return Reflect.apply(originalPush,this,items);};
  let result;try{result=await executeTimetableSearch({assets,from:stop('566'),to:stop('58'),catalog:[],date:'2026-10-19',options:{at:warsawTimeMs('2026-10-19','09:30'),arriveBy:false,maxTransfers:0,walkMeters:0,transferMinutes:5,providers:['pks','mpk'],sort:'fastest'}});}finally{Array.prototype.push=originalPush;}
  assert.ok(result.journeys.some(j=>j.legs[0].line==='301'));assert.deepEqual(result.warnings,[]);
  assert.deepEqual(await loadTimetableAssets(['pks','mpk'],signal),assets,'cached bytes remain usable after structured cloning to a worker');
  assert.equal(structuredClone(assets).pks.length,assets.pks.length);
 }finally{global.fetch=original;}
});

test('asset failure is retryable and does not discard the successful carrier',async()=>{
 const original=global.fetch;let fail=true;
 try{
  global.fetch=async url=>new Response(fail&&url.includes('/pks.')?'missing':bytes(url.includes('/pks.')?'pks':'mpk'),{status:fail&&url.includes('/pks.')?404:200});
  const {loadTimetableAssets}=load('lib/journey-assets.ts'),signal=new AbortController().signal;
  const first=await loadTimetableAssets(['pks','mpk'],signal);assert.equal(first.pks,null);assert.ok(first.mpk.length);
  fail=false;assert.ok((await loadTimetableAssets(['pks'],signal)).pks.length);
 }finally{global.fetch=original;}
});

test('cancelling local asset loading releases the search',async()=>{
 const original=global.fetch;
 try{
  global.fetch=()=>new Promise(()=>{});
  const {loadTimetableAssets}=load('lib/journey-assets.ts'),controller=new AbortController();
  const pending=loadTimetableAssets(['pks'],controller.signal);controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
 }finally{global.fetch=original;}
});

test('Android APK assets are plain .json and web gzip assets remain a supported fallback',async()=>{
 const original=global.fetch;
 try{
  for(const android of [true,false]){
   const requests=[];
   global.fetch=async url=>{
    requests.push(url);
    const wanted=android?!url.endsWith('.gz'):url.endsWith('.gz');
    if(!wanted)return new Response('<html>missing asset</html>',{status:200});
    const compressed=bytes(url.includes('/pks.')?'pks':'mpk');
    return new Response(android?require('node:zlib').gunzipSync(compressed):compressed);
   };
   const {loadTimetableAssets}=load('lib/journey-assets.ts');
   const assets=await loadTimetableAssets(['pks','mpk'],new AbortController().signal);
   assert.ok(assets.pks?.length&&assets.mpk?.length);
   const {executeTimetableSearch}=load('lib/journey-schedules.ts');
   const raw=JSON.parse(require('node:zlib').gunzipSync(bytes('pks')));
   const stop=id=>({...raw.stops[id],id:'journey:pks:'+id,type:'bus',carriers:[],lines:[],isFavorite:false});
   const result=await executeTimetableSearch({assets,from:stop('566'),to:stop('58'),catalog:[],date:'2026-10-19',options:{at:warsawTimeMs('2026-10-19','09:30'),arriveBy:false,maxTransfers:0,walkMeters:0,transferMinutes:5,providers:['pks','mpk'],sort:'fastest'}});
   assert.ok(result.journeys.some(j=>j.legs[0].line==='301'));assert.deepEqual(result.warnings,[]);
   assert.equal(requests.length,android?2:4);
  }
 }finally{global.fetch=original;}
});
