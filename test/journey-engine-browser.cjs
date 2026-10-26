const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
const encode=require('./encode-polyline.cjs'),load=require('./load-ts.cjs');
const {roadDistance}=load('lib/bus-road-geometry.ts');
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'journey-engine-v2-'));let browser,server;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'production',devtool:false,plugins:[new webpack.DefinePlugin({'process.env':JSON.stringify({})})],entry:path.join(root,'test/journey-engine-browser-fixture.ts'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')}]},optimization:{minimize:false}});compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));});
  server=http.createServer((req,res)=>{
   if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<meta charset="utf-8"><body><script src="/fixture.js"></script></body>');}
   const file=path.resolve(temp,'.'+new URL(req.url,'http://localhost').pathname);
   if(!file.startsWith(temp+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage();
  const errors=[];let requests=0,hold=false,offline=false;
  page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
  page.on('request',request=>{
   if(!request.url().startsWith('https://'))return request.continue();
   requests++;if(hold)return;if(offline)return request.abort();
   let points;
   const valhalla=request.url().includes('valhalla');
   if(valhalla){const q=JSON.parse(new URL(request.url()).searchParams.get('json'));points=q.locations.map(p=>[p.lat,p.lon]);}
   else points=new URL(request.url()).pathname.split('/foot/')[1].split(';').map(p=>p.split(',').map(Number).reverse());
   const route=[points[0],[points[0][0]+.003,points[0][1]+.002],points[1]];
   const meters=route.slice(1).reduce((sum,p,i)=>sum+roadDistance(route[i],p),0);
   const body=valhalla?{trip:{legs:[{shape:encode(route)}],summary:{length:meters/1000}}}:{code:'Ok',routes:[{distance:meters,geometry:{coordinates:route.map(([lat,lon])=>[lon,lat])}}]};
   return request.respond({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
  });
  await page.goto(origin);await page.waitForFunction(()=>document.body.textContent==='ready').catch(error=>{throw Error(error.message+'; browser: '+errors.join('; '));});
  await page.evaluate(()=>window.runEngine());
  const first=await page.evaluate(()=>({result:window.__engineResult,workers:window.__workerCount,error:window.__engineError,progress:window.__engineProgress}));
  assert.equal(first.error,'');assert.equal(first.workers,1,'pedestrian rescans reuse one real Worker');assert.ok(first.progress>0);assert.ok(requests>0);
  assert.equal(first.result.journeys[0].arrival,Date.parse('2026-10-20T10:50:00Z'));
  assert.ok(first.result.journeys.every(j=>j.legs.every(l=>l.course!=='mpk:fast')),'the impossible crossing must be removed');
  const afterFirst=requests;offline=true;await page.reload();await page.waitForFunction(()=>document.body.textContent==='ready');
  await page.evaluate(()=>window.runEngine());
  assert.equal(await page.evaluate(()=>window.__engineError),'');assert.equal(requests,afterFirst,'verified persisted footpaths work offline after reload');
  offline=false;hold=true;const beforeCancel=requests;
  await page.evaluate(()=>{window.runEngine(true);});
  await new Promise((resolve,reject)=>{const start=Date.now();const check=()=>requests>beforeCancel?resolve():Date.now()-start>10000?reject(Error('No walking request before cancellation')):setTimeout(check,20);check();});
  await page.evaluate(()=>window.cancelEngine());await page.waitForFunction(()=>window.__engineError==='AbortError');assert.equal(await page.evaluate(()=>window.__engineResult),null);
  assert.deepEqual(errors,[]);console.log('PASS: real Worker search, routed transfer rejection and replacement, worker reuse, persistent offline footpaths, cancellation and no stale result.');
 }finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
