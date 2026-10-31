const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'admin-buttons-'));let browser,server;
 try{
  const template=fs.readFileSync('app/admin/AdminDashboard.tsx','utf8').match(/<style>\{`([\s\S]*?)`\}<\/style>/)[1],adminCss=Function('return `'+template+'`;')();
  const sdk=path.join(root,'test/maintenance-ui-stub.ts');
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'}),ADMIN_LIGHT_STYLES:JSON.stringify(adminCss)})],entry:path.join(root,'test/admin-button-style-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/lib/maintenance-spark':sdk,'@/lib/firebase':sdk,'firebase/firestore':sdk,'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname;if(name==='/'){res.setHeader('Content-Type','text/html');return res.end('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/production.css"><div id="root"></div><script src="/fixture.js"></script>');}if(name==='/production.css'){res.setHeader('Content-Type','text/css');return res.end(css);}if(name==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(temp,'fixture.js')));}res.statusCode=404;res.end();});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:393,height:851,deviceScaleFactor:1});
  await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)?r.continue():r.abort());
  fs.mkdirSync('test/ui-previews',{recursive:true});let checked=0;
  const variants=['light','light-warm','light-pink','light-sky','dark','dark-oled','dark-forest','dark-cosmos'].map(theme=>({theme})).concat([30,1,-30].map(sun=>({theme:'dark-mountains',sun})));
  for(const variant of variants)for(const style of ['original','solid','outline'])for(const accent of ['#ff8000','#3b82f6','#000000','#ffffff']){
   const params={...variant,style,accent};await page.goto(origin+'/?'+new URLSearchParams(params));await page.waitForSelector('[data-fixture-view="operators"] .ui-accent-control');
   // Opening controls exercises their real handlers and exposes active date choices.
   await page.$eval('[data-fixture-view="operators"] .ui-accent-control',b=>b.click());
   await page.waitForFunction(()=>[...document.querySelectorAll('[data-fixture-view="operators"] button')].some(b=>b.textContent.trim()==='Wszyscy'));
   await page.$eval('[data-fixture-view="logs"] .ui-accent-control:nth-of-type(1)',()=>{const b=[...document.querySelectorAll('[data-fixture-view="logs"] button.ui-accent-control')].find(b=>b.textContent.includes('Wszystkie daty'));b.click();});
   await page.waitForFunction(()=>document.querySelectorAll('[data-fixture-view="logs"] button.ui-accent-control').length>=3);
   const rows=await page.evaluate(style=>{
    const css=e=>{const s=getComputedStyle(e);return {background:s.backgroundColor,image:s.backgroundImage,color:s.color,border:s.borderTopColor,shadow:s.textShadow};};
    const probe=document.createElement('i');document.body.append(probe);probe.style.color='var(--pks-accent-on)';const on=getComputedStyle(probe).color;probe.style.color='var(--landscape-accent,var(--pks-accent-text))';const outline=getComputedStyle(probe).color;probe.style.color='var(--pks-accent)';const accent=getComputedStyle(probe).color;probe.remove();
    return [...document.querySelectorAll('button.ui-accent-control')].map(b=>{
     const paint=css(b),children=[...b.querySelectorAll('svg,span')].map(css),bounds=b.getBoundingClientRect();
     b.classList.remove('ui-accent-control');const original=css(b);b.classList.add('ui-accent-control');
     return {view:b.closest('[data-fixture-view]')?.dataset.fixtureView,text:b.textContent.trim(),paint,children,original,on,outline,accent,width:bounds.width,scroll:b.scrollWidth,client:b.clientWidth};
    });
   },style);
   assert.ok(rows.length>=10,JSON.stringify({params,rows}));
   for(const row of rows){const detail=JSON.stringify({params,row});if(style==='original')assert.deepEqual(row.paint,row.original,detail);else{
    assert.equal(row.paint.color,style==='solid'?row.on:row.outline,detail);assert.equal(row.paint.background,style==='solid'?row.accent:'rgba(0, 0, 0, 0)',detail);assert.equal(row.paint.image,'none',detail);assert.equal(row.paint.shadow,'none',detail);
    if(style==='outline')assert.equal(row.paint.border,row.outline,detail);
    for(const child of row.children)assert.equal(child.color,row.paint.color,detail);
   }if(row.width>0)assert.ok(row.scroll<=row.client+2,detail);}
   // The history button still opens the actual maintenance dialog.
   await page.$eval('[data-fixture-view="maintenance"] button.ui-accent-control',b=>b.click());await page.waitForSelector('[role="dialog"][aria-label="Historia zmian"]');
   if(style==='solid'&&accent==='#ff8000'&&['light-warm','dark-mountains'].includes(variant.theme)){
    await page.$eval('[role="dialog"] button',b=>b.click());await page.$eval('[data-fixture-view="operators"]',e=>e.scrollIntoView());await page.screenshot({path:'test/ui-previews/admin-button-'+variant.theme+'-'+(variant.sun??'flat')+'.png'});
   }
   checked++;
  }
  assert.deepEqual(errors,[]);console.log('PASS real admin controls in '+checked+' theme/style/accent configurations; original appearance and handlers retained.');
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
