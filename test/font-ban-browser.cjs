const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'font-ban-'));let browser,server;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/font-ban-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((e,stats)=>compiler.close(()=>e||stats.hasErrors()?reject(e||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(fs.readFileSync(path.join(temp,'fixture.js')));}res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}'+css+'</style><div id="root"></div><script src="/fixture.js"></script>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage(),errors=[];page.on('console',m=>{if(m.type()==='error')console.error('Browser console:',m.text());});page.on('pageerror',e=>{errors.push(e.message);console.error('Font/ban page error:',e.message);});
  await page.setViewport({width:393,height:851,deviceScaleFactor:1,isMobile:true,hasTouch:true});await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)?r.continue():r.abort());
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.click('[aria-label="Wybierz krój pisma"]');await page.waitForSelector('[aria-label="Szukaj czcionki"]');
  assert.equal(await page.evaluate(()=>document.activeElement.matches('input,textarea')),false,'opening fonts does not focus a text field');
  await page.click('[aria-label="Szukaj czcionki"]');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Szukaj czcionki');
  await page.type('[aria-label="Szukaj czcionki"]','System');assert.ok(await page.$('.personal-font-list button'));await page.keyboard.press('Escape');await page.waitForSelector('.personal-font-list',{hidden:true});
  await page.click('[data-tab="only"]');await page.click('[data-only-toggle]');assert.equal(await page.evaluate(()=>document.activeElement.matches('input')),false,'input-only surfaces focus their container');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Pole testowe');await page.keyboard.press('Escape');
  for(const duration of ['day','week','month','year']){
   console.log('Opening duration',duration);await page.evaluate(()=>document.querySelector('[data-tab="ban"]').click());await page.waitForSelector('[aria-label="Zablokuj urządzenie"]');
   assert.equal(await page.evaluate(()=>document.activeElement.matches('input,textarea')),false);
   await page.click('[data-ban-duration-toggle]');assert.equal(await page.$$eval('[data-ban-duration]',n=>n.length),6);await page.click('[data-ban-duration="'+duration+'"]');
   assert.equal(await page.$('[data-ban-custom-date]'),null);
   await page.click('[data-ban-submit]');await page.waitForSelector('[aria-label="Zablokuj urządzenie"]',{hidden:true});
   const payload=await page.evaluate(()=>window.__savedBan),hours=(Date.parse(payload.expiryDate)-Date.now())/3600000;
   assert.ok(hours>({day:23,week:167,month:670,year:8758}[duration])&&hours<({day:25,week:169,month:747,year:8786}[duration]),duration+' deadline has the selected duration');
  }
  await page.click('[data-tab="bans"]');await page.click('[aria-label="Edytuj blokadę: Testowy telefon"]');await page.waitForSelector('[aria-label="Edytuj blokadę"]');
  assert.equal(await page.$eval('[aria-label="Powód blokady"]',e=>e.value),'Zapisany powód');assert.ok(await page.$('[data-ban-custom-date]'));
  await page.click('[aria-label="Powód blokady"]');await page.keyboard.down('Control');await page.keyboard.press('KeyA');await page.keyboard.up('Control');await page.keyboard.type('Nowy powód');
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Ban permanentny')).click());
  await page.click('[data-ban-submit]');await page.waitForSelector('[aria-label="Edytuj blokadę"]',{hidden:true});
  assert.deepEqual(await page.evaluate(()=>({reason:window.__savedBan.reason,expiry:window.__savedBan.expiryDate,silent:window.__savedBan.silent})),{reason:'Nowy powód',expiry:'',silent:true});
  await page.click('[data-tab="devices"]');await page.waitForSelector('input[placeholder="Szukaj..."]');assert.equal(await page.$eval('input[placeholder="Szukaj..."]',e=>getComputedStyle(e).paddingLeft),'32px');
  await page.evaluate(()=>[...document.querySelectorAll('[title="Zmień nazwę urządzenia"]')].find(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').click());await page.waitForSelector('input[placeholder="np. Telefon Tomka"]');assert.equal(await page.evaluate(()=>document.activeElement.matches('input,textarea')),false,'rename does not auto-open the keyboard');
  await page.evaluate(()=>[...document.querySelector('input[placeholder="np. Telefon Tomka"]').parentElement.querySelectorAll('button')].find(e=>e.textContent.trim()==='Anuluj').click());await page.waitForSelector('input[placeholder="np. Telefon Tomka"]',{hidden:true});
  await page.click('[data-tab="navigation"]');
  const visualOrder=selector=>page.$$eval(selector+' [data-nav-item]',nodes=>nodes.map(n=>({id:n.dataset.navItem,x:n.getBoundingClientRect().x})).sort((a,b)=>a.x-b.x).map(n=>n.id));
  const checkOrder=async expected=>{for(const selector of ['[data-test-navigation]','[data-navigation-preview]'])assert.deepEqual(await visualOrder(selector),expected);};
  await checkOrder(['map','stops','journeys','admin','options']);
  for(const [label,expected] of [['wcześniej',['map','journeys','stops','admin','options']],['wcześniej',['journeys','map','stops','admin','options']],['później',['map','journeys','stops','admin','options']],['później',['map','stops','journeys','admin','options']],['później',['map','stops','admin','journeys','options']]]){
   await page.click('[aria-label="Przesuń Połączenia '+label+'"]');await checkOrder(expected);
   assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('mks_interface_appearance_v1')).navOrder),expected);
  }
  await page.reload({waitUntil:'domcontentloaded'});await page.click('[data-tab="navigation"]');await checkOrder(['map','stops','admin','journeys','options']);
  await page.click('[data-hide-admin]');await page.click('[aria-label="Przesuń Połączenia wcześniej"]');await checkOrder(['map','journeys','stops','options']);
  fs.mkdirSync('test/ui-previews',{recursive:true});await page.$eval('[data-test-navigation]',e=>e.scrollIntoView());await page.screenshot({path:'test/ui-previews/navigation-order.png'});
  for(const role of ['user','admin']){
   await page.click('[data-nav-role="'+role+'"]');
   assert.equal(await page.$('[data-test-navigation] [data-nav-item="journeys"]'),null,'default denied for '+role);
   assert.equal(await page.$('[data-navigation-preview] [data-nav-item="journeys"]'),null);
   assert.equal(await page.$('[aria-label="Przesuń Połączenia wcześniej"]'),null,'restricted tab hidden in personalization');
   await page.click('[data-toggle-journeys]');assert.ok(await page.$('[data-test-navigation] [data-nav-item="journeys"]'),'explicit grant shows journeys');
   await page.click('[data-toggle-journeys]');assert.equal(await page.$('[data-test-navigation] [data-nav-item="journeys"]'),null,'revocation hides journeys');
  }
  await page.click('[data-nav-role="owner"]');assert.ok(await page.$('[data-test-navigation] [data-nav-item="journeys"]'));
  await page.click('[data-tab="access"]');await page.waitForSelector('[aria-label="Edycja uprawnień"]');
  const access='[aria-label="Edycja uprawnień"] button';
  assert.equal(await page.$$eval(access,n=>n.find(e=>e.textContent.includes('Włącz połączenia')).querySelector('[role="switch"]').getAttribute('aria-checked')),'false');
  await page.$$eval(access,n=>n.find(e=>e.textContent.includes('Włącz połączenia')).click());
  assert.equal(await page.$$eval(access,n=>n.find(e=>e.textContent.includes('Włącz połączenia')).querySelector('[role="switch"]').getAttribute('aria-checked')),'true');
  await page.screenshot({path:'test/ui-previews/journeys-device-access.png'});
  await page.$$eval(access,n=>n.find(e=>e.textContent.trim()==='Zapisz zmiany').click());
  await page.waitForFunction(()=>Boolean(window.__savedAccess));assert.equal(await page.evaluate(()=>window.__savedAccess.journeys),true);assert.equal(await page.evaluate(()=>window.__savedAccess.disableJourneys),false);
  assert.deepEqual(errors,[]);console.log('PASS: explicit search focus, keyboard navigation, restored ban periods, existing-ban editing, rename focus and device search inset, navigation arrows, visual order, preview and persisted order');
 }catch(error){if(browser){const page=(await browser.pages()).at(-1);console.error('Font/ban UI failure:',await page.evaluate(()=>({url:location.href,html:document.body.innerHTML.slice(-5000),text:document.body.innerText,dialogs:document.querySelectorAll('[role="dialog"]').length,focus:document.activeElement?.outerHTML})));fs.mkdirSync('test/ui-previews',{recursive:true});await page.screenshot({path:'test/ui-previews/font-ban-failure.png'}).catch(()=>{});}throw error;}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
