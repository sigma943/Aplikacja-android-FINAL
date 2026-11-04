const {test}=require('node:test');const assert=require('node:assert/strict');const load=require('./load-ts.cjs');
test('Marcel stops appear without map fleet activation, before a slow route completes, with lookahead only for empty routes',async()=>{
 let finishSlow;const slow=new Promise(resolve=>finishSlow=resolve),dates=[],partial=[];
 const api={fetchMarcelRoutesClient:async()=>[{idTr:1},{idTr:2},{idTr:3}],fetchMarcelCoursesClient:async(id,date)=>{dates.push([id,date]);return id===3&&date==='2026-10-07'?[]:[{idKu:id}];},fetchMarcelPublicCourseStopsClient:async id=>{if(id===2)await slow;return [{nazMi:'Babica',nazPr:'Babica 01',szGps:49.96,dlGps:21.95}];},fetchVehicleDetailsClient:async()=>{throw Error('No map vehicles permitted');}};
 const {getMarcelStopsIndex}=load('components/stops-panel/stop-domain.ts',{'@/lib/pks-client':api});
 const result=getMarcelStopsIndex('2026-10-07',{onPartial:rows=>partial.push(rows)});
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(partial.some(rows=>rows.length===1),'fast catalog must not wait for the slow route');
 assert.deepEqual(dates.filter(([id])=>id===1).map(([,date])=>date),['2026-10-07']);
 assert.deepEqual(dates.filter(([id])=>id===3).map(([,date])=>date),['2026-10-07','2026-10-08']);
 finishSlow();const rows=await result;
 assert.equal(rows.length,1);assert.deepEqual([...rows[0].routeIds].sort(),['1','2','3']);
 const count=dates.length;await getMarcelStopsIndex('2026-10-07');assert.equal(dates.length,count,'shared index avoids repeat requests');
});

test('missing GPS stays missing and valid coordinates from another course replace it as a pair',async()=>{
 const api={fetchMarcelRoutesClient:async()=>[{idTr:1}],fetchMarcelCoursesClient:async()=>[{idKu:1},{idKu:2}],
 fetchMarcelPublicCourseStopsClient:async id=>[
  {nazMi:'Babica',nazPr:'(81) za torami',szGps:null,dlGps:null},
  {nazMi:'Babica',nazPr:'Szkoła 1',szGps:id===1?49.8:49.95,dlGps:id===1?null:21.9}]};
 const {getMarcelStopsIndex}=load('components/stops-panel/stop-domain.ts',{'@/lib/pks-client':api});
 const stops=await getMarcelStopsIndex('2026-10-08');
 const missing=stops.find(s=>s.name.includes('Za Torami')||s.name.toLowerCase().includes('za torami'));
 assert.ok(missing,'stop remains available for departures');assert.equal(missing.lat,undefined);assert.equal(missing.lon,undefined);
 const school=stops.find(s=>s!==missing);assert.equal(school.lat,49.95);assert.equal(school.lon,21.9,'coordinates must come from the same observation');
});

test('bare Marcel platform numbers preserve locality and direction identities instead of disappearing',async()=>{
 const api={fetchMarcelRoutesClient:async()=>[{idTr:1}],fetchMarcelCoursesClient:async()=>[{idKu:1}],fetchMarcelPublicCourseStopsClient:async()=>[
  {nazMi:'Babica',nazPr:'83 (+)',szGps:49.95,dlGps:21.9},
  {nazMi:'Babica',nazPr:'82 (-)',szGps:49.949,dlGps:21.899},
  {nazMi:'Babica',nazPr:'(81)',szGps:null,dlGps:null}]};
 const domain=load('components/stops-panel/stop-domain.ts',{'@/lib/pks-client':api});
 const rows=await domain.getMarcelStopsIndex('2026-10-09');
 assert.equal(rows.length,2);assert.deepEqual(rows.map(s=>s.cityMatchKey).sort(),['babica|82','babica|83']);
 assert.equal(domain.marcelCourseStopIndexKey({nazMi:'Babica',nazPr:'083 (+)'}),'babica|83');
 assert.notEqual(rows[0].id,rows[1].id);
});


test('closing the last catalogue consumer stops queued course requests and permits a later retry',async()=>{
 let release;const waiting=new Promise(r=>release=r),calls=[];
 const api={fetchMarcelRoutesClient:async()=>[{idTr:1}],fetchMarcelCoursesClient:async()=>Array.from({length:20},(_,i)=>({idKu:i+1})),
 fetchMarcelPublicCourseStopsClient:async id=>{calls.push(id);await waiting;return [{nazMi:'Babica',nazPr:'Babica 01',szGps:49.96,dlGps:21.95}];}};
 const {getMarcelStopsIndex}=load('components/stops-panel/stop-domain.ts',{'@/lib/pks-client':api});
 const c=new AbortController(),pending=getMarcelStopsIndex('2026-10-10',{signal:c.signal});
 const rejected=assert.rejects(pending,{name:'AbortError'});
 await new Promise(r=>setImmediate(r));assert.equal(calls.length,2);
 c.abort();release();await rejected;await new Promise(r=>setImmediate(r));assert.equal(calls.length,2,'18 queued courses must not start after leaving');
 const rows=await getMarcelStopsIndex('2026-10-10');assert.equal(rows.length,1,'aborted scans are retryable and never cached as complete');
});
test('one closed consumer cannot cancel another open catalogue or evict its completed cache',async()=>{
 let release;const waiting=new Promise(r=>release=r);let calls=0;
 const api={fetchMarcelRoutesClient:async()=>[{idTr:1}],fetchMarcelCoursesClient:async()=>[{idKu:1}],fetchMarcelPublicCourseStopsClient:async()=>{calls++;await waiting;return [{nazMi:'Babica',nazPr:'Babica 01',szGps:49.96,dlGps:21.95}];}};
 const {getMarcelStopsIndex}=load('components/stops-panel/stop-domain.ts',{'@/lib/pks-client':api});
 const a=new AbortController(),b=new AbortController(),one=getMarcelStopsIndex('2026-10-11',{signal:a.signal}),two=getMarcelStopsIndex('2026-10-11',{signal:b.signal});
 const rejected=assert.rejects(one,{name:'AbortError'});await new Promise(r=>setImmediate(r));a.abort();release();await rejected;
 assert.equal((await two).length,1);await getMarcelStopsIndex('2026-10-11');assert.equal(calls,1);
});
