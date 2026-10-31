const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'theme-background-'));let browser,server;
 try{
  const adminTemplate=fs.readFileSync('app/admin/AdminDashboard.tsx','utf8').match(/<style>\{`([\s\S]*?)`\}<\/style>/)[1];
  const adminCss=Function('return `'+adminTemplate+'`;')();
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'}),ADMIN_LIGHT_STYLES:JSON.stringify(adminCss)})],entry:path.join(root,'test/theme-background-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/production.css"><div id="root"></div><script src="/fixture.js"></script>');}if(url.pathname==='/production.css'){res.setHeader('Content-Type','text/css');return res.end(css);}if(url.pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(temp,'fixture.js')));}res.statusCode=404;res.end();});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:393,height:851,deviceScaleFactor:1});
  fs.mkdirSync('test/ui-previews',{recursive:true});let checked=0;
  for(const theme of ['light','light-warm','light-pink','light-sky','dark','dark-oled','dark-forest','dark-cosmos']){
   if(theme==='dark-cosmos')continue; // The existing scenery/contrast suite covers artwork, not a flat canvas.
   for(const [glass,opacity] of [['off',64],['on',20],['on',64],['on',100]])for(const tab of ['stops','journeys','admin']){
    await page.goto(origin+'/?'+new URLSearchParams({theme,tab,glass,opacity}));
    const target=tab==='stops'?'.transit-view':tab==='journeys'?'.connections-view':'[data-admin-view-canvas]';await page.waitForSelector(target);
    await page.waitForFunction(target=>getComputedStyle(document.querySelector(target)).opacity==='1',{},target);
    const result=await page.evaluate(target=>{
     const root=document.querySelector('.pks-theme-root'),probe=document.createElement('div');root.append(probe);probe.style.backgroundColor='var(--ui-canvas)';const expected=getComputedStyle(probe).backgroundColor;probe.remove();
     const nodes=[document.querySelector('[data-native-view]'),document.querySelector(target),...document.querySelectorAll('[data-admin-viewport]')];
     return {expected,colors:nodes.map(e=>getComputedStyle(e).backgroundColor),image:getComputedStyle(document.querySelector(target)).backgroundImage,overflow:document.documentElement.scrollWidth>innerWidth};
    },target);
    const detail=JSON.stringify({theme,tab,glass,opacity,result});for(const color of result.colors)assert.equal(color,result.expected,detail);assert.equal(result.overflow,false,detail);
    if(['dark-forest','light-sky','light-pink'].includes(theme))assert.notEqual(result.image,'none',detail);
    if(tab==='admin'){const text=await page.$eval('[data-admin-view-canvas]',e=>e.textContent);assert.match(text,/Zapisane szczegóły blokady/);assert.doesNotMatch(text,/banDetails|Permanentne/);}
    if(glass==='on'&&opacity===64)await page.screenshot({path:'test/ui-previews/theme-background-'+theme+'-'+tab+'.png'});
    checked++;
   }
  }
  assert.deepEqual(errors,[]);console.log('PASS consistent tab backgrounds and Polish block labels in '+checked+' theme/tab/glass configurations.');
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
