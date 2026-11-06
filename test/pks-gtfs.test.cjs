const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),{gunzipSync}=require('zlib'),load=require('./load-ts.cjs'),fixture=require('./pks-gtfs-fixtures.cjs');
const api=load('lib/pks-gtfs.ts');
test('new GTFS courses, calendar exceptions, platform identities and withdrawal replace the old schedule',()=>{
 const first=api.parsePksGtfs(fixture(1)),next=api.parsePksGtfs(fixture(2));
 const base={'777':{n:'Unrelated old EINFO stop 01',lat:50,lon:22,code:'01',areaId:'other'}};
 const index=api.indexPksGtfs(first,base);assert.equal(index.stops['777'],base['777']);assert.ok(index.stops['gtfs:777']);
 assert.deepEqual(index.lines['gtfs:777'],['108','109']);
 const initial=api.pksGtfsDepartures(first,index.byStop['gtfs:777'],'2026-11-04');assert.deepEqual(initial.map(r=>r.line_name),['108','109']);
 assert.ok(initial.every(r=>r.journey_id.startsWith('gtfs:')),'GTFS trip numbers cannot impersonate technical journey IDs');
 assert.equal(api.pksGtfsDepartures(first,['778'],'2026-11-04').length,0,'no boarding at arrival-only terminal');
 assert.equal(api.pksGtfsDepartures(first,['777'],'2026-11-11').length,0,'holiday removal');
 assert.equal(api.pksGtfsDepartures(first,['777'],'2026-11-07').length,2,'exception adds Saturday service');
 assert.equal(api.pksGtfsDepartures(first,['777'],'2026-11-08').length,0,'normal Sunday');
 assert.deepEqual(api.pksGtfsDepartures(next,['777'],'2026-11-04').map(r=>r.line_name),['109','245']);
 assert.notEqual(first.revision,next.revision);
});
test('CSV handles BOM, commas, escaped quotes and newlines; incomplete archives are rejected',()=>{
 assert.deepEqual(api.gtfsCsv('\ufeffid,name\r\n1,"A, B"\r\n2,"Line\n""two"""\n'),[{id:'1',name:'A, B'},{id:'2',name:'Line\n"two"'}]);
 assert.throws(()=>api.gtfsCsv('id,name\n1,"broken'));
 assert.throws(()=>api.parsePksGtfs(fixture().slice(0,20)));
});
test('packaged fallback includes the real new line 109, Lutcza and complete valid timetables',()=>{
 const feed=JSON.parse(gunzipSync(fs.readFileSync('public/data/journeys/pks.json.gz')));
 const valid=load('lib/journey-feed-validation.ts').normalizeJourneyFeed(feed,'pks');assert.deepEqual(valid.diagnostics,[]);
 assert.equal(feed.trips.filter(t=>t[1]==='109').length,10);
 const lutcza=Object.entries(feed.stops).filter(([,s])=>/lutcza/i.test(s.name));assert.ok(lutcza.length>=9);
 const rows=lutcza.flatMap(([id])=>api.pksGtfsDepartures(feed,[id],'2026-11-04'));assert.ok(rows.some(r=>r.line_name==='109'));
});
test('native updater atomically replaces versions, sends validators and preserves the good snapshot on failures',async()=>{
 const oldFetch=global.fetch,oldNow=Date.now;let at=oldNow(),version=1,status=200,requests=[];Date.now=()=>at;
 try{
  global.fetch=async url=>({ok:String(url).endsWith('.gz'),arrayBuffer:async()=>Buffer.from(JSON.stringify(api.parsePksGtfs(fixture(1))))});
  const runtime=load('lib/pks-gtfs-runtime.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>true},CapacitorHttp:{request:async options=>{requests.push(options);return{status,headers:{ETag:'"v'+version+'"'},data:Buffer.from(version===3?Buffer.from('broken'):fixture(version)).toString('base64')};}}},'./app-activity':{isAppVisible:()=>true,observeAppActivity:()=>()=>{}}});
  await runtime.loadPksGtfs();await runtime.refreshPksGtfs(true);
  const first=runtime.peekPksGtfs();assert.ok(first.trips.some(t=>t[1]==='108'));
  version=2;await runtime.refreshPksGtfs(true);assert.equal(runtime.peekPksGtfs(),first,'the first withdrawal response is held');assert.equal(runtime.pksGtfsUpdateStatus(),'confirming');at+=15*60_000;await runtime.refreshPksGtfs(true);const second=runtime.peekPksGtfs();assert.notEqual(second.revision,first.revision);assert.ok(!second.trips.some(t=>t[1]==='108'));assert.ok(second.managedLines.includes('108'),'remember withdrawn managed lines');
  assert.equal(requests.at(-1).responseType,'arraybuffer');assert.ok(requests.at(-1).headers['If-None-Match']);
  assert.deepEqual(runtime.pksGtfsLines()['gtfs:777'],['109','245']);
  status=304;await runtime.refreshPksGtfs(true);assert.equal(runtime.peekPksGtfs(),second);
  status=200;version=3;await runtime.refreshPksGtfs(true);assert.equal(runtime.peekPksGtfs(),second,'bad archive must not erase the usable feed');
  status=503;await runtime.refreshPksGtfs(true);assert.equal(runtime.peekPksGtfs(),second);
 }finally{global.fetch=oldFetch;Date.now=oldNow;}
});
test('physical terminal bays use the current GTFS; withdrawn managed courses cannot return from an old API board',async()=>{
 const oldWindow=global.window;global.window={};
 try{
  const feed=JSON.parse(gunzipSync(fs.readFileSync('public/data/journeys/pks.json.gz')));
  const legacy={journeys:[{journey_id:999,line_name:'108',route_description:'Old',timetable_time:'2026-11-04T09:00:00.000Z'}]};
  const api=load('lib/providers/pks-departures.ts',{'../pks-gtfs-runtime':{loadPksGtfs:async()=>feed,pksGtfsIndex:()=>({byStop:{}})},'../transport/http':{requestEinfoJson:async path=>path.startsWith('stop-point-timetable')?{success:true,items:[]}:legacy}});
  const bay=await api.fetchDeparturesClient('terminal:rzeszow-da:4','1937','4','2026-11-04');
  assert.ok(bay.journeys.some(r=>r.line_name==='232'),'GTFS physical bay 4 is reachable without a technical EINFO ID');
  assert.ok(!bay.journeys.some(r=>r.journey_id===999),'an obsolete course on a managed line cannot be resurrected');
  const removed=await api.fetchDeparturesClient('gtfs:removed','gtfs:removed','1','2026-11-04');assert.deepEqual(removed.journeys,[]);
 }finally{if(oldWindow===undefined)delete global.window;else global.window=oldWindow;}
});

test('Medynia I and Zadwór each keep two platforms and line 202 uses the existing EINFO ID',()=>{
 const feed=JSON.parse(gunzipSync(fs.readFileSync('public/data/journeys/pks.json.gz')));
 const base=require('../public/data/pks-stop-points.json').stops;
 const {indexPksGtfs,pksGtfsDepartures}=load('lib/pks-gtfs.ts');
 const indexed=indexPksGtfs(feed,base);
 for(const [api,gtfs] of [['1353','923'],['1346','924'],['1347','925']]){
  assert.deepEqual(indexed.byStop[api],[gtfs]);
  assert.equal(indexed.stops['gtfs:'+gtfs],undefined);
  assert.equal(indexed.stops[api].lat,feed.stops[gtfs].lat);
  assert.equal(indexed.stops[api].apiLat,base[api].apiLat);
 }
 assert.equal(indexed.stops['1354'].lat,50.180845);
 assert.notEqual(indexed.stops['1354'].lon,indexed.stops['1353'].lon);
 assert.ok(pksGtfsDepartures(feed,indexed.byStop['1353'],'2026-11-06').some(row=>row.line_name==='202'));
 const {buildStopsCatalog}=load('lib/stops-catalog.ts',{'@/lib/pks-client':{}});
 const catalog=buildStopsCatalog(Object.entries(indexed.stops).map(([id,stop])=>({...stop,id,name:stop.n})),[],[],'medynia-physical',true);
 const {visibleMapStops}=load('lib/map-stop-markers.ts');
 assert.deepEqual(visibleMapStops(catalog,[22.1409,50.1737,22.1417,50.1755],19).map(s=>s.id).sort(),['1346','1347']);
 assert.deepEqual(visibleMapStops(catalog,[22.1444,50.1806,22.1452,50.1811],19).map(s=>s.id).sort(),['1353','1354']);
});
