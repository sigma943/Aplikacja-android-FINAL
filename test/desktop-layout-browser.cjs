const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-layout-'));let browser,server;
 try{
  const entry=Object.fromEntries(['stops','options','admin'].map((key,i)=>[key,path.join(root,'test/'+['stop-search-fixture.tsx','ui-interactions-fixture.tsx','admin-theme-fixture.tsx'][i])]));
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,entry,output:{path:temp,filename:'[name].js'},plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/lib/use-global-api-statistics':path.join(root,'test/admin-statistics-hook-stub.ts'),'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((e,stats)=>compiler.close(()=>e||stats.hasErrors()?reject(e||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),key=u.searchParams.get('fixture')||'stops';
   if(/^\/(stops|options|admin)\.js$/.test(u.pathname)){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(temp,u.pathname.slice(1))));}
   if(u.pathname!=='/'){const f=path.resolve(root,'public','.'+u.pathname);if(f.startsWith(path.join(root,'public')+path.sep)&&fs.existsSync(f)&&fs.statSync(f).isFile())return res.end(fs.readFileSync(f));res.statusCode=404;return res.end();}
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}'+css+'</style><div id="root"></div><script src="/'+key+'.js"></script>');
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage();page.setDefaultTimeout(60000);
  await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')||r.url().startsWith('blob:')?r.continue():r.abort());
  fs.mkdirSync('test/ui-previews',{recursive:true});
  const open=async(url,width,selector)=>{await page.setViewport({width,height:900,deviceScaleFactor:1});await page.goto(origin+url);await page.waitForSelector(selector);await new Promise(r=>setTimeout(r,800));};
  const overflow=()=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  // Compare the real components with the desktop layer present and removed:
  // every material and box must remain identical below the new breakpoint.
  for(const [url,selector] of [['/?fixture=stops','[data-stop-list-mode]'],['/?fixture=options','[data-options-sheet]'],['/?fixture=stops&planner','.connections-content'],['/?fixture=admin&view=devices&theme=dark-forest','[data-admin-device-item]']]){
   for(const width of [393,1024]){
    await open(url,width,selector);
    const equal=await page.evaluate(()=>{
     const sheets=[];for(const sheet of document.styleSheets)for(let i=sheet.cssRules.length-1;i>=0;i--){const r=sheet.cssRules[i];if(r.conditionText?.replace(/\s/g,'')==='(min-width:1100px)'){sheets.push([sheet,i,r.cssText]);sheet.deleteRule(i);}}
     const sample=()=>[...document.querySelectorAll('[data-stop-list-header],[data-stop-card-id],[data-options-sheet],.personal-tabs,.connections-content,[data-admin-device-item]')].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return [r.x,r.y,r.width,r.height,s.backgroundColor,s.borderRadius,s.display,s.gridTemplateColumns];});
     if(!sheets.length)throw Error('Desktop composition layer missing from compiled CSS');
     const before=sample();for(const [sheet,i,text]of sheets.reverse())sheet.insertRule(text,i);return JSON.stringify(before)===JSON.stringify(sample());
    });assert.ok(equal,`mobile/tablet unchanged: ${url} at ${width}`);assert.equal(await overflow(),false);
   }
  }
  for(const width of [1100,1366,1920,2560]){
   await open('/?fixture=stops',width,'[data-stop-list-mode]');
   const sizes=await page.evaluate(()=>{const r=document.querySelector('[data-stop-list-header]').getBoundingClientRect(),grid=document.querySelector('[data-stop-list-mode] > [data-stop-list-scroll]');return {width:r.width,center:r.x+r.width/2,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length};});
   assert.ok(sizes.width<=1192);assert.ok(Math.abs(sizes.center-width/2)<2);assert.equal(sizes.columns,2);assert.equal(await overflow(),false);
   await page.screenshot({path:`test/ui-previews/desktop-stops-${width}.png`});
   await open('/?fixture=options',width,'[data-options-sheet]');await page.click('#options-personal-tab');await page.waitForSelector('[data-theme-presets]');
   const sheet=await page.$eval('[data-options-sheet]',e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height,bottom:r.bottom};});assert.ok(sheet.width<=960);assert.ok(sheet.height<=836);assert.ok(sheet.bottom<=900);assert.equal(await overflow(),false);
   assert.equal(await page.$eval('.personal-presets-grid',e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),3);
   await page.screenshot({path:`test/ui-previews/desktop-options-${width}.png`});
   await open('/?fixture=stops&planner',width,'.connections-content');assert.ok(await page.$eval('.connections-content',e=>e.getBoundingClientRect().width<=1180));assert.equal(await overflow(),false);
   await page.screenshot({path:`test/ui-previews/desktop-connections-${width}.png`});
  }
  console.log('PASS desktop composition at 1100/1366/1920/2560; mobile and tablet geometry/materials unchanged at 393/1024');
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
