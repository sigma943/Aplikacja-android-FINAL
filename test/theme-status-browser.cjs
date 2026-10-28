const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer'),{PNG}=require('pngjs');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'theme-status-'));let browser,server;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/theme-status-fixture.tsx'),output:{path:temp,filename:'fixture.js',publicPath:'/'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/lib/use-global-api-statistics':path.join(root,'test/admin-statistics-hook-stub.ts'),'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}'+css+'</style><div id="root"></div><script src="/fixture.js"></script>');}const base=/^\/(themes|data)\//.test(url.pathname)?path.join(root,'public'):temp,file=path.resolve(base,'.'+url.pathname);if(!file.startsWith(base+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream');res.end(fs.readFileSync(file));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});await page.setViewport({width:393,height:851,deviceScaleFactor:1});await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  fs.mkdirSync('test/ui-previews',{recursive:true});
  for(const theme of ['dark-forest','light-sky','light-pink','dark-oled','light','dark-cosmos','dark-mountains'])for(const tab of ['admin','stops','journeys']){
   await page.goto(origin+'/?theme='+theme+'&tab='+tab);const leaf=tab==='admin'?'[data-admin-view-canvas]':tab==='stops'?'.transit-view':'.connections-view';await page.waitForSelector(leaf);
   if(theme==='dark-mountains'){
    await page.waitForFunction(()=>typeof window.__landscapePreview==='function');await page.evaluate(()=>window.__landscapePreview({iso:'2026-06-21T12:00:00Z',rate:0}));
    await page.waitForSelector('[data-landscape-stage][data-assets-ready="true"]');await page.waitForFunction(()=>document.documentElement.dataset.landscapePeriod==='day');
   }
   await page.evaluate(()=>document.fonts.ready);await new Promise(r=>setTimeout(r,150));
   const metrics=await page.$eval(leaf,e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e),h=e.querySelector('h1'),hr=h?.getBoundingClientRect();return {top:r.top,background:s.backgroundColor,image:s.backgroundImage,padding:parseFloat(s.paddingTop),heading:hr?.top,content:document.querySelector('[data-app-content]').getBoundingClientRect().top};});
   assert.equal(metrics.content,0,theme+' '+tab+' full-screen content');assert.equal(metrics.top,0,theme+' '+tab+' owns status-area background');assert.ok(metrics.heading>=32,theme+' '+tab+' keeps heading below icons');
   if(['dark-forest','light-sky','light-pink'].includes(theme))assert.match(metrics.image,/svg/,theme+' artwork continues through status area');
   const png=PNG.sync.read(await page.screenshot()),at=(x,y)=>[...png.data.subarray((y*png.width+x)*4,(y*png.width+x)*4+3)];
   if(['dark-forest','light-sky','light-pink'].includes(theme)){
    assert.deepEqual(at(2,12),at(2,44),theme+' '+tab+' has no horizontal colour seam');
    const colours=new Set();for(let y=0;y<32;y+=2)for(let x=0;x<393;x+=3)colours.add(at(x,y).join(','));assert.ok(colours.size>2,theme+' decoration is visible beneath status icons');
   }
   if(theme==='dark-mountains')assert.equal(await page.$eval('[data-landscape-stage]',e=>e.getBoundingClientRect().top),0,'real Horyzont canvas includes status area');
   await page.screenshot({path:'test/ui-previews/theme-status-'+theme+'-'+tab+'.png'});
  }
  await page.goto(origin+'/?theme=dark-mountains&tab=journeys');
  await page.waitForFunction(()=>typeof window.__checkCloudTop==='function');
  for(const sample of await page.evaluate(()=>window.__checkCloudTop())){
   if(sample.offset>0){assert.ok(sample.top>150,'cloud alpha extends above source edge: '+JSON.stringify(sample));assert.ok(Math.abs(sample.top-sample.below)<=2,'no alpha seam at source edge');}
   assert.equal(sample.clear,0,'transparent sky stays transparent');
  }
  await page.waitForFunction(()=>typeof window.__landscapePreview==='function');
  await page.evaluate(()=>window.__landscapePreview({iso:'2026-10-28T16:45:00Z',rate:0,seconds:240}));
  await page.waitForSelector('[data-landscape-stage][data-assets-ready="true"]');
  await page.waitForFunction(()=>document.documentElement.dataset.landscapePeriod==='night');
  await new Promise(r=>setTimeout(r,500));
  await page.screenshot({path:'test/ui-previews/theme-status-horyzont-night-clouds.png'});
  await page.goto(origin+'/?theme=dark-forest&tab=admin&off');await page.waitForSelector('[data-admin-view-canvas]');assert.equal(await page.$eval('[data-app-content]',e=>e.getBoundingClientRect().top),32,'disabled mode retains reserved status area');
  assert.equal(await page.$eval('[data-admin-view-canvas] h1',e=>e.getBoundingClientRect().top)>=32,true);
  assert.deepEqual(errors,[]);console.log('PASS real admin/stops/journeys backgrounds and artwork cover status area across seven themes, controls stay safe, actual Horyzont renderer reaches top');
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
