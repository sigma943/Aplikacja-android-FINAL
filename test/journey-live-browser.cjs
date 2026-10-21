const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'pks-live-journey-'));let browser,server;
 try{
  const entry=path.join(root,'test/journey-live-fixture.tsx');
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry,output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/lib/journey-loader':entry,'@/lib/journey-catalog':entry,'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((e,stats)=>compiler.close(()=>e||stats.hasErrors()?reject(e||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(temp,'.'+pathname);if(pathname.endsWith('.js')&&file.startsWith(temp+path.sep)&&fs.existsSync(file)){res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(fs.readFileSync(file));}if(pathname==='/themes/kosmos/nebula.jpg'){res.setHeader('Content-Type','image/jpeg');return res.end(fs.readFileSync(path.join(root,'public/themes/kosmos/nebula.jpg')));}if(pathname!=='/'){res.statusCode=404;return res.end();}res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial}'+css+'</style><div id="root"></div><script src="/fixture.js"></script>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Page error:',e.message);});
  await page.setViewport({width:393,height:851,deviceScaleFactor:1,isMobile:true,hasTouch:true});await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)?r.continue():r.abort());
  await page.evaluateOnNewDocument(()=>{const schedule=window.setTimeout;window.setTimeout=((fn,ms,...args)=>schedule(fn,ms===30000?90:ms,...args));});
  await page.evaluateOnNewDocument(()=>Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:resolve=>resolve({coords:{latitude:50.04,longitude:22}})}}));
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForSelector('.connections-recent-delete .lucide-trash2');
  assert.equal(await page.$$eval('.connections-recent',nodes=>nodes.length),5,'history restores only five recent searches');
  assert.equal(await page.$('.connections-intro'),null);
  assert.equal(await page.$eval('.connections-recent-delete',e=>getComputedStyle(e).color),'rgb(251, 113, 133)');
  await page.click('.connections-recent>button:first-child');
  await page.click('[data-journey-from]');await page.waitForSelector('[data-journey-picker] .connections-use-location');await page.click('[data-journey-picker] .connections-use-location');
  await page.waitForFunction(()=>document.querySelector('[data-journey-from]').textContent.includes('Twoja lokalizacja'));
  await page.click('.connections-preferences');await page.click('[aria-label="Bez limitu przesiadek"]');await page.click('[aria-label="Bez limitu czasu na przesiadkę"]');
  assert.equal(await page.$eval('[aria-label="Bez limitu przesiadek"]',e=>e.getAttribute('aria-pressed')),'true');
  await page.$eval('[aria-label="Maksymalny dystans pieszo"]',e=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(e,'50');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.click('.connections-primary');await page.waitForSelector('[data-journey-result]');
  await page.waitForSelector('[data-journey-refining]');assert.equal(await page.$eval('.connections-primary',e=>e.disabled),false,'local results are usable before Marcel finishes');
  assert.deepEqual(await page.evaluate(()=>({transfers:window.__preferences.maxTransfers,buffer:window.__preferences.transferMinutes,walk:window.__preferences.walkMeters})),{transfers:-1,buffer:0,walk:50});
  assert.equal(await page.$('.connections-recents'),null,'successful results hide history');
  assert.equal(await page.$eval('.connections-result .connections-duration',e=>e.textContent),'1 godz 30 min');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('pks-live:journey-recents')).length),5);
  await page.click('.connections-result');await page.waitForSelector('.connections-detail');await page.evaluate(()=>window.__finishEnrichment());await page.waitForSelector('[data-journey-refining]',{hidden:true});assert.ok(await page.$('.connections-detail'),'enrichment preserves the open journey');assert.doesNotMatch(await page.$eval('.connections-detail',e=>e.textContent),/Odśwież połączenia|Godziny z uwzględnieniem/);
  await page.waitForFunction(()=>[...document.querySelectorAll('.connections-disclosure')].every(n=>n.clientHeight>=n.scrollHeight-1),{timeout:2000});
  await page.click('.connections-detail [data-journey-leg="0"]');
  assert.equal(await page.$('.journey-map'),null,'ordinary stage headings do not open the map');
  assert.equal(await page.$('.connections-detail button[data-journey-leg]'),null,'ordinary details have no accidental map controls');
  await page.click('.connections-map-button');await page.waitForSelector('.connections-walking-path');
  await page.$eval('.connections-walking-path',e=>e.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.waitForSelector('.connections-walking-path.is-focused');
  assert.ok(await page.$('.connections-bus-path.is-muted'),'selecting a path on the map still highlights the leg');
  await page.$eval('[aria-label="Pokaż całą trasę"]',n=>n.scrollIntoView({behavior:'instant',block:'center'}));
  await page.click('[aria-label="Pokaż całą trasę"]');await page.waitForFunction(()=>!document.querySelector('.connections-walking-path.is-focused'));
  await page.waitForSelector('.connections-walk-marker');
  await page.evaluate(()=>{window.__testMap=document.querySelector('.journey-map .leaflet-container');window.__testCalls=window.__liveCalls;});
  await page.waitForFunction(()=>window.__liveCalls>=window.__testCalls+2);
  assert.match(await page.$eval('.connections-detail',e=>e.textContent),/Twoja lokalizacja/);
  assert.equal(await page.$$eval('.connections-stage-number',n=>n.length),3);
  assert.ok(await page.$('.connections-leg-card .connections-stop-details'),'calls remain inside their bus stage');
  assert.ok(await page.$('.connections-detail'),'automatic refresh preserves expanded details');
  assert.equal(await page.$('.connections-duration .connections-delay-badge'),null,'duration is not labelled with a course delay');
  assert.equal(await page.$('.connections-result .connections-delay-badge'),null,'summary hides badges while live times keep updating');
  assert.ok(await page.$('.connections-departure-clock .connections-delay-badge'));
  assert.equal(await page.$eval('.connections-detail [data-journey-leg="2"]',e=>e.parentElement.querySelector('.connections-duration').textContent),'1 godz 19 min');
  assert.equal(await page.$$eval('.connections-stop-point',nodes=>nodes.length),5,'all intermediate stops have a dot');
  assert.ok(await page.$$eval('.connections-stop-point.is-stop',nodes=>nodes.every(n=>n.getAttribute('fill')==='#fff')),'bus stops use white dots');
  for(const role of ['start','end','transfer'])assert.equal(await page.$$eval('.connections-route-point.is-'+role,n=>n.length),1,'one '+role+' marker');
  assert.equal(await page.$eval('.connections-stop-details summary strong',e=>e.textContent),'3 przystanki');
  assert.equal(await page.$eval('.connections-heading p',e=>e.textContent),'Rozkłady jazdy i planowanie podróży');
  await page.click('.connections-stop-details summary');assert.ok(await page.$('.connections-stop-details[open]'));await page.click('.connections-stop-details summary');
  assert.ok(await page.evaluate(()=>{
   const dots=[...document.querySelectorAll('.connections-stop-point')];
   const routes=[...document.querySelectorAll('.connections-bus-path')];
   return dots.some(dot=>{
    const r=dot.getBoundingClientRect(),x=(r.left+r.right)/2,y=(r.top+r.bottom)/2;
    return routes.every(route=>{const length=route.getTotalLength(),m=route.getScreenCTM();for(let i=0;i<=Math.ceil(length);i++){const p=route.getPointAtLength(Math.min(length,i)),s=new DOMPoint(p.x,p.y).matrixTransform(m);if(Math.hypot(s.x-x,s.y-y)<2)return false;}return true;});
   });
  }),'physical passenger platforms are not snapped onto the bus road');
  await page.$eval('.journey-map',e=>e.scrollIntoView());
  fs.mkdirSync('test/ui-previews',{recursive:true});await page.screenshot({path:'test/ui-previews/journeys-geometry.png'});
  assert.equal(await page.evaluate(()=>window.__testMap===document.querySelector('.journey-map .leaflet-container')),true,'automatic refresh retains the same map');
  assert.equal(await page.$('.leaflet-control-attribution'),null);
  assert.equal(await page.$('.connections-map-footer'),null);
  const rect=await page.$eval('.journey-map .leaflet-container',e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
  assert.ok(await page.$('.journey-map .leaflet-grab'),'inline map enables dragging');
  assert.equal(await page.$('.connections-walk-marker.leaflet-interactive'),null,'decorative pedestrian cannot intercept stop taps');
  await page.click('.connections-stop-point.is-stop');await page.waitForSelector('.connections-stop-point.is-selected');assert.equal(await page.$('.leaflet-popup'),null);assert.equal(await page.$('.connections-selected-stop'),null);assert.ok(await page.$('.connections-stop-badge'));
  assert.ok(await page.$eval('.connections-stop-badge',e=>{const b=e.getBoundingClientRect(),map=e.closest('.leaflet-container').getBoundingClientRect(),x=map.x+Number(e.dataset.anchorX),y=map.y+Number(e.dataset.anchorY);return Math.hypot(Math.max(b.left-x,0,x-b.right),Math.max(b.top-y,0,y-b.bottom))<=30&&!(x>b.left&&x<b.right&&y>b.top&&y<b.bottom);}),'badge stays beside the selected dot without covering it');await page.screenshot({path:'test/ui-previews/journeys-stop-badge.png'});await page.click('[aria-label="Zamknij opis przystanku"]');
  for(const theme of ['light-sky','dark-forest','light-pink']){await page.evaluate(t=>{document.querySelector('.pks-theme-root').dataset.uiTheme=t;document.documentElement.style.setProperty('--theme-decoration',window.__journeyThemes[t]);},theme);assert.match(await page.$eval('.connections-view',e=>getComputedStyle(e).backgroundImage),/data:image/);await page.screenshot({path:'test/ui-previews/journeys-'+theme+'.png'});}
  await page.evaluate(()=>{document.querySelector('.pks-theme-root').dataset.uiTheme='dark';document.documentElement.style.removeProperty('--theme-decoration');});
  const pan=await page.$eval('.leaflet-map-pane',e=>e.style.transform),scroll=await page.$eval('.connections-view',e=>e.scrollTop);
  const touch=await page.touchscreen.touchStart(rect.x+rect.w*.4,rect.y+rect.h*.5);await touch.move(rect.x+rect.w*.6,rect.y+rect.h*.5);await touch.end();
  await page.waitForFunction(before=>document.querySelector('.leaflet-map-pane').style.transform!==before,{},pan);
  assert.equal(await page.$eval('.connections-view',e=>e.scrollTop),scroll,'one-finger map drag does not scroll the page');
  const originalDot=await page.$eval('.connections-stop-point.is-stop',e=>e.getBoundingClientRect().width);
  const sizes=[];
  await page.keyboard.down('Shift');try{await page.click('.leaflet-control-zoom-out');}finally{await page.keyboard.up('Shift');}
  await new Promise(r=>setTimeout(r,500));
  const distantDots=await page.$$eval('.connections-stop-point.is-stop',nodes=>nodes.map(e=>e.getBoundingClientRect().width));
  assert.ok(distantDots.every(width=>width<originalDot&&width>=4.4),'visible distant dots stay compact with a readable white centre');
  for(const role of ['start','end','transfer'])assert.ok(await page.$('.connections-route-point.is-'+role),'important points stay visible when ordinary stops are thinned');
  sizes.push(await page.$eval('.connections-walk-marker',e=>parseFloat(e.style.width)));
  const centered=await page.$eval('.connections-walk-marker',e=>{const r=e.getBoundingClientRect(),s=e.querySelector('svg').getBoundingClientRect();return Math.abs((r.left+r.right-s.left-s.right)/2)<1&&Math.abs((r.top+r.bottom-s.top-s.bottom)/2)<1;});assert.equal(centered,true);assert.ok(sizes[0]<=24,'distant pedestrian marker stays compact');
  // Fullscreen keeps its own accessible, draggable journey details.
  await page.click('[aria-label="Powiększ mapę"]');await page.waitForSelector('.connections-map-sheet');
  assert.equal(await page.$eval('.connections-sheet-handle',e=>e.getAttribute('aria-expanded')),'false');
  assert.equal(await page.$eval('.connections-map-modal',e=>Boolean(e.closest('.pks-theme-root'))),true,'fullscreen keeps the active theme context');
  assert.equal(await page.$eval('.connections-map-modal>.connections-map-toolbar',e=>getComputedStyle(e).backgroundColor),'rgb(11, 20, 34)','header is opaque');
  for(const role of ['start','end','transfer'])assert.ok(await page.$eval('.connections-map-modal .connections-route-point.is-'+role,e=>Boolean(e.querySelector('svg path'))),'distinct symbol for '+role);
  for(const theme of ['light-sky','dark-forest','light-pink']){
   await page.evaluate(t=>{document.querySelector('.pks-theme-root').dataset.uiTheme=t;document.documentElement.style.setProperty('--theme-decoration',window.__journeyThemes[t]);},theme);
   assert.match(await page.$eval('.connections-map-sheet',e=>getComputedStyle(e).backgroundImage),/data:image/);
   await page.screenshot({path:'test/ui-previews/journeys-map-panel-'+theme+'.png'});
  }
  await page.evaluate(()=>{document.querySelector('.pks-theme-root').dataset.uiTheme='dark-cosmos';document.documentElement.dataset.cosmicTheme='on';document.documentElement.style.removeProperty('--theme-decoration');});
  assert.equal(await page.$eval('.connections-map-sheet>[data-filter-cosmos]',e=>getComputedStyle(e).display),'block');
  assert.equal(await page.$('.leaflet-container [data-filter-cosmos]'),null,'decorations stay out of streets');
  await page.screenshot({path:'test/ui-previews/journeys-map-panel-cosmos.png'});

  assert.match(await page.$eval('.connections-sheet-summary',e=>e.textContent),/1 godz 30 min.*108.*11.*100 m pieszo/);
  const handle=await page.$eval('.connections-sheet-handle',e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+8};});
  const drag=await page.touchscreen.touchStart(handle.x,handle.y);await drag.move(handle.x,handle.y-180);await drag.end();
  await page.waitForSelector('.connections-map-sheet.is-expanded');
  await page.waitForFunction(()=>document.querySelector('.connections-map-sheet').getBoundingClientRect().height>300);
  assert.equal(await page.$$eval('.connections-map-sheet .connections-stage-number',nodes=>nodes.length),3);
  await page.screenshot({path:'test/ui-previews/journeys-fullscreen-details.png'});
  await page.click('.connections-map-sheet [data-journey-leg="1"]');
  await page.waitForSelector('.connections-map-modal .connections-bus-path.is-focused');
  assert.ok(await page.$('.connections-map-sheet.is-expanded'),'focusing a route keeps the details sheet open');
  await page.waitForFunction(()=>{
   const path=document.querySelector('.connections-map-modal .connections-bus-path.is-focused');if(!path)return false;
   const route=path.getBoundingClientRect(),map=path.closest('.leaflet-container').getBoundingClientRect();
   const points=[...document.querySelectorAll('.connections-map-modal .connections-stop-point')];
   return Math.max(route.width,route.height)>Math.min(map.width,map.height)*.3&&points.every(p=>{const r=p.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return x>map.left+4&&x<map.right-4&&y>map.top+4&&y<map.bottom-4;});
  },{timeout:3000});
  const footprint=await page.$eval('.connections-map-modal .connections-bus-path.is-focused',p=>{const r=p.getBoundingClientRect(),m=p.closest('.leaflet-container').getBoundingClientRect();return {route:Math.max(r.width,r.height),map:Math.min(m.width,m.height)};});
  assert.ok(footprint.route>footprint.map*.3,'expanded sheet does not subtract its height twice and over-zoom the route');
  await page.evaluate(()=>{document.documentElement.dataset.personalLightEffects='on';document.documentElement.dataset.personalMotion='reduced';document.documentElement.dataset.personalMapMotion='normal';});
  await page.click('.connections-map-modal .leaflet-control-zoom-in');
  await page.waitForSelector('.connections-map-modal .leaflet-zoom-anim');
  assert.equal(await page.$eval('.connections-map-modal .leaflet-zoom-anim .leaflet-zoom-animated',n=>getComputedStyle(n).transitionDuration),'0.25s','light effects preserve Leaflet zoom timing');
  await page.evaluate(()=>{document.documentElement.dataset.personalLightEffects='off';document.documentElement.dataset.personalMotion='normal';});

  assert.equal(await page.$$eval('.connections-map-modal .connections-stop-point',nodes=>nodes.length),3,'the focused bus shows all its calls');
  const mapBefore=await page.evaluate(()=>{window.__focusedMap=document.querySelector('.connections-map-modal .leaflet-container');window.__focusedPath=document.querySelector('.connections-map-modal .connections-bus-path.is-focused');return window.__liveCalls;});
  await page.waitForFunction(n=>window.__liveCalls>n,{},mapBefore);
  assert.ok(await page.evaluate(()=>window.__focusedMap===document.querySelector('.connections-map-modal .leaflet-container')&&window.__focusedPath===document.querySelector('.connections-map-modal .connections-bus-path.is-focused')),'live updates preserve fullscreen and the focused stage');
  await page.screenshot({path:'test/ui-previews/journeys-fullscreen-focused-bus.png'});
  assert.ok(await page.$('.connections-map-sheet.is-expanded'));
  await page.click('.connections-sheet-all');assert.ok(await page.$('.connections-map-sheet.is-expanded'),'showing the entire journey also keeps details open');
  await page.click('.connections-map-sheet .connections-stop-details summary');
  assert.match(await page.$eval('.connections-map-sheet .connections-stop-details[open]',e=>e.textContent),/Przystanek pośredni/);
  const upper=await page.$eval('.connections-sheet-handle',e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+8};});
  const down=await page.touchscreen.touchStart(upper.x,upper.y);await down.move(upper.x,upper.y+150);await down.end();
  await page.waitForFunction(()=>!document.querySelector('.connections-map-sheet.is-expanded')&&document.querySelector('.connections-map-sheet').getBoundingClientRect().height<130);
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.connections-map-modal'));
  await page.click('[aria-label="Pokaż całą trasę"]');
  await page.click('[data-fixture-toggle]');const before=await page.evaluate(()=>window.__liveCalls);await new Promise(r=>setTimeout(r,400));assert.equal(await page.evaluate(()=>window.__liveCalls),before,'inactive tab stops polling');
  await page.click('[data-fixture-toggle]');await page.waitForFunction(count=>window.__liveCalls>count,{},before);
  await page.click('[aria-label="Zamień przystanki"]');const stopped=await page.evaluate(()=>window.__liveCalls);await new Promise(r=>setTimeout(r,400));assert.equal(await page.evaluate(()=>window.__liveCalls),stopped,'changing query cancels automatic refresh');
  for(let i=0;i<5;i++)await page.click('.connections-recent-delete');assert.equal(await page.$('.connections-recents'),null);assert.deepEqual(errors,[]);
  fs.mkdirSync('test/ui-previews',{recursive:true});await page.screenshot({path:'test/ui-previews/journeys-live-refresh.png'});console.log('PASS: 30-second refresh, stable details/map, inactive cancellation, trash icon, centered compact walker and map attribution');
 }catch(error){
  const pages=await browser?.pages().catch(()=>[]);const page=pages?.find(page=>page.url().startsWith('http://127.0.0.1:'));
  if(page){fs.mkdirSync('test/ui-previews',{recursive:true});await page.screenshot({path:'test/ui-previews/journeys-interaction-failure.png'}).catch(()=>{});console.error('Journey UI state:',await page.evaluate(()=>({focus:[...document.querySelectorAll('.connections-leg-focus')].map(e=>({label:e.getAttribute('aria-label'),pressed:e.getAttribute('aria-pressed')})),sheet:document.querySelector('.connections-map-sheet')?.outerHTML.slice(0,1800),routes:[...document.querySelectorAll('.connections-walking-path,.connections-bus-path')].map(e=>({class:e.getAttribute('class'),stroke:e.getAttribute('stroke'),opacity:e.getAttribute('stroke-opacity')}))})).catch(()=>null));}
  throw error;
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
