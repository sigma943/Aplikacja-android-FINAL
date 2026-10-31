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
  await page.evaluateOnNewDocument(()=>{
   localStorage.setItem('mks_app_theme','dark-mountains');window.__filterSceneCopies=0;
   const draw=CanvasRenderingContext2D.prototype.drawImage;
   CanvasRenderingContext2D.prototype.drawImage=function(source,...args){
    if(this.canvas.dataset.landscapeWindow==='filter'&&source?.dataset&&('landscapeStage'in source.dataset||'landscapeWater'in source.dataset))window.__filterSceneCopies++;
    return draw.call(this,source,...args);
   };
  });
  await page.setRequestInterception(true);page.on('request',req=>req.url().startsWith('https://mt1.google.com/')?req.respond({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path fill="#eaf1e7" d="M0 0h256v256H0z"/><path d="M0 130h256M110 0v256" stroke="#fff" stroke-width="12"/><path d="M0 10q80 100 256 50" stroke="#afd7ee" stroke-width="20" fill="none"/><text x="125" y="115" fill="#526159" font-size="11">Rzeszów</text></svg>'}):req.url().startsWith(origin)||req.url().startsWith('data:')?req.continue():req.abort());
  await page.goto(origin+'/landscape-fixture/');await page.waitForFunction(()=>window.__landscapeDiagnostics?.().frames>0&&document.querySelector('[data-landscape-stage]')?.dataset.assetsReady==='true');
  assert.equal(await page.evaluate(()=>window.__landscapeDiagnostics().renderer.presentation),'direct-gpu');
  assert.equal(await page.$$eval('[data-landscape-water]',nodes=>nodes.length),1,'one visible GPU surface, no GPU-to-2D copy in the frame path');
  fs.mkdirSync('test/ui-previews',{recursive:true});
  await page.addStyleTag({content:'[data-fixture-controls]{visibility:hidden}html[data-landscape-theme] *{transition-duration:0s!important}'});
  for(const [name,iso] of [['early-morning','2026-10-26T05:28:00+01:00'],['day','2026-10-23T12:00:00+02:00'],['golden-hour','2026-10-23T16:20:00+02:00'],['twilight','2026-10-23T18:00:00+02:00'],['phone-twilight-low','2026-10-24T18:11:00+02:00'],['sunset','2026-10-23T17:10:00+02:00'],['filmic-sunset','2026-10-25T16:15:00+01:00'],['filmic-morning','2026-10-23T08:12:00+02:00'],['night','2026-10-26T23:00:00+01:00'],['cloudy-night','2026-10-24T03:00:00+02:00'],['sunrise','2026-10-23T07:10:00+02:00'],['sun-moon-transition','2026-10-25T16:10:00+01:00'],['after-sunset','2026-10-25T16:34:00+01:00']]){
   // Fix wave/cloud phase for repeatable coverage, while keeping both moving.
   await page.evaluate(({iso,seconds,quality})=>window.__landscapePreview({iso,rate:0,quality,seconds}),{iso,quality:name==='phone-twilight-low'?'low':'high',seconds:name==='night'?72:name==='cloudy-night'?168:name==='golden-hour'?78:0});
   await page.waitForFunction(()=>window.__landscapeDiagnostics().samples!==null);
   await new Promise(r=>setTimeout(r,150));
   if(name==='cloudy-night')assert.ok(await page.evaluate(()=>{const l=window.__landscapeDiagnostics().renderer.lighting;return l.moon.intensity<=l.moon.illumination*(1-l.sky.day)*.32;}),'sparser cloud coverage never amplifies moonlight');
   if(name==='night')assert.ok(await page.evaluate(()=>window.__landscapeDiagnostics().renderer.lighting.moon.intensity>.05),'the moonlit fixture uses a genuinely exposed Moon');
   if(name==='night')assert.ok(await page.evaluate(()=>{const c=window.__landscapeCapture(),d=c.getContext('2d').getImageData(0,Math.floor(c.height*.6),c.width,Math.floor(c.height*.4)).data;let silver=0;for(let i=0;i<d.length;i+=4)if(d[i+2]>100&&d[i+2]>d[i]*1.03)silver++;return silver>100;}),'visible silver path follows the real Moon through the river bends');
   await page.screenshot({path:'test/ui-previews/landscape-'+name+'.png'});
  }
  await page.evaluate(()=>window.__landscapePreview({iso:'2026-10-23T16:20:00+02:00',rate:0,quality:'high',seconds:78}));
  await page.waitForFunction(()=>window.__landscapeDiagnostics().samples!==null);
  // Record the actual live canvas with Chrome's own encoder, without depending
  // on an external ffmpeg executable being installed on every CI runner.
  const record=()=>page.evaluate(async()=>{
   const composite=window.__landscapeRecording(true);
   const stream=composite.captureStream(24),chunks=[];
   const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:1800000});
   const finished=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=event=>chunks.push(event.data);
   recorder.start();await new Promise(resolve=>setTimeout(resolve,6000));recorder.stop();await finished;
   stream.getTracks().forEach(track=>track.stop());window.__landscapeRecording(false);const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());
   let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary);
  });
  const highRecording=await record();
  assert.ok(highRecording.length>10000,'high-quality recording contains encoded frames');
  fs.writeFileSync('test/ui-previews/landscape-high.webm',Buffer.from(highRecording,'base64'));
  await page.evaluate(()=>window.__landscapePreview({iso:'2026-10-23T16:20:00+02:00',rate:0,seconds:78}));
  await page.waitForFunction(()=>window.__landscapeDiagnostics().samples!==null);
  const recording=await record();
  assert.ok(recording.length>10000,'live recording contains encoded frames');
  fs.writeFileSync('test/ui-previews/landscape-live.webm',Buffer.from(recording,'base64'));
  // At a fixed astronomical instant, changes below the skyline must come from
  // real water motion, not an advancing clock or a moving full-screen wallpaper.
  await page.evaluate(()=>{const c=window.__landscapeCapture();const y=Math.floor(c.height*.6);window.__waterBefore=c.getContext('2d').getImageData(0,y,c.width,c.height-y).data;});
  await new Promise(r=>setTimeout(r,1200));
  assert.ok(await page.evaluate(()=>{const c=window.__landscapeCapture();const y=Math.floor(c.height*.6),after=c.getContext('2d').getImageData(0,y,c.width,c.height-y).data;let changed=0;for(let i=0;i<after.length;i+=4)if(Math.abs(after[i]-window.__waterBefore[i])+Math.abs(after[i+1]-window.__waterBefore[i+1])+Math.abs(after[i+2]-window.__waterBefore[i+2])>2)changed++;return changed>c.width*c.height*.005;}),'water visibly ripples at a fixed scene time');
  await page.evaluate(()=>window.__landscapePreview({iso:'2026-10-23T12:00:00+02:00',rate:0}));
  await page.waitForFunction(()=>window.__landscapeDiagnostics().samples!==null);
  await page.evaluate(()=>{const c=document.querySelector('[data-landscape-stage]');window.__cloudBefore=c.getContext('2d').getImageData(0,0,c.width,Math.floor(c.height*.33)).data;});
  await page.screenshot({path:'test/ui-previews/landscape-motion-before.png'});
  await new Promise(r=>setTimeout(r,3000));
  assert.ok(await page.evaluate(()=>{const c=document.querySelector('[data-landscape-stage]'),after=c.getContext('2d').getImageData(0,0,c.width,Math.floor(c.height*.33)).data;let changed=0;for(let i=0;i<after.length;i+=4)if(Math.abs(after[i]-window.__cloudBefore[i])+Math.abs(after[i+1]-window.__cloudBefore[i+1])+Math.abs(after[i+2]-window.__cloudBefore[i+2])>12)changed++;return changed>300;}),'clouds visibly change position within three seconds at a fixed daytime instant');
  await page.screenshot({path:'test/ui-previews/landscape-motion-after.png'});
  // Covering the scene must stop expensive draws, not lower visible quality.
  await page.evaluate(()=>{window.__surfaceBeforeCover=document.querySelector('[data-landscape-water]');document.querySelector('[data-toggle-covered]').click();});
  await page.waitForFunction(()=>window.__landscapeDiagnostics().renderer.sceneCovered&&document.querySelector('[data-landscape-window="filter"]')?.dataset.sceneReady==='true');
  const coveredBefore=await page.evaluate(()=>{
   const canvas=document.querySelector('[data-landscape-window="filter"]');window.__coveredSky=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
   const d=window.__landscapeDiagnostics();return {uploads:d.renderer.gpu.uniformUploads,frames:d.frames,quality:d.renderer.quality};
  });
  await new Promise(r=>setTimeout(r,1800));
  const coveredAfter=await page.evaluate(()=>{
   const d=window.__landscapeDiagnostics(),c=document.querySelector('[data-landscape-window="filter"]'),pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
   let changed=0;for(let i=0;i<pixels.length;i++)if(Math.abs(pixels[i]-window.__coveredSky[i])>2)changed++;
   return {uploads:d.renderer.gpu.uniformUploads,frames:d.frames,quality:d.renderer.quality,changed,interval:d.interval,surfaceHidden:getComputedStyle(window.__surfaceBeforeCover).visibility};
  });
  assert.equal(coveredAfter.uploads,coveredBefore.uploads,'opaque map stops water, reflection and foliage GPU work');
  assert.equal(coveredAfter.quality,coveredBefore.quality,'covering the scene must not downgrade the quality controller');
  assert.ok(coveredAfter.frames-coveredBefore.frames>10,'visible sky window must not be throttled to four updates per second');
  assert.ok(coveredAfter.changed>30,'filter clouds remain animated while the river is covered');
  assert.equal(coveredAfter.interval,1000/60);assert.equal(coveredAfter.surfaceHidden,'hidden');
  await page.evaluate(()=>document.querySelector('[data-toggle-covered]').click());
  await page.waitForFunction(before=>!window.__landscapeDiagnostics().renderer.sceneCovered&&window.__landscapeDiagnostics().renderer.gpu.uniformUploads>before,{},coveredBefore.uploads);
  assert.equal(await page.evaluate(()=>window.__surfaceBeforeCover===document.querySelector('[data-landscape-water]')),true,'reveal reuses the live GPU context and textures');
  assert.equal(await page.$eval('[data-landscape-water]',e=>getComputedStyle(e).visibility),'visible');
  console.log('Covered landscape:',{coveredBefore,coveredAfter});
  // Real timetable UI over the same scene, including a small viewport and scrolling.
  await page.evaluate(()=>document.querySelector('[data-toggle-ui]').click());await page.waitForSelector('[data-departure-row]');
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.transit-view')).opacity)>=.999);
  await new Promise(r=>setTimeout(r,350));
  assert.ok(await page.evaluate(()=>{const color=getComputedStyle(document.querySelector('.transit-card')).backgroundColor,alpha=Number(color.split(',').pop().replace(')',''));return Math.abs(alpha-.64)<.005;}),'glass exposes scenery while keeping a dark scrim');
  await page.screenshot({path:'test/ui-previews/landscape-timetable.png'});
  for(const opacity of [20,85,64]){
   await page.evaluate(opacity=>{localStorage.setItem('mks_interface_appearance_v1',JSON.stringify({glassOpacity:opacity}));window.dispatchEvent(new Event('pks-interface-appearance'));},opacity);
   await page.waitForFunction(expected=>Math.abs(Number(getComputedStyle(document.querySelector('.transit-card')).backgroundColor.match(/[\d.]+/g).pop())-expected/100)<.005,{},opacity);
  }
  for(const opacity of [1,.64]){
   await page.evaluate(()=>document.querySelector('[data-toggle-glass]').click());
   await page.waitForFunction(expected=>{const parts=getComputedStyle(document.querySelector('.transit-card')).backgroundColor.match(/[\d.]+/g).map(Number);return Math.abs((parts.length===3?1:parts[3])-expected)<.005;}, {},opacity);
   if(opacity===1)assert.equal(await page.evaluate(()=>Number(document.documentElement.style.getPropertyValue('--landscape-reflection-strength'))),0,'glass off removes specular effects');
  }
  await page.waitForFunction(()=>document.querySelector('[data-landscape-stage]')?.dataset.assetsReady==='true');
  assert.equal(await page.$eval('.transit-view',e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)','no white layer across scenery');
  assert.equal(await page.$eval('.transit-view',e=>getComputedStyle(e).backdropFilter),'none');
  assert.ok(await page.$$eval('[data-scene-label]',labels=>labels.length>0&&labels.every(e=>{const s=getComputedStyle(e);return s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.boxShadow==='none'&&parseFloat(s.paddingTop)===0;})),'scene labels have no individual boxes or outlines');
  assert.equal(await page.$eval('[data-fixture-blur-wrapper]',e=>getComputedStyle(e).backdropFilter),'none','fullscreen ancestor must not blur the scene');
  assert.ok(await page.$$eval('[data-departure-row]',rows=>rows.every(e=>parseFloat(getComputedStyle(e).borderBottomWidth)===0)),'departure rows have no bright separator lines');
  assert.ok(await page.$$eval('.pks-line-badge',badges=>badges.length>0&&badges.every(e=>getComputedStyle(e).backgroundColor.startsWith('rgb('))),'line badges have their own opaque contrast surface');

  for(const [phase,iso] of [['sunrise','2026-10-23T06:55:00+02:00'],['sunset','2026-10-23T17:20:00+02:00'],['night','2026-10-26T23:00:00+01:00'],['day','2026-10-23T12:00:00+02:00']]){
   await page.evaluate(iso=>window.__landscapePreview({iso,rate:0}),iso);
   await page.waitForFunction(()=>window.__landscapeDiagnostics().samples!==null);
   await page.evaluate(()=>new Promise(requestAnimationFrame));
   const material=await page.$eval('.transit-card',e=>({actual:getComputedStyle(e).backgroundColor.match(/[\d.]+/g).map(Number),target:getComputedStyle(document.documentElement).getPropertyValue('--landscape-surface').match(/[\d.]+/g).map(Number),duration:getComputedStyle(e).transitionDuration}));
   assert.deepEqual(material.actual.slice(0,3),material.target.slice(0,3),'card gets the new test time immediately: '+phase);
   assert.ok(Math.abs(material.actual[3]-material.target[3])<=1/255,'only browser alpha quantization differs');
   assert.ok(material.duration);assert.ok(material.actual[3]<=.65,'scenery remains visible at '+phase);
   assert.ok(await page.$$eval('.pks-line-badge',badges=>{
    const luminance=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    return badges.every(e=>{const s=getComputedStyle(e),fg=luminance(s.color.match(/[\d.]+/g).map(Number)),bg=luminance(s.backgroundColor.match(/[\d.]+/g).map(Number));return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)>=4.5;});
   }),'all carrier badges retain readable contrast at '+phase);

   await page.screenshot({path:'test/ui-previews/landscape-timetable-'+phase+'.png'});
  }
  await page.setViewport({width:320,height:640,deviceScaleFactor:2});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'test/ui-previews/landscape-small-phone.png'});
  await page.evaluate(()=>window.__landscapePreview({iso:'2026-10-23T12:00:00+02:00',rate:0,quality:'low'}));
  await new Promise(r=>setTimeout(r,2500)); // Measure cadence at explicit low quality on software GPUs.
  const cadence=await page.evaluate(()=>({frames:window.__landscapeDiagnostics().frames,background:window.__landscapeDiagnostics().renderer.backgroundFrames}));
  await new Promise(r=>setTimeout(r,1400));
  const cadenceAfter=await page.evaluate(()=>({frames:window.__landscapeDiagnostics().frames,background:window.__landscapeDiagnostics().renderer.backgroundFrames}));
  assert.ok(cadenceAfter.frames-cadence.frames>=10,'water remains live: '+JSON.stringify({cadence,cadenceAfter,diagnostics:await page.evaluate(()=>window.__landscapeDiagnostics())}));
  assert.ok(cadenceAfter.background-cadence.background<=14,'the full landscape is cached rather than redrawn every water frame');
  await page.evaluate(()=>window.__landscapePreview({}));
  await new Promise(r=>setTimeout(r,2000));
  const metrics=await page.evaluate(()=>window.__landscapeDiagnostics());
  assert.ok(metrics.canvasPixels<=3600000);assert.equal(metrics.source,'default-rzeszow');
  // Native saver/bridge fallback must remain live instead of freezing the world.
  await page.evaluate(()=>window.__landscapeTestPower(true));
  await page.waitForFunction(()=>window.__landscapeDiagnostics().motion==='power-saving');
  assert.ok(await page.evaluate(()=>window.__landscapeDiagnostics().interval<=1000/12),'power saving reduces resolution, never drops live water to 2 fps');
  const saverFrames=await page.evaluate(()=>window.__landscapeDiagnostics().frames);
  await new Promise(r=>setTimeout(r,1300));
  assert.ok(await page.evaluate(n=>window.__landscapeDiagnostics().frames>=n+10,saverFrames));
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
  await page.waitForFunction(()=>!document.querySelector('[data-landscape-stage]')&&!window.__landscapeDiagnostics&&!document.querySelector('[data-landscape-water]')&&!document.documentElement.dataset.landscapeTheme);
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
  await page.setViewport({width:393,height:851,deviceScaleFactor:1});
  await page.goto(origin+'/landscape-map-fixture/');
  await page.waitForFunction(()=>window.__landscapeDiagnostics?.().frames>0);
  await page.waitForSelector('[data-landscape-window=filter][data-scene-ready=true]');
  assert.equal(await page.evaluate(()=>window.__landscapeDiagnostics().renderer.gpu),undefined,'opening directly on the opaque map does not allocate a hidden GPU scene');
  assert.equal(await page.$$eval('[data-landscape-window]',els=>els.length),1,'only the filter owns a sky window');
  await page.waitForSelector('.leaflet-layer img');
  for(const [name,iso,invert] of [['day','2026-10-23T12:00:00+02:00',0],['night','2026-10-26T23:00:00+01:00',1]]){
   await page.evaluate(iso=>window.__landscapePreview({iso,rate:0}),iso);
   await page.waitForFunction(()=>window.__landscapeDiagnostics().samples!==null);
   await new Promise(r=>setTimeout(r,150));
   assert.equal(await page.$eval('.leaflet-layer',e=>getComputedStyle(e).transitionDuration),'0s','map polarity never animates through washed-out grey');
   assert.ok(await page.$eval('.leaflet-layer',(e,n)=>getComputedStyle(e).filter.startsWith('invert('+n+')'),invert),'actual Leaflet layer changes with the Sun');
   await page.evaluate(()=>{
    let marker=document.querySelector('[data-solar-marker-probe]');
    if(!marker){marker=document.createElement('span');marker.dataset.solarMarkerProbe='';marker.className='text-white';marker.textContent='9';document.querySelector('.leaflet-marker-pane').append(marker);}
   });
   assert.equal(await page.$eval('[data-solar-marker-probe]',e=>getComputedStyle(e).color),'rgb(255, 255, 255)','solar ink never leaks into filled map markers');
   const ink=await page.$eval('[data-map-search-panel] input',e=>getComputedStyle(e).color);
   assert.equal(ink,name==='day'?'rgb(11, 27, 38)':'rgb(244, 248, 252)');
   assert.equal(await page.$eval('[data-fixture-period]',e=>e.dataset.fixturePeriod),name,'solar mode reaches React component props as well as CSS');
   assert.ok(await page.$eval('[data-map-brand]',e=>getComputedStyle(e).color!==getComputedStyle(document.documentElement).getPropertyValue('--landscape-ink')),'brand uses the selected accent');
   assert.equal(await page.$eval('[data-landscape-window=filter]',e=>getComputedStyle(e).filter),'none','sky is crisp instead of frosted');
   assert.ok(await page.$eval('[data-landscape-window=filter]',e=>{const d=e.getContext('2d').getImageData(0,0,e.width,e.height).data,colors=new Set();for(let i=0;i<d.length;i+=16)colors.add(d[i]+','+d[i+1]+','+d[i+2]);return colors.size>30&&e.width<=600;}),'filter paints bounded sky/cloud detail');
   assert.equal(await page.evaluate(()=>window.__filterSceneCopies),0,'filter never samples the scene containing discs, mountains or water');
   await page.screenshot({path:'test/ui-previews/landscape-map-'+name+'.png'});
  }
  assert.ok(await page.$eval('.pks-navigation',e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return Math.abs(r.left-10)<1&&Math.abs(innerWidth-r.right-10)<1&&parseFloat(s.borderRadius)>=20&&Math.abs(innerHeight-r.bottom-8)<1;}),'navigation floats with matching 10px sides and rounded corners');
  await page.evaluate(()=>window.__landscapePreview({iso:'2026-10-23T17:10:00+02:00',rate:0}));
  await page.waitForFunction(()=>window.__landscapeDiagnostics().samples!==null);
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  const transition=await page.$eval('[data-map-search-panel] input',e=>({color:getComputedStyle(e).color,target:getComputedStyle(document.documentElement).getPropertyValue('--landscape-ink').replaceAll(' ',''),duration:getComputedStyle(e).transitionDuration}));
  assert.equal(transition.color.replaceAll(' ',''),transition.target,'test date applies the correct ink immediately');
  assert.ok(transition.duration);
  for(const selector of ['[data-map-search-panel]','.pks-navigation'])assert.ok(await page.$eval(selector,e=>!getComputedStyle(e).transitionProperty.includes('color')));
  await page.screenshot({path:'test/ui-previews/landscape-map-sunset.png'});
  // Reproduce Android IME resize at a fixed width. The stage and the filter's
  // source frame stay unchanged even though the app viewport becomes shorter.
  const beforeKeyboard=await page.$eval('[data-landscape-stage]',e=>({width:e.width,height:e.height}));
  await page.focus('[data-map-search-panel] input');
  await page.setViewport({width:393,height:500,deviceScaleFactor:1});
  await page.waitForFunction(()=>document.querySelector('[data-landscape-stage]').dataset.keyboard==='true');
  assert.deepEqual(await page.$eval('[data-landscape-stage]',e=>({width:e.width,height:e.height})),beforeKeyboard,'keyboard never reframes the sky into terrain');
  await page.screenshot({path:'test/ui-previews/landscape-keyboard-stable.png'});
  await page.evaluate(()=>document.activeElement.blur());
  await page.setViewport({width:393,height:851,deviceScaleFactor:1});
  await page.waitForFunction(()=>document.querySelector('[data-landscape-stage]').dataset.keyboard==='false');
  await page.type('[data-map-search-panel] input','108');
  assert.equal(await page.$eval('[data-map-search-panel] input',e=>e.value),'108');
  await page.click('[data-nav-item="stops"]');assert.equal(await page.$eval('[data-nav-item="stops"]',e=>e.getAttribute('aria-current')),'page');
  await page.click('[data-nav-item="map"]');
  await page.screenshot({path:'test/ui-previews/landscape-map-chrome.png'});
  const nav=await page.$eval('.pks-navigation',e=>({width:e.getBoundingClientRect().width,radius:parseFloat(getComputedStyle(e).borderTopLeftRadius)}));
  assert.equal(nav.width,373,'navigation has balanced side insets');assert.ok(nav.radius>=20,'navigation is rounded all around');
  await page.evaluate(()=>{localStorage.setItem('mks_interface_appearance_v1',JSON.stringify({glassOpacity:20}));window.dispatchEvent(new Event('pks-interface-appearance'));});
  await page.click('[data-nav-item="options"]');await page.waitForSelector('[data-options-sheet]');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-app-content]')).visibility==='visible');
  assert.ok(await page.$$eval('[data-app-content],[data-app-navigation]',nodes=>nodes.every(e=>getComputedStyle(e).visibility==='visible')),'options retain the current tab beneath the glass');
  await page.screenshot({path:'test/ui-previews/landscape-options-20.png'});
  const reflection=()=>page.evaluate(()=>Number(getComputedStyle(document.documentElement).getPropertyValue('--landscape-reflection-strength')));
  const strong=await reflection();
  await page.$eval('[aria-label="Krycie testowe"]',e=>{e.value='80';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
  // Use the actual settings event too: React's range event implementation varies
  // between Chrome versions when a value is assigned by script.
  await page.evaluate(()=>{localStorage.setItem('mks_interface_appearance_v1',JSON.stringify({glassOpacity:80}));window.dispatchEvent(new Event('pks-interface-appearance'));});
  await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--landscape-surface').endsWith(',0.8)'));
  assert.ok(await reflection()<strong,'reflective glints follow the opacity setting');
  await page.click('[data-close-options]');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-app-content]')).visibility==='visible');
  await page.evaluate(()=>{localStorage.setItem('mks_interface_appearance_v1','{}');window.dispatchEvent(new Event('pks-interface-appearance'));});
  await page.goto(origin+'/landscape-journey-fixture/');
  await page.waitForSelector('input[type=date]');
  await page.waitForFunction(()=>window.__landscapeDiagnostics?.().frames>0);
  for(const [phase,iso] of [['day','2026-10-23T12:00:00+02:00'],['night','2026-10-26T23:00:00+01:00']]){
   await page.evaluate(iso=>window.__landscapePreview({iso,rate:0}),iso);
   await page.waitForFunction(()=>window.__landscapeDiagnostics().samples!==null);
   assert.equal(await page.$eval('input[type=date]',e=>getComputedStyle(e).colorScheme),phase==='day'?'light':'dark','native calendar follows solar material');
   assert.equal(await page.$eval('.connections-view',e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)','journeys do not wash out the landscape');
   await page.evaluate(()=>{localStorage.setItem('mks_interface_appearance_v1',JSON.stringify({glassOpacity:35,glassBlur:8,glassBlurEnabled:false}));window.dispatchEvent(new Event('pks-interface-appearance'));});
   await page.waitForFunction(()=>Math.abs(Number(getComputedStyle(document.querySelector('.connections-card')).backgroundColor.match(/[\d.]+/g).pop())-.35)<.01);
   assert.ok(await page.$eval('.connections-card',e=>getComputedStyle(e).backdropFilter.includes('0px')),'journey blur toggle is honoured');
   await page.screenshot({path:'test/ui-previews/landscape-journey-'+phase+'.png'});
  }
  await page.evaluate(()=>{localStorage.setItem('mks_interface_appearance_v1','{}');window.dispatchEvent(new Event('pks-interface-appearance'));});
  await page.goto(origin+'/landscape-admin-fixture/');
  await page.waitForSelector('.admin-device-card',{timeout:45000});
  await page.waitForFunction(()=>window.__landscapeDiagnostics?.().frames>0);
  for(const selector of ['.admin-device-card','[data-admin-viewport] input[placeholder="Szukaj..."]']){
   assert.ok(await page.$eval(selector,e=>{const c=getComputedStyle(e).backgroundColor;return c.startsWith('rgba')&&Number(c.split(',').pop().replace(')',''))<.9;}),'admin glass must be translucent: '+selector);
  }
  await page.screenshot({path:'test/ui-previews/landscape-admin-glass.png'});
  for(const [phase,iso] of [['day','2026-10-23T12:00:00+02:00'],['night','2026-10-26T23:00:00+01:00']]){
   await page.evaluate(iso=>window.__landscapePreview({iso,rate:0}),iso);
   await page.waitForFunction(()=>window.__landscapeDiagnostics().samples!==null);
   assert.equal(await page.$eval('[data-landscape-heading] h1',e=>getComputedStyle(e).color),'rgb(244, 248, 252)','standalone admin heading stays visible on the artwork');
   for(const opacity of [20,85]){
    await page.evaluate(opacity=>{localStorage.setItem('mks_interface_appearance_v1',JSON.stringify({glassOpacity:opacity,glassBlur:8,glassBlurEnabled:false}));window.dispatchEvent(new Event('pks-interface-appearance'));},opacity);
    await page.waitForFunction(opacity=>{const s=getComputedStyle(document.querySelector('.admin-device-card')),parts=s.backgroundColor.match(/[\d.]+/g).map(Number);return Math.abs(parts[3]-opacity/100)<.01&&s.backdropFilter.includes('0px');},{},opacity);
    const actual=await page.$eval('.admin-device-card',e=>({background:getComputedStyle(e).backgroundColor,ink:getComputedStyle(e.querySelector('.text-white')).color}));
    assert.equal(actual.ink,phase==='day'?'rgb(11, 27, 38)':'rgb(244, 248, 252)','admin ink and material agree');
   }
   await page.screenshot({path:'test/ui-previews/landscape-admin-'+phase+'.png'});
  }
  await page.evaluate(()=>{localStorage.setItem('mks_interface_appearance_v1','{}');window.dispatchEvent(new Event('pks-interface-appearance'));});

  for(const mode of ['bus','stop']){
   await page.goto(origin+'/landscape-'+mode+'-sheet-fixture/');
   await page.waitForFunction(()=>window.__landscapeDiagnostics?.().frames>1);
   // High-quality optical frames and both recordings are checked above.
   // Measure the UI spring at the bounded mobile quality: software rasterization
   // of the High shader can otherwise consume an entire spring between rAFs.
   await page.evaluate(()=>window.__landscapePreview({iso:'2026-10-25T16:15:00+01:00',rate:0,quality:'low'}));
   await page.waitForFunction(()=>window.__landscapeDiagnostics().samples!==null);
   assert.equal(await page.$$eval('[data-landscape-window]',els=>els.length),0,'no scenery canvas in the vehicle sheet');
   assert.equal(await page.$eval('.map-detail-shell',e=>getComputedStyle(e).backdropFilter.includes('blur(')),true,'glass sheets soften the backdrop');
   if(mode==='bus'){
    await page.evaluate(()=>window.__landscapePreview({iso:'2026-10-23T12:00:00+02:00',rate:0,quality:'low'}));
    await page.waitForFunction(()=>document.documentElement.dataset.landscapePeriod==='day'&&document.querySelector('[data-vehicle-header]')?.dataset.uiMode==='light');
    await new Promise(r=>setTimeout(r,150));
    assert.equal(await page.$eval('[data-vehicle-line]',e=>getComputedStyle(e).flexDirection),'row','vehicle sheet retains the shared layout');
    assert.equal(await page.$eval('[data-vehicle-header]',e=>getComputedStyle(e).color),'rgb(23, 37, 54)','daytime carrier heading uses dark ink');
    assert.ok(await page.$eval('[data-map-bus-sheet]',e=>getComputedStyle(e).backgroundColor.startsWith('rgba(')),'daytime sheet reveals the scenery through one tint');
    for(const width of [320,393]){
     await page.setViewport({width,height:851,deviceScaleFactor:1});
     assert.ok(await page.$eval('[data-map-bus-sheet]',e=>e.scrollWidth<=e.clientWidth+1),'vehicle panel fits '+width+'px');
     assert.ok(await page.evaluate(()=>Math.abs(document.querySelector('.pks-navigation').getBoundingClientRect().top-document.querySelector('[data-map-bus-sheet]').getBoundingClientRect().bottom-8)<1),'sheet has a balanced 8px gap above the rounded navigation');
     await page.screenshot({path:'test/ui-previews/landscape-bus-day-'+width+'.png'});
    }
    await page.evaluate(()=>window.__landscapePreview({iso:'2026-10-24T03:00:00+02:00',rate:0,quality:'low'}));
    await page.waitForFunction(()=>document.querySelector('[data-vehicle-header]')?.dataset.uiMode==='dark');
    assert.equal(await page.$eval('[data-vehicle-header]',e=>getComputedStyle(e).color),'rgb(255, 255, 255)','night carrier heading uses pale ink');
    await page.screenshot({path:'test/ui-previews/landscape-bus-night.png'});
    await page.evaluate(()=>window.__landscapePreview({iso:'2026-10-25T16:15:00+01:00',rate:0,quality:'low'}));
    await page.waitForFunction(()=>window.__landscapeDiagnostics().samples!==null);
    await new Promise(r=>setTimeout(r,350));
    await page.screenshot({path:'test/ui-previews/landscape-bus-warm-glass.png'});
    await page.evaluate(()=>window.__landscapePreview({iso:'2026-10-23T12:00:00+02:00',rate:0,quality:'low'}));
    await page.waitForFunction(()=>document.querySelector('[data-vehicle-header]')?.dataset.uiMode==='light');
    assert.ok(await page.$eval('[data-map-bus-sheet]',e=>getComputedStyle(e).backgroundImage.includes('radial-gradient')),'sheet has smooth optical highlights');
   }
   if(mode==='stop')assert.ok(await page.$$eval('[data-departure-row]>span:first-child',badges=>{
    const colorCanvas=document.createElement('canvas');colorCanvas.width=colorCanvas.height=1;const colorContext=colorCanvas.getContext('2d');
    const parse=s=>{colorContext.clearRect(0,0,1,1);colorContext.fillStyle=s;colorContext.fillRect(0,0,1,1);const c=colorContext.getImageData(0,0,1,1).data;return [c[0],c[1],c[2],c[3]/255];},lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const over=(a,b)=>a.slice(0,3).map((v,i)=>v*(a[3]??1)+b[i]*(1-(a[3]??1)));
    const panel=parse(document.documentElement.style.getPropertyValue('--landscape-surface'));
    return badges.length>0&&badges.every(e=>{
     const s=getComputedStyle(e),fg=lum(parse(s.color)),badge=parse(s.backgroundColor),row=parse(getComputedStyle(e.parentElement).backgroundColor);
     return [0,255].every(v=>{const bg=lum(over(badge,over(row,over(panel,[v,v,v]))));return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)>=4.5;});
    });
   }),'stop line numbers remain readable on the solar glass');
   assert.ok(await page.$eval('.map-detail-shell',e=>getComputedStyle(e).backgroundColor.startsWith('rgba(')),'glass sheet retains the saved opacity');
   assert.ok(await page.evaluate(()=>{const sheet=document.querySelector('.map-detail-shell'),nav=document.querySelector('.pks-navigation'),a=sheet.getBoundingClientRect(),b=nav.getBoundingClientRect(),s=getComputedStyle(sheet);return Math.abs(a.left-b.left)<1&&Math.abs(a.right-b.right)<1&&Math.abs(b.top-a.bottom-8)<1&&[s.borderTopLeftRadius,s.borderTopRightRadius,s.borderBottomLeftRadius,s.borderBottomRightRadius].every(r=>parseFloat(r)>=20);}),mode+' sheet matches the rounded dock on all four corners');
   await page.screenshot({path:'test/ui-previews/landscape-'+mode+'-expanded.png'});
   const handle=mode==='bus'?'[data-vehicle-header]':'.map-stop-handle';
   if(mode==='bus'){
    const motion=await page.evaluate(async()=>{
     const sheet=document.querySelector('[data-map-bus-sheet]'),heights=[];
     document.querySelector('[data-vehicle-header]').click();const start=performance.now();
     while(performance.now()-start<800){await new Promise(requestAnimationFrame);heights.push(Math.round(sheet.getBoundingClientRect().height));}
     return {heights};
    });
    assert.ok(new Set(motion.heights).size>4,'sheet height changes smoothly over successive frames');
   }else await page.click(handle);
   await page.waitForFunction(selector=>document.querySelector(selector)?.getAttribute('aria-expanded')==='false',{},handle);
   await page.screenshot({path:'test/ui-previews/landscape-'+mode+'-collapsed.png'});
  }
  await page.setViewport({width:393,height:851,deviceScaleFactor:1});
  for(const theme of ['light','light-warm','light-pink','light-sky','dark','dark-oled','dark-forest','dark-cosmos'])for(const mode of ['bus','stop']){
   await page.goto(origin+'/chrome-fixture/?theme='+theme+'&mode='+mode);
   await page.waitForFunction(()=>document.documentElement.dataset.personalChrome==='modern');
   await page.waitForFunction(()=>{const a=document.querySelector('.map-detail-shell')?.getBoundingClientRect(),b=document.querySelector('.pks-navigation')?.getBoundingClientRect();return a&&b&&Math.abs(a.left-b.left)<1&&Math.abs(a.right-b.right)<1&&Math.abs(b.top-a.bottom-8)<1;});
   if(theme==='light-sky'||theme==='dark-oled')await page.screenshot({path:'test/ui-previews/chrome-'+theme+'-'+mode+'-modern.png'});
  }
  const colors={pks:[213,242,239],mpk:[254,230,213],marcel:[233,246,213]};
  for(const carrier of Object.keys(colors))for(const theme of ['light','dark-oled']){
   await page.goto(origin+'/chrome-fixture/?carrier='+carrier+'&theme='+theme);
   await page.waitForSelector('[data-vehicle-carrier="'+carrier+'"]');
   assert.equal(await page.$$eval('[data-vehicle-route-badge][data-carrier-id],[data-vehicle-carrier-name]',els=>els.length),0,'no coloured tiles in the header');
   await page.click('[data-vehicle-header]');
   await page.waitForFunction(()=>document.querySelector('[data-map-bus-sheet]').dataset.expanded==='false');
   await page.waitForFunction(()=>{const a=document.querySelector('.map-detail-shell').getBoundingClientRect(),b=document.querySelector('.pks-navigation').getBoundingClientRect();return Math.abs(b.top-a.bottom-8)<1;});
   const fill=await page.$eval('[data-map-bus-sheet]',el=>({sheet:getComputedStyle(el).background,header:getComputedStyle(el.querySelector('[data-vehicle-header]')).backgroundColor}));
   assert.equal(fill.header,'rgba(0, 0, 0, 0)','one carrier fill covers the whole collapsed panel without a second tint');
   if(theme==='light')assert.ok(fill.sheet.includes(colors[carrier].join(', ')),JSON.stringify(fill));
   else assert.ok(fill.sheet.includes('linear-gradient'),'dark carrier tint remains visible');
   await page.screenshot({path:'test/ui-previews/chrome-carrier-'+carrier+'-'+theme+'.png'});
  }
  for(const theme of ['light','light-warm','light-pink','light-sky','dark','dark-oled','dark-forest','dark-cosmos'])for(const mode of ['bus','stop']){
   await page.goto(origin+'/chrome-fixture/?theme='+theme+'&mode='+mode);
   const handle=mode==='bus'?'[data-vehicle-header]':'.map-stop-handle';
   await page.waitForFunction(theme=>document.querySelector('[data-bus-sheet-fixture]')?.dataset.uiTheme===theme,{},theme);
   await page.waitForSelector(handle);
   await page.waitForFunction(()=>document.querySelector('.map-detail-shell')?.dataset.expanded==='true');
   const material=await page.$eval(handle,el=>({background:getComputedStyle(el).background,image:getComputedStyle(el).backgroundImage,color:getComputedStyle(el).backgroundColor,carrier:getComputedStyle(el.closest('.map-detail-shell')).getPropertyValue('--vehicle-carrier-background')}));
   if(mode==='bus')assert.ok(material.image!=='none'?!material.image.includes('rgba(')&&!material.image.includes('transparent'):!material.color.includes('rgba('),'carrier header is opaque in '+theme);
   await page.click(handle);await page.waitForFunction(()=>document.querySelector('.map-detail-shell')?.dataset.expanded==='false');
   const collapsed=await page.$eval(handle,el=>({background:getComputedStyle(el).background,carrier:getComputedStyle(el.closest('.map-detail-shell')).getPropertyValue('--vehicle-carrier-background')}));
   if(mode==='bus')assert.equal(collapsed.carrier,material.carrier,'both states share one carrier material in '+theme);
   else {assert.equal(collapsed.background,material.background,'stop header material is independent of expansion in '+theme);assert.ok(await page.$eval('[data-map-stop-sheet]',el=>!getComputedStyle(el).backgroundImage.includes('nebula')),'collapsed stop has no exposed artwork strip');}
  }
  await page.goto(origin+'/stop-refresh-fixture/');
  await page.waitForFunction(()=>document.querySelectorAll('[data-departure-row]').length===2);
  await page.evaluate(()=>{window.__oldDepartureRows=[...document.querySelectorAll('[data-departure-row]')];window.__rowPositions=window.__oldDepartureRows.map(el=>el.getBoundingClientRect().top);window.__startStopRefresh();});
  await page.waitForFunction(()=>window.__refreshCount===2&&window.__releaseDepartures);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.ok(await page.evaluate(()=>window.__oldDepartureRows.every((el,i)=>document.querySelectorAll('[data-departure-row]')[i]===el)),'partial refresh does not replace or remove existing rows');
  await page.evaluate(()=>window.__releaseDepartures());
  await page.waitForFunction(()=>document.querySelector('[data-departure-line="108"]').textContent.includes('+5 min'));
  assert.ok(await page.evaluate(()=>window.__oldDepartureRows.every((el,i)=>document.querySelectorAll('[data-departure-row]')[i]===el)),'ETA and vehicle updates retain DOM identity');
  assert.ok(await page.evaluate(()=>window.__oldDepartureRows.every((el,i)=>Math.abs(el.getBoundingClientRect().top-window.__rowPositions[i])<1)),'refresh updates digits without moving the departure cards');
  await page.screenshot({path:'test/ui-previews/steady-stop-refresh.png'});
  await page.goto(origin+'/readability-fixture/');
  await page.waitForFunction(()=>window.__landscapeDiagnostics?.().frames>1);
  for(const [phase,iso] of [['day','2026-10-26T12:00:00+01:00'],['sunset','2026-10-26T16:00:00+01:00'],['night','2026-10-26T02:00:00+01:00']])for(const opacity of [20,80]){
   await page.evaluate(({iso,opacity})=>{window.__landscapePreview({iso,rate:0,quality:'low'});localStorage.setItem('mks_interface_appearance_v1',JSON.stringify({glassOpacity:opacity}));window.dispatchEvent(new Event('pks-interface-appearance'));},{iso,opacity});
   await page.waitForFunction(()=>window.__landscapeDiagnostics().samples!==null);
   await page.waitForFunction(opacity=>{const s=getComputedStyle(document.querySelector('[role="alert"]'));return Math.abs(Number(s.backgroundColor.match(/[\d.]+/g).pop())-opacity/100)<.01;},{},opacity);
   await page.waitForFunction(ink=>getComputedStyle(document.querySelector('[role="alert"]')).color===ink,{},phase==='night'?'rgb(244, 248, 252)':'rgb(11, 27, 38)');
   const style=await page.$eval('[role="alert"]',el=>({filter:getComputedStyle(el).backdropFilter,ink:getComputedStyle(el).color}));
   assert.ok(style.filter.includes('contrast(0.2)'),'message has a reading shield');
   assert.equal(style.ink,phase==='night'?'rgb(244, 248, 252)':'rgb(11, 27, 38)');
   await page.click('[data-open-admin-menu]');
   await page.waitForFunction(()=>Math.abs(document.querySelector('[data-admin-sidebar]').getBoundingClientRect().left)<1);
   assert.ok(await page.$eval('[data-admin-sidebar]',el=>getComputedStyle(el).backdropFilter.includes('contrast(0.2)')));
   await page.screenshot({path:'test/ui-previews/readable-admin-'+phase+'-'+opacity+'.png'});
   await page.click('[aria-label="Zamknij menu administratora"]');
   await page.waitForFunction(()=>document.querySelector('[data-admin-sidebar]').getBoundingClientRect().right<=1);
   await page.screenshot({path:'test/ui-previews/readable-messages-'+phase+'-'+opacity+'.png'});
  }
  for(const [name,iso] of [['day','2026-10-26T12:00:00+01:00'],['sunset','2026-10-26T16:00:00+01:00'],['night','2026-10-26T02:00:00+01:00']]){
   await page.evaluateOnNewDocument(iso=>{const NativeDate=Date,fixed=NativeDate.parse(iso);window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};localStorage.setItem('mks_app_theme','dark-mountains');},iso);
   await page.goto(origin+'/theme-screens-fixture/');
   await page.waitForSelector('[data-startup-theme="dark-mountains"]');
   const material=await page.$eval('.pks-loading-screen',el=>({background:getComputedStyle(el).backgroundColor,glow:getComputedStyle(el).backgroundImage,ink:getComputedStyle(el).color}));
   assert.equal(material.ink,name==='night'?'rgb(244, 248, 252)':'rgb(11, 27, 38)');
   if(name==='day')assert.equal(material.background,'rgb(242, 248, 252)');
   if(name==='sunset')assert.ok(material.glow.includes('radial-gradient')&&!material.glow.includes('rgba(255, 232, 192, 0)'));
   if(name==='night')assert.equal(material.background,'rgb(24, 27, 43)');
   await page.screenshot({path:'test/ui-previews/landscape-loading-'+name+'.png'});
  }
  for(const mode of ['bus','stop']){
   await page.goto(origin+'/chrome-fixture/?style=classic&mode='+mode);
   await page.waitForFunction(()=>document.documentElement.dataset.personalChrome==='classic');
   await page.waitForFunction(()=>{const a=document.querySelector('.map-detail-shell')?.getBoundingClientRect(),nav=document.querySelector('.pks-navigation'),b=nav?.getBoundingClientRect();return a&&b&&a.left===0&&b.left===0&&Math.abs(b.width-innerWidth)<1&&Math.abs(a.bottom-b.top)<1&&parseFloat(getComputedStyle(nav).borderTopLeftRadius)===0;});
   await page.screenshot({path:'test/ui-previews/chrome-'+mode+'-classic.png'});
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync('test/ui-previews/landscape-metrics.json',JSON.stringify({environment:'Headless Chrome CI; not physical Android battery measurements',...metrics},null,2));
  console.log('Landscape: four solar views, live timetable, small phone, bounded canvas, reduced motion, background pause/resume and theme disposal verified. Draw metrics:',metrics.averageDrawMs,metrics.maxDrawMs);
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fixture.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
