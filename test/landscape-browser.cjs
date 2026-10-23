const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),puppeteer=require('puppeteer');
(async()=>{
 process.env.NEXT_PUBLIC_LANDSCAPE_PREVIEW='true';
 const fixture=require('./build-accent-fixture.cjs')();let server,browser;
 try{
  server=http.createServer((req,res)=>{let f=path.join(fixture.root,decodeURIComponent(new URL(req.url,'http://local').pathname));if(!f.startsWith(fixture.root)){res.writeHead(403);return res.end();}if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');if(!fs.existsSync(f)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(f));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:393,height:851,deviceScaleFactor:1});
  await page.setRequestInterception(true);page.on('request',req=>req.url().startsWith('https://mt1.google.com/')?req.respond({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path fill="#eaf1e7" d="M0 0h256v256H0z"/><path d="M0 130h256M110 0v256" stroke="#fff" stroke-width="12"/><path d="M0 10q80 100 256 50" stroke="#afd7ee" stroke-width="20" fill="none"/><text x="125" y="115" fill="#526159" font-size="11">Rzeszów</text></svg>'}):req.url().startsWith(origin)||req.url().startsWith('data:')?req.continue():req.abort());
  await page.goto(origin+'/landscape-fixture/');await page.waitForFunction(()=>window.__landscapeDiagnostics?.().frames>0&&document.querySelector('[data-landscape-stage]')?.dataset.assetsReady==='true');
  fs.mkdirSync('test/ui-previews',{recursive:true});
  await page.addStyleTag({content:'[data-fixture-controls]{visibility:hidden}html[data-landscape-theme] *{transition-duration:0s!important}'});
  for(const [name,iso] of [['day','2026-10-23T12:00:00+02:00'],['sunset','2026-10-23T17:10:00+02:00'],['night','2026-10-26T23:00:00+01:00'],['sunrise','2026-10-23T07:10:00+02:00']]){
   await page.evaluate(iso=>window.__landscapePreview({iso,rate:0}),iso);
   await page.waitForFunction(()=>window.__landscapeDiagnostics().samples!==null);
   await new Promise(r=>setTimeout(r,150));
   await page.screenshot({path:'test/ui-previews/landscape-'+name+'.png'});
  }
  await page.evaluate(()=>window.__landscapePreview({iso:'2026-10-26T23:00:00+01:00',rate:0}));
  await page.waitForFunction(()=>window.__landscapeDiagnostics().samples!==null);
  // Record the actual live canvas with Chrome's own encoder, without depending
  // on an external ffmpeg executable being installed on every CI runner.
  const recording=await page.evaluate(async()=>{
   const stream=document.querySelector('[data-landscape-stage]').captureStream(24),chunks=[];
   const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:1800000});
   const finished=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=event=>chunks.push(event.data);
   recorder.start();await new Promise(resolve=>setTimeout(resolve,6000));recorder.stop();await finished;
   stream.getTracks().forEach(track=>track.stop());const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());
   let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary);
  });
  assert.ok(recording.length>10000,'live recording contains encoded frames');
  fs.writeFileSync('test/ui-previews/landscape-live.webm',Buffer.from(recording,'base64'));
  // At a fixed astronomical instant, changes below the skyline must come from
  // real water motion, not an advancing clock or a moving full-screen wallpaper.
  await page.evaluate(()=>{const c=document.querySelector('[data-landscape-stage]'),y=Math.floor(c.height*.6);window.__waterBefore=c.getContext('2d').getImageData(0,y,c.width,c.height-y).data;});
  await new Promise(r=>setTimeout(r,1200));
  assert.ok(await page.evaluate(()=>{const c=document.querySelector('[data-landscape-stage]'),y=Math.floor(c.height*.6),after=c.getContext('2d').getImageData(0,y,c.width,c.height-y).data;let changed=0;for(let i=0;i<after.length;i+=4)if(Math.abs(after[i]-window.__waterBefore[i])+Math.abs(after[i+1]-window.__waterBefore[i+1])+Math.abs(after[i+2]-window.__waterBefore[i+2])>2)changed++;return changed>2500;}),'water visibly ripples at a fixed scene time');
  await page.evaluate(()=>window.__landscapePreview({iso:'2026-10-23T12:00:00+02:00',rate:0}));
  await page.waitForFunction(()=>window.__landscapeDiagnostics().samples!==null);
  await page.evaluate(()=>{const c=document.querySelector('[data-landscape-stage]');window.__cloudBefore=c.getContext('2d').getImageData(0,0,c.width,Math.floor(c.height*.33)).data;});
  await page.screenshot({path:'test/ui-previews/landscape-motion-before.png'});
  await new Promise(r=>setTimeout(r,3000));
  assert.ok(await page.evaluate(()=>{const c=document.querySelector('[data-landscape-stage]'),after=c.getContext('2d').getImageData(0,0,c.width,Math.floor(c.height*.33)).data;let changed=0;for(let i=0;i<after.length;i+=4)if(Math.abs(after[i]-window.__cloudBefore[i])+Math.abs(after[i+1]-window.__cloudBefore[i+1])+Math.abs(after[i+2]-window.__cloudBefore[i+2])>12)changed++;return changed>300;}),'clouds visibly change position within three seconds at a fixed daytime instant');
  await page.screenshot({path:'test/ui-previews/landscape-motion-after.png'});
  // Real timetable UI over the same scene, including a small viewport and scrolling.
  await page.evaluate(()=>document.querySelector('[data-toggle-ui]').click());await page.waitForSelector('[data-departure-row]');
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.transit-view')).opacity)>=.999);
  await new Promise(r=>setTimeout(r,350));
  assert.ok(await page.evaluate(()=>{const color=getComputedStyle(document.querySelector('.transit-card')).backgroundColor,alpha=Number(color.split(',').pop().replace(')',''));return alpha>=.58&&alpha<=.68;}),'glass exposes scenery while keeping a dark scrim');
  await page.screenshot({path:'test/ui-previews/landscape-timetable.png'});
  await page.setViewport({width:320,height:640,deviceScaleFactor:2});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'test/ui-previews/landscape-small-phone.png'});
  await page.evaluate(()=>window.__landscapePreview({}));
  await new Promise(r=>setTimeout(r,2000));
  const metrics=await page.evaluate(()=>window.__landscapeDiagnostics());
  assert.ok(metrics.canvasPixels<=1800000);assert.equal(metrics.source,'default-rzeszow');
  // Native saver/bridge fallback must remain live instead of freezing the world.
  await page.evaluate(()=>window.__landscapeTestPower(true));
  await page.waitForFunction(()=>window.__landscapeDiagnostics().motion==='power-saving');
  const saverFrames=await page.evaluate(()=>window.__landscapeDiagnostics().frames);
  await new Promise(r=>setTimeout(r,1300));
  assert.ok(await page.evaluate(n=>window.__landscapeDiagnostics().frames>=n+2,saverFrames));
  await page.evaluate(()=>window.__landscapeTestPower(false));
  await page.waitForFunction(()=>window.__landscapeDiagnostics().interval<200);
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.waitForFunction(()=>window.__landscapeDiagnostics().interval===15000);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  const paused=await page.evaluate(()=>window.__landscapeDiagnostics().frames);
  await new Promise(r=>setTimeout(r,400));assert.equal(await page.evaluate(()=>window.__landscapeDiagnostics().frames),paused);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(n=>window.__landscapeDiagnostics().frames>n,{},paused);
  await page.evaluate(()=>document.querySelector('[data-toggle-scene]').click());
  await page.waitForFunction(()=>!document.querySelector('[data-landscape-stage]')&&!window.__landscapeDiagnostics&&!document.documentElement.dataset.landscapeTheme);
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
  await page.setViewport({width:393,height:851,deviceScaleFactor:1});
  await page.goto(origin+'/landscape-map-fixture/');
  await page.waitForFunction(()=>window.__landscapeDiagnostics?.().frames>0);
  for(const kind of ['filter','navigation'])assert.equal(await page.$eval('[data-landscape-chrome="'+kind+'"]',e=>getComputedStyle(e).display),'block');
  await page.waitForSelector('.leaflet-layer img');
  for(const [name,iso,invert] of [['day','2026-10-23T12:00:00+02:00',0],['night','2026-10-26T23:00:00+01:00',1]]){
   await page.evaluate(iso=>window.__landscapePreview({iso,rate:0}),iso);
   await page.waitForFunction(()=>window.__landscapeDiagnostics().samples!==null);
   await new Promise(r=>setTimeout(r,600));
   const intermediate=await page.$eval('.leaflet-layer',e=>Number(getComputedStyle(e).filter.match(/invert\(([\d.]+)/)[1]));
   assert.ok(intermediate>0&&intermediate<1,'map transition is animated, not an abrupt filter switch');
   await new Promise(r=>setTimeout(r,1600));
   assert.ok(await page.$eval('.leaflet-layer',(e,n)=>getComputedStyle(e).filter.startsWith('invert('+n+')'),invert),'actual Leaflet layer changes with the Sun');
   const ink=await page.$eval('[data-map-search-panel] input',e=>getComputedStyle(e).color);
   assert.equal(ink,name==='day'?'rgb(20, 45, 57)':'rgb(244, 248, 252)');
   assert.equal(await page.$eval('[data-map-brand]',e=>getComputedStyle(e).color),name==='day'?'rgb(15, 101, 91)':'rgb(166, 226, 203)','map brand accent stays readable in both materials');
   assert.equal(await page.$eval('[data-landscape-chrome]',e=>e.tagName),'SPAN','map chrome has no geometric scenery');
   await page.screenshot({path:'test/ui-previews/landscape-map-'+name+'.png'});
  }
  await page.type('[data-map-search-panel] input','108');
  assert.equal(await page.$eval('[data-map-search-panel] input',e=>e.value),'108');
  await page.click('[data-nav-item="stops"]');assert.equal(await page.$eval('[data-nav-item="stops"]',e=>e.getAttribute('aria-current')),'page');
  await page.click('[data-nav-item="map"]');
  await page.screenshot({path:'test/ui-previews/landscape-map-chrome.png'});
  await page.goto(origin+'/landscape-admin-fixture/');
  await page.waitForSelector('.admin-device-card',{timeout:45000});
  await page.waitForFunction(()=>window.__landscapeDiagnostics?.().frames>0);
  for(const selector of ['.admin-device-card','[data-admin-viewport] input[placeholder="Szukaj..."]']){
   assert.ok(await page.$eval(selector,e=>{const c=getComputedStyle(e).backgroundColor;return c.startsWith('rgba')&&Number(c.split(',').pop().replace(')',''))<.7;}),'admin glass must be translucent: '+selector);
  }
  await page.screenshot({path:'test/ui-previews/landscape-admin-glass.png'});
  assert.deepEqual(errors,[]);
  fs.writeFileSync('test/ui-previews/landscape-metrics.json',JSON.stringify({environment:'Headless Chrome CI; not physical Android battery measurements',...metrics},null,2));
  console.log('Landscape: four solar views, live timetable, small phone, bounded canvas, reduced motion, background pause/resume and theme disposal verified. Draw metrics:',metrics.averageDrawMs,metrics.maxDrawMs);
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fixture.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
