const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'font-ban-'));let browser,server;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/light-effects-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((e,stats)=>compiler.close(()=>e||stats.hasErrors()?reject(e||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(fs.readFileSync(path.join(temp,'fixture.js')));}res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}'+css+'</style><div id="root"></div><script src="/fixture.js"></script>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage(),errors=[];page.on('console',m=>{if(m.type()==='error')console.error('Browser console:',m.text());});page.on('pageerror',e=>{errors.push(e.message);console.error('Font/ban page error:',e.message);});
  await page.setViewport({width:393,height:851,deviceScaleFactor:1,isMobile:true,hasTouch:true});await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)?r.continue():r.abort());
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('[data-map-bus-sheet]');
  await page.waitForFunction(()=>{const s=document.querySelector('[data-map-bus-sheet]'),h=s?.querySelector('[data-vehicle-header]');return h&&Math.abs(s.getBoundingClientRect().height-h.offsetHeight)<3;});
  await page.click('[data-vehicle-header]');
  await page.waitForSelector('[data-next-departure]');
  assert.equal(await page.$('[data-route-stop-id]'),null,'finished vehicle has no stale stop list');
  assert.equal(await page.$('[data-map-bus-sheet] .animate-pulse'),null,'finished vehicle never shows endless skeletons');
  assert.match(await page.$eval('[data-next-departure]',n=>n.textContent),/Obliczanie czasu do kolejnego odjazdu/);
  await page.waitForFunction(()=>document.querySelector('[data-filter-cosmos]').dataset.active==='true');
  const saved=await page.evaluate(()=>({appearance:localStorage.getItem('mks_interface_appearance_v1'),glass:localStorage.getItem('mks_transparent')}));
  await page.click('[data-light-toggle]');
  await page.waitForFunction(()=>document.documentElement.dataset.personalLightEffects==='on');
  if(await page.$eval('[data-test-glass]',n=>getComputedStyle(n).backdropFilter)!=='none')console.error('Performance cascade diagnostics',await page.evaluate(()=>({attributes:[...document.documentElement.attributes].filter(a=>a.name.includes('personal')||a.name.includes('cosmic')).map(a=>[a.name,a.value]),matches:document.querySelector('[data-test-glass]').matches("html[data-personal-light-effects='on'] body *"),layers:[...document.styleSheets].flatMap(s=>{try{return [...s.cssRules].filter(r=>r.cssText.includes('pks-performance')).map(r=>r.cssText.slice(0,2200));}catch{return [];}})})));
  assert.notEqual(await page.evaluate(()=>window.__skipAnimations()),true,'light mode does not globally short-circuit motion layout updates');
  assert.equal(await page.$eval('[data-test-glass]',n=>getComputedStyle(n).backdropFilter),'none');
  assert.equal(await page.$eval('[data-test-glass]',n=>getComputedStyle(n).boxShadow),'none');
  assert.match(await page.$eval('[data-test-glass]',n=>getComputedStyle(n).backgroundColor),/^rgb\(/,'opaque panels');
  assert.equal(await page.$eval('[data-filter-cosmos]',n=>getComputedStyle(n).display),'none');
  assert.equal(await page.$eval('[data-filter-cosmos]',n=>n.dataset.active),'false');
  assert.notEqual(await page.$eval('[data-test-spinner]',n=>getComputedStyle(n).animationName),'none','useful loading spinner remains');
  assert.equal(await page.$eval('[data-test-spinner]',n=>getComputedStyle(n).animationDuration),'1s','reduced-motion CSS cannot accelerate the useful spinner');
  await page.click('[data-light-toggle]');
  await page.waitForFunction(()=>document.documentElement.dataset.personalLightEffects==='off');
  assert.notEqual(await page.$eval('[data-test-glass]',n=>getComputedStyle(n).backdropFilter),'none','glass returns');
  assert.notEqual(await page.$eval('[data-filter-cosmos]',n=>getComputedStyle(n).display),'none');
  assert.equal(await page.$eval('[data-filter-cosmos]',n=>n.dataset.active),'true','cosmic effects resume');
  assert.deepEqual(await page.evaluate(()=>({appearance:localStorage.getItem('mks_interface_appearance_v1'),glass:localStorage.getItem('mks_transparent')})),saved,'saved preferences survive the temporary mode');
  await page.click('[data-future]');await page.waitForSelector('[data-route-stop-id]');
  assert.equal(await page.$('[data-next-departure]'),null,'a known new course replaces the terminal placeholder');
  await page.click('[data-light-toggle]');
  await page.waitForFunction(()=>document.documentElement.dataset.personalLightEffects==='on');
  await page.click('[data-reopen]');await page.waitForSelector('[data-map-bus-sheet]',{hidden:true});
  await page.click('[data-reopen]');await page.waitForSelector('[data-map-bus-sheet]');
  await page.waitForFunction(()=>{const sheet=document.querySelector('[data-map-bus-sheet]'),header=sheet?.querySelector('[data-vehicle-header]');return header&&Math.abs(sheet.getBoundingClientRect().height-header.offsetHeight)<3;});
  const firstHeight=await page.$eval('[data-map-bus-sheet]',n=>n.getBoundingClientRect().height);
  await page.click('[data-reopen]');await page.waitForSelector('[data-map-bus-sheet]',{hidden:true});await page.click('[data-reopen]');
  await page.waitForFunction(h=>Math.abs(document.querySelector('[data-map-bus-sheet]').getBoundingClientRect().height-h)<3,{},firstHeight);
  await page.click('[data-devices]');await page.waitForSelector('[data-test-devices] [data-cosmic-panel]');
  for(const theme of ['light-sky','dark-forest']){
   await page.evaluate(t=>{localStorage.setItem('mks_app_theme',t);document.querySelector('.pks-theme-root').dataset.uiTheme=t;window.dispatchEvent(new Event('pks-interface-appearance'));},theme);
   assert.ok(await page.$$eval('[data-test-devices] [data-cosmic-panel]',cards=>cards.every(card=>{const box=card.getBoundingClientRect(),footer=card.lastElementChild.getBoundingClientRect();return footer.bottom<=box.bottom+1&&footer.top>=box.top;})),'device card footer remains inside the card in light mode: '+theme);
  }
  assert.deepEqual(errors,[]);console.log('PASS: reversible light effects, opaque glass, stopped cosmic accents, retained useful spinner, terminal state and next course');
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
