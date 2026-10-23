const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),puppeteer=require('puppeteer');
(async()=>{
 process.env.NEXT_PUBLIC_LANDSCAPE_PREVIEW='true';
 const fixture=require('./build-accent-fixture.cjs')();let server,browser;
 try{
  server=http.createServer((req,res)=>{let f=path.join(fixture.root,decodeURIComponent(new URL(req.url,'http://local').pathname));if(!f.startsWith(fixture.root)){res.writeHead(403);return res.end();}if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');if(!fs.existsSync(f)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(f));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:393,height:851,deviceScaleFactor:1});
  await page.setRequestInterception(true);page.on('request',req=>req.url().startsWith(origin)||req.url().startsWith('data:')?req.continue():req.abort());
  await page.goto(origin+'/landscape-fixture/');await page.waitForFunction(()=>window.__landscapeDiagnostics?.().frames>0&&document.querySelector('[data-landscape-stage]')?.dataset.assetsReady==='true');
  fs.mkdirSync('test/ui-previews',{recursive:true});
  await page.addStyleTag({content:'[data-fixture-controls]{visibility:hidden}'});
  for(const [name,iso] of [['day','2026-10-23T12:00:00+02:00'],['sunset','2026-10-23T17:10:00+02:00'],['night','2026-10-26T23:00:00+01:00'],['sunrise','2026-10-23T07:10:00+02:00']]){
   await page.evaluate(iso=>window.__landscapePreview({iso,rate:0}),iso);
   await page.waitForFunction(()=>window.__landscapeDiagnostics().samples!==null);
   await page.screenshot({path:'test/ui-previews/landscape-'+name+'.png'});
  }
  // At a fixed astronomical instant, changes below the skyline must come from
  // real water motion, not an advancing clock or a moving full-screen wallpaper.
  await page.evaluate(()=>{const c=document.querySelector('[data-landscape-stage]'),y=Math.floor(c.height*.6);window.__waterBefore=c.getContext('2d').getImageData(0,y,c.width,c.height-y).data;});
  await new Promise(r=>setTimeout(r,1200));
  assert.ok(await page.evaluate(()=>{const c=document.querySelector('[data-landscape-stage]'),y=Math.floor(c.height*.6),after=c.getContext('2d').getImageData(0,y,c.width,c.height-y).data;let changed=0;for(let i=0;i<after.length;i+=4)if(Math.abs(after[i]-window.__waterBefore[i])+Math.abs(after[i+1]-window.__waterBefore[i+1])+Math.abs(after[i+2]-window.__waterBefore[i+2])>2)changed++;return changed>100;}),'water visibly ripples at a fixed scene time');
  await page.evaluate(()=>window.__landscapePreview({iso:'2026-10-23T12:00:00+02:00',rate:0}));
  await page.waitForFunction(()=>window.__landscapeDiagnostics().samples!==null);
  // Real timetable UI over the same scene, including a small viewport and scrolling.
  await page.evaluate(()=>document.querySelector('[data-toggle-ui]').click());await page.waitForSelector('[data-departure-row]');
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.transit-view')).opacity)>=.999);
  await new Promise(r=>setTimeout(r,350));
  assert.ok(await page.evaluate(()=>{const color=getComputedStyle(document.querySelector('.transit-card')).backgroundColor,alpha=Number(color.split(',').pop().replace(')',''));return alpha>=.58&&alpha<=.68;}),'glass exposes scenery while keeping a dark scrim');
  await page.screenshot({path:'test/ui-previews/landscape-timetable.png'});
  await page.setViewport({width:320,height:640,deviceScaleFactor:2});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'test/ui-previews/landscape-small-phone.png'});
  await page.evaluate(()=>window.__landscapePreview({}));
  await new Promise(r=>setTimeout(r,2000));
  const metrics=await page.evaluate(()=>window.__landscapeDiagnostics());
  assert.ok(metrics.canvasPixels<=1800000);assert.equal(metrics.source,'default-rzeszow');
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.waitForFunction(()=>window.__landscapeDiagnostics().interval===15000);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  const paused=await page.evaluate(()=>window.__landscapeDiagnostics().frames);
  await new Promise(r=>setTimeout(r,400));assert.equal(await page.evaluate(()=>window.__landscapeDiagnostics().frames),paused);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(n=>window.__landscapeDiagnostics().frames>n,{},paused);
  await page.evaluate(()=>document.querySelector('[data-toggle-scene]').click());
  await page.waitForFunction(()=>!document.querySelector('[data-landscape-stage]')&&!window.__landscapeDiagnostics&&!document.documentElement.dataset.landscapeTheme);
  assert.deepEqual(errors,[]);
  fs.writeFileSync('test/ui-previews/landscape-metrics.json',JSON.stringify({environment:'Headless Chrome CI; not physical Android battery measurements',...metrics},null,2));
  console.log('Landscape: four solar views, live timetable, small phone, bounded canvas, reduced motion, background pause/resume and theme disposal verified. Draw metrics:',metrics.averageDrawMs,metrics.maxDrawMs);
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fixture.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
