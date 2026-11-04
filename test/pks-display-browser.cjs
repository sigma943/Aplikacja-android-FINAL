const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer'),postcss=require('postcss');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'pks-gtfs-'));let browser,server;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/pks-display-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((e,s)=>compiler.close(()=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));});
  const feed=JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync('public/data/journeys/pks.json.gz'))),gtfs=require('./load-ts.cjs')('lib/pks-gtfs.ts');
  const labels={'203':'Siedliska','210':'Czudec, Dwór','228':'Nosówka, pętla','232':'Wola Zgłobieńska, pętla','288':'Pstrągowa'};
  const legacy={items:gtfs.pksGtfsDepartures(feed,gtfs.pksGtfsTerminalStopIds(feed,'1937','4'),'2026-11-04').filter(row=>labels[row.line_name]).map(row=>({line_name:row.line_name,description:labels[row.line_name],journeys:[{stop_point_code:'4',time:new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Warsaw',hour:'2-digit',minute:'2-digit'}).format(new Date(row.timetable_time)),journey_id:'legacy:'+row.trip_id,legends:[]}]}))};
  const css=(await postcss([require('@tailwindcss/postcss')({base:root})]).process(fs.readFileSync('app/globals.css','utf8'),{from:path.join(root,'app/globals.css')})).css;
  server=http.createServer((req,res)=>{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(temp,'fixture.js')));}
   if(url.pathname==='/api/pks/einfo/stop-point-timetable/1937'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(legacy));}
   if(url.pathname.startsWith('/api/pks/einfo/its/infoboard/')){res.setHeader('Content-Type','application/json');return res.end('{"journeys":[]}');}
   if(url.pathname==='/data/journeys/pks.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(feed));}
   if(url.pathname.startsWith('/data/')){const p=path.join(root,'public',url.pathname);if(fs.existsSync(p)){res.setHeader('Content-Type',p.endsWith('.gz')?'application/gzip':'application/json');return res.end(fs.readFileSync(p));}res.statusCode=404;return res.end();}
   if(url.pathname.startsWith('/api/')){res.statusCode=503;return res.end('upstream unavailable');}
   res.setHeader('Content-Type','text/html');res.end('<meta charset="utf-8"><style>'+css+'</style><div id="root"></div><script src="/fixture.js"></script>');
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.stack||e.message);});await page.setViewport({width:393,height:1000});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.evaluateOnNewDocument(()=>{const NativeDate=Date;window.__clock=NativeDate.parse('2026-11-04T06:00:00Z');window.Date=class extends NativeDate{constructor(...args){if(args.length)super(...args);else super(window.__clock);}static now(){return window.__clock;}};});
  await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)?r.continue():r.abort());
  await page.goto(origin);await page.waitForSelector('[data-stop-card-id="3720"] [data-stop-line-badges]');
  assert.equal(await page.$$eval('[data-stop-card-id]',els=>els.length),4,'one card per physical platform');
  for(const id of ['3731','terminal:rzeszow-da:7','terminal:rzeszow-da:10'])assert.match(await page.$eval('[data-stop-card-id="'+id+'"]',e=>e.textContent),/Brak przypisanych linii PKS/);
  const total=await page.$eval('[data-stop-card-id="3720"] [data-stop-line-badges]',e=>Number(e.dataset.lineTotal));assert.ok(total>=5,'physical platform 4 has line badges');
  await page.click('[data-stop-card-id="3720"]');await page.waitForSelector('[data-departure-row]');
  const directions=await page.$$eval('[data-departure-row] h4',els=>els.map(e=>e.textContent));
  assert.ok(directions.includes('Wola Zgłobieńska, pętla'));assert.ok(directions.includes('Pstrągowa'));assert.ok(!directions.some(s=>s.includes(' p. ')),'known courses use compact legacy labels');
  assert.deepEqual(errors,[]);console.log('PASS actual stop cards: platform 4 badges, empty platforms 1/7/10 and compact known-course departure directions.');
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
