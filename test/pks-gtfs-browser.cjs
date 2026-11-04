const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer'),postcss=require('postcss');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'pks-gtfs-'));let browser,server;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/pks-gtfs-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((e,s)=>compiler.close(()=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));});
  const fixture=require('./pks-gtfs-fixtures.cjs'),parse=require('./load-ts.cjs')('lib/pks-gtfs.ts').parsePksGtfs;let version=1,broken=false,requests=0;
  const css=(await postcss([require('@tailwindcss/postcss')({base:root})]).process(fs.readFileSync('app/globals.css','utf8'),{from:path.join(root,'app/globals.css')})).css;
  server=http.createServer((req,res)=>{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(temp,'fixture.js')));}
   if(['/api/pks/gtfs','/api/mpk/gtfs'].includes(url.pathname)){requests++;if(broken){res.statusCode=503;return res.end('offline');}res.setHeader('ETag','"v'+version+'"');res.setHeader('Content-Type','application/zip');return res.end(Buffer.from(fixture(version)));}
   if(url.pathname==='/set-version'){version=Number(url.searchParams.get('v'));broken=url.searchParams.has('broken');return res.end('ok');}
   if(['/data/journeys/pks.json','/data/journeys/mpk.json'].includes(url.pathname)){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(parse(fixture(1),url.pathname.includes('/mpk.')?'mpk':'pks')));}
   if(url.pathname.startsWith('/data/')){const p=path.join(root,'public',url.pathname);if(fs.existsSync(p)){res.setHeader('Content-Type',p.endsWith('.gz')?'application/gzip':'application/json');return res.end(fs.readFileSync(p));}res.statusCode=404;return res.end();}
   if(url.pathname.startsWith('/api/')){res.statusCode=503;return res.end('upstream unavailable');}
   res.setHeader('Content-Type','text/html');res.end('<meta charset="utf-8"><style>'+css+'</style><div id="root"></div><script src="/fixture.js"></script>');
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.stack||e.message);});await page.setViewport({width:393,height:1000});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.evaluateOnNewDocument(()=>{const NativeDate=Date;window.__clock=NativeDate.parse('2026-11-04T06:00:00Z');window.Date=class extends NativeDate{constructor(...args){if(args.length)super(...args);else super(window.__clock);}static now(){return window.__clock;}};});
  await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)?r.continue():r.abort());
  const snapshot=()=>page.$eval('#snapshot',e=>JSON.parse(e.textContent));
  await page.goto(origin);await page.waitForFunction(()=>Boolean(window.__refreshPks));await page.evaluate(()=>window.__refreshPks());
  await page.waitForFunction(()=>document.querySelectorAll('[data-departure-row]').length===2);
  let state=await snapshot();assert.deepEqual(state.lines,['108','109']);assert.deepEqual(state.journeys,['108','109']);assert.ok(state.hasLutcza&&state.mapped);assert.deepEqual(state.feedLines,['108','109']);
  const firstRevision=state.revision;
  await page.evaluate(()=>fetch('/set-version?v=2'));await page.evaluate(()=>window.__refreshPks());
  state=await snapshot();assert.deepEqual(state.lines,['108','109'],'first response cannot remove a PKS course');assert.deepEqual(state.mpkLines,['108','109'],'first response cannot remove an MPK course');assert.equal(state.pksStatus,'confirming');assert.equal(state.mpkStatus,'confirming');
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('[data-departure-row]').length===2);state=await snapshot();assert.deepEqual(state.lines,['108','109'],'a restart cannot bypass pending PKS confirmation');assert.deepEqual(state.mpkLines,['108','109'],'a restart cannot bypass pending MPK confirmation');
  await page.evaluate(()=>{window.__clock+=15*60*1000;});await page.evaluate(()=>window.__refreshPks());
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-departure-row]')].map(e=>e.dataset.departureLine).join(',')==='109,245');
  state=await snapshot();assert.deepEqual(state.lines,['109','245']);assert.deepEqual(state.journeys,['109','245']);assert.deepEqual(state.feedLines,['109','245']);assert.deepEqual(state.mpkLines,['109','245']);assert.equal(state.mpkStopLines,'109,245');assert.notEqual(state.revision,firstRevision);
  await page.evaluate(()=>fetch('/set-version?v=2&broken'));await page.evaluate(()=>window.__refreshPks());assert.deepEqual((await snapshot()).lines,['109','245']);
  await page.waitForFunction(()=>new Promise(resolve=>{const open=indexedDB.open('pks-live-gtfs',1);open.onsuccess=()=>{const db=open.result;const tx=db.transaction('feeds');const request=tx.objectStore('feeds').get('pks');request.onsuccess=()=>{const yes=Boolean(request.result?.feed?.trips?.some(t=>t[1]==='245'));db.close();resolve(yes);};};}));
  const beforeReload=requests;await page.reload();await page.waitForFunction(()=>document.querySelectorAll('[data-departure-row]').length===2);
  state=await snapshot();assert.deepEqual(state.lines,['109','245'],'offline restart uses the committed updated feed');assert.deepEqual(state.journeys,['109','245']);assert.ok(requests<=beforeReload+2,'failed requests are throttled');
  assert.deepEqual(errors,[]);console.log('PASS real stop UI, shared journey feed, PKS/MPK additions, confirmed withdrawals, shared planner, IndexedDB persistence and offline restart.');
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
