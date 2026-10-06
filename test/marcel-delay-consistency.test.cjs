const {test}=require('node:test');const assert=require('node:assert/strict');const loadTs=require('./load-ts.cjs');
const domain=loadTs('components/stops-panel/stop-domain.ts',{'@/lib/pks-client':{}});
const {busDelayMinutes}=loadTs('lib/bus-punctuality.ts');
const {marcelDepartureFromVehicle}=loadTs('lib/marcel-stop-punctuality.ts');
const {getCachedBusIcon}=loadTs('components/BusMap.tsx',{'react-leaflet':{},leaflet:{divIcon:options=>options},'leaflet/dist/leaflet.css':{},'@/lib/pks-client':{}});

test('Marcel 4-versus-5 case, rounding boundaries and icon cache agree with stop departures',()=>{
  for(const seconds of [-280,-269,-271,-270,269,270,271,59,-59]){
    const minutes=busDelayMinutes(seconds);
    const row=domain.departureFromMarcelCourseStop({idKu:42,nazTr:'Sanok-Rzeszów'},{kol:2,godz:'15:45'},'2026-10-06',0,seconds);
    assert.equal(row.delayMins,minutes);
    const html=getCachedBusIcon('M','marcel_rounding',seconds,false,'#68c44a',0,true,'marcel','',16).html;
    if(minutes)assert.match(html,new RegExp(`${minutes>0?'\\+':'-'}${Math.abs(minutes)}(?:\\s|<)`));
    else assert.doesNotMatch(html,/>\s*[+-]\d+\s*<\/div>/);
  }
  assert.equal(busDelayMinutes(-280),-5);
  assert.equal(busDelayMinutes(280),5);
  assert.equal(busDelayMinutes(-270),-5);
});

test('a retained map snapshot never overwrites a fresh stop estimate or operator prediction',()=>{
  const plannedAtMs=Date.parse('2026-10-06T13:45:00Z');
  const bus={id:'marcel_42',provider:'marcel',tripId:'42',status:'active',dataAgeSec:0,delay:-240,
    routeStops:[{id:1,planned:new Date(plannedAtMs).toISOString()}]};
  for(const estimated of [true,false]){
    const departure={id:'test',line:'M',carrier:{id:'marcel'},courseId:'42',plannedAtMs,
      realAtMs:plannedAtMs-280_000,realtimeSource:'vehicle-feed',delayEstimated:estimated,delayMins:-5};
    assert.equal(marcelDepartureFromVehicle(departure,[bus]),departure);
  }
});

for(const gpsTimestamp of [true,false])test(`Marcel map, details and stops share positions and GPS time (${gpsTimestamp?'timestamp':'receipt time'})`,async()=>{
  const originalFetch=global.fetch,originalNow=Date.now;let now=Date.parse('2026-10-06T13:33:40Z'),positionCalls=0;
  Date.now=()=>now;
  const stops=[{kol:1,nazPr:'Początek',szGps:50,dlGps:22,godz:'15:30'},{kol:2,nazPr:'Koniec',szGps:50.1,dlGps:22.1,godz:'15:50'}];
  const raw=()=>[{idKu:42,szGps:50.0383333333,dlGps:22.0383333333,nazTr:'Sanok-Rzeszów',...(gpsTimestamp?{lastUpdate:new Date(now-40_000).toISOString()}: {})}];
  global.fetch=async url=>{if(String(url).includes('/kurs/'))return new Response(JSON.stringify(stops));positionCalls++;return new Response(JSON.stringify(raw()));};
  try{
    const api=loadTs('lib/pks-client.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}}});
    const options={pkpViewport:{bbox:[21.9,49.9,22.2,50.2]}};
    const [fleet,positions]=await Promise.all([api.fetchVehiclesClient(true,['marcel'],options),api.fetchMarcelLivePositionsClient()]);
    await new Promise(resolve=>setImmediate(resolve));
    const marker=api.withCachedMarcelDelay(fleet[0],now+30_000);
    const delay=api.estimateMarcelCourseDelay(42,stops,'2026-10-06',positions);
    const details=await api.fetchVehicleDetailsClient('marcel','marcel_42');
    assert.equal(positionCalls,1);
    assert.equal(marker.positionObservedAtMs,positions[0].observedAtMs);
    assert.equal(marker.delay,delay);assert.equal(details.delay,delay);
    assert.equal(api.withCachedMarcelDelay(fleet[0],now+50_000).delay,delay,'elapsed wall time must not change a fixed GPS estimate');
    if(gpsTimestamp)assert.equal(delay,-280);
    const departure=domain.departureFromMarcelCourseStop({idKu:42,nazTr:'Sanok-Rzeszów'},stops[1],'2026-10-06',0,delay);
    assert.equal(departure.delayMins,busDelayMinutes(marker.delay));
    now+=11_000;
    const [freshFleet,freshPositions]=await Promise.all([api.fetchVehiclesClient(true,['marcel'],options),api.fetchMarcelLivePositionsClient()]);
    assert.equal(positionCalls,2);
    assert.equal(freshFleet[0].positionObservedAtMs,freshPositions[0].observedAtMs);
    assert.equal(freshFleet[0].delay,api.estimateMarcelCourseDelay(42,stops,'2026-10-06',freshPositions));
  }finally{global.fetch=originalFetch;Date.now=originalNow;}
});

test('aborting a map consumer leaves the shared Marcel stop request usable; failures retry',async()=>{
  const originalFetch=global.fetch,originalNow=Date.now;let release,calls=0,now=Date.now();Date.now=()=>now;
  global.fetch=()=>{calls++;return new Promise(resolve=>{release=()=>resolve(new Response('[]'));});};
  try{
    const api=loadTs('lib/pks-client.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}}},'\nexport { fetchMarcelVehiclesDirect };');
    const controller=new AbortController();
    const map=api.fetchMarcelVehiclesDirect(true,controller.signal);
    const stopRequest=api.fetchMarcelLivePositionsClient();
    controller.abort();await assert.rejects(map,{name:'AbortError'});
    release();
    assert.deepEqual(await stopRequest,[]);assert.equal(calls,1);
    now+=11_000;
    global.fetch=async()=>{calls++;return new Response('',{status:503});};
    await assert.rejects(api.fetchMarcelLivePositionsClient());
    global.fetch=async()=>{calls++;return new Response('[]');};
    assert.deepEqual(await api.fetchMarcelLivePositionsClient(),[]);
  }finally{global.fetch=originalFetch;Date.now=originalNow;}
});
