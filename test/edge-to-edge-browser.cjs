const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer'),{PNG}=require('pngjs');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'native-navigation-'));
 await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/native-navigation-fixture.tsx'),output:{path:temp,filename:'fixture.js',publicPath:'/'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((e,stats)=>compiler.close(()=>e||stats.hasErrors()?reject(e||Error(stats.toString({all:false,errors:true}))):resolve()));});
 const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
 const server=http.createServer((req,res)=>{const asset=path.join(temp,path.basename(req.url.split('?')[0]));if(asset.endsWith('.js')&&fs.existsSync(asset)){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(asset));}res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body></body></html>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage();page.on('pageerror',error=>console.log('NAVIGATION PAGE ERROR',error.stack||error.message));
  for(const [width,height,insets] of [[393,851,{top:32,bottom:24,left:0,right:0}],[851,393,{top:24,bottom:0,left:32,right:48}],[1366,900,{top:0,bottom:0,left:0,right:0}]]){
   await page.setViewport({width,height});await page.goto(origin);
   await page.setContent('<style>'+css+'</style><div class="pks-theme-root fixed inset-0 flex flex-col" data-cosmic-tab="map" data-ui-theme="light-sky"><div data-native-status-background></div><div data-app-content class="flex-1 relative min-h-0"><div data-map-canvas class="absolute inset-0" style="background:rgb(255,0,0)"><div data-map-toolbar class="absolute top-0 left-0 right-0 p-2"><button>PKS Live</button></div></div></div><div id="navigation-root" data-app-navigation class="absolute bottom-0 left-0 right-0"></div></div>');
   await page.addScriptTag({content:fs.readFileSync(path.join(temp,'fixture.js'),'utf8')});await page.waitForSelector('[data-nav-item]');
   await page.evaluate(insets=>{const r=document.documentElement;r.dataset.nativeEdge='true';r.dataset.personalStatusBarOverlay='true';for(const [side,value]of Object.entries(insets))r.style.setProperty('--native-'+side,value+'px');},insets);
   const measure=()=>page.evaluate(()=>{const rect=q=>{const r=document.querySelector(q).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};};return {map:rect('[data-map-canvas]'),toolbar:rect('[data-map-toolbar]'),content:rect('[data-app-content]'),nav:rect('[data-app-navigation]'),panel:rect('.pks-navigation'),backdrop:getComputedStyle(document.querySelector('[data-native-status-background]')).display,topIsMap:Boolean(document.elementFromPoint(innerWidth/2,5)?.closest('[data-map-canvas]')),overflow:document.documentElement.scrollWidth>innerWidth};});
   const topPixel=async()=>[...PNG.sync.read(await page.screenshot({clip:{x:Math.floor(width/2),y:5,width:1,height:1}})).data];
   const optionsCheck=async()=>{
    const before=insets.top?await topPixel():null;
    await page.evaluate(()=>{const root=document.querySelector('.pks-theme-root');root.dataset.optionsOpen='true';const overlay=document.createElement('div');overlay.dataset.optionsOverlay='';overlay.className='absolute inset-0';overlay.style.cssText='z-index:6000;background:rgba(0,0,0,.5);backdrop-filter:blur(4px)';root.appendChild(overlay);});
    assert.equal((await measure()).backdrop,'none','opening options keeps status area transparent');
    assert.equal(await page.$eval('[data-options-overlay]',e=>e.getBoundingClientRect().top),insets.top,'options dimming starts below system icons');
    if(before)assert.deepEqual(await topPixel(),before,'options do not darken or recolour the status area');
    await page.evaluate(()=>{document.querySelector('[data-options-overlay]').remove();delete document.querySelector('.pks-theme-root').dataset.optionsOpen;});
   };
   let metrics=await measure();
   assert.equal(metrics.map.top,0);assert.equal(metrics.map.left,0);assert.equal(metrics.map.bottom,height);assert.equal(metrics.map.right,width);
   assert.equal(metrics.content.top,insets.top);assert.equal(metrics.content.left,insets.left);
   assert.equal(metrics.toolbar.top,insets.top);assert.equal(metrics.backdrop,'none');
   assert.equal(metrics.panel.height,width>=1100?72:64,'navigation never grows by the gesture inset');
   assert.equal(metrics.nav.bottom,height-insets.bottom-(width>=1100?18:0));assert.equal(metrics.overflow,false);
   if(insets.top)assert.equal(metrics.topIsMap,true,'map is actually visible under system icons');
   await optionsCheck();
   for(const tab of ['stops','journeys','admin']){
    await page.evaluate(tab=>document.querySelector('.pks-theme-root').dataset.cosmicTab=tab,tab);
    metrics=await measure();assert.equal(metrics.map.top,insets.top);assert.equal(metrics.backdrop,'none');
    await optionsCheck();
    if(insets.top)assert.equal(metrics.topIsMap,false,tab+' never leaks the map into its status area');
   }
   await page.evaluate(()=>{document.querySelector('.pks-theme-root').dataset.cosmicTab='map';document.documentElement.dataset.personalStatusBarOverlay='false';});
   metrics=await measure();assert.equal(metrics.map.top,insets.top);assert.equal(metrics.backdrop,'block');assert.equal(metrics.toolbar.top,insets.top);
   if(insets.top)assert.equal(metrics.topIsMap,false,'switch off really removes the map from behind the clock');
   await page.evaluate(()=>{const root=document.querySelector('.pks-theme-root');root.dataset.uiTheme='dark-mountains';root.style.setProperty('--landscape-solid','rgb(220,235,245)');});
   assert.equal(await page.$eval('[data-native-status-background]',e=>getComputedStyle(e).backgroundColor),'rgb(220, 235, 245)','Horyzont uses its solid day/night material behind system icons');
   await page.evaluate(()=>document.documentElement.dataset.personalStatusBarOverlay='true');metrics=await measure();assert.equal(metrics.map.top,0);assert.equal(metrics.backdrop,'none');
  }
  console.log('PASS compact navigation, transparent status area on every tab and while opening options, overlay switch on/off, phone/tablet/desktop');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
