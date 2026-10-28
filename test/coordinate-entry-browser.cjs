const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'place-search-'));let browser,server,page;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/coordinate-entry-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((e,stats)=>compiler.close(()=>e||stats.hasErrors()?reject(e||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(temp,'fixture.js')));}res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}'+css+'</style><div id="root"></div><script src="/fixture.js"></script>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});page=await browser.newPage();const queries=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
  page.on('request',request=>{const url=request.url();if(url.startsWith(origin)||url.startsWith('data:')||url.startsWith('blob:'))return request.continue();
   if(url.includes('photon')){queries.push(url);return request.abort();}
   if(request.resourceType()==='image')return request.respond({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA1cAAAAASUVORK5CYII=','base64')});return request.abort();
  });
  const input='input[aria-label="Współrzędne"]';
  const enter=async value=>{await page.$eval(input,(e,v)=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));},value);await page.focus(input);await page.keyboard.press('Enter');};
  fs.mkdirSync('test/ui-previews',{recursive:true});
  for(const width of [393,1366]){
   await page.setViewport({width,height:851,deviceScaleFactor:1});await page.goto(origin);await page.waitForSelector(input);
   assert.equal(await page.$('[role=search],[role=combobox],.connections-place-search'),null,'there is no place search bar');
   assert.equal(await page.$eval('.connections-coordinate-entry button',e=>e.disabled),true);
   for(const text of ['50,03897; 22,00282','50.03897, 22.00282']){
    await enter(text);
    await page.waitForFunction(()=>document.querySelector('.connections-place-confirm').textContent.includes('50.03897, 22.00282'));
    await page.click('.connections-place-confirm button');
    const result=JSON.parse(await page.$eval('[data-confirmed]',e=>e.textContent));assert.equal(result.lat,50.03897);assert.equal(result.lon,22.00282);
   }
   await enter('91, 22');await page.waitForFunction(()=>document.querySelector('.connections-coordinate-entry').textContent.includes('poprawne współrzędne'));
   assert.match(await page.$eval('.connections-place-confirm',e=>e.textContent),/50.03897, 22.00282/,'invalid input does not replace the chosen point');
   await enter('Pro-Familia');await page.waitForFunction(()=>document.querySelector('.connections-coordinate-entry').textContent.includes('poprawne współrzędne'));
   await enter('-33.86, 151.2');await page.waitForFunction(()=>document.querySelector('.connections-place-confirm').textContent.includes('-33.86000, 151.20000'));
   assert.equal(queries.length,0,'coordinate entry never calls Photon');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:`test/ui-previews/coordinate-entry-${width}.png`});
  }
  assert.deepEqual(errors,[]);console.log('PASS coordinate entry/paste, invalid ranges, preserved selection, no place search or geocoding, mobile/desktop layouts');
 }catch(error){
  if(page){await page.screenshot({path:'test/ui-previews/coordinate-entry-error.png',fullPage:true});console.log('SEARCH DOM',await page.evaluate(()=>[...document.querySelectorAll('.connections-coordinate-entry,.connections-place-confirm')].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {text:e.textContent,rect:{x:r.x,y:r.y,w:r.width,h:r.height},display:s.display,visibility:s.visibility};})));}throw error;
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
