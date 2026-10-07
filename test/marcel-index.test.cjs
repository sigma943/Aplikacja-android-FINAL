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
