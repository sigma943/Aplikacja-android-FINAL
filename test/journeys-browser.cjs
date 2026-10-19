const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'pks-journeys-'));let server,browser;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/journey-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end('<meta charset="utf-8"><style>body{font-family:Arial,sans-serif}</style><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/production.css"><div id="root"></div><script src="/fixture.js"></script>');}if(url.pathname==='/production.css'){res.setHeader('Content-Type','text/css');return res.end(css);}const base=url.pathname.startsWith('/data/')?path.join(root,'public'):temp,file=path.resolve(base,'.'+url.pathname);if(!file.startsWith(base+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream');fs.createReadStream(file).pipe(res);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage(),errors=[],external=[];page.on('pageerror',e=>{errors.push(e.message);console.log('Page error:',e.message);});
  await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('blob:')||r.url().startsWith('data:')?r.continue():(external.push(r.url()),r.abort()));
  await page.setViewport({width:393,height:851,deviceScaleFactor:1});fs.mkdirSync('test/ui-previews',{recursive:true});
  const screenshot=name=>page.screenshot({path:'test/ui-previews/journeys-'+name+'.png'});
  await page.goto(origin,{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.querySelector('.connections-primary')&&!document.querySelector('.connections-primary').disabled,{timeout:20000}).catch(async error=>{console.log('Initial screen',await page.$eval('body',e=>e.innerText),'errors',errors,'external',external);await screenshot('failure');throw error;});
  await screenshot('dark');await page.click('[data-journey-from]');await page.waitForSelector('[data-journey-picker] input[placeholder*="Babica"]');
  await page.type('[data-journey-picker] input[placeholder*="Babica"]','sloneczne');await page.waitForSelector('[data-journey-picker] [data-stop-card-id="5419"]');
  assert.ok(await page.$('[data-stop-line-badges]'),'the actual Stops tab cards include line badges');
  await screenshot('stop-picker');await page.click('[data-stop-card-id="5419"]');await page.click('[data-journey-to]');await page.type('[data-journey-picker] input[placeholder*="Babica"]','Rzeszów D.A.');await page.waitForSelector('[data-stop-card-id="3719"]');await page.click('[data-stop-card-id="3719"]');
  await page.$eval('[aria-label="Data podróży"]',e=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,'2026-10-20');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.$eval('[aria-label="Godzina podróży"]',e=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,'09:30');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.click('.connections-primary');await page.waitForSelector('[data-journey-result]',{timeout:30000});
  assert.equal(await page.$('.connections-error'),null);assert.ok((await page.$eval('.connections-results',e=>e.textContent)).includes('301'),'real full timetable finds the selected PKS corridor');
  await page.click('[data-journey-result] .connections-result');await page.waitForSelector('.connections-detail');await screenshot('results');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.querySelector('.connections-view').scrollWidth>document.querySelector('.connections-view').clientWidth+1);assert.equal(overflow,false,'mobile layout must not overflow horizontally');
  await page.click('[aria-label="Zapisz połączenie"]');assert.ok(await page.$('[aria-label="Usuń z ulubionych"]'));
  await page.click('[aria-label="Zamień przystanki"]');assert.equal(await page.$('[data-journey-result]'),null,'changing endpoints clears stale results');assert.match(await page.$eval('[data-journey-from]',e=>e.textContent),/Rzeszów/i);
  await page.goto(origin+'/?theme=light',{waitUntil:'networkidle0'});await page.waitForFunction(()=>!document.querySelector('.connections-primary').disabled);await screenshot('light');
  await page.click('.connections-primary');assert.match(await page.$eval('[role="alert"]',e=>e.textContent),/Wybierz przystanek/);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[],'PKS/MPK planning works using local timetable assets without external APIs');
  await page.click('[data-journey-from]');await page.type('[data-journey-picker] input[placeholder*="Babica"]','Dworzec Główny');await page.waitForSelector('[data-stop-card-id="mpk_rzeszow:127"]');await page.click('[data-stop-card-id="mpk_rzeszow:127"]');
  await page.click('[data-journey-to]');await page.type('[data-journey-picker] input[placeholder*="Babica"]','Matuszczaka');await page.waitForSelector('[data-stop-card-id="3795"]');await page.click('[data-stop-card-id="3795"]');
  await page.$eval('[aria-label="Data podróży"]',e=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2026-10-20');e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.$eval('[aria-label="Godzina podróży"]',e=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'09:30');e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.click('.connections-primary');await page.waitForSelector('[data-journey-result]');assert.ok(await page.$('.connections-leg-badges [data-provider="mpk"]'),'full MPK timetables also produce real connections');
  await page.click('[data-journey-result] .connections-result');await page.waitForSelector('.connections-detail');
  await page.click('.connections-map-button');await page.waitForSelector('.journey-map .leaflet-container');await page.waitForFunction(()=>document.querySelectorAll('.journey-map path').length>=3);
  await screenshot('mpk-map');assert.deepEqual(errors,[]);
  await page.click('[data-journey-from]');await page.keyboard.press('Escape');assert.equal(await page.$('[data-journey-picker]'),null,'Escape closes the picker');
  for(const width of [320,430]){await page.setViewport({width,height:851,deviceScaleFactor:1});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no overflow at '+width+'px');}
  console.log('PASS: shared stop picker, Polish search, full PKS 301 and MPK timetables in a Worker, details/map, favorites, swap, dark/light mobile layouts, keyboard dismissal and offline API independence.');
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
