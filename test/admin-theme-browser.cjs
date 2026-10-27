const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'horyzont-map-'));let browser,server;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/admin-theme-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/lib/use-global-api-statistics':path.join(root,'test/admin-statistics-hook-stub.ts'),'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/production.css"><div id="root"></div><script src="/fixture.js"></script>');}if(url.pathname==='/production.css'){res.setHeader('Content-Type','text/css');return res.end(css);}const base=/^\/(themes|data)\//.test(url.pathname)?path.join(root,'public'):temp,file=path.resolve(base,'.'+url.pathname);if(!file.startsWith(base+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream');res.end(fs.readFileSync(file));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message);});page.setDefaultTimeout(60000);
  await page.setViewport({width:393,height:851,deviceScaleFactor:1});
  fs.mkdirSync('test/ui-previews',{recursive:true});
  const contrast=(a,b)=>{const lum=c=>c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  for(const theme of ['dark-mountains','dark-cosmos','dark-forest','dark-oled','dark','light','light-warm','light-sky','light-pink'])for(const night of theme==='dark-mountains'?[false,true]:[false]){
   await page.goto(origin+'/?theme='+theme+(night?'&night':''));await page.waitForSelector('[data-statistics-chart]');
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent==='Dzisiaj').click());
   const stats=await page.evaluate(()=>{const chart=document.querySelector('[data-statistics-chart="requests"]'),plot=chart.querySelector('[data-statistics-plot]'),marks=chart.querySelectorAll('[data-statistics-marks] circle');return {plot:getComputedStyle(plot).fill,marks:[...marks].map(e=>({fill:getComputedStyle(e).fill,r:e.getAttribute('r')})),rects:[...chart.querySelectorAll('rect[role="button"]')].map(e=>getComputedStyle(e).stroke),exportBorder:getComputedStyle(document.querySelector('[data-statistics-export]')).borderTopWidth};});

   assert.equal(stats.marks.length,2,'single-day requests and errors both have marks');for(const m of stats.marks)assert.ok(contrast(m.fill,stats.plot)>=3,theme+' series contrast '+JSON.stringify(stats));assert.ok(stats.rects.every(s=>s==='none'));assert.equal(stats.exportBorder,'0px');
   await page.$eval('[data-statistics-chart="requests"]',e=>e.scrollIntoView({block:'center'}));await page.screenshot({path:'test/ui-previews/horyzont-admin-chart-'+theme+(night?'-night':'')+'.png'});
   await page.$eval('[data-statistics-chart="requests"] rect[role="button"]',e=>e.dispatchEvent(new MouseEvent('click',{bubbles:true})));await page.waitForSelector('[data-statistics-tooltip]');assert.match(await page.$eval('[data-statistics-tooltip]',e=>e.textContent),/100/);await page.keyboard.press('Escape');
   await page.$eval('[aria-label="Otwórz menu statystyk"]',e=>e.scrollIntoView());await page.click('[aria-label="Otwórz menu statystyk"]');await new Promise(r=>setTimeout(r,350));
   const sidebar=await page.$eval('[data-admin-sidebar]',e=>({bg:getComputedStyle(e).backgroundColor,ink:getComputedStyle(e).color,width:e.getBoundingClientRect().width,body:document.body.scrollWidth,card:getComputedStyle(document.querySelector('[data-control-card]')).backgroundColor}));
   assert.ok(sidebar.width<=393);assert.ok(sidebar.body<=393,'no sidebar or SVG overflow');
   if(theme==='dark-mountains'){assert.equal(sidebar.bg,night?'rgb(16, 29, 44)':'rgb(245, 249, 252)');assert.ok(contrast(sidebar.bg,sidebar.ink)>7);assert.ok(sidebar.card.endsWith('0.2)'),'other panels keep 20%');}
   if(theme==='dark-mountains'){
    for(const period of ['night','day',night?'night':'day']){
     await page.evaluate(period=>document.documentElement.dataset.landscapePeriod=period,period);
     assert.equal(await page.$eval('[data-admin-sidebar]',e=>getComputedStyle(e).backgroundColor),period==='night'?'rgb(16, 29, 44)':'rgb(245, 249, 252)','open sidebar follows live day/night change');
    }
   }
   await page.screenshot({path:'test/ui-previews/horyzont-admin-sidebar-'+theme+(night?'-night':'')+'.png'});console.log('PASS admin',theme,night?'night':'day',stats,sidebar);
  }
  for(const theme of ['dark-mountains','dark-cosmos','dark-forest','dark-oled','dark','light','light-warm','light-sky','light-pink'])for(const night of theme==='dark-mountains'?[false,true]:[false])for(const provider of theme==='dark-mountains'?['pks','mpk_rzeszow','marcel']:['pks']){
   await page.goto(origin+'/?view=bus&theme='+theme+(night?'&night':'')+'&provider='+provider);await page.waitForSelector('[data-map-bus-sheet]');
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-map-bus-sheet]')).opacity==='1');
   for(const expanded of [false,true,false]){
    if(expanded!==(await page.$eval('[data-map-bus-sheet]',e=>e.dataset.expanded==='true')))await page.click('[data-vehicle-header]');
    await page.waitForFunction(expanded=>document.querySelector('[data-map-bus-sheet]').dataset.expanded===String(expanded),{},expanded);await new Promise(r=>setTimeout(r,400));
    const panel=await page.$eval('[data-map-bus-sheet]',e=>{const h=e.querySelector('[data-vehicle-header]'),s=getComputedStyle(e),hs=getComputedStyle(h),r=e.getBoundingClientRect(),hr=h.getBoundingClientRect();return {fill:s.backgroundColor,image:s.backgroundImage,header:hs.backgroundColor,headerImage:hs.backgroundImage,ink:hs.color,height:r.height,headerHeight:hr.height,bottom:r.bottom,nav:document.querySelector('[data-test-navigation]').getBoundingClientRect().top,text:h.textContent};});
    assert.match(panel.text,/108/);assert.match(panel.text,/Scania/);assert.ok(panel.height>150&&panel.headerHeight>100,'bus header has its actual size');assert.ok(panel.bottom<=panel.nav+2,'sheet remains above navigation');
    // Collapsed sheets intentionally paint their carrier material on the
    // parent, with a transparent child header. Inspect the composed surface.
    const headerImage=panel.headerImage!=='none'?panel.headerImage:panel.image;
    const headerFill=/^rgb\(/.test(panel.header)?panel.header:panel.fill;
    assert.ok(headerImage!=='none'||/^rgb\(/.test(headerFill),'carrier header or its parent must paint an opaque surface: '+JSON.stringify(panel));
    if(theme==='dark-mountains')assert.ok(/^rgb\(/.test(panel.fill),'landscape bus sheet must retain a solid backing: '+JSON.stringify(panel));
    const headerColors=headerImage==='none'?[headerFill]:headerImage.match(/rgb\([^)]+\)/g)||[];assert.ok(headerColors.length>0);for(const c of headerColors)assert.ok(contrast(c,panel.ink)>=4.5,'readable vehicle header: '+JSON.stringify(panel));
    if(provider==='pks')await page.screenshot({path:'test/ui-previews/horyzont-bus-'+theme+(night?'-night':'')+(expanded?'-expanded':'-collapsed')+'.png'});
   }
   console.log('PASS bus sheet',theme,night?'night':'day',provider,'collapsed/expanded/collapsed');
  }
  await page.setRequestInterception(true);page.on('request',r=>r.url().includes('/data/stop-platform-index.json')?r.respond({status:404,body:'{}'}):r.url().includes('/data/stop-platforms.json')?r.respond({status:200,contentType:'application/json',body:JSON.stringify({points:[{id:'platform/1',name:'Test wspólny peron 01',lat:50.00007,lon:22.00007}]})}):r.continue());
  for(const provider of ['pks','mpk_rzeszow','marcel']){
   await page.goto(origin+'/?view=platform&provider='+provider);await page.waitForSelector('.map-stop-ring.is-selected');
   const state=()=>page.evaluate(()=>({circles:window.__platformCenters().circles.length,icons:window.__platformCenters().icons.length,glows:document.querySelectorAll('.map-stop-ring.is-selected').length,panel:!!document.querySelector('[data-stop-details]')}));
   assert.deepEqual(await state(),{circles:0,icons:2,glows:1,panel:false},'high zoom shows only highlighted catalog stop');
   await page.evaluate(()=>window.__platformZoom(15));await page.waitForFunction(()=>window.__platformCenters().circles.length===1&&window.__platformCenters().icons.length===0);
   assert.deepEqual(await state(),{circles:1,icons:0,glows:0,panel:false},'zoom out restores ordinary route dots');
   for(const zoom of [16,19,20]){
    await page.evaluate(zoom=>window.__platformZoom(zoom),zoom);await page.waitForFunction(()=>window.__platformCenters().circles.length===0&&window.__platformCenters().icons.length===2);
    assert.deepEqual(await state(),{circles:0,icons:2,glows:1,panel:false},'zoom '+zoom+' '+provider+' hides white dot and glows only the matching stop');
   }
   await page.evaluate(()=>window.__platformRefresh());await new Promise(r=>setTimeout(r,150));assert.deepEqual(await state(),{circles:0,icons:2,glows:1,panel:false},'catalog refresh keeps glow without a duplicate or panel');
   await page.evaluate(()=>window.__routeVisible(false));await page.waitForFunction(()=>!document.querySelector('.map-stop-ring.is-selected'));assert.deepEqual(await state(),{circles:0,icons:2,glows:0,panel:false},'deselecting route removes automatic glow');
   await page.evaluate(()=>window.__routeVisible(true));await page.waitForSelector('.map-stop-ring.is-selected');
   await page.evaluate(()=>window.__catalogVisible(false));await page.waitForFunction(()=>window.__platformCenters().circles.length===1&&window.__platformCenters().icons.length===0);assert.equal((await state()).panel,false,'disabled catalog retains route dots');
   await page.evaluate(()=>window.__catalogVisible(true));await page.waitForSelector('.map-stop-ring.is-selected');await new Promise(r=>setTimeout(r,300));
   assert.deepEqual(await state(),{circles:0,icons:2,glows:1,panel:false});assert.notEqual(await page.$eval('.map-stop-ring.is-selected',e=>getComputedStyle(e).boxShadow),'none','same visible halo as a pressed stop');
   await page.screenshot({path:'test/ui-previews/horyzont-platform-glow-'+provider+'.png'});
   await page.click('.map-stop-ring.is-selected');await page.waitForSelector('[data-stop-details]');assert.match(await page.$eval('[data-stop-details]',e=>e.textContent),/kliknięcia: 1/,'an explicit click still opens stop details');
   console.log('PASS route stop glow',provider,'zoom 15/16/19/20, refresh, deselection, hidden catalog; no automatic panel');
  }
  await page.goto(origin+'/?view=clouds');const clouds=await page.evaluate(()=>window.__cloudMaterialCheck);assert.equal(clouds.alphaMismatch,0,'identical cloud silhouettes day and night');assert.ok(clouds.visible>1000);assert.ok(clouds.nightRatio>.25&&clouds.nightRatio<.8,'night clouds keep visible texture without daytime lighting: '+JSON.stringify(clouds));console.log('PASS same cloud asset day/night',clouds);
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
