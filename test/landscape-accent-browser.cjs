const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'solar-accent-'));let browser,server;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/landscape-accent-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname;if(name==='/'){res.setHeader('Content-Type','text/html');return res.end('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/production.css"><div id="root"></div><script src="/fixture.js"></script>');}if(name==='/production.css'){res.setHeader('Content-Type','text/css');return res.end(css);}if(name==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(temp,'fixture.js')));}res.statusCode=404;res.end();});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:393,height:851,deviceScaleFactor:1});
  await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)?r.continue():r.abort());
  const control='[data-landscape-accent-options] input[role="switch"]';
  const open=async()=>{await page.waitForSelector('[data-personalization-panel]');await page.$eval('[data-personal-group="colors"]',e=>e.open=true);await page.waitForSelector(control);};
  const click=async selector=>page.$eval(selector,b=>b.click());
  const active=async color=>{await page.waitForFunction(color=>document.querySelector('[data-active-accent]')?.dataset.activeAccent===color,{},color);assert.equal(await page.$eval('[data-general-accent]',e=>e.dataset.generalAccent),await page.evaluate(()=>localStorage.getItem('mks_theme')||'#ff8000'));};
  const setColor=async(label,color)=>{await click(`[aria-label="${label}"]`);await page.waitForSelector('.color-picker-dialog');await page.click('[aria-label="Kod HEX"]');await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.type('[aria-label="Kod HEX"]',color);await click('.color-picker-dialog button.ui-accent-solid');await page.waitForSelector('.color-picker-dialog',{hidden:true});};
  await page.goto(origin);await open();assert.equal(await page.$eval(control,e=>e.checked),false);await active('#ff8000');
  const atBottom=await page.$eval('[data-landscape-accent-options]',e=>e===e.parentElement.lastElementChild);assert.ok(atBottom,'solar option is at the bottom of Theme and colours');
  await click(control);await page.waitForSelector('[aria-label="Akcent na dzień"]');
  for(const label of ['Akcent na dzień','Akcent na noc'])assert.match(await page.$eval(`[aria-label="${label}"]`,e=>e.textContent),/#FF8000/);
  await setColor('Akcent na dzień','#3b82f6');await active('#3b82f6');
  await setColor('Akcent na noc','#818cf8');await active('#3b82f6');
  await click('[data-test-period="night"]');await active('#818cf8');
  assert.equal(await page.$eval('[aria-label="Własny akcent interfejsu"]',e=>e.textContent.includes('#FF8000')),true,'general field stays independent');
  const styled=await page.evaluate(()=>({root:getComputedStyle(document.querySelector('.pks-theme-root')).getPropertyValue('--pks-accent').trim(),brand:document.querySelector('[data-test-chrome] [data-map-brand]').style.color,nav:document.querySelector('[data-test-chrome] [data-nav-item="map"]').style.color}));assert.equal(styled.root,'#818cf8');assert.equal(styled.brand,'rgb(129, 140, 248)');assert.equal(styled.nav,styled.brand);
  await click(control);await active('#ff8000');await setColor('Własny akcent interfejsu','#22c55e');await active('#22c55e');
  await click(control);await active('#818cf8');assert.match(await page.$eval('[aria-label="Akcent na dzień"]',e=>e.textContent),/#3B82F6/);
  for(const theme of ['light','light-warm','light-pink','light-sky','dark','dark-oled','dark-forest','dark-cosmos']){await click(`[data-test-theme="${theme}"]`);await page.waitForFunction(()=>!document.querySelector('[data-landscape-accent-options]'));await active('#22c55e');}
  await click('[data-test-theme="dark-mountains"]');await open();await active('#818cf8');
  await page.reload();await open();assert.equal(await page.$eval(control,e=>e.checked),true);await active('#3b82f6');await click('[data-test-period="night"]');await active('#818cf8');
  fs.mkdirSync('test/ui-previews',{recursive:true});
  for(const width of [320,393,768]){await page.setViewport({width,height:851,deviceScaleFactor:1});await page.$eval('[data-landscape-accent-options]',e=>e.scrollIntoView({block:'center'}));await page.waitForFunction(()=>document.querySelector('[aria-label="Akcent na noc"]').getBoundingClientRect().height>30);const bounds=await page.$eval('[data-landscape-accent-options]',e=>({width:e.clientWidth,scroll:e.scrollWidth,fields:[...e.querySelectorAll('.color-picker-trigger')].map(b=>({width:b.clientWidth,scroll:b.scrollWidth}))}));assert.ok(bounds.scroll<=bounds.width+2,JSON.stringify({width,bounds}));for(const b of bounds.fields)assert.ok(b.scroll<=b.width+2,JSON.stringify({width,bounds}));await page.screenshot({path:'test/ui-previews/landscape-accent-'+width+'.png'});}
  assert.deepEqual(errors,[]);console.log('PASS solar accent switch, initial general defaults, both real colour dialogs, solar period event, live header/navigation colours, off/on retention, reload, isolation from eight other themes and three viewport widths.');
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
