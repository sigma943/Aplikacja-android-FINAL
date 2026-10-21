const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'pks-live-journey-'));let browser,server;
 try{
  const entry=path.join(root,'test/journey-live-fixture.tsx');
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry,output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/lib/journey-loader':entry,'@/lib/journey-catalog':entry,'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((e,stats)=>compiler.close(()=>e||stats.hasErrors()?reject(e||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(temp,'.'+pathname);if(pathname.endsWith('.js')&&file.startsWith(temp+path.sep)&&fs.existsSync(file)){res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(fs.readFileSync(file));}if(pathname==='/themes/kosmos/nebula.jpg'){res.setHeader('Content-Type','image/jpeg');return res.end(fs.readFileSync(path.join(root,'public/themes/kosmos/nebula.jpg')));}if(pathname.startsWith('/data/marcel-routes/')){const asset=path.resolve(root,'public'+pathname);if(asset.startsWith(path.join(root,'public/data/marcel-routes')+path.sep)&&fs.existsSync(asset)){res.setHeader('Content-Type','application/json');return res.end(fs.readFileSync(asset));}}if(pathname!=='/'){res.statusCode=404;return res.end();}res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial}'+css+'</style><div id="root"></div><script src="/fixture.js"></script>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Page error:',e.message);});
  await page.setViewport({width:393,height:851,deviceScaleFactor:1,isMobile:true,hasTouch:true});await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)?r.continue():r.abort());
  await page.evaluateOnNewDocument(()=>Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:resolve=>resolve({coords:{latitude:50.04,longitude:22}})}}));

  await page.goto(origin+'/?disclosures',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('.connections-recent>button:first-child');await page.click('.connections-recent>button:first-child');
  await page.evaluate(()=>{window.__holdSearch=true;});await page.click('.connections-primary');
  await page.waitForSelector('.connections-primary[aria-busy="true"] .animate-spin');
  assert.match(await page.$eval('.connections-primary',e=>e.textContent),/Wyszukiwanie/);
  assert.equal(await page.$('.connections-progress'),null,'the search indicator is confined to the button');
  await page.evaluate(()=>{window.__holdSearch=false;window.__releaseSearch();});await page.waitForSelector('[data-journey-result]');
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const open=async index=>{await page.$$eval('.connections-result',(nodes,i)=>nodes[i].scrollIntoView({block:'center'}),index);await page.$$eval('.connections-result',(nodes,i)=>nodes[i].click(),index);await wait(450);};
  const checkHeader=async index=>{
   const box=await page.$$eval('.connections-result',(nodes,i)=>{const r=nodes[i].getBoundingClientRect(),v=nodes[i].closest('.connections-view').getBoundingClientRect();return {top:r.top-v.top,bottom:r.bottom-v.top,height:v.height};},index);
   assert.ok(box.top>=8,'selected header is not clipped above the viewport: '+JSON.stringify(box));assert.ok(box.bottom<box.height-90,'details expand below a fully visible header');
   assert.equal(await page.$$eval('.connections-result[aria-expanded="true"]',n=>n.length),1);
  };
  await open(0);await page.click('.connections-stop-details summary');await wait(300);
  assert.ok(await page.$('.connections-stop-details[open]'));
  await page.click('.connections-map-button');await page.waitForSelector('.connections-bus-path');await wait(450);
  assert.equal(await page.$$eval('.connections-bus-path',n=>n.length),1,'Marcel road renders with external requests blocked');
  assert.equal(await page.$('.connections-map-status'),null,'all 27 calls have a known road');
  await page.$eval('.connections-bus-path',n=>{if(n.getTotalLength()<50)throw Error('Marcel geometry is empty');});
  await open(1);await checkHeader(1);
  await page.click('.connections-stop-details summary');await wait(300);
  await page.click('.connections-map-button');await page.waitForSelector('.connections-bus-path');await wait(350);
  // Last card exercises browser scroll clamping as a tall preceding card collapses.
  await open(3);await checkHeader(3);
  const expanded=await page.$eval('.connections-disclosure:has(.connections-detail)',e=>e.getBoundingClientRect().height);
  await page.$eval('.connections-result[aria-expanded="true"]',e=>e.click());await wait(80);
  const during=await page.$eval('.connections-disclosure:has(.connections-detail)',e=>e.getBoundingClientRect().height);
  assert.ok(during>0&&during<expanded,'collapse visibly animates before removing details');
  await wait(350);assert.equal(await page.$('.connections-detail'),null);
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await open(0);await page.click('.connections-stop-details summary');assert.ok(await page.$('.connections-stop-details[open]'));
  await open(2);await checkHeader(2);
  await page.$eval('.connections-result[aria-expanded="true"]',e=>e.click());await wait(60);assert.equal(await page.$('.connections-detail'),null,'reduced motion removes details without animation');
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
  await page.evaluate(()=>{document.documentElement.dataset.personalMotion='reduced';});
  await open(1);await page.$eval('.connections-result[aria-expanded="true"]',e=>e.click());await wait(60);
  assert.equal(await page.$('.connections-detail'),null,'the app motion preference is respected too');
  assert.deepEqual(errors,[]);console.log('PASS: mobile card anchoring including last card, expanding/collapsing animation, reduced motion, and offline 27-stop Marcel map');
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
