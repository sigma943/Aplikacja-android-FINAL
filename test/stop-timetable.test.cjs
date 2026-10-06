const {test} = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const {StopTimetableStore,stopRequestKey,limitTimetableRequest} = loadTs('lib/stop-timetable-store.ts');
const fixture = require('./fixtures/pks-baryczka-2026-10-05.json');
const client = () => loadTs('lib/pks-client.ts', {'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}}});

test('Baryczka 69 has line 108 and full Monday departures via same-origin PKS proxy', async()=>{
  const original=global.fetch; const calls=[];
  global.fetch=async url=>{calls.push(String(url));return new Response(JSON.stringify(String(url).includes('nearest-departures')?{journeys:[]}:fixture));};
  try {
    const result=await client().fetchDeparturesClient('2083','1054','69','2026-10-05');
    assert.ok(result.journeys.length>=18);
    assert.ok(result.journeys.every(row=>row.line_name==='108'));
    assert.ok(result.journeys.some(row=>row.timetable_time==='2026-10-05T10:41:00.000Z'));
    assert.ok(result.journeys.every(row=>row.route_description==='Rzeszów D.A.'));
    assert.ok(calls.every(url=>url.startsWith('/api/pks/einfo/')));
  } finally {global.fetch=original;}
});

test('PKS fetch failures are errors, never successful empty departures',async()=>{
  const original=global.fetch;global.fetch=async()=>{throw Error('offline');};
  try {await assert.rejects(client().fetchDeparturesClient('2083','1054','69','2026-10-05'));}
  finally{global.fetch=original;}
});

test('complete line index is independent of vehicles and distinguishes stop sides',()=>{
  const {lines}=require('../public/data/pks-stop-lines.json');
  assert.deepEqual(lines['2083'],['108']);
  assert.deepEqual(lines['2082'],['108']);
  assert.equal(Object.keys(lines).length,1800);
  assert.ok(Object.values(lines).some(lines=>lines.includes('108')&&lines.includes('288')));
});

const row={id:'trip',line:'108',direction:'Rzeszów',time:'12:41',status:'on_time',carrier:{id:'pks'},plannedAtMs:1791196860000};
test('independent provider failure keeps successful rows, and last complete schedule survives refresh failure',async()=>{
  const store=new StopTimetableStore();
  const source={key:'pks:2083:2026-10-05',label:'PKS',load:async()=>({departures:[row]})};
  await store.load([source]);
  const failure={...source,load:async()=>{throw Error('offline');}};
  const result=await store.load([failure,{key:'mpk:42:2026-10-05',label:'MPK',load:async()=>{throw Error('offline');}}]);
  assert.equal(result.departures.length,1);
  assert.equal(result.warnings.length,2);
  assert.equal(result.departures[0].realtimeSource,undefined);
  await assert.rejects(store.load([{...failure,key:'pks:2083:2026-10-06'}]));
});

test('empty success clears old trips; simultaneous consumers share one source request',async()=>{
  const store=new StopTimetableStore();let calls=0,resolve;
  const source={key:'a',label:'PKS',load:()=>{calls++;return new Promise(r=>resolve=r);}};
  const a=store.load([source]),b=store.load([source]);
  resolve({departures:[row]});await Promise.all([a,b]);assert.equal(calls,1);
  const result=await store.load([{...source,load:async()=>({departures:[]})}]);
  assert.deepEqual(result.departures,[]);assert.deepEqual(result.warnings,[]);
});

test('favorites and badge changes do not change departure request identity',()=>{
  const stop={id:'2083',providerStopIds:{pks:'2083',pksLines:'108'},pksStopPoints:[{id:'2083',areaId:'1054',code:'69'}]};
  assert.equal(stopRequestKey(stop),stopRequestKey({...stop,isFavorite:true,lines:['288'],providerStopIds:{pksLines:'108,288',pks:'2083'}}));
  assert.notEqual(stopRequestKey(stop),stopRequestKey({...stop,code:'96'}));
});

test('provider request concurrency is bounded without dropping queued requests',async()=>{
  let active=0,maximum=0;
  const results=await Promise.all(Array.from({length:21},(_,id)=>limitTimetableRequest(async()=>{
    active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,2));active--;return id;
  })));
  assert.equal(maximum,6);assert.equal(results.length,21);
});

test('Marcel errors are evicted and retried instead of cached as empty arrays',async()=>{
  const original=global.fetch;let calls=0;
  global.fetch=async()=>{if(++calls===1)throw Error('offline');return new Response(JSON.stringify([{idKu:42}]));};
  try {const api=client();await assert.rejects(api.fetchMarcelCoursesClient('1','2026-10-05'));assert.equal((await api.fetchMarcelCoursesClient('1','2026-10-05'))[0].idKu,42);assert.equal(calls,2);}
  finally{global.fetch=original;}
});
