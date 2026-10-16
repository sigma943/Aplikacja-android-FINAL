// Diagnostic measurements only: no timing thresholds and no production changes.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const inspector = require('node:inspector');
const {performance} = require('node:perf_hooks');
const puppeteer = require('puppeteer');
const load = require('./load-ts.cjs');
const directory = path.resolve('test/performance-results');
fs.mkdirSync(directory, {recursive:true});
const report = {environment:{node:process.version, cpuThrottle:4, viewport:'393x851', mockedNetwork:true, mapTilesExcluded:true}, cpu:[], browser:[]};
const percentile = (values, fraction) => values.length ? [...values].sort((a,b)=>a-b)[Math.min(values.length-1, Math.ceil(values.length*fraction)-1)] : 0;
const round = value => +value.toFixed(2);
function benchmark(name, fn, repeats=30) {
  const values=[];
  for(let i=0;i<repeats;i++) {const start=performance.now(); fn(i); values.push(performance.now()-start);}
  report.cpu.push({name, samples:repeats, medianMs:+percentile(values,.5).toFixed(4), p95Ms:+percentile(values,.95).toFixed(4), maxMs:+Math.max(...values).toFixed(4)});
}
async function cpuAudit() {
  const modules=new Map(), overrides={'@/lib/pks-client':{}};
  const catalog=load('lib/stops-catalog.ts',overrides,'',modules);
  const domain=load('components/stops-panel/stop-domain.ts',overrides,'',modules);
  const markers=load('lib/map-stop-markers.ts',overrides,'',modules);
  const positions=load('lib/stop-platform-position.ts',overrides,'',modules);
  const pks=Object.entries(require('../public/data/pks-stop-points.json').stops).map(([id,s])=>({...s,id,name:s.n+' '+s.code,lines:[]}));
  const mpk=Object.entries(require('../public/data/bus-routes/mpk_rzeszow.json').stops).map(([id,s])=>({...s,id,lines:[]}));
  const original=global.fetch;
  try {global.fetch=async()=>({ok:true,json:async()=>require('../public/data/stop-platforms.json')});await positions.loadStopPlatforms();} finally {global.fetch=original;}
  const session=new inspector.Session();session.connect();
  const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(e,r)=>e?reject(e):resolve(r)));
  await post('Profiler.enable');await post('Profiler.start');
  try {
    const platformPoints=require('../public/data/stop-platforms.json').points;
    const prepared=positions.createPlatformIndex?.(platformPoints);
    benchmark('platform index prepare',()=>positions.createPlatformResolver(platformPoints,false,prepared),30);
    benchmark('catalog first build',()=>catalog.buildStopsCatalog(pks,mpk,[],'audit-first'),1);
    benchmark('catalog cold: PKS + MPK',i=>catalog.buildStopsCatalog(pks,mpk,[],'audit-cold-'+i),8);
    const stops=catalog.buildStopsCatalog(pks,mpk,[],'audit-warm');
    const asyncCatalog=load('lib/stops-catalog-async.ts',{'@/lib/pks-client':{},'./stops-catalog-worker-factory':{}},'',modules);
    benchmark('catalog reopen from persistent snapshot',i=>{
      const key='audit-reopen-'+i;
      const snapshot={version:4,rulesVersion:1,catalogKey:key,baseStops:stops,pks,mpk,marcel:[],lines:{},stops};
      if(!asyncCatalog.restoreStopsCatalog?.(snapshot,key))catalog.buildStopsCatalog(pks,mpk,[],key);
    },8);
    catalog.buildStopsCatalog(pks,mpk,[],'audit-warm');
    benchmark('catalog cache hit: PKS + MPK',()=>catalog.buildStopsCatalog(pks,mpk,[],'audit-warm'));
    benchmark('physical map catalog cold',i=>catalog.buildStopsCatalog(pks,mpk,[],'audit-physical-'+i,true),8);
    catalog.buildStopsCatalog(pks,mpk,[],'audit-physical-warm',true);
    benchmark('physical map catalog cache hit',()=>catalog.buildStopsCatalog(pks,mpk,[],'audit-physical-warm',true));
    benchmark('collection signature: full PKS',()=>domain.stopCollectionSignature(pks),100);
    benchmark('visible map stops: city viewport',()=>markers.visibleMapStops(stops,[21.99,50.03,22.01,50.05],17),100);
    benchmark('visible map stops: wide viewport',()=>markers.visibleMapStops(stops,[21.8,49.9,22.2,50.2],16),100);
    benchmark('platform positions: warm full catalog',()=>{for(const stop of stops)positions.platformPosition(stop);},100);
    benchmark('MPK alias selection: full catalog',()=>markers.canonicalMapStopId(stops,mpk[0].id,'mpk_rzeszow'),100);
    report.dataset={pks:pks.length,mpk:mpk.length,merged:stops.length,marcel:0};
  } finally {
    const {profile}=await post('Profiler.stop');
    fs.writeFileSync(path.join(directory,'catalog.cpuprofile'),JSON.stringify(profile));
    const counts=new Map();for(const id of profile.samples||[])counts.set(id,(counts.get(id)||0)+1);
    report.cpuTopSamples=profile.nodes.filter(n=>counts.has(n.id)).map(n=>({function:n.callFrame.functionName||'(anonymous)',file:n.callFrame.url.replace(process.cwd(),'repo'),samples:counts.get(n.id)})).sort((a,b)=>b.samples-a.samples).slice(0,12);
    session.disconnect();
  }
}
async function browserAudit(fixture, runIndex) {
  const root=fixture.root, production=path.resolve('out');
  const server=http.createServer((req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    let file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(404);return res.end();}
    if(!fs.existsSync(file))file=path.resolve(production,'.'+pathname);
    if((!file.startsWith(root+path.sep)&&!file.startsWith(production+path.sep))||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
  });
  let browser;
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${server.address().port}`;
    browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    report.environment.chrome=await browser.version();
    const page=await browser.newPage();page.setDefaultTimeout(60000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewport({width:393,height:851,deviceScaleFactor:1});
    const cdp=await page.createCDPSession();await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Performance.enable');await cdp.send('Profiler.enable');
    await page.evaluateOnNewDocument(()=>{
      localStorage.setItem('mks_map_state',JSON.stringify({center:{lat:50.04,lng:22},zoom:17}));localStorage.setItem('mks_show_map_stops','true');
      window.auditEarlyTransportRequests=[];
      const originalFetch=window.fetch;
      window.fetch=function(...args){const url=String(args[0]?.url||args[0]);if(/get_vehicles.php|\/api\/pks\/vehicles|stopscache|api-site.marcel/.test(url)&&!window.__startupDeviceReadyAt)window.auditEarlyTransportRequests.push(url);return originalFetch.apply(this,args);};
      window.auditCatalogJobs=[];window.auditCatalogWorkerErrors=[];
      const NativeWorker=window.Worker;
      if(NativeWorker)window.Worker=class extends NativeWorker {
        constructor(...args){super(...args);this.auditRequests=new Map();
          this.addEventListener('message',event=>{const input=this.auditRequests.get(event.data?.id);if(input&&Array.isArray(event.data.list)&&Array.isArray(event.data.physical))window.auditCatalogJobs.push({input,result:event.data});});
          this.addEventListener('error',event=>window.auditCatalogWorkerErrors.push(event.message));
        }
        postMessage(input,...args){if(input?.pks&&input?.key)this.auditRequests.set(input.id,input);return super.postMessage(input,...args);}
      };
      window.auditLongTasks=[];new PerformanceObserver(list=>window.auditLongTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
      window.auditFrames=[];let last;function frame(now){if(last!==undefined)window.auditFrames.push({start:last,duration:now-last});last=now;requestAnimationFrame(frame);}requestAnimationFrame(frame);
    });
    let fleetSize=100, feedRequests=0, reachabilityRequests=0;
    await page.setRequestInterception(true);
    page.on('request',request=>{
      const url=request.url();const json=data=>request.respond({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
      if(url.startsWith('https://www.gstatic.com/generate_204')){reachabilityRequests++;return request.respond({status:204,body:''});}
      if(url.includes('/pks/get_vehicles.php')) {
        feedRequests++;
        const date=new Date().toLocaleString('sv-SE',{timeZone:'Europe/Warsaw'});
        return json(Array.from({length:fleetSize},(_,i)=>{
          const v=structuredClone(require('./fixtures/pks-vehicle.json'));v.vehicle_id=i+1;v.trip_id=987654321+i;
          v.position={...v.position,lat:50.0385+(i%20)*.00015+feedRequests*.00001,long:21.9984+Math.floor(i/20)*.00025,position_date:date,speed:15};
          v.journey.vehicle_journey_date=date.slice(0,10);return v;
        }));
      }
      if(url.includes('mpkrzeszow.pl/przystanki/stopscache'))return json(Object.entries(require('../public/data/bus-routes/mpk_rzeszow.json').stops).map(([id,s])=>({stop_id:id,stop_name:s.name,stop_lat:s.lat,stop_lon:s.lon,lines:''})));
      if(url.includes('mpkrzeszow.pl')||url.includes('api-site.marcel-bus.pl'))return json([]);
      if(url.includes('nearest-departures'))return json({journeys:[]});
      if(url.includes('/api/pks/einfo/stop-point')&&!url.includes('timetable'))return json({items:Object.entries(require('../public/data/pks-stop-points.json').stops).map(([id,s])=>({stop_point_id:id,name:s.n,stop_area_name:s.n,stop_area_id:s.areaId,stop_point_code:s.code,location:{lat:s.lat,lon:s.lon}}))});
      if(url.includes('stop-point-timetable')||url.includes('/api/pks/'))return json({items:[]});
      if(url.startsWith(origin))return request.continue();return request.abort();
    });
    const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
    const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    async function measure(name,action) {
      const before=await metrics(), start=name.startsWith('startup-')?0:await page.evaluate(()=>performance.now());
      await cdp.send('Profiler.start');const details=await action();
      const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(path.join(directory,'run-'+runIndex+'-'+name+'.cpuprofile'),JSON.stringify(profile));
      const hits=new Map();for(const id of profile.samples||[])hits.set(id,(hits.get(id)||0)+1);
      const topSamples=profile.nodes.filter(n=>hits.has(n.id)).map(n=>({function:n.callFrame.functionName||'(anonymous)',file:n.callFrame.url.replace(origin,'fixture'),line:n.callFrame.lineNumber+1,column:n.callFrame.columnNumber+1,samples:hits.get(n.id)})).sort((a,b)=>b.samples-a.samples).slice(0,8);
      const after=await metrics();const stats=await page.evaluate(start=>{
        const tasks=window.auditLongTasks.filter(t=>t.start>=start), frames=window.auditFrames.filter(t=>t.start>=start);
        return {durationMs:performance.now()-start,longTasks:tasks.map(t=>t.duration),frames:frames.map(t=>t.duration),markers:document.querySelectorAll('.leaflet-marker-icon').length};
      },start);
      report.browser.push({name,durationMs:round(stats.durationMs),scriptMs:round((after.ScriptDuration-before.ScriptDuration)*1000),layoutMs:round((after.LayoutDuration-before.LayoutDuration)*1000),longTasks:stats.longTasks.length,longTaskTotalMs:round(stats.longTasks.reduce((a,b)=>a+b,0)),maxLongTaskMs:round(Math.max(0,...stats.longTasks)),frameGapP95Ms:round(percentile(stats.frames,.95)),frameGapsOver50Ms:stats.frames.filter(v=>v>50).length,heapMB:round(after.JSHeapUsedSize/1024/1024),markers:stats.markers,feedRequests,topSamples,...details});
      console.log('Completed performance scenario: '+name);
    }
    await measure('startup-100-vehicles',async()=>{await page.goto(origin+'/startup-home/',{waitUntil:'domcontentloaded'});await page.waitForSelector('.mks-bus-marker');await page.waitForSelector('.map-catalog-stop');const gateReadyMs=await page.evaluate(()=>window.__startupDeviceReadyAt);if(!gateReadyMs)throw Error('Startup gate was not measured');const readyMs=await page.evaluate(()=>performance.now());await pause(2000);return {readyMs:round(readyMs),gateReadyMs:round(gateReadyMs),afterGateMs:round(readyMs-gateReadyMs)};});
    await measure('idle-100-vehicles',()=>pause(4000));
    await measure('pan-map-100-vehicles',async()=>{for(let i=0;i<6;i++){await page.mouse.move(190,460);await page.mouse.down();await page.mouse.move(i%2?240:140,i%2?420:500,{steps:20});await page.mouse.up();await pause(400);}await pause(1000);});
    await measure('refresh-250-vehicles',async()=>{fleetSize=250;const before=feedRequests;await page.waitForFunction(()=>document.querySelectorAll('.mks-bus-marker').length>=200,{timeout:30000});if(feedRequests<=before)throw new Error('Fleet refresh was not observed');await pause(2000);});
    await measure('bus-panel',async()=>{await page.click('.mks-bus-marker');await page.waitForSelector('[data-map-bus-sheet]');await page.click('[aria-label="Rozwiń panel autobusu"]');await pause(1500);});
    const button=async label=>page.evaluate(text=>{const b=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text);if(!b)throw new Error('Missing button '+text);b.click();},label);
    await measure('stop-list-open',async()=>{await button('Przystanki');await page.waitForSelector('input[placeholder*="Babica"]');await page.waitForSelector('[data-stop-card-id]');await pause(700);});
    await measure('hidden-map-idle',()=>pause(4000));
    await measure('stop-list-search',async()=>{await page.type('input[placeholder*="Babica"]','Rzeszów',{delay:100});await page.waitForSelector('[data-stop-card-id]');await pause(1000);});
    await measure('stop-panel',async()=>{await page.evaluate(()=>document.querySelector('[data-stop-card-id]').click());await page.waitForSelector('[aria-label="Pokaż przystanek na mapie"]');await pause(1500);});
    await measure('background-35s',async()=>{
      // Allow any foreground request already in flight to settle, then count only hidden work.
      await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
      await pause(1000);
      const probes=reachabilityRequests, feeds=feedRequests;
      const heartbeats=await page.evaluate(()=>window.__startupHeartbeatWrites||0);
      await pause(35000);
      const result={reachabilityRequests:reachabilityRequests-probes,vehicleRequests:feedRequests-feeds,heartbeatWrites:(await page.evaluate(()=>window.__startupHeartbeatWrites||0))-heartbeats};
      if(fs.existsSync('lib/home/panel-code.ts')) {
        const assert=require('node:assert/strict');
        assert.equal(result.reachabilityRequests,0,'No connectivity radio probes while hidden');
        assert.equal(result.vehicleRequests,0,'No vehicle polling while hidden');
        assert.ok(result.heartbeatWrites>=1,'Keep the existing administrative presence heartbeat while hidden');
      }
      await page.evaluate(()=>{delete document.visibilityState;delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
      await page.waitForFunction(count=>(window.__startupHeartbeatWrites||0)>count,{},heartbeats);
      return result;
    });
    const workerJobs=await page.evaluate(()=>window.auditCatalogJobs);
    report.catalogWorker={jobs:workerJobs.length,errors:await page.evaluate(()=>window.auditCatalogWorkerErrors)};
    if(fs.existsSync('lib/stops-catalog.worker.ts')) {
      require('node:assert/strict').ok(workerJobs.length>0,'Actual browser must use the worker, not silently fall back');
      require('node:assert/strict').deepEqual(report.catalogWorker.errors,[]);
      const catalog=load('lib/stops-catalog.ts',{'@/lib/pks-client':{}});
      const clean=value=>JSON.parse(JSON.stringify(value));
      for(const {input,result} of workerJobs) {
        require('node:assert/strict').deepEqual(result.list,clean(catalog.buildStopsCatalog(input.pks,input.mpk,input.marcel,input.key)));
        require('node:assert/strict').deepEqual(result.physical,clean(catalog.buildStopsCatalog(input.pks,input.mpk,input.marcel,input.key,true)));
      }
    }
    report.earlyTransportRequests=await page.evaluate(()=>window.auditEarlyTransportRequests);require('node:assert/strict').deepEqual(report.earlyTransportRequests,[],'Transport requests must remain behind access verification');
    report.browserErrors=errors;if(errors.length)throw new Error('Browser errors: '+errors.join('; '));
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
async function overlappingFeedAudit() {
  const fixture=require('./fixtures/pks-vehicle.json');
  const rows=Array.from({length:250},(_,i)=>({...fixture,vehicle_id:i+1}));
  const payload=JSON.stringify(rows);
  let requests=0,bytes=0,parseMs=0;
  const api=load('lib/pks-client.ts',{
    '@capacitor/core':{Capacitor:{isNativePlatform:()=>false}},
    './transport/http':{isNative:()=>false,requestJson:async()=>{
      requests++;bytes+=Buffer.byteLength(payload);
      await new Promise(resolve=>setTimeout(resolve,40));
      const start=performance.now();const result=JSON.parse(payload);parseMs+=performance.now()-start;
      return result;
    }},
  },'\nexport {fetchPksVehiclesSnapshot};');
  const durations=[];
  for(let i=0;i<10;i++) {
    const start=performance.now();
    const [map,panel]=await Promise.all([api.fetchPksVehiclesSnapshot(),api.fetchPksVehiclesSnapshot()]);
    require('node:assert/strict').deepEqual(map,rows);require('node:assert/strict').deepEqual(panel,rows);
    await new Promise(resolve=>setTimeout(resolve,5));durations.push(performance.now()-start);
  }
  report.overlappingPks={bursts:10,vehicles:250,requests,bytes,parseMs:round(parseMs),medianReadyMs:round(percentile(durations,.5)),mockDelayMs:40};
}
(async()=>{
  try {
    await cpuAudit();await overlappingFeedAudit();
    if(!process.argv.includes('--cpu-only')) {
      const fixture=require('./build-accent-fixture.cjs')();
      report.browserRuns=[];
      try {
        for(let i=0;i<3;i++) {
          const start=report.browser.length;
          await browserAudit(fixture,i+1);
          report.browserRuns.push(report.browser.slice(start));
        }
        report.browser=report.browserRuns[0].map((row,index)=>{
          const median={...row};
          for(const [key,value] of Object.entries(row)) {
            if(typeof value==='number')median[key]=round(percentile(report.browserRuns.map(run=>run[index][key]),.5));
          }
          return median;
        });
      } finally {fixture.cleanup();}
    }
  }
  finally {
    fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
    const md=['# Performance audit','', 'Diagnostic measurements, not phone FPS. Browser scenarios report medians of three fresh-browser runs. Main-thread CPU is throttled 4x; worker CPU speed is not independently calibrated. This is not a model of an entire old phone. Network uses fixtures; map tile loading, real Firebase network latency (a fixed 1800ms restored-device fixture is used), Android GPU and device temperature are excluded. CPU microbenchmarks use unthrottled Node and cannot be compared directly with Chrome. PKS and MPK catalogs are complete; Marcel fleet is not measured.','', '| Operation | Median ms | P95 ms |','|---|---:|---:|',...report.cpu.map(r=>`| ${r.name} | ${r.medianMs} | ${r.p95Ms} |`),'', '| Browser scenario | JS ms | Layout ms | Tasks >50ms | Max task ms | Frame gap P95 ms |','|---|---:|---:|---:|---:|---:|',...report.browser.map(r=>`| ${r.name} | ${r.scriptMs} | ${r.layoutMs} | ${r.longTasks} | ${r.maxLongTaskMs} | ${r.frameGapP95Ms} |`),'','Raw CPU profiles can be opened in Chrome DevTools Performance. Startup includes code loading and hydration. Refresh includes waiting for the unchanged normal polling interval. Different scenario durations mean totals are not rankings.'];
    fs.writeFileSync(path.join(directory,'report.md'),md.join('\n'));
    console.log('PERFORMANCE_REPORT_JSON='+JSON.stringify(report));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
