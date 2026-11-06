const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer'),postcss=require('postcss');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'stop-motion-'));let browser,server;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/stop-filter-motion-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((e,s)=>compiler.close(()=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));});
  const css=(await postcss([require('@tailwindcss/postcss')({base:root})]).process(fs.readFileSync('app/globals.css','utf8'),{from:path.join(root,'app/globals.css')})).css;
  server=http.createServer((req,res)=>{if(req.url.startsWith('/fixture.js')){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(temp,'fixture.js')));}res.setHeader('Content-Type','text/html');res.end('<meta charset="utf-8"><style>'+css+'</style><div id="root"></div><script src="/fixture.js"></script>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.stack||e.message);});
  await page.setViewport({width:393,height:1200,deviceScaleFactor:1});
  await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)?r.continue():r.abort());
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const lines=()=>page.$$eval('[data-departure-row]',es=>es.map(e=>e.dataset.departureLine));
  const click=async line=>page.$eval('[data-line-filter="'+line+'"]',e=>e.click());
  for(const theme of ['dark-mountains','light']){
   await page.goto(origin+'/?theme='+theme);await page.waitForFunction(()=>document.querySelectorAll('[data-departure-row]').length===5);await pause(600);
   const loads=await page.evaluate(()=>window.__loads);
   await page.evaluate(()=>window.__retained=document.querySelector('[data-departure-line="40"]'));
   await click('40');await pause(70);
   const entering=await page.$$eval('[data-departure-line="40"]',es=>es.map(e=>({opacity:Number(getComputedStyle(e).opacity),transform:getComputedStyle(e).transform,old:e===window.__retained})));
   assert.equal(entering.length,2);assert.ok(entering.some(e=>!e.old&&e.opacity<1&&e.transform!=='none'),theme+' new rows slide and fade');
   assert.ok(entering.some(e=>e.old), 'retained rows keep their DOM identity');
   await pause(500);assert.deepEqual(await lines(),['40','40']);
   await click('203');await pause(550);assert.deepEqual(await lines(),['203','40','203','40']);
   await click('40');await pause(550);assert.deepEqual(await lines(),['203','203']);
   await click('all');await pause(550);assert.deepEqual(await lines(),['108','203','40','108','203']);
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Pokaż wszystkie odjazdy')).click());
   await page.waitForFunction(()=>document.querySelectorAll('[data-departure-row]').length===6);
   await click('40');await pause(500);assert.deepEqual(await lines(),['40','40']);
   await click('203');await pause(70);
   assert.ok((await page.$$eval('[data-departure-line="203"]',es=>es.map(e=>Number(getComputedStyle(e).opacity)))).some(v=>v<1),'expanded list animates newly matching courses');
   await pause(500);await click('108');await click('40');await click('203');await pause(600);assert.deepEqual(await lines(),['108','108']);
   await page.evaluate(()=>window.__stable=document.querySelector('[data-departure-row]'));await pause(1100);
   assert.ok(await page.$eval('[data-departure-row]',e=>e===window.__stable&&getComputedStyle(e).opacity==='1'&&getComputedStyle(e).transform==='none'),'clock updates keep settled rows');
   assert.equal(await page.evaluate(()=>window.__loads),loads,'filtering does not reload departures');
  }
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await page.goto(origin);
  await page.waitForFunction(()=>document.querySelectorAll('[data-departure-row]').length===5);await pause(200);await click('40');await pause(40);
  assert.deepEqual(await lines(),['40','40']);assert.ok(await page.$$eval('[data-departure-row]',es=>es.every(e=>getComputedStyle(e).opacity==='1'&&getComputedStyle(e).transform==='none')),'reduced motion stays immediate');
  assert.deepEqual(errors,[]);console.log('PASS stop filter slide/fade, stable rows, multi-select, all/expanded lists, rapid clicks, clock refresh, no reloads and reduced motion in Horyzont and light themes.');
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
