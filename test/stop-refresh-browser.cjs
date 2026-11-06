const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'stop-refresh-'));let browser,server;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/stop-refresh-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')}]},optimization:{minimize:false}});compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));});
  server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?fs.readFileSync(path.join(temp,'fixture.js')):'<div id="root"></div><script src="/fixture.js"></script>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
  const request=async count=>page.waitForFunction(n=>window.__stopRefresh?.requests.length===n,{},count);
  const send=async(index,kind,ids)=>page.evaluate(({index,kind,ids})=>{
   const result={departures:ids.map(id=>({id,line:'108',direction:'Rzeszów D.A.',time:'04:32',status:'on_time',carrier:{id:'pks'}})),warnings:[],updatedAt:Date.now()};
   window.__stopRefresh.requests[index][kind](result);
  },{index,kind,ids});
  const ids=()=>page.$$eval('[data-row]',nodes=>nodes.map(n=>n.textContent.split(':')[0]));
  const settle=()=>new Promise(r=>setTimeout(r,100));
  await request(1);await send(0,'partial',['a','b']);await page.waitForSelector('[data-row]');await send(0,'resolve',['a','b']);await settle();
  await page.evaluate(()=>{window.__firstRow=document.querySelector('[data-row]');window.__startRender=window.__stopRefresh.renders.length;window.__stopRefresh.enrich();});await request(2);
  assert.deepEqual(await ids(),['a','b']);assert.equal(await page.$('[data-skeleton]'),null);
  await send(1,'partial',[]);await settle();await send(1,'partial',['a']);await settle();assert.deepEqual(await ids(),['a','b']);
  assert.equal(await page.evaluate(()=>window.__firstRow===document.querySelector('[data-row]')),true,'existing row DOM remains mounted through enrichment');
  await send(1,'resolve',['a','b','c']);await settle();assert.deepEqual(await ids(),['a','b','c']);
  assert.equal(await page.evaluate(()=>window.__stopRefresh.renders.slice(window.__startRender).some(r=>r.loading||!r.ids.length)),false,'no skeleton or empty-list render while enriching this stop/day');
  await page.evaluate(()=>window.__stopRefresh.enrich());await request(3);await page.evaluate(()=>window.__stopRefresh.requests[2].reject(Error('offline')));await settle();assert.deepEqual(await ids(),['a','b','c']);assert.ok((await page.$eval('[data-warning]',e=>e.textContent)).includes('Zachowano'));
  await page.evaluate(()=>window.__stopRefresh.enrich());await request(4);await page.evaluate(()=>window.__stopRefresh.changeDate('2026-11-07'));await request(5);assert.ok(await page.$('[data-skeleton]'),'new day resets the previous schedule');
  await send(3,'partial',['old']);await send(3,'resolve',['old']);await settle();assert.ok(await page.$('[data-skeleton]'),'late old-day responses cannot populate new day');
  await send(4,'resolve',['tomorrow']);await settle();assert.deepEqual(await ids(),['tomorrow']);
  await page.evaluate(()=>window.__stopRefresh.changeStop());await request(6);assert.ok(await page.$('[data-skeleton]'));await send(5,'resolve',['other-stop']);await settle();assert.deepEqual(await ids(),['other-stop']);
  await page.evaluate(()=>window.__stopRefresh.refresh());await request(7);assert.deepEqual(await ids(),['other-stop']);await send(6,'resolve',[]);await settle();assert.deepEqual(await ids(),[],'a successful complete empty schedule still clears obsolete rows');assert.equal(await page.$('[data-skeleton]'),null);
  assert.deepEqual(errors,[]);console.log('PASS: first partial result, catalog enrichment without flicker/DOM replacement, partial empties, refresh error retention, stale-response guards, new day/stop resets, final empty result');
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
