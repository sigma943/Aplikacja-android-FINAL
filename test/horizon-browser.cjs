const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'horizon-'));let server,browser;
try{
 await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/horizon-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')}]},optimization:{minimize:false}});compiler.run((e,s)=>compiler.close(()=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));});
 const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
 server=http.createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(temp,'fixture.js')));}res.setHeader('Content-Type','text/html');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script src="/fixture.js"></script>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width:412,height:880,deviceScaleFactor:1});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForSelector('html[data-horizon-theme="on"] [data-horizon-sky]');
 fs.mkdirSync('test/ui-previews',{recursive:true});
 for(const [label,time]of [['dawn','2026-10-23T04:40Z'],['day','2026-10-23T10:00Z'],['sunset','2026-10-23T15:20Z'],['night','2026-10-23T20:00Z']]){
  await page.evaluate(t=>window.horizonAt(t),time);await page.screenshot({path:`test/ui-previews/horizon-${label}.png`});
  const result=await page.evaluate(()=>({alt:+document.querySelector('[data-horizon-sky]').dataset.solarAltitude,animations:document.getAnimations().length,surface:getComputedStyle(document.querySelector('.transit-surface')).backgroundColor}));
  assert.ok(result.animations<=5);assert.ok(result.surface!=='rgba(0, 0, 0, 0)');
 }
 const stars=await page.$eval('[data-horizon-stars]',e=>+e.style.opacity);assert.ok(stars>.5);
 await page.evaluate(()=>window.horizonHidden(true));assert.equal(await page.evaluate(()=>document.getAnimations().length),0,'background cancels every sky animation');
 await page.evaluate(()=>{window.horizonAt('2026-10-24T10:00Z');window.horizonHidden(false);});
 const altitude=await page.$eval('[data-horizon-sky]',e=>+e.dataset.solarAltitude);assert.ok(altitude>15,'resume immediately uses current time');
 await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await page.waitForFunction(()=>document.getAnimations().length===0);
 await page.click('#toggle-theme');assert.equal(await page.$eval('[data-horizon-sky]',e=>getComputedStyle(e).display),'none');assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
 assert.deepEqual(errors,[]);console.log('Horizon browser: four skies, readable surfaces, pause/resume, reduced motion and theme cleanup passed.');
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
