const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ui-interactions-'));let browser,server;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/ui-interactions-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((e,stats)=>compiler.close(()=>e||stats.hasErrors()?reject(e||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(fs.readFileSync(path.join(temp,'fixture.js')));}res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}'+css+'</style><div id="root"></div><script src="/fixture.js"></script>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage(),errors=[];page.on('console',m=>{if(m.type()==='error')console.error('Browser console:',m.text());});page.on('pageerror',e=>{errors.push(e.message);console.error('Interaction page error:',e.message);});
  await page.setViewport({width:393,height:851,deviceScaleFactor:1,isMobile:true,hasTouch:true});await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)?r.continue():r.abort());
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#options-general-panel');await wait(550);
  const generalHeight=await page.$eval('[data-options-sheet]',e=>e.getBoundingClientRect().height);
  const tab=async id=>{await page.click('#options-'+id+'-tab');await page.waitForSelector('#options-'+id+'-panel');await wait(230);};
  await page.click('#options-personal-tab');await page.waitForSelector('#options-personal-panel');
  const entry=await page.$eval('#options-personal-panel',e=>Number(getComputedStyle(e).opacity));
  assert.ok(entry<1,'the settings tab enters with a finite fade');await wait(70);
  const middleHeight=await page.$eval('[data-options-sheet]',e=>e.getBoundingClientRect().height);await wait(450);
  const personalHeight=await page.$eval('[data-options-sheet]',e=>e.getBoundingClientRect().height);
  assert.ok(middleHeight>generalHeight+1&&middleHeight<personalHeight-1,'options height follows a spring instead of snapping: '+JSON.stringify({generalHeight,middleHeight,personalHeight}));
  const summary='[data-personal-group="colors"]>summary',body='[data-personal-group="colors"]>[data-ui-transition="details"]';
  const click=async selector=>{await page.$eval(selector,e=>e.scrollIntoView({block:'center'}));await page.click(selector);};
  const running=()=>page.$eval(body,e=>e.getAnimations().some(a=>a.playState==='running'));
  await click(summary);assert.ok(await running(),'opening settings runs a real height animation');
  await wait(70);const middle=await page.$eval(body,e=>e.getBoundingClientRect().height);await wait(300);
  const full=await page.$eval(body,e=>e.getBoundingClientRect().height);assert.ok(middle>0&&middle<full,'settings expand through intermediate heights');
  await page.evaluate(()=>window.__savedControl=document.querySelector('[aria-label="Własny akcent interfejsu"]'));
  await click(summary);await wait(70);const closing=await page.$eval(body,e=>e.getBoundingClientRect().height);
  assert.ok(closing>0&&closing<full,'settings collapse instead of disappearing');await wait(300);
  assert.equal(await page.$eval('[data-personal-group="colors"]',e=>e.open),false);
  assert.equal(await page.evaluate(()=>window.__savedControl===document.querySelector('[aria-label="Własny akcent interfejsu"]')),true,'collapsing preserves mounted controls and draft state');
  await page.focus(summary);await page.keyboard.press('Enter');await wait(300);assert.ok(await page.$eval('[data-personal-group="colors"]',e=>e.open),'native summary remains keyboard operable');
  // Reverse a collapse before it finishes: the last requested state wins.
  await page.$eval(summary,e=>e.click());await wait(45);await page.$eval(summary,e=>e.click());await wait(330);
  assert.ok(await page.$eval('[data-personal-group="colors"]',e=>e.open));
  await click('[aria-label="Własny akcent interfejsu"]');await page.waitForSelector('.color-picker-dialog');await wait(260);
  await page.click('[aria-label="Zamknij wybór koloru"]');await wait(45);
  assert.ok(await page.$('.color-picker-overlay'),'color picker retains its exit transition');
  await page.waitForSelector('.color-picker-overlay',{hidden:true});
  await click(summary);await wait(300);await click(summary);assert.ok(await running());
  // A lighter-effects toggle during a transition must not cancel useful motion.
  await page.$eval('[data-test-light]',e=>e.click());await page.waitForFunction(()=>document.documentElement.dataset.personalLightEffects==='on');
  assert.ok(await running(),'lighter effects keep an in-progress interaction alive');await wait(300);
  for(const theme of ['light-sky','dark-mountains','dark-cosmos']){
   await page.$eval('[data-test-theme="'+theme+'"]',e=>e.click());
   await click(summary);await wait(300);await click(summary);assert.ok(await running(),'finite interactions remain enabled in '+theme);await wait(300);
  }
  await click(summary);await wait(35);await page.$eval('[data-test-reduce]',e=>e.click());
  await page.waitForFunction(()=>document.documentElement.dataset.personalMotion==='reduced');
  assert.equal(await running(),false,'reduced motion cancels an active height animation');
  assert.equal(await page.$eval('[data-personal-group="colors"]',e=>e.open),false);
  await page.$eval('[data-test-reduce]',e=>e.click());await page.waitForFunction(()=>document.documentElement.dataset.personalMotion==='normal');
  await click(summary);await wait(300);
  // Preview and font selector use the same finite expand/collapse policy.
  await click('[data-preview-toggle]');await page.waitForSelector('[data-interface-preview]');await wait(300);
  await click('[aria-label="Podgląd: Autobus"]');await wait(450);assert.ok(await page.$('[data-interface-preview] [data-map-bus-sheet]'));
  await click('[data-preview-toggle]');await wait(350);assert.equal(await page.$('[data-interface-preview]'),null);
  await click(summary);await wait(300);
  const textSummary='[data-personal-group="text"]>summary';await click(textSummary);await wait(300);
  await click('.personal-font-trigger');await page.waitForSelector('.personal-font-list');await wait(350);
  await click('.personal-font-trigger');await wait(350);assert.equal(await page.$('.personal-font-list'),null);
  // Personal reduced motion overrides both normal and lighter-effect modes.
  await page.$eval('[data-test-reduce]',e=>e.click());await page.waitForFunction(()=>document.documentElement.dataset.personalMotion==='reduced');
  await click(summary);assert.equal(await running(),false);assert.ok(await page.$eval('[data-personal-group="colors"]',e=>e.open));
  await click(summary);assert.equal(await page.$eval('[data-personal-group="colors"]',e=>e.open),false);
  await tab('general');await tab('personal');
  assert.equal(await page.$eval('#options-personal-panel',e=>getComputedStyle(e).opacity),'1');
  assert.equal(await page.$eval('#options-personal-panel',e=>e.getAnimations().some(a=>a.playState==='running')),false);
  await page.$eval('[data-test-reduce]',e=>e.click());await page.waitForFunction(()=>document.documentElement.dataset.personalMotion==='normal');
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await click(summary);assert.equal(await running(),false,'system accessibility preference is respected as well');
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
  await click(summary);await wait(330);await click(summary);assert.ok(await running(),'motion resumes while lighter effects stay enabled');await wait(330);
  fs.mkdirSync('test/ui-previews',{recursive:true});await page.screenshot({path:'test/ui-previews/options-interactions-light-effects.png'});
  assert.deepEqual(errors,[]);console.log('PASS: settings tabs, animated resize/disclosures, rapid reversal, keyboard, retained drafts, preview, fonts and color dialog; light effects retain motion; app/system reduced motion disable it.');
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
