const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'horyzont-map-'));let browser,server;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/horyzont-map-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/production.css"><div id="root"></div><script src="/fixture.js"></script>');}if(url.pathname==='/production.css'){res.setHeader('Content-Type','text/css');return res.end(css);}const base=/^\/(themes|data)\//.test(url.pathname)?path.join(root,'public'):temp,file=path.resolve(base,'.'+url.pathname);if(!file.startsWith(base+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream');res.end(fs.readFileSync(file));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(60000);
  await page.setViewport({width:393,height:851,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(()=>localStorage.setItem('pks_horyzont_settings_v1',JSON.stringify({quality:'low'})));
  await page.setRequestInterception(true);page.on('request',r=>r.url().includes('routing.openstreetmap.de/routed-foot/')?r.respond({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:fs.readFileSync('test/fixtures/warszawska-foot-route.json','utf8')}):r.url().includes('valhalla')?r.respond({status:503,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:'{}'}):r.url().startsWith(origin)||/^(blob:|data:)/.test(r.url())?r.continue():r.respond({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#c8d0d8"/></svg>'}));
  fs.mkdirSync('test/ui-previews',{recursive:true});const checked=[];
  for(const theme of ['dark-mountains','dark-cosmos','dark-forest','dark-oled','dark','light','light-warm','light-sky','light-pink']){
   await page.goto(origin+'/?theme='+theme);await page.waitForSelector('.connections-bus-path');await page.waitForSelector('.connections-walking-path');
   await page.click('[aria-label="Powiększ mapę"]');await page.waitForSelector('.connections-map-modal .connections-bus-path');await page.waitForSelector('.connections-map-modal .connections-walking-path');assert.ok(await page.$eval('.connections-walking-path',e=>e.getAttribute('d').split('L').length>3),'walking follows the returned network');assert.match(await page.$eval('.connections-map-endpoint-note',e=>e.textContent),/nie jest potwierdzone/);
   const state=await page.evaluate(()=>{const modal=document.querySelector('.connections-map-modal'),header=modal.querySelector('.connections-map-toolbar'),sheet=modal.querySelector('.connections-map-sheet'),map=modal.querySelector('.leaflet-container'),p=modal.querySelector('.connections-bus-path'),hr=header.getBoundingClientRect(),sr=sheet.getBoundingClientRect();return {body:modal.parentElement===document.body,header:getComputedStyle(header).backgroundColor,sheet:getComputedStyle(sheet).backgroundColor,modal:getComputedStyle(modal).backgroundColor,position:getComputedStyle(modal).position,headerHit:modal.contains(document.elementFromPoint(innerWidth/2,Math.min(20,hr.bottom-1))),sheetHit:sheet.contains(document.elementFromPoint(innerWidth/2,sr.top+30)),line:p.getAttribute('d'),stroke:p.getAttribute('stroke'),mapHeight:map.clientHeight,top:modal.getBoundingClientRect().top,bottom:modal.getBoundingClientRect().bottom};});
   assert.equal(state.body,true,theme);assert.equal(state.position,'fixed');assert.equal(state.top,0);assert.equal(state.bottom,851);assert.ok(state.header.startsWith('rgb('),theme+' header is opaque: '+JSON.stringify(state));assert.ok(state.sheet.startsWith('rgb('),theme+' sheet is opaque');assert.ok(state.modal.startsWith('rgb('),theme+' modal is opaque');assert.equal(state.headerHit,true);assert.equal(state.sheetHit,true);assert.ok(state.line.includes('L'));assert.equal(state.stroke,'#14b8a6');assert.ok(state.mapHeight>120);
   await page.screenshot({path:'test/ui-previews/horyzont-map-'+theme+'.png'});checked.push(theme);
  }
  await page.goto(origin+'/?view=options&theme=dark-mountains');await page.waitForSelector('[data-landscape-settings]');await page.click('[data-landscape-settings]>summary');
  await page.waitForFunction(()=>window.__landscapeDiagnostics?.().renderer.quality==='low');
  await page.evaluate(()=>[...document.querySelectorAll('[data-landscape-settings] button')].find(e=>e.textContent.includes('Średnia')).click());
  await page.waitForFunction(()=>window.__landscapeDiagnostics().renderer.quality==='medium');
  const reading=await page.$eval('[data-landscape-settings]',e=>{const s=getComputedStyle(e),c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d');const parse=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};const bg=parse(s.backgroundColor),fg=parse(s.color);const lum=rgb=>rgb.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);return {background:s.backgroundColor,color:s.color,alpha:bg[3],contrast:(Math.max(lum(bg),lum(fg))+.05)/(Math.min(lum(bg),lum(fg))+.05)};});
  console.log('Horyzont settings reading surface:',reading);
  assert.equal(await page.$eval('[data-landscape-settings]',e=>getComputedStyle(e).backgroundColor),await page.$eval('.personal-group:not([data-landscape-settings])',e=>getComputedStyle(e).backgroundColor),'same material as adjacent option groups');assert.ok(reading.contrast>=4.5,'readable settings: '+JSON.stringify(reading));
  const sliders=await page.$$('[data-landscape-settings] input[type="range"]');assert.equal(sliders.length,5);
  for(const [key,label,max] of [['bloom','Siła poświaty wody',200],['reflections','Siła odbić światła',200],['rays','Rozchodzenie się promieni',200],['waveSpeed','Prędkość fal',200],['exposure','Jasność wody',150]]){
   for(const value of [key==='exposure'?50:0,max]){
    await page.$eval('[aria-label="'+label+'"]',(e,value)=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,String(value));e.dispatchEvent(new Event('input',{bubbles:true}));},value);
    await page.waitForFunction((key,value)=>JSON.parse(localStorage.getItem('pks_horyzont_settings_v1'))[key]===value&&window.__landscapeDiagnostics().renderer.effects[key]===value/100,{},key,value);
   }
  }
  for(const opacity of [20,85,100]){
   await page.evaluate(opacity=>{localStorage.setItem('mks_interface_appearance_v1',JSON.stringify({glassOpacity:opacity}));window.dispatchEvent(new Event('pks-interface-appearance'));},opacity);
   await page.waitForFunction(opacity=>[...document.querySelectorAll('[data-opacity-probes]>div,[data-opacity-probes]>article')].every(e=>{const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d');ctx.fillStyle=getComputedStyle(e).backgroundColor;ctx.fillRect(0,0,1,1);const expected=e.hasAttribute('data-adjustable-card')?opacity/100:1;return Math.abs(ctx.getImageData(0,0,1,1).data[3]/255-expected)<.01;}),{},opacity);
  }
  // Measure transmitted contrast in pixels: alpha alone missed the old
  // contrast(.2) scrim that visually hid the scenery at 20%, especially at night.
  for(const [period,iso] of [['day','2026-10-26T12:00:00+01:00'],['night','2026-10-26T20:07:00+01:00']]){
   await page.evaluate(iso=>{window.__landscapePreview({iso,rate:0,quality:'low',seconds:0});localStorage.setItem('mks_interface_appearance_v1',JSON.stringify({glassOpacity:20}));window.dispatchEvent(new Event('pks-interface-appearance'));},iso);
   await page.waitForFunction(period=>document.documentElement.dataset.landscapePeriod===period,{},period);
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-adjustable-card]')).backgroundColor.endsWith('0.2)'));
   await page.evaluate(()=>{const host=document.createElement('div');host.id='transmission-probe';host.style.cssText='position:fixed;top:0;left:0;width:160px;height:80px;z-index:30000;background:linear-gradient(to right,#000 50%,#fff 50%);isolation:isolate';const card=document.createElement('div');card.className='transit-card';card.style.cssText='position:absolute;inset:0;border:0;border-radius:0;box-shadow:none';host.append(card);document.body.append(host);});
   const probe=await page.$eval('#transmission-probe',e=>({x:scrollX,y:scrollY,filter:getComputedStyle(e.firstElementChild).backdropFilter,fill:getComputedStyle(e.firstElementChild).backgroundColor}));
   console.log('Transmission probe',period,probe);
   const shot=await page.screenshot({path:'test/ui-previews/horyzont-transmission-'+period+'.png',clip:{x:probe.x,y:probe.y,width:160,height:80}}),pixels=await require('sharp')(shot).removeAlpha().raw().toBuffer();
   const delta=[0,1,2].map(c=>Math.abs(pixels[(40*160+140)*3+c]-pixels[(40*160+20)*3+c]));
   assert.ok(delta.every(d=>d>170),period+' 20% cards must transmit background contrast: '+delta);
   await page.evaluate(()=>document.getElementById('transmission-probe').remove());
   console.log('20% panel transmitted contrast',period,delta);
  }
  const glowBefore=await page.$eval('[data-landscape-settings]',e=>getComputedStyle(e).backgroundImage);
  await page.evaluate(()=>{document.documentElement.dataset.panelGlow='on';document.documentElement.style.setProperty('--panel-glow-image','radial-gradient(at 0% 0%, rgb(10, 240, 100), transparent)');});
  const glowAfter=await page.$eval('[data-landscape-settings]',e=>getComputedStyle(e).backgroundImage);
  assert.notEqual(glowAfter,glowBefore,'Horyzont options must react to panel glow');assert.ok(glowAfter.includes('10, 240, 100'));assert.equal(glowAfter,await page.$eval('.personal-group:not([data-landscape-settings])',e=>getComputedStyle(e).backgroundImage),'same glow as other option groups');
  await page.evaluate(()=>{document.documentElement.dataset.panelGlow='off';document.documentElement.style.removeProperty('--panel-glow-image');});
  assert.equal(await page.$eval('[data-landscape-window="filter"]',e=>getComputedStyle(e).opacity),'1','filter sky stays independent of card opacity');
  await page.evaluate(()=>{localStorage.setItem('mks_interface_appearance_v1',JSON.stringify({glassOpacity:64}));window.dispatchEvent(new Event('pks-interface-appearance'));});
  await page.evaluate(()=>document.querySelector('[data-landscape-settings]').scrollIntoView());await page.screenshot({path:'test/ui-previews/horyzont-settings.png'});
  // Show the real layered scene, with fixed solar time, for visual inspection.
  await page.evaluate(()=>{document.querySelector('[data-personalization-panel]').style.display='none';document.querySelector('[data-opacity-probes]').style.display='none';window.__landscapePreview({iso:'2026-10-25T16:15:00+01:00',rate:0,quality:'high',seconds:0});});
  await page.waitForFunction(()=>window.__landscapeDiagnostics().renderer.quality==='high');
  for(const strength of [0,100,200]){
   await page.evaluate(strength=>{localStorage.setItem('pks_horyzont_settings_v1',JSON.stringify({quality:'high',bloom:strength,reflections:strength,rays:strength,waveSpeed:100,exposure:100}));window.dispatchEvent(new Event('pks-horyzont-settings'));},strength);
   await page.waitForFunction(strength=>window.__landscapeDiagnostics().renderer.effects.rays===strength/100,{},strength);
   await new Promise(r=>setTimeout(r,700));await page.screenshot({path:'test/ui-previews/horyzont-light-'+strength+'.png'});
  }
  await page.goto(origin+'/?view=options&theme=dark-cosmos');await page.waitForSelector('[data-personalization-panel]');assert.equal(await page.$('[data-landscape-settings]'),null);
  assert.deepEqual(errors,[]);console.log('PASS: visible route, body portal, opaque header/sheet, navigation isolation across',checked.join(', '),'; mixed walking route, adjustable panel opacity, Horyzont settings visibility and persistence');
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
