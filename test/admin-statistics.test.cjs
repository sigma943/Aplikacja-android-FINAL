const {test}=require('node:test');
const assert=require('node:assert/strict');
const loadTs=require('./load-ts.cjs');
const stats=loadTs('lib/admin/statistics.ts');
const now=Date.parse('2026-10-08T12:00:00Z');

test('statistics deduplicate installations, preserve first login and ignore future and banned activity',()=>{
  const devices=[
    {id:'a',installationId:'one',firstLogin:'2026-10-02T10:00:00Z',lastSeenAt:'2026-10-04T10:00:00Z',deviceInfo:'Android',verified:false},
    {id:'a-new',installationId:'one',firstLogin:'2026-10-07T10:00:00Z',lastSeenAt:{toDate:()=>new Date('2026-10-08T10:00:00Z')},deviceInfo:'Android',verified:true},
    {id:'b',firstLogin:'2026-10-08T10:00:00Z',lastSeenAt:{seconds:Date.parse('2026-10-08T11:00:00Z')/1000},deviceInfo:'iPhone',status:'banned'},
    {id:'c',firstLogin:'2026-10-01T10:00:00Z',lastSeenAt:'2026-10-10T10:00:00Z',deviceInfo:'Windows'},
    {id:'d',firstLogin:'invalid',lastSeenAt:null},
  ];
  const result=stats.deviceStatistics(devices,7,now);
  assert.equal(result.total,4);assert.equal(result.newDevices,2);assert.equal(result.previousNew,1);
  assert.equal(result.active,1);assert.equal(result.verified,1);assert.equal(result.banned,1);assert.equal(result.unknownFirst,1);
  assert.equal(result.series[0].date,'2026-10-02');assert.equal(result.series[0].value,1);
  assert.deepEqual(result.platforms,{Android:1,iOS:1,'Komputer / przeglądarka':1,'Nieznany system':1});
});
test('statistics use Warsaw calendar days across midnight and DST without overlap',()=>{
  const midnight=Date.parse('2026-03-30T22:30:00Z');
  assert.deepEqual(stats.statisticsDays(1,midnight),['2026-03-31']);
  const result=stats.deviceStatistics([{id:'a',firstLogin:'2026-03-28T23:30:00Z'}],1,Date.parse('2026-03-29T22:00:00Z'));
  assert.equal(result.previousNew,1);assert.equal(result.newDevices,0);
  assert.equal(stats.statisticsTime({seconds:Infinity}),null);
  assert.equal(stats.statisticsTime({toDate:()=>{throw Error('bad timestamp');}}),null);
  assert.equal(stats.statisticsTime('2026-10-08'),Date.parse('2026-10-07T22:00:00Z'));
});
test('API charts leave unknown earlier days empty and aggregate request errors and latency',()=>{
  const result=stats.apiStatistics([{date:'2026-10-08',providers:{pks:{requests:8,errors:1,latencyMs:1600},marcel:{requests:2,errors:1,latencyMs:800}}}],7,now,now);
  assert.equal(result.requests,10);assert.equal(result.errors,2);assert.equal(result.successRate,80);assert.equal(result.averageMs,240);
  assert.ok(result.series.slice(0,-1).every(day=>day.value===null));assert.equal(result.series.at(-1).value,10);
  assert.ok(stats.apiStatistics([],7,null,now).series.every(day=>day.value===null));
});
test('statistics discard corrupt caches and retain only 90 days of valid counters',()=>{
  const api=loadTs('lib/api-statistics.ts');
  assert.equal(api.readApiStatistics({version:1,startedAt:now+1,days:[]},now).startedAt,null);
  const cache=api.readApiStatistics({version:1,startedAt:now-100*86400000,days:[
    {date:'2026-01-01',providers:{pks:{requests:3,errors:0,latencyMs:3}}},
    {date:'2026-10-08',providers:{pks:{requests:3,errors:4,latencyMs:3},marcel:{requests:4,errors:1,latencyMs:400}}},
    {date:'2026-10-09',providers:{marcel:{requests:4,errors:1,latencyMs:400}}},
  ]},now);
  assert.equal(cache.days.length,1);assert.equal(cache.days[0].providers.pks,undefined);assert.equal(cache.days[0].providers.marcel.requests,4);
});
test('collection is passive, batches writes, skips operations and native widget runner',()=>{
  const api=loadTs('lib/api-statistics.ts');const previous=global.window,originalTimer=global.setTimeout,originalClear=global.clearTimeout;
  let writes=0,timers=0;const storage=new Map();
  global.window={localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{writes++;storage.set(k,v);}}};
  global.setTimeout=()=>{timers++;return 1;};global.clearTimeout=()=>{};
  const measurement={provider:'pks',kind:'departures',latencyMs:120,failed:false,scope:'request'};
  try{
    api.collectApiMeasurement({...measurement,scope:'operation'});assert.equal(api.getApiStatistics().startedAt,null);
    window.NativeWidget={};api.collectApiMeasurement(measurement);assert.equal(api.getApiStatistics().startedAt,null);delete window.NativeWidget;
    const unsubscribe=api.subscribeApiStatistics(()=>{throw Error('bad observer');});
    api.collectApiMeasurement(measurement);api.collectApiMeasurement({...measurement,failed:true});unsubscribe();
    assert.equal(writes,0);assert.equal(timers,1);const bucket=api.getApiStatistics().days[0].providers.pks;
    assert.deepEqual(bucket,{requests:2,errors:1,latencyMs:240});
    api.saveApiStatistics();assert.equal(writes,1);api.saveApiStatistics();assert.equal(writes,1);
    window.localStorage.setItem=()=>{throw Error('storage unavailable');};api.collectApiMeasurement(measurement);assert.doesNotThrow(()=>api.saveApiStatistics());assert.equal(api.getApiStatistics().days[0].providers.pks.requests,3);
  }finally{global.window=previous;global.setTimeout=originalTimer;global.clearTimeout=originalClear;}
});
test('measurement observers cannot alter transport results, errors or intentional cancellations',async()=>{
  const diagnostic=loadTs('lib/transport-diagnostics.ts'),measurements=[];
  const stop=diagnostic.subscribeTransportMeasurements(event=>measurements.push(event));
  const bad=diagnostic.subscribeTransportMeasurements(()=>{throw Error('observer failure');});
  try{
    const value={vehicles:[]};assert.equal(await diagnostic.measuredTransport('pks','vehicles',()=>Promise.resolve(value),undefined,undefined,'request'),value);
    const error=Error('HTTP 503');await assert.rejects(diagnostic.measuredTransport('pks','vehicles',()=>Promise.reject(error),undefined,undefined,'request'),e=>e===error);
    const abort=new DOMException('Cancelled','AbortError');await assert.rejects(diagnostic.measuredTransport('pks','vehicles',()=>Promise.reject(abort),undefined,undefined,'request'),e=>e===abort);
    assert.equal(measurements.length,2);assert.equal(measurements[0].failed,false);assert.equal(measurements[1].failed,true);
  }finally{stop();bad();}
});
test('nested route operations contribute exactly one real HTTP measurement',async()=>{
  const api=loadTs('lib/api-statistics.ts'),diagnostic=loadTs('lib/transport-diagnostics.ts'),previous=global.window;
  global.window={localStorage:{getItem:()=>null,setItem:()=>{}}};const unsubscribe=diagnostic.subscribeTransportMeasurements(api.collectApiMeasurement);
  try{
    assert.equal(await diagnostic.measuredTransport('marcel','geometry',()=>diagnostic.measuredTransport('marcel','catalog',async()=>42,undefined,undefined,'request')),42);
    assert.equal(api.getApiStatistics().days[0].providers.marcel.requests,1);
  }finally{api.saveApiStatistics();unsubscribe();global.window=previous;}
});

