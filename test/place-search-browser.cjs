const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'place-search-'));let browser,server,page;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/place-search-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((e,stats)=>compiler.close(()=>e||stats.hasErrors()?reject(e||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(temp,'fixture.js')));}res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}'+css+'</style><div id="root"></div><script src="/fixture.js"></script>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});page=await browser.newPage();const queries=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
  page.on('request',request=>{const url=request.url();if(url.startsWith(origin)||url.startsWith('data:')||url.startsWith('blob:'))return request.continue();
   if(url.startsWith('https://photon.komoot.io/api/')){const q=new URL(url).searchParams.get('q');queries.push(q);const reply=()=>request.respond({status:q==='offline'?503:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({features:q==='empty'?[]:[{geometry:{type:'Point',coordinates:[22.031,50.046]},properties:{name:q==='slow'?'Stary wynik':q==='fast'?'Nowy wynik':'Pro-Familia',street:'Witolda',housenumber:'6B',city:'Rzeszów'}}]})}).catch(()=>{});if(q==='slow')setTimeout(reply,3000);else void reply();return;}
   if(request.resourceType()==='image')return request.respond({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA1cAAAAASUVORK5CYII=','base64')});return request.abort();
  });
  const input='input[aria-label="Miejsce, adres lub współrzędne"]',option='[role=option]';
  const enter=async value=>{await page.$eval(input,(e,v)=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));},value);await page.focus(input);await page.keyboard.press('Enter');};
  fs.mkdirSync('test/ui-previews',{recursive:true});
  for(const width of [393,1366]){
   await page.setViewport({width,height:851,deviceScaleFactor:1});await page.goto(origin);await page.waitForSelector(input);
   await enter('50,03897; 22,00282');await page.waitForSelector(option);assert.equal(queries.length,0,'coordinates must work offline without geocoding');await page.waitForSelector(option,{visible:true});await page.click(option);
   await page.waitForFunction(()=>document.querySelector('.connections-place-confirm').textContent.includes('50.03897, 22.00282'));await page.click('.connections-place-confirm button');
   let result=JSON.parse(await page.$eval('[data-confirmed]',e=>e.textContent));assert.equal(result.lat,50.03897);assert.equal(result.lon,22.00282);
   await enter('Pro-Familia');await page.waitForFunction(()=>document.querySelector('[role=option]')?.textContent.includes('Pro-Familia'));await page.waitForSelector(option,{visible:true});await page.click(option);
   assert.match(await page.$eval('.connections-place-confirm',e=>e.textContent),/Pro-Familia/);await page.click('.connections-place-confirm button');result=JSON.parse(await page.$eval('[data-confirmed]',e=>e.textContent));assert.equal(result.name,'Pro-Familia');assert.equal(result.lat,50.046);assert.match(result.id,/^journey:point:/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`test/ui-previews/place-search-${width}.png`});queries.length=0;
  }
  await enter('slow');await page.waitForFunction(()=>document.querySelector('.connections-place-search').textContent.includes('Wyszukiwanie'));await new Promise(r=>setTimeout(r,1100));await enter('fast');
  await page.waitForFunction(()=>document.querySelector('[role=option]')?.textContent.includes('Nowy wynik'));await new Promise(r=>setTimeout(r,3300));assert.doesNotMatch(await page.$eval('.connections-place-search',e=>e.textContent),/Stary wynik/);
  await enter('offline');await page.waitForFunction(()=>document.querySelector('.connections-place-search').textContent.includes('Nie udało'));await enter('91, 22');await page.waitForFunction(()=>document.querySelector('.connections-place-search').textContent.includes('poprawne współrzędne'));
  await enter('50.04, 22.0');await page.waitForSelector(option);await page.waitForSelector(option,{visible:true});await page.click(option);assert.equal(await page.$eval('.connections-place-confirm button',e=>e.disabled),false);
  assert.deepEqual(errors,[]);console.log('PASS coordinates offline, named POIs, confirm payload, stale response suppression, errors and mobile/desktop layouts');
 }catch(error){
  if(page){await page.screenshot({path:'test/ui-previews/place-search-error.png',fullPage:true});console.log('SEARCH DOM',await page.evaluate(()=>[...document.querySelectorAll('.connections-place-search,.connections-place-search-results,[role=option],.connections-place-confirm')].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {text:e.textContent,rect:{x:r.x,y:r.y,w:r.width,h:r.height},display:s.display,visibility:s.visibility};})));}throw error;
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
