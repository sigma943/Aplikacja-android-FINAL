const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'pks-journeys-'));let server,browser,originalUrl;const assetCache=new Map();const android=process.env.JOURNEY_ANDROID_CDP;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/journey-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end('<meta charset="utf-8"><style>body{font-family:Arial,sans-serif}</style><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/production.css"><div id="root"></div><script src="/fixture.js"></script>');}if(url.pathname==='/production.css'){res.setHeader('Content-Type','text/css');return res.end(css);}const base=url.pathname.startsWith('/data/')?path.join(root,'public'):temp,file=path.resolve(base,'.'+url.pathname);if(!file.startsWith(base+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream');if(!assetCache.has(file))assetCache.set(file,fs.readFileSync(file));res.end(assetCache.get(file));});
  await new Promise(resolve=>server.listen(0,android?'0.0.0.0':'127.0.0.1',resolve));const origin=(android?'http://10.0.2.2:':'http://127.0.0.1:')+server.address().port;
  browser=android?await puppeteer.connect({browserURL:android,defaultViewport:null}):await puppeteer.launch({headless:true,args:['--no-sandbox']});const page=android?(await browser.pages())[0]:await browser.newPage(),errors=[],external=[];page.setDefaultNavigationTimeout(60000);if(android)originalUrl=page.url().startsWith('http://10.0.2.2:')?'https://localhost/':page.url();page.on('console',m=>{if(m.type()==='warn')console.log('BROWSER WARNING:',m.text());});page.on('requestfailed',r=>{if(r.url().includes('/data/journeys/'))console.log('FEED REQUEST FAILED:',r.url(),r.failure());});page.on('pageerror',e=>{errors.push(e.message);console.log('Page error:',e.message);});
  const network=await page.createCDPSession();await network.send('Network.enable');if(!process.env.JOURNEY_MAP_ONLY)await network.send('Network.setBlockedURLs',{urls:['https://*']});
  page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:')&&!r.url().startsWith('https://mt1.google.com/')&&!r.url().startsWith('https://routing.openstreetmap.de/routed-foot/'))external.push(r.url());});
  await page.setViewport({width:393,height:851,deviceScaleFactor:1});fs.mkdirSync('test/ui-previews',{recursive:true});
  const screenshot=name=>page.screenshot({path:'test/ui-previews/journeys-'+name+'.png'});
  if(process.env.JOURNEY_PICKER_ONLY){
   await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!document.querySelector('.connections-primary').disabled);
   await page.click('.connections-preferences');await page.click('[data-journey-to]');
   await page.waitForSelector('[data-journey-picker] .connections-picker-actions');
   assert.match(await page.$eval('[data-journey-picker] .connections-picker-actions',e=>e.textContent),/Twoja lokalizacja/);
   for(const width of [320,393,430]){
    await page.setViewport({width,height:851,deviceScaleFactor:1});
    const covered=await page.evaluate(()=>{const host=document.querySelector('.connections-picker-host'),rect=host.getBoundingClientRect(),picker=document.querySelector('[data-journey-picker]').getBoundingClientRect();return {bottom:rect.bottom,pickerBottom:picker.bottom,hit:Boolean(document.elementFromPoint(innerWidth/2,innerHeight-70)?.closest('.connections-picker-host')),overflow:host.scrollWidth>innerWidth};});
    assert.equal(covered.bottom,851);assert.equal(covered.pickerBottom,787);assert.equal(covered.hit,true);assert.equal(covered.overflow,false);
   }
   await page.setViewport({width:393,height:851,deviceScaleFactor:1});
   await page.evaluate(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(success){success({coords:{latitude:50.0412,longitude:21.9991}});}}}));
   await page.click('[data-journey-picker] .connections-use-location');await page.waitForFunction(()=>document.querySelector('[data-journey-to]').textContent.includes('Twoja lokalizacja'));
   await page.click('[data-journey-to]');await page.click('[data-journey-picker] .connections-use-location:nth-child(2)');
   await page.waitForSelector('.connections-place-leaflet canvas');
   assert.equal(await page.$('.connections-place-map .leaflet-marker-icon'),null,'map picker has no vehicle or stop bus icons');
   const mapRect=await page.$eval('.connections-place-leaflet',e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
   await page.mouse.click(mapRect.x+mapRect.w*.2,mapRect.y+mapRect.h*.35);
   await page.waitForFunction(()=>document.querySelector('.connections-place-confirm strong').textContent==='Punkt na mapie');
   await screenshot('map-picker-point');await page.click('.connections-place-confirm button');
   await page.waitForFunction(()=>document.querySelector('[data-journey-to]').textContent.includes('Punkt na mapie'));
   await page.click('[data-journey-to]');await page.click('[data-journey-picker] .connections-use-location:nth-child(2)');await page.waitForSelector('.connections-place-leaflet');
   await page.keyboard.press('Escape');await page.waitForSelector('[data-journey-picker] input');assert.equal(await page.$('.connections-place-leaflet'),null);
   await page.keyboard.press('Escape');assert.equal(await page.$('[data-journey-picker]'),null);assert.deepEqual(errors,[]);
   console.log('PASS: destination location, full picker coverage at 320/393/430px, map point selection, no bus icons and back navigation');return;
  }
  if(!process.env.JOURNEY_MAP_ONLY){
  await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>document.querySelector('.connections-primary')&&!document.querySelector('.connections-primary').disabled,{timeout:20000}).catch(async error=>{console.log('Initial screen',await page.$eval('body',e=>e.innerText),'errors',errors,'external',external);await screenshot('failure');throw error;});
  await screenshot('dark');await page.click('[data-journey-from]');await page.waitForSelector('[data-journey-picker] input[placeholder*="Babica"]');
  await page.type('[data-journey-picker] input[placeholder*="Babica"]','sloneczne');await page.waitForSelector('[data-journey-picker] [data-stop-card-id="5419"]');
  assert.ok(await page.$('[data-stop-line-badges]'),'the actual Stops tab cards include line badges');
  await screenshot('stop-picker');await page.click('[data-stop-card-id="5419"]');await page.click('[data-journey-to]');await page.type('[data-journey-picker] input[placeholder*="Babica"]','Rzeszów D.A.');await page.waitForSelector('[data-stop-card-id="journey:rzeszow-da"]');assert.equal(await page.$$eval('[data-journey-picker] [data-stop-card-id]',nodes=>nodes.filter(n=>/Rzeszów D\.A\./.test(n.textContent)).length),1,'station has exactly one picker entry');assert.doesNotMatch(await page.$eval('[data-stop-card-id="journey:rzeszow-da"]',e=>e.textContent),/st\.\s*\d/);await page.click('[data-stop-card-id="journey:rzeszow-da"]');
  await page.$eval('[aria-label="Data podróży"]',e=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,'2026-10-20');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.$eval('[aria-label="Godzina podróży"]',e=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,'09:30');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.click('.connections-primary');await page.waitForSelector('[data-journey-result]',{timeout:40000}).catch(async error=>{console.log('SEARCH FAILURE',await page.$eval('body',e=>e.innerText),errors,external);await screenshot('search-failure');throw error;});
  assert.equal(await page.$('.connections-error'),null);assert.ok((await page.$eval('.connections-results',e=>e.textContent)).includes('301'),'real full timetable finds the selected PKS corridor');
  await page.click('[data-journey-result] .connections-result');await page.waitForSelector('.connections-detail');await screenshot('results');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.querySelector('.connections-view').scrollWidth>document.querySelector('.connections-view').clientWidth+1);assert.equal(overflow,false,'mobile layout must not overflow horizontally');
  assert.equal(await page.$('.connections-save'),null);assert.ok(await page.$('.connections-recents'));assert.match(await page.$eval('.connections-detail',e=>e.textContent),/D\.A\. st\. 10/,'actual arrival platform is retained');
  await page.click('[aria-label="Zamień przystanki"]');assert.equal(await page.$('[data-journey-result]'),null,'changing endpoints clears stale results');assert.match(await page.$eval('[data-journey-from]',e=>e.textContent),/Rzeszów/i);
  await page.goto(origin+'/?theme=light',{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>!document.querySelector('.connections-primary').disabled);await screenshot('light');assert.ok(await page.$('.connections-recents'),'recent searches survive reload');
  await page.click('.connections-primary');assert.match(await page.$eval('[role="alert"]',e=>e.textContent),/Wybierz przystanek/);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[],'PKS/MPK planning works using local timetable assets without external APIs');await network.send('Network.setBlockedURLs',{urls:[]});
  await page.click('[data-journey-from]');await page.type('[data-journey-picker] input[placeholder*="Babica"]','Dworzec Główny');await page.waitForSelector('[data-stop-card-id="mpk_rzeszow:127"]');await page.click('[data-stop-card-id="mpk_rzeszow:127"]');
  await page.click('[data-journey-to]');await page.type('[data-journey-picker] input[placeholder*="Babica"]','Matuszczaka');await page.waitForSelector('[data-stop-card-id="3795"]');await page.click('[data-stop-card-id="3795"]');
  await page.$eval('[aria-label="Data podróży"]',e=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2026-10-20');e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.$eval('[aria-label="Godzina podróży"]',e=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'09:30');e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.click('.connections-primary');await page.waitForSelector('[data-journey-result]');assert.ok(await page.$('.connections-leg-badges [data-provider="mpk"]'),'full MPK timetables also produce real connections');
  await page.click('[data-journey-result] .connections-result');await page.waitForSelector('.connections-detail');
  await page.click('.connections-map-button');await page.waitForSelector('.journey-map .leaflet-container');await page.waitForFunction(()=>document.querySelectorAll('.journey-map path').length>=3);
  await screenshot('mpk-map');assert.deepEqual(errors,[]);
  await page.click('[data-journey-from]');await page.keyboard.press('Escape');assert.equal(await page.$('[data-journey-picker]'),null,'Escape closes the picker');
  for(const width of [320,430]){await page.setViewport({width,height:851,deviceScaleFactor:1});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no overflow at '+width+'px');}
  await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});
  await page.waitForFunction(()=>[...document.querySelectorAll('.leaflet-tile')].some(t=>t.complete&&t.naturalWidth>0));
  await page.waitForSelector('.connections-bus-path',{timeout:25000}).catch(async e=>{console.log('MAP FAILURE',await page.$eval('.connections-detail',e=>e.textContent),external);await screenshot('map-failure');throw e;});
  assert.ok((await page.$eval('.connections-bus-path',e=>e.getAttribute('stroke')))==='#ff7a00','MPK shares the main map color');
  assert.equal(await page.$('.marker-number'),null,'journey map has no vehicle icons');
  const layout=await page.evaluate(()=>{const a=document.querySelector('.connections-search-column').getBoundingClientRect(),b=document.querySelector('.connections-answer-column').getBoundingClientRect();return b.left>a.right;});assert.ok(layout,'desktop form and results are side by side');await screenshot('desktop');
  await browser.defaultBrowserContext().overridePermissions(origin,['geolocation']);await page.setGeolocation({latitude:50.0423,longitude:22.0034,accuracy:15});
  await page.click('[data-journey-from]');await page.click('.connections-use-location');await page.waitForFunction(()=>document.querySelector('[data-journey-from]').textContent.includes('Twoja lokalizacja'));
  await page.click('.connections-primary');await page.waitForFunction(()=>[...document.querySelectorAll('.connections-result-meta')].some(n=>n.textContent.includes('Całą trasę pieszo')),{timeout:30000});
  assert.ok(await page.$('.connections-leg-badges [data-provider="mpk"]'),'location also finds nearby bus departures');
  await page.evaluate(()=>[...document.querySelectorAll('[data-journey-result]')].find(n=>n.textContent.includes('Całą trasę pieszo')).querySelector('button').click());await page.click('.connections-map-button');
  await page.waitForSelector('.connections-walking-path',{timeout:20000});assert.equal(await page.$eval('.connections-walking-path',e=>e.getAttribute('stroke')),'#fff');assert.equal(await page.$eval('.connections-walking-path',e=>e.getAttribute('stroke-dasharray')),'5 10');assert.ok(await page.$('.connections-walk-marker'));
  assert.ok(await page.$eval('.connections-walking-path',e=>e.getAttribute('d').split('L').length>3),'walking route follows real streets and paths');
  const history=await page.evaluate(()=>JSON.parse(localStorage.getItem('pks-live:journey-recents')));assert.equal(history[0].from.lat,undefined,'location coordinates are not persisted');
  await screenshot('location-walk');
  await page.setViewport({width:393,height:851,deviceScaleFactor:1});await page.click('[aria-label="Powiększ mapę"]');await page.waitForSelector('.connections-map-modal .connections-walking-path');await page.waitForFunction(()=>{const tiles=[...document.querySelectorAll('.connections-map-modal .leaflet-tile')];return tiles.length>3&&tiles.every(t=>t.complete&&t.naturalWidth>0);},{timeout:20000});await page.screenshot({path:'test/ui-previews/journeys-mobile-real-route.png'});await page.keyboard.press('Escape');
  await page.click('[data-journey-from]');await page.evaluate(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(_success,failure){failure({code:1});}}}));await page.click('.connections-use-location');await page.waitForFunction(()=>document.querySelector('[data-journey-picker] [role="alert"]')?.textContent.includes('Zezwól'));await page.keyboard.press('Escape');assert.deepEqual(errors,[]);
  await page.click('[data-journey-from]');await page.type('[data-journey-picker] input[placeholder*="Babica"]','Rzeszów D.A.');await page.waitForSelector('[data-stop-card-id="journey:rzeszow-da"]');await page.click('[data-stop-card-id="journey:rzeszow-da"]');
  await page.click('[data-journey-to]');await page.type('[data-journey-picker] input[placeholder*="Babica"]','Gwoźnica Górna, Skr 13');await page.waitForSelector('[data-stop-card-id="10672"]');await page.screenshot({path:'test/ui-previews/journeys-crossing-picker.png'});await page.click('[data-stop-card-id="10672"]');
  await page.$eval('[aria-label="Godzina podróży"]',e=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'12:11');e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.click('.connections-primary');await page.waitForSelector('[data-journey-result]',{timeout:30000});await page.click('[data-journey-result] .connections-result');await page.waitForSelector('.connections-detail');
  assert.equal(await page.$$eval('.connections-detail .connections-leg[data-provider="pks"]',nodes=>nodes.length),1,'Gwoznica uses one outward bus instead of a trip to the terminus and back');
  assert.match(await page.$eval('.connections-detail',e=>e.textContent),/Dojście pieszo/);await page.screenshot({path:'test/ui-previews/journeys-gwoznica-crossing.png'});
  }
  // Mobile map controls, true viewport fitting and error recovery use deterministic geometry.
  await page.setViewport({width:393,height:851,deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await page.goto(origin+'/?map-case=curve',{waitUntil:'domcontentloaded'});await page.waitForSelector('.connections-walking-path');
  await page.waitForFunction(()=>!document.querySelector('.journey-map .leaflet-container').classList.contains('leaflet-grab'));
  const assertFitted=async()=>{await page.waitForFunction(()=>{const root=document.querySelector('.connections-map-modal')||document.querySelector('.journey-map'),map=root.querySelector('.leaflet-container').getBoundingClientRect(),path=root.querySelector('.connections-walking-path').getBoundingClientRect();return path.left>=map.left+15&&path.right<=map.right-15&&path.top>=map.top+15&&path.bottom<=map.bottom-15;});};
  await assertFitted();
  for(const [accent,color] of [['#8b5cf6','rgb(139, 92, 246)'],['#ff7a00','rgb(255, 122, 0)']]){
   await page.evaluate(value=>document.documentElement.style.setProperty('--pks-accent',value),accent);
   assert.equal(await page.$eval('.connections-walk-marker',e=>getComputedStyle(e).color),color,'pedestrian uses the selected accent');
   assert.equal(await page.$eval('.connections-walk-marker',e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
   await page.click('[aria-label="Powiększ mapę"]');await page.waitForSelector('.connections-map-modal .connections-walk-marker');assert.equal(await page.$eval('.connections-map-modal .connections-walk-marker',e=>getComputedStyle(e).color),color,'accent is preserved in the full-screen portal');await page.keyboard.press('Escape');
  }
  await page.evaluate(()=>document.documentElement.style.setProperty('--pks-accent','#00a3a2'));
  assert.ok(await page.evaluate(()=>{const dot=document.querySelector('.connections-stop-point').closest('.leaflet-pane'),route=document.querySelector('.connections-walking-path').closest('.leaflet-pane');return Number(getComputedStyle(dot).zIndex)>Number(getComputedStyle(route).zIndex); }),'stop points stay above asynchronously loaded route strokes');
  for(const [width,height] of [[320,568],[393,851],[430,932]]){
   await page.setViewport({width,height,deviceScaleFactor:1,isMobile:true,hasTouch:true});await assertFitted();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile map does not overflow '+width);
   const controls=await page.$$eval('.connections-map-toolbar button',nodes=>nodes.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));assert.ok(controls.every(r=>r.w>=44&&r.h>=44));
   const inlineHeight=await page.$eval('.journey-map',e=>e.clientHeight);
   await page.click('[aria-label="Powiększ mapę"]');assert.equal(await page.$eval('.journey-map',e=>e.clientHeight),inlineHeight,'opening the full-screen map preserves the underlying card height');await page.waitForSelector('[role="dialog"][aria-label="Mapa podróży na pełnym ekranie"]');await assertFitted();
   assert.ok(await page.$('.connections-map-modal .leaflet-grab'),'full-screen map supports panning with one finger');
   assert.equal(await page.$eval('.connections-view',e=>e.style.overflow),'hidden','background scrolling is locked');
   const size=await page.$eval('.connections-map-modal',e=>({height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width}));assert.ok(Math.abs(size.height-height)<1);assert.ok(Math.abs(size.width-width)<1);
   await page.click('[aria-label="Pokaż całą trasę"]');await assertFitted();
   if(width===393){await page.waitForFunction(()=>{const tiles=[...document.querySelectorAll('.connections-map-modal .leaflet-tile')];return tiles.length>3&&tiles.every(t=>t.complete&&t.naturalWidth>0);},{timeout:20000});await page.screenshot({path:'test/ui-previews/journeys-mobile-fullscreen.png'});await page.setViewport({width:851,height:393,deviceScaleFactor:1,isMobile:true,hasTouch:true});await assertFitted();assert.ok(await page.$eval('.connections-map-modal .leaflet-container',e=>e.clientHeight>=180));await page.screenshot({path:'test/ui-previews/journeys-mobile-landscape.png'});}
   await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.connections-map-modal'));
   assert.equal(await page.$eval('.connections-view',e=>e.style.overflow),'');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Powiększ mapę');
  }
  await page.setViewport({width:393,height:851,deviceScaleFactor:1,isMobile:true,hasTouch:true});await page.screenshot({path:'test/ui-previews/journeys-mobile-inline.png'});
  // The inline map must allow a vertical swipe to scroll the page, rather than trapping it.
  await page.evaluate(()=>{const spacer=document.createElement('div');spacer.style.height='1200px';document.querySelector('.connections-view').append(spacer);});
  const touch=await page.touchscreen.touchStart(180,300);await touch.move(180,220);await touch.move(180,140);await touch.end();await page.waitForFunction(()=>document.querySelector('.connections-view').scrollTop>40);
  await page.goto(origin+'/?map-case=missing',{waitUntil:'domcontentloaded'});await page.waitForSelector('.connections-map-error');assert.equal(await page.$('.connections-map-status'),null,'invalid coordinates terminate loading');
  await page.click('.connections-map-error button');await page.waitForSelector('.connections-map-error');await page.waitForFunction(()=>!document.querySelector('.connections-map-status'));assert.ok(await page.$('.connections-walking-path'),'a failed leg does not remove the valid route');assert.deepEqual(errors,[]);
  await page.goto(origin+'/?icons=1',{waitUntil:'domcontentloaded'});await page.waitForSelector('[data-nav-item="journeys"] [data-journey-tab-icon]');await page.screenshot({path:'test/ui-previews/journeys-new-icon.png'});
  console.log(process.env.JOURNEY_MAP_ONLY?'PASS: mobile fullscreen, touch scrolling, rotation, complete route framing, focus restoration and missing-coordinate recovery.':'PASS: shared stop picker, Polish search, full PKS 301 and MPK timetables in a Worker, real map tiles, physical platforms, location and routed walking, recents, desktop/mobile layouts, swap, dark/light mobile layouts, fullscreen map, touch scrolling, rotation, complete route framing, missing-coordinate recovery and offline API independence.');
 }finally{if(android&&browser){const page=(await browser.pages())[0];page.removeAllListeners('request');await page.setViewport(null).catch(()=>{});if(originalUrl)await page.goto(originalUrl,{waitUntil:'domcontentloaded',timeout:15000}).catch(()=>{});browser.disconnect();}else await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
