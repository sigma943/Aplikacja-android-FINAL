const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'scene-message-'));let browser,server;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/scene-message-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/production.css"><div id="root"></div><script src="/fixture.js"></script>');}
   if(url.pathname==='/production.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
   if(url.pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(temp,'fixture.js')));}
   res.statusCode=404;res.end();
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:393,height:851,deviceScaleFactor:1});
  fs.mkdirSync('test/ui-previews',{recursive:true});let checked=0;
  const themes=['light','light-warm','light-pink','light-sky','dark','dark-oled','dark-forest','dark-cosmos'];
  const cases=themes.map(theme=>({theme}));
  for(const sun of [30,0,-10])for(const opacity of [0,20,100])cases.push({theme:'dark-mountains',sun,opacity});
  for(const config of cases)for(const variant of ['preview','favorites','full']){
   await page.goto('http://127.0.0.1:'+server.address().port+'/?'+new URLSearchParams({...config,variant,accent:variant==='favorites'?'#000000':'#ffffff'}));
   await page.waitForSelector('.transit-view .scene-message');
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('.transit-view')).opacity==='1');
   const readings=await page.$$eval('.scene-message',nodes=>nodes.flatMap(node=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
    const rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
    const lum=rgb=>rgb.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const bg=rgba(getComputedStyle(node).backgroundColor),box=node.getBoundingClientRect();
    return [node,...node.querySelectorAll('h2,span')].map(text=>{const fg=rgba(getComputedStyle(text).color);return {text:text.textContent,alpha:bg[3],contrast:(Math.max(lum(bg),lum(fg))+.05)/(Math.min(lum(bg),lum(fg))+.05),opacity:getComputedStyle(text).opacity,fits:box.left>=0&&box.right<=innerWidth&&node.scrollWidth<=node.clientWidth+1};});
   }));
   assert.ok(readings.length>=3);for(const reading of readings){const detail=JSON.stringify({config,variant,reading});assert.equal(reading.alpha,255,detail);assert.ok(reading.contrast>=4.5,detail);assert.equal(reading.opacity,'1',detail);assert.equal(reading.fits,true,detail);}
   if(variant==='preview'&&(config.opacity===20||!config.sun))await page.screenshot({path:'test/ui-previews/scene-message-'+config.theme+'-'+(config.sun??'base')+'.png'});
   checked++;
  }
  assert.deepEqual(errors,[]);console.log('Readable standalone messages: '+checked+' theme, sun, opacity and list combinations passed.');
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
