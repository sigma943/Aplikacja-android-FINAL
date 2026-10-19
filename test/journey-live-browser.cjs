const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'pks-live-journey-'));let browser,server;
 try{
  const entry=path.join(root,'test/journey-live-fixture.tsx');
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry,output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/lib/journey-loader':entry,'@/lib/journey-catalog':entry,'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((e,stats)=>compiler.close(()=>e||stats.hasErrors()?reject(e||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(temp,'.'+pathname);if(pathname.endsWith('.js')&&file.startsWith(temp+path.sep)&&fs.existsSync(file)){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(file));}if(pathname!=='/'){res.statusCode=404;return res.end();}res.setHeader('Content-Type','text/html');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial}'+css+'</style><div id="root"></div><script src="/fixture.js"></script>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Page error:',e.message);});
  await page.setViewport({width:393,height:851,deviceScaleFactor:1});await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)?r.continue():r.abort());
  await page.evaluateOnNewDocument(()=>{const schedule=window.setTimeout;window.setTimeout=((fn,ms,...args)=>schedule(fn,ms===30000?90:ms,...args));});
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForSelector('.connections-recent-delete .lucide-trash2');
  assert.equal(await page.$eval('.connections-recent-delete',e=>getComputedStyle(e).color),'rgb(251, 113, 133)');
  await page.click('.connections-recent>button:first-child');await page.click('.connections-primary');await page.waitForSelector('[data-journey-result]');
  await page.click('.connections-result');await page.waitForSelector('.connections-detail');assert.doesNotMatch(await page.$eval('.connections-detail',e=>e.textContent),/Odśwież połączenia|Godziny z uwzględnieniem/);
  await page.click('.connections-map-button');await page.waitForSelector('.connections-walk-marker');
  await page.evaluate(()=>{window.__testMap=document.querySelector('.journey-map .leaflet-container');window.__testCalls=window.__liveCalls;});
  await page.waitForFunction(()=>window.__liveCalls>=window.__testCalls+2);
  assert.ok(await page.$('.connections-detail'),'automatic refresh preserves expanded details');
  assert.equal(await page.evaluate(()=>window.__testMap===document.querySelector('.journey-map .leaflet-container')),true,'automatic refresh retains the same map');
  assert.doesNotMatch(await page.$eval('.leaflet-control-attribution',e=>e.textContent),/Leaflet/);assert.match(await page.$eval('.leaflet-control-attribution',e=>e.textContent),/Google.*OpenStreetMap/);
  const sizes=[];
  await page.keyboard.down('Shift');try{await page.click('.leaflet-control-zoom-out');}finally{await page.keyboard.up('Shift');}
  await new Promise(r=>setTimeout(r,500));sizes.push(await page.$eval('.connections-walk-marker',e=>parseFloat(e.style.width)));
  const centered=await page.$eval('.connections-walk-marker',e=>{const r=e.getBoundingClientRect(),s=e.querySelector('svg').getBoundingClientRect();return Math.abs((r.left+r.right-s.left-s.right)/2)<1&&Math.abs((r.top+r.bottom-s.top-s.bottom)/2)<1;});assert.equal(centered,true);assert.ok(sizes[0]<=24,'distant pedestrian marker stays compact');
  await page.click('[data-fixture-toggle]');const before=await page.evaluate(()=>window.__liveCalls);await new Promise(r=>setTimeout(r,400));assert.equal(await page.evaluate(()=>window.__liveCalls),before,'inactive tab stops polling');
  await page.click('[data-fixture-toggle]');await page.waitForFunction(count=>window.__liveCalls>count,{},before);
  await page.click('[aria-label="Zamień przystanki"]');const stopped=await page.evaluate(()=>window.__liveCalls);await new Promise(r=>setTimeout(r,400));assert.equal(await page.evaluate(()=>window.__liveCalls),stopped,'changing query cancels automatic refresh');
  await page.click('.connections-recent-delete');assert.equal(await page.$('.connections-recents'),null);assert.deepEqual(errors,[]);
  fs.mkdirSync('test/ui-previews',{recursive:true});await page.screenshot({path:'test/ui-previews/journeys-live-refresh.png'});console.log('PASS: 30-second refresh, stable details/map, inactive cancellation, trash icon, centered compact walker and map attribution');
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
