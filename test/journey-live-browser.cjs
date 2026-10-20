const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'pks-live-journey-'));let browser,server;
 try{
  const entry=path.join(root,'test/journey-live-fixture.tsx');
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry,output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/lib/journey-loader':entry,'@/lib/journey-catalog':entry,'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((e,stats)=>compiler.close(()=>e||stats.hasErrors()?reject(e||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(temp,'.'+pathname);if(pathname.endsWith('.js')&&file.startsWith(temp+path.sep)&&fs.existsSync(file)){res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(fs.readFileSync(file));}if(pathname!=='/'){res.statusCode=404;return res.end();}res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial}'+css+'</style><div id="root"></div><script src="/fixture.js"></script>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Page error:',e.message);});
  await page.setViewport({width:393,height:851,deviceScaleFactor:1,isMobile:true,hasTouch:true});await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)?r.continue():r.abort());
  await page.evaluateOnNewDocument(()=>{const schedule=window.setTimeout;window.setTimeout=((fn,ms,...args)=>schedule(fn,ms===30000?90:ms,...args));});
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForSelector('.connections-recent-delete .lucide-trash2');
  assert.equal(await page.$$eval('.connections-recent',nodes=>nodes.length),5,'history restores only five recent searches');
  assert.equal(await page.$('.connections-intro'),null);
  assert.equal(await page.$eval('.connections-recent-delete',e=>getComputedStyle(e).color),'rgb(251, 113, 133)');
  await page.click('.connections-recent>button:first-child');await page.click('.connections-primary');await page.waitForSelector('[data-journey-result]');
  assert.equal(await page.$$eval('.connections-recent',nodes=>nodes.length),5);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('pks-live:journey-recents')).length),5);
  await page.click('.connections-result');await page.waitForSelector('.connections-detail');assert.doesNotMatch(await page.$eval('.connections-detail',e=>e.textContent),/Odśwież połączenia|Godziny z uwzględnieniem/);
  await page.click('.connections-map-button');await page.waitForSelector('.connections-walk-marker');
  await page.evaluate(()=>{window.__testMap=document.querySelector('.journey-map .leaflet-container');window.__testCalls=window.__liveCalls;});
  await page.waitForFunction(()=>window.__liveCalls>=window.__testCalls+2);
  assert.ok(await page.$('.connections-detail'),'automatic refresh preserves expanded details');
  assert.equal(await page.$('.connections-duration .connections-delay-badge'),null,'duration is not labelled with a course delay');
  assert.equal(await page.$('.connections-result .connections-delay-badge'),null,'summary hides badges while live times keep updating');
  assert.ok(await page.$('.connections-departure-clock .connections-delay-badge'));
  assert.equal(await page.$$eval('.connections-stop-point',nodes=>nodes.length),5,'all intermediate stops have a dot');
  assert.ok(await page.$$eval('.connections-stop-point.is-stop',nodes=>nodes.every(n=>n.getAttribute('fill')==='#fff')),'bus stops use white dots');
  for(const role of ['start','end','transfer'])assert.equal(await page.$$eval('.connections-route-point.is-'+role,n=>n.length),1,'one '+role+' marker');
  assert.equal(await page.$eval('.connections-stop-details summary strong',e=>e.textContent),'3 przystanki');
  assert.equal(await page.$eval('.connections-heading p',e=>e.textContent),'Rozkłady jazdy i planowanie podróży');
  await page.click('.connections-stop-details summary');assert.ok(await page.$('.connections-stop-details[open]'));await page.click('.connections-stop-details summary');
  assert.ok(await page.evaluate(()=>{
   const routes=[...document.querySelectorAll('.connections-bus-path,.connections-walking-path')];
   return [...document.querySelectorAll('.connections-stop-point')].every(dot=>{
    const rect=dot.getBoundingClientRect(),x=(rect.left+rect.right)/2,y=(rect.top+rect.bottom)/2;
    return routes.some(route=>{const length=route.getTotalLength(),matrix=route.getScreenCTM();for(let i=0;i<=Math.ceil(length);i++){const p=route.getPointAtLength(Math.min(length,i)),screen=new DOMPoint(p.x,p.y).matrixTransform(matrix);if(Math.hypot(screen.x-x,screen.y-y)<1.5)return true;}return false;});
   });
  }),'all white dots lie on the route, including the offset intermediate platform');
  await page.$eval('.journey-map',e=>e.scrollIntoView());
  fs.mkdirSync('test/ui-previews',{recursive:true});await page.screenshot({path:'test/ui-previews/journeys-geometry.png'});
  assert.equal(await page.evaluate(()=>window.__testMap===document.querySelector('.journey-map .leaflet-container')),true,'automatic refresh retains the same map');
  assert.equal(await page.$('.leaflet-control-attribution'),null);
  assert.equal(await page.$('.connections-map-footer'),null);
  const rect=await page.$eval('.journey-map .leaflet-container',e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
  assert.ok(await page.$('.journey-map .leaflet-grab'),'inline map enables dragging');
  const pan=await page.$eval('.leaflet-map-pane',e=>e.style.transform),scroll=await page.$eval('.connections-view',e=>e.scrollTop);
  const touch=await page.touchscreen.touchStart(rect.x+rect.w*.4,rect.y+rect.h*.5);await touch.move(rect.x+rect.w*.6,rect.y+rect.h*.5);await touch.end();
  await page.waitForFunction(before=>document.querySelector('.leaflet-map-pane').style.transform!==before,{},pan);
  assert.equal(await page.$eval('.connections-view',e=>e.scrollTop),scroll,'one-finger map drag does not scroll the page');
  const originalDot=await page.$eval('.connections-stop-point.is-stop',e=>e.getBoundingClientRect().width);
  const sizes=[];
  await page.keyboard.down('Shift');try{await page.click('.leaflet-control-zoom-out');}finally{await page.keyboard.up('Shift');}
  await new Promise(r=>setTimeout(r,500));
  const distantDot=await page.$eval('.connections-stop-point.is-stop',e=>e.getBoundingClientRect().width);assert.ok(distantDot<originalDot,'stop dots shrink when zoomed out');
  sizes.push(await page.$eval('.connections-walk-marker',e=>parseFloat(e.style.width)));
  const centered=await page.$eval('.connections-walk-marker',e=>{const r=e.getBoundingClientRect(),s=e.querySelector('svg').getBoundingClientRect();return Math.abs((r.left+r.right-s.left-s.right)/2)<1&&Math.abs((r.top+r.bottom-s.top-s.bottom)/2)<1;});assert.equal(centered,true);assert.ok(sizes[0]<=24,'distant pedestrian marker stays compact');
  await page.click('[data-fixture-toggle]');const before=await page.evaluate(()=>window.__liveCalls);await new Promise(r=>setTimeout(r,400));assert.equal(await page.evaluate(()=>window.__liveCalls),before,'inactive tab stops polling');
  await page.click('[data-fixture-toggle]');await page.waitForFunction(count=>window.__liveCalls>count,{},before);
  await page.click('[aria-label="Zamień przystanki"]');const stopped=await page.evaluate(()=>window.__liveCalls);await new Promise(r=>setTimeout(r,400));assert.equal(await page.evaluate(()=>window.__liveCalls),stopped,'changing query cancels automatic refresh');
  for(let i=0;i<5;i++)await page.click('.connections-recent-delete');assert.equal(await page.$('.connections-recents'),null);assert.deepEqual(errors,[]);
  fs.mkdirSync('test/ui-previews',{recursive:true});await page.screenshot({path:'test/ui-previews/journeys-live-refresh.png'});console.log('PASS: 30-second refresh, stable details/map, inactive cancellation, trash icon, centered compact walker and map attribution');
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
