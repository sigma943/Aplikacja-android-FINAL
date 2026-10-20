const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'pks-smart-search-'));let browser,server,page;
 try{
  const entry=path.join(root,'test/stop-search-fixture.tsx');
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry,output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/lib/journey-loader':entry,'@/lib/journey-catalog':entry,'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((e,stats)=>compiler.close(()=>e||stats.hasErrors()?reject(e||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(temp,'.'+pathname);if(pathname.endsWith('.js')&&file.startsWith(temp+path.sep)&&fs.existsSync(file)){res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(fs.readFileSync(file));}if(pathname==='/themes/kosmos/nebula.jpg'){res.setHeader('Content-Type','image/jpeg');return res.end(fs.readFileSync(path.join(root,'public/themes/kosmos/nebula.jpg')));}if(pathname!=='/'){res.statusCode=404;return res.end();}res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial}'+css+'</style><div id="root"></div><script src="/fixture.js"></script>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});page=await browser.newPage();const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:393,height:851,deviceScaleFactor:1});await page.setRequestInterception(true);page.on('request',r=>{if(r.url().startsWith(origin)||r.url().startsWith('data:')||r.url().startsWith('blob:'))r.continue();else{external.push(r.url());r.abort();}});
  await page.evaluateOnNewDocument(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(){throw Error('search must not request location');}}}));
  const input='input[placeholder*="Babica"]';
  const query=async text=>{await page.click(input);await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.press('Backspace');if(text)await page.type(input,text);};
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForSelector('[data-stop-card-id="3731"]');
  await query('dworzec autobusowy');await page.waitForFunction(()=>document.querySelectorAll('[data-stop-card-id]').length===1);
  assert.equal(await page.$eval(input,e=>e.value),'dworzec autobusowy');
  assert.match(await page.$eval('[data-stop-card-id="3731"]',e=>e.textContent),/Rzeszów D\.A\. st\. 1/);
  assert.equal(await page.evaluate(()=>window.__chosenStop),undefined,'typing never selects a stop');
  await page.focus('[data-stop-card-id="3731"]');await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(()=>window.__chosenStop),{id:'3731',name:'Rzeszów D.A. st. 1',sameReference:true,providerStopIds:{pks:'3731'}});
  await query('babca kolonia');await page.waitForSelector('[data-stop-card-id="1373"]');
  await query('babica 82');await page.waitForFunction(()=>document.querySelectorAll('[data-stop-card-id]').length===1&&document.querySelector('[data-stop-card-id="1367"]'));
  await query('glowienka');await page.waitForSelector('[data-stop-card-id="marcel:test"]');
  await query('park');await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(e=>/Pokaż wszystkie \(55\)/i.test(e.textContent)));
  assert.equal(await page.$$eval('[data-stop-card-id]',n=>n.length),30,'existing preview limit is unchanged');
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>/Pokaż wszystkie \(55\)/i.test(e.textContent)).click());
  await page.waitForSelector('[aria-label="Zamknij pełną listę przystanków"]');assert.equal(await page.$eval(input,e=>e.value),'park');
  assert.ok(await page.$('[data-stop-card-id]'),'existing virtualized full list renders results');
  for(const theme of ['dark-cosmos','light-sky','dark-forest','light-pink']){
   await page.evaluate(t=>window.__setStopTheme(t),theme);await page.waitForFunction(t=>document.querySelector('.pks-theme-root').dataset.uiTheme===t&&document.documentElement.dataset.cosmicTheme===(t==='dark-cosmos'?'on':'off'),{},theme);
   if(theme==='dark-cosmos')assert.equal(await page.$eval('[data-stop-list-mode]>[data-filter-cosmos]',e=>getComputedStyle(e).display),'block');
   else assert.match(await page.$eval('[data-stop-list-mode]',e=>getComputedStyle(e).backgroundImage),/data:image/);
   assert.equal(await page.$eval('[data-full-stop-list]',e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
   assert.equal(await page.$eval(input,e=>e.value),'park','theme changes preserve the active search');
   await page.screenshot({path:'test/ui-previews/stop-list-theme-'+theme+'.png'});
  }
  await page.evaluate(()=>window.__setStopTheme('dark'));
  await page.click('[aria-label="Zamknij pełną listę przystanków"]');
  await query('nowa swilcza');await page.waitForFunction(()=>document.querySelectorAll('[data-stop-card-id]').length===0);
  await page.click('[data-test-update]');await page.waitForSelector('[data-stop-card-id="new"]');
  assert.equal(await page.$eval(input,e=>e.value),'nowa swilcza','catalog updates do not rewrite the query');
  fs.mkdirSync('test/ui-previews',{recursive:true});await page.screenshot({path:'test/ui-previews/stop-search-existing-list.png'});
  await page.goto(origin+'/?planner=1',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!document.querySelector('.connections-primary').disabled);
  await page.click('[data-journey-from]');await query('dworzec pks');await page.waitForSelector('[data-stop-card-id="journey:rzeszow-da"]');
  assert.equal(await page.$eval(input,e=>e.value),'dworzec pks');assert.match(await page.$eval('[data-stop-card-id="journey:rzeszow-da"]',e=>e.textContent),/Rzeszów D\.A\./);
  await page.click('[data-stop-card-id="journey:rzeszow-da"]');await page.waitForFunction(()=>document.querySelector('[data-journey-from]').textContent.includes('Rzeszów D.A.'));
  await page.click('[data-journey-to]');await query('babica 82');await page.waitForSelector('[data-stop-card-id="1367"]');await page.click('[data-stop-card-id="1367"]');
  await page.click('.connections-primary');await page.waitForFunction(()=>window.__plannerSelection);
  const selected=await page.evaluate(()=>window.__plannerSelection);assert.equal(selected.from.id,'journey:rzeszow-da');assert.equal(selected.from.name,'Rzeszów D.A.');assert.equal(selected.to.id,'1367');assert.equal(selected.to.name,'Babica 82');assert.equal(selected.to.code,'82');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[],'search and selection use local data without external requests');
  console.log('PASS: smart search uses unchanged stop cards, preserves typed queries and original selection objects/IDs, paginates ambiguous results, rebuilds after catalog changes, and selects planner origin/destination offline.');
 }catch(error){if(page){fs.mkdirSync('test/ui-previews',{recursive:true});await page.screenshot({path:'test/ui-previews/stop-search-failure.png'}).catch(()=>{});console.error('Search UI:',await page.$eval('body',e=>e.innerText).catch(()=>''));}throw error;}
 finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