test('request classification distinguishes PKS hosted by MPK and MPK trip and XML endpoints',()=>{
  const {diagnosticRequest}=loadTs('lib/transport-diagnostics.ts');
  assert.equal(diagnosticRequest('https://www.mpkrzeszow.pl/pks/get_vehicles.php').provider,'pks');
  for(const url of ['https://www.mpkrzeszow.pl/brygady/get_trip_stops_advanced.php','https://www.mpkrzeszow.pl/mpk/vehicles_proxy.php','https://example.com/vehicles?providers=mpk_rzeszow'])assert.equal(diagnosticRequest(url).provider,'mpk_rzeszow');
  assert.equal(diagnosticRequest('https://api-site.marcel-bus.pl/client/api/trasy/kurs/12').provider,'marcel');
  assert.equal(diagnosticRequest('https://router.project-osrm.org/route/v1/driving/21,50;22,51'),null);
});

test('Android statistics export uses the native picker and propagates save errors',async()=>{
  const calls=[],plugin={save:async options=>{calls.push(options);return {saved:false};}};
  const helper=loadTs('lib/admin/statistics-export.ts',{'@capacitor/core':{Capacitor:{getPlatform:()=> 'android'},registerPlugin:name=>{assert.equal(name,'AdminStatisticsExport');return plugin;}}});
  assert.deepEqual(await helper.saveStatisticsCsv('date;count','pks-live-statystyki-7-dni.csv'),{saved:false});
  assert.deepEqual(calls,[{content:'date;count',filename:'pks-live-statystyki-7-dni.csv'}]);
  plugin.save=async()=>{throw Error('Save failed');};await assert.rejects(helper.saveStatisticsCsv('csv','pks-live-statystyki-7-dni.csv'),/Save failed/);
});
