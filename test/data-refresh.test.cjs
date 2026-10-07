const {test}=require('node:test');const assert=require('node:assert/strict');const load=require('./load-ts.cjs');
const {foregroundRefresh}=load('lib/foreground-refresh.ts');
test('refresh loop never reschedules after disposal during an in-flight request',async()=>{
 const timers=new Map();let next=0,resolve,calls=0;
 const loop=foregroundRefresh(()=>{calls++;return new Promise(done=>resolve=done);},()=>true,10,(fn)=>{const id=++next;timers.set(id,fn);return id;},id=>timers.delete(id));
 const fn=[...timers.values()][0];fn();loop.refresh();assert.equal(calls,1);loop.dispose();resolve();await new Promise(done=>setImmediate(done));assert.equal(timers.size,0);
});
test('background pauses refresh and visibility resumes exactly one request',async()=>{
 let visible=false,calls=0;const timers=new Map();let id=0;
 const loop=foregroundRefresh(async()=>{calls++;},()=>visible,10,fn=>{timers.set(++id,fn);return id;},id=>timers.delete(id));
 [...timers.values()][0]();await new Promise(done=>setImmediate(done));assert.equal(calls,0);
 visible=true;loop.visibilityChanged();await new Promise(done=>setImmediate(done));assert.equal(calls,1);
 visible=false;loop.visibilityChanged();assert.equal(timers.size,0);loop.dispose();
});
test('fast and incremental departures appear before the slow provider finishes; failed cache has unknown punctuality',async()=>{
 const {StopTimetableStore}=load('lib/stop-timetable-store.ts');const store=new StopTimetableStore();let finishSlow;const updates=[];
 const row={id:'a',line:'1',direction:'Centre',time:'12:00',status:'on_time',plannedAtMs:Date.now()+60000};
 const slow={key:'slow',label:'Slow',load:async partial=>{partial({departures:[{...row,id:'b'}]});return new Promise(resolve=>finishSlow=resolve);}};
 const request=store.load([{key:'fast',label:'Fast',load:async()=>({departures:[row]})},slow],result=>updates.push(result.departures.map(row=>row.id)));
 await new Promise(done=>setImmediate(done));assert.ok(updates.some(ids=>ids.includes('a')));assert.ok(updates.some(ids=>ids.includes('b')));
 finishSlow({departures:[{...row,id:'b'}]});assert.equal((await request).departures.length,2);
 const fallback=await store.load([{key:'fast',label:'Fast',load:async()=>{throw Error('offline');}}]);assert.equal(fallback.departures[0].status,'unknown');assert.equal(fallback.departures[0].delayMins,undefined);
});
test('Marcel timetable cache survives another adapter instance, validates payloads, expires and retries failed requests',async()=>{
 const saved=new Map();const storage={'../timetable-cache':{readTimetableCache:async key=>saved.get(key),writeTimetableCache:async(key,value)=>saved.set(key,value)}};
 const {createMarcelTimetableApi}=load('lib/providers/marcel-timetable.ts',storage);let calls=0;
 const request=async()=>{calls++;return [{idKu:42}];};
 await createMarcelTimetableApi(request,'https://marcel.example').fetchMarcelCoursesClient('1','2026-10-07');
 await createMarcelTimetableApi(request,'https://marcel.example').fetchMarcelCoursesClient('1','2026-10-07');assert.equal(calls,1);
 for(const value of saved.values())value.expiresAt=0;
 await createMarcelTimetableApi(request,'https://marcel.example').fetchMarcelCoursesClient('1','2026-10-07');assert.equal(calls,2);
 let bad=true;const api=createMarcelTimetableApi(async()=>bad?{error:'invalid'}:[{idKu:43}],'https://marcel.example');
 await assert.rejects(api.fetchMarcelCoursesClient('2','2026-10-07'),/nieprawidłowa/);bad=false;assert.equal((await api.fetchMarcelCoursesClient('2','2026-10-07'))[0].idKu,43);
});
test('Marcel partial failure keeps good departures instead of rejecting the operator',async()=>{
 const domain={splitCsvValues:value=>value?value.split(','):[],mergeCsvValues:(...values)=>values.filter(Boolean).join(','),stopPreciseNameKey:value=>value,marcelCourseStopIndexKey:point=>point.nazPr,marcelCourseStopMatchKey:point=>point.nazPr,departureFromMarcelCourseStop:(course,point)=>({id:String(course.idKu),line:'M',time:point.godz})};
 const api={fetchMarcelRoutesClient:async()=>[{idTr:1}],fetchMarcelCoursesClient:async()=>[{idKu:1},{idKu:2}],fetchMarcelPublicCourseStopsClient:async id=>{if(id===2)throw Error('offline');return [{nazPr:'A',godz:'12:00'},{nazPr:'B',godz:'12:10'}];},fetchMarcelLivePositionsClient:async()=>[],estimateMarcelCourseDelay:()=>undefined};
 const {loadMarcelStopDepartures}=load('lib/providers/marcel-departures.ts',{'../pks-client':api,'@/components/stops-panel/stop-domain':domain});const updates=[];
 const result=await loadMarcelStopDepartures({id:'a',name:'A',providerStopIds:{}},'2026-10-07',true,value=>updates.push(value));
 assert.equal(result.departures.length,1);assert.match(result.warning,/część/);assert.equal(updates.length,1);
});
test('virtual list bounds rendered rows even for 10,000 stops, including measured heights',()=>{
 const {virtualListWindow}=load('lib/virtual-list.ts');const keys=Array.from({length:10000},(_,i)=>String(i));const sizes=new Map([['0',250],['1',80]]);
 const top=virtualListWindow(keys,sizes,0,800);assert.ok(top.end-top.start<20);assert.equal(top.offsets[1],262);
 const far=virtualListWindow(keys,sizes,500000,800);assert.ok(far.start>3000);assert.ok(far.end-far.start<20);assert.equal(far.total,top.total);
});
test('map uses the same MPK minute precision and excludes truly passed departures',()=>{
 const {mapStopDepartureRows}=load('lib/map-stop-departures.ts');const now=Date.parse('2026-10-07T10:18:20Z'),time=Date.parse('2026-10-07T10:21:00Z');
 const row={id:'1',line:'46',direction:'Centre',time:'12:21',plannedAtMs:time,realAtMs:time,status:'on_time',carrier:{id:'mpk'},realtimeSource:'stop-board',boardTimePrecisionMs:60000};
 assert.equal(mapStopDepartureRows([row],[],now)[0].time,'3 min');assert.equal(mapStopDepartureRows([{...row,boardIsPast:true}],[],now).length,0);
});
test('diagnostics retain the last success when a new failure arrives and ignore cancellation',async()=>{
 const api=load('lib/transport-diagnostics.ts');await api.measuredTransport('marcel','vehicles',async()=>[1,2],rows=>rows.length);
 await assert.rejects(api.measuredTransport('marcel','vehicles',async()=>{throw Error('offline');}));const row=api.getTransportDiagnostics()[0];assert.equal(row.count,2);assert.ok(row.lastSuccess);assert.equal(row.error,'offline');
 await assert.rejects(api.measuredTransport('marcel','vehicles',async()=>{throw Object.assign(Error('cancel'),{name:'AbortError'});}));assert.equal(api.getTransportDiagnostics()[0].error,'offline');
});
test('history pages merge without duplicates, preferring current records',()=>{
 const {mergeMaintenanceHistory}=load('lib/maintenance-history.ts');const first={id:'a',createdAtMs:10,summary:'fresh'},old={...first,summary:'old'};
 assert.deepEqual(mergeMaintenanceHistory([first],[old,{id:'b',createdAtMs:5}]).map(row=>row.summary),['fresh',undefined]);
});
