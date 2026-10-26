const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'horyzont-map-'));let browser,server;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/admin-theme-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/lib/use-global-api-statistics':path.join(root,'test/admin-statistics-hook-stub.ts'),'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/production.css"><div id="root"></div><script src="/fixture.js"></script>');}if(url.pathname==='/production.css'){res.setHeader('Content-Type','text/css');return res.end(css);}const base=/^\/(themes|data)\//.test(url.pathname)?path.join(root,'public'):temp,file=path.resolve(base,'.'+url.pathname);if(!file.startsWith(base+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream');res.end(fs.readFileSync(file));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(60000);
  await page.setViewport({width:393,height:851,deviceScaleFactor:1});
  fs.mkdirSync('test/ui-previews',{recursive:true});
  for(const theme of ['dark-mountains','dark-cosmos','dark-forest','dark-oled','dark','light','light-warm','light-sky','light-pink'])for(const night of theme==='dark-mountains'?[false,true]:[false]){
   await page.goto(origin+'/?theme='+theme+(night?'&night':''));await page.waitForSelector('[data-statistics-chart]');
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent==='Dzisiaj').click());
   const stats=await page.evaluate(()=>{const chart=document.querySelector('[data-statistics-chart="requests"]'),plot=chart.querySelector('[data-statistics-plot]'),marks=chart.querySelectorAll('[data-statistics-marks] circle');return {plot:getComputedStyle(plot).fill,marks:[...marks].map(e=>({fill:getComputedStyle(e).fill,r:e.getAttribute('r')})),rects:[...chart.querySelectorAll('rect[role="button"]')].map(e=>getComputedStyle(e).stroke),exportBorder:getComputedStyle(document.querySelector('[data-statistics-export]')).borderTopWidth};});
   const contrast=(a,b)=>{const lum=c=>c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
   assert.equal(stats.marks.length,2,'single-day requests and errors both have marks');for(const m of stats.marks)assert.ok(contrast(m.fill,stats.plot)>=3,theme+' series contrast '+JSON.stringify(stats));assert.ok(stats.rects.every(s=>s==='none'));assert.equal(stats.exportBorder,'0px');
   await page.$eval('[data-statistics-chart="requests"]',e=>e.scrollIntoView({block:'center'}));await page.screenshot({path:'test/ui-previews/horyzont-admin-chart-'+theme+(night?'-night':'')+'.png'});
   await page.$eval('[data-statistics-chart="requests"] rect[role="button"]',e=>e.dispatchEvent(new MouseEvent('click',{bubbles:true})));await page.waitForSelector('[data-statistics-tooltip]');assert.match(await page.$eval('[data-statistics-tooltip]',e=>e.textContent),/100/);await page.keyboard.press('Escape');
   await page.$eval('[aria-label="Otwórz menu statystyk"]',e=>e.click());await new Promise(r=>setTimeout(r,350));
   const sidebar=await page.$eval('[data-admin-sidebar]',e=>({bg:getComputedStyle(e).backgroundColor,ink:getComputedStyle(e).color,width:e.getBoundingClientRect().width,body:document.body.scrollWidth,card:getComputedStyle(document.querySelector('[data-control-card]')).backgroundColor}));
   assert.ok(sidebar.width<=393);assert.ok(sidebar.body<=393,'no sidebar or SVG overflow');
   if(theme==='dark-mountains'){assert.equal(sidebar.bg,'rgb(245, 249, 252)');assert.ok(contrast(sidebar.bg,sidebar.ink)>7);assert.ok(sidebar.card.endsWith('0.2)'),'other panels keep 20%');}
   await page.screenshot({path:'test/ui-previews/horyzont-admin-sidebar-'+theme+(night?'-night':'')+'.png'});console.log('PASS admin',theme,night?'night':'day',stats,sidebar);
  }
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
