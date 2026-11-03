const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer'),postcss=require('postcss');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'bus-material-'));let browser,server;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/bus-carrier-material-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')}]},optimization:{minimize:false}});compiler.run((e,s)=>compiler.close(()=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));});
  const source=fs.readFileSync('app/globals.css','utf8'),begin=source.indexOf('/* Only Horyzont bus sheets have fixed carrier materials.'),end=source.indexOf('/* Daylight readability belongs',begin);assert.ok(begin>=0&&end>begin);
  const compile=async css=>(await postcss([require('@tailwindcss/postcss')({base:root})]).process(css,{from:path.join(root,'app/globals.css')})).css;
  const css=await compile(source),baseline=await compile(source.slice(0,begin)+source.slice(end));
  server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link id="sheet" rel="stylesheet" href="/current.css"><div id="root"></div><script src="/fixture.js"></script>');}if(['/current.css','/baseline.css'].includes(url.pathname)){res.setHeader('Content-Type','text/css');return res.end(url.pathname==='/current.css'?css:baseline);}if(url.pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(temp,'fixture.js')));}res.statusCode=404;res.end();});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.stack||e.message);});await page.setViewport({width:393,height:851,deviceScaleFactor:1});await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)?r.continue():r.abort());
  const metrics=()=>page.evaluate(()=>{const read=e=>{const s=getComputedStyle(e);return{fill:s.backgroundColor,image:s.backgroundImage,ink:s.color,edge:s.borderColor};};const bus=document.querySelector('[data-map-detail-kind="bus"]');return{panel:read(bus),header:read(bus.querySelector('[data-vehicle-header]')),cards:[...bus.querySelectorAll('.map-detail-row')].map(read),loading:[...bus.querySelectorAll('[data-vehicle-loading-marker]')].map(read),punctuality:[...bus.querySelectorAll('.text-rose-500,.text-emerald-500')].map(read),neighbours:['[data-test-map]','[data-test-search]','[data-test-stop]','[data-test-navigation]'].map(s=>read(document.querySelector(s)))};});
  const switchCss=async name=>{await page.evaluate(name=>new Promise((resolve,reject)=>{const s=document.getElementById('sheet');s.onload=resolve;s.onerror=reject;s.href='/'+name+'.css';}),name);};
  const previewDir='test/ui-previews';fs.mkdirSync(previewDir,{recursive:true});
  const colours={};let checks=0;
  for(const provider of ['pks','marcel','mpk_rzeszow'])for(const night of [false,true]){
   await page.goto(origin+'/?provider='+provider+(night?'&night':''));await page.waitForSelector('[data-vehicle-header]');
   let reference;
   for(const accent of ['#3b82f6','#f43f5e','#a3e635']){
    await page.evaluate(c=>window.__busAccent(c),accent);await page.waitForFunction(c=>getComputedStyle(document.documentElement).getPropertyValue('--pks-accent').trim()===c,{},accent);
    for(const expanded of [true,false]){
     if(await page.$eval('[data-map-detail-kind="bus"]',e=>e.dataset.expanded==='true')!==expanded)await page.click('[data-vehicle-header]');
     await page.waitForFunction(v=>document.querySelector('[data-map-detail-kind="bus"]').dataset.expanded===String(v),{},expanded);
     await page.waitForSelector('[data-vehicle-metrics]',{hidden:!expanded});
     const current=await metrics();if(expanded)assert.ok(current.punctuality.length,'delayed status is rendered');await switchCss('baseline');const previous=await metrics();await switchCss('current');assert.deepEqual(current.neighbours,previous.neighbours,'adjacent views are unchanged');assert.deepEqual(current.punctuality,previous.punctuality,'status colours are unchanged');
     const own={panel:current.panel,header:current.header,cards:current.cards};
     const key=String(expanded);reference??={};if(reference[key])assert.deepEqual(own,reference[key],provider+' '+night+' ignores accent');else reference[key]=own;
     checks++;
    }
   }
   colours[provider+'-'+night]=reference.true.panel.fill;
   await page.screenshot({path:path.join(previewDir,'bus-carrier-'+provider+(night?'-night':'-day')+'.png')});
  }
  for(const night of [false,true])assert.equal(new Set(['pks','marcel','mpk_rzeszow'].map(p=>colours[p+'-'+night])).size,3,'three separate carrier shades');
  for(const theme of ['light','dark','dark-oled','light-pink','light-sky','dark-forest','dark-cosmos']){
   await page.goto(origin+'/?theme='+theme);await page.waitForSelector('[data-vehicle-header]');const current=await metrics();if(expanded)assert.ok(current.punctuality.length,'delayed status is rendered');await switchCss('baseline');assert.deepEqual(await metrics(),current,theme+' remains unchanged');checks++;
  }
  await page.goto(origin+'/?provider=pkp_intercity');await page.waitForSelector('[data-vehicle-header]');const train=await metrics();await switchCss('baseline');assert.deepEqual(await metrics(),train,'rail panels remain unchanged');
  await page.goto(origin+'/?provider=pks&loading');await page.waitForSelector('[data-vehicle-loading-marker]');const loader=(await metrics()).loading;await page.evaluate(()=>window.__busAccent('#f43f5e'));await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--pks-accent').trim()==='#f43f5e');assert.deepEqual((await metrics()).loading,loader,'loading marker ignores the user accent');
  assert.deepEqual(errors,[]);console.log('PASS '+checks+' bus palette/theme configurations, day/night, collapsed/expanded, neighbouring views, rail isolation and loading marker.');
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
