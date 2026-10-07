const {test}=require('node:test');
const assert=require('node:assert/strict');
const loadTs=require('./load-ts.cjs');
const overrides={'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}}};
const points=[{kol:1,nazPr:'Start',nazMi:'Miasto',szGps:50,dlGps:22,godz:'13:00'},
  {kol:2,nazPr:'Cel',nazMi:'Miasto',szGps:50.1,dlGps:22.1,godz:'13:20'},
  {kol:3,nazPr:'Koniec',nazMi:'Miasto',szGps:50.2,dlGps:22.2,godz:'13:40'}];
function clock(){
  const OriginalDate=Date;let now=Date.parse('2026-10-07T11:08:00Z');
  global.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
  return {advance:ms=>{now+=ms;},restore:()=>{global.Date=OriginalDate;}};
}

test('visible Marcel badges load without selecting a bus and reuse the stop timetable request',async()=>{
  const oldFetch=global.fetch,time=clock();let calls=0,release;
  global.fetch=async url=>{
    if(String(url).includes('/kurs/')){calls++;return new Promise(resolve=>{release=()=>resolve(new Response(JSON.stringify(points)));});}
    return new Response(JSON.stringify([{idKu:42,szGps:50.05,dlGps:22.05}]));
  };
  try{
    const api=loadTs('lib/pks-client.ts',overrides);
    const fleet=await api.fetchVehiclesClient(true,['marcel']);
    const stop=api.fetchMarcelPublicCourseStopsClient(42);
    const resolved=new Promise(resolve=>{const unsubscribe=api.subscribeMarcelCourseDelays(id=>{if(id==='42'){unsubscribe();resolve();}});});
    api.warmMarcelBadgeCourses(fleet,[21.9,49.9,22.3,50.3]);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls,1,'map and stop must not download the same course twice');
    release();await Promise.all([stop,resolved]);
    const marker=api.withCachedMarcelDelay(fleet[0]);
    assert.ok(Number.isFinite(marker.delay));
    assert.equal(marker.delay,api.estimateMarcelCourseDelay(42,points,'2026-10-07',await api.fetchMarcelLivePositionsClient()));
    await api.fetchVehicleDetailsClient('marcel','marcel_42');
    assert.equal(calls,1,'opening bus details must use the shared course cache');
  }finally{global.fetch=oldFetch;time.restore();}
});

test('a stop refresh updates a retained map marker from the same latest GPS snapshot',async()=>{
  const oldFetch=global.fetch,time=clock();let offset=0;
  global.fetch=async url=>new Response(JSON.stringify(String(url).includes('/kurs/')?points:
    [{idKu:42,szGps:50.05+offset,dlGps:22.05+offset}]));
  try{
    const api=loadTs('lib/pks-client.ts',overrides);
    const fleet=await api.fetchVehiclesClient(true,['marcel']);await api.fetchMarcelPublicCourseStopsClient(42);
    const first=api.withCachedMarcelDelay(fleet[0]);
    time.advance(11_000);offset=.01;
    const positions=await api.fetchMarcelLivePositionsClient();
    const marker=api.withCachedMarcelDelay(fleet[0]);
    assert.notEqual(marker.delay,first.delay);
    assert.equal(marker.delay,api.estimateMarcelCourseDelay(42,points,'2026-10-07',positions));
    assert.equal(marker.positionObservedAtMs,positions[0].observedAtMs);
    const helper=loadTs('lib/marcel-stop-punctuality.ts',{'./pks-client':api});
    const row={id:'42:2',line:'M',carrier:{id:'marcel'},courseId:'42',plannedAtMs:Date.parse('2026-10-07T11:20:00Z'),
      realtimeSource:'position-estimate',realtimeObservedAtMs:first.positionObservedAtMs,delayMins:-2};
    const departure=helper.marcelDepartureFromVehicle(row,fleet);
    const {busDelayMinutes}=loadTs('lib/bus-punctuality.ts');
    assert.equal(departure.delayMins,busDelayMinutes(marker.delay));
    assert.equal(departure.realtimeObservedAtMs,marker.positionObservedAtMs);
    const newer={...row,realtimeObservedAtMs:marker.positionObservedAtMs+10_000,delayMins:5};
    assert.equal(helper.marcelDepartureFromVehicle(newer,fleet),newer,'older GPS must not overwrite a newer estimate');
  }finally{global.fetch=oldFetch;time.restore();}
});

test('Marcel timetable is published while GPS is still pending, and duplicate route courses are fetched once',async()=>{
  const time=clock();let releaseGps,courseCalls=0;
  const positions=new Promise(resolve=>{releaseGps=resolve;});
  const client={fetchMarcelCoursesClient:async()=>[{idKu:42,godz:'13:00',nazTr:'Miasto-Cel'}],
    fetchMarcelPublicCourseStopsClient:async()=>{courseCalls++;return points;},
    fetchMarcelLivePositionsClient:()=>positions,estimateMarcelCourseDelay:()=>120};
  try{
    const {loadMarcelStopDepartures}=loadTs('lib/providers/marcel-departures.ts',{'../pks-client':client});
    const seen=[];
    const request=loadMarcelStopDepartures({id:'cel',name:'Cel',providerStopIds:{marcelRouteIds:'1,2',marcelMatchKeys:'cel'}},'2026-10-07',true,result=>seen.push(result));
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(courseCalls,1);
    assert.equal(seen[0].departures.length,1,'first departure must not wait for the live feed');
    assert.equal(seen[0].departures[0].realtimeSource,undefined);
    releaseGps([{tripId:'42',observedAtMs:Date.now()}]);
    const result=await request;
    assert.equal(result.departures[0].delayMins,2);
    assert.equal(result.departures[0].realtimeSource,'position-estimate');
    assert.equal(result.departures[0].realtimeObservedAtMs,Date.now());
  }finally{time.restore();}
});

test('cached course clock times are rebuilt for the new Warsaw service date',async()=>{
  const oldFetch=global.fetch,time=clock();let courseCalls=0;
  global.fetch=async url=>{if(String(url).includes('/kurs/'))courseCalls++;return new Response(JSON.stringify(String(url).includes('/kurs/')?points:[{idKu:42,szGps:50.05,dlGps:22.05,lastUpdate:new Date().toISOString()}]));};
  try{
    const api=loadTs('lib/pks-client.ts',overrides);
    const first=await api.fetchVehicleDetailsClient('marcel','marcel_42');
    time.advance(24*3600_000);
    const next=await api.fetchVehicleDetailsClient('marcel','marcel_42');
    assert.equal(Date.parse(next.routeStops[0].planned)-Date.parse(first.routeStops[0].planned),24*3600_000);
    assert.equal(next.delay,first.delay);
  }finally{global.fetch=oldFetch;time.restore();}
});
