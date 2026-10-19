const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'route-style-'));let browser,server;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,entry:path.resolve('test/route-lines-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js']},module:{rules:[{test:/\.tsx?$/,use:path.resolve('test/route-tsx-loader.cjs')}]},optimization:{minimize:false}});compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()));});
  const html='<link rel="stylesheet" href="/leaflet.css"><div id="root"></div><script src="/fixture.js"></script>';
  server=http.createServer((req,res)=>{if(req.url.startsWith('/fixture.js')){res.setHeader('Content-Type','text/javascript');return fs.createReadStream(path.join(temp,'fixture.js')).pipe(res);}if(req.url==='/leaflet.css'){res.setHeader('Content-Type','text/css');return fs.createReadStream('node_modules/leaflet/dist/leaflet.css').pipe(res);}res.setHeader('Content-Type','text/html');res.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:393,height:700,deviceScaleFactor:1});
  fs.mkdirSync('test/ui-previews',{recursive:true});
  for(const canvas of [false,true]){
   await page.goto(`http://127.0.0.1:${server.address().port}/?canvas=${canvas?1:0}`);
   await page.waitForFunction(()=>window.routeTestMap&&Object.values(window.routeTestMap._layers).some(l=>l.options?.className==='mks-route-line'));
   for(let round=0;round<3;round++){
    await page.click('button:first-child');await page.waitForSelector('[data-mode="road"]');
    await page.waitForFunction(()=>Object.values(window.routeTestMap._layers).filter(l=>l.options?.pane==='routeLinePane'&&l.getLatLngs).length===3);
    const result=await page.evaluate(()=>{
     const map=window.routeTestMap,layers=Object.values(map._layers).filter(l=>l.options?.pane==='routeLinePane'&&l.getLatLngs),front=layers.find(l=>l.options.className==='mks-route-line'),renderer=front._renderer;
     const data={dash:front.options.dashArray,last:false,pixel:null,stroke:null};
     if(renderer._ctx){let tail=renderer._drawFirst;while(tail?.next)tail=tail.next;data.last=tail?.layer===front;const p=map.latLngToLayerPoint([50,22]).subtract(renderer._bounds.min);data.pixel=Array.from(renderer._ctx.getImageData(Math.round(p.x),Math.round(p.y),1,1).data);}
     else{data.last=front._path===renderer._rootGroup.lastChild;data.stroke=front._path.getAttribute('stroke-dasharray');}
     return data;
    });
    assert.deepEqual(result.dash,[],'road stroke explicitly clears schematic dashes');assert.equal(result.last,true,'foreground must paint above both halo layers');
    if(!canvas)assert.equal(result.stroke,null,'SVG road is solid');
    if(canvas){await new Promise(r=>setTimeout(r,70));const pixel=await page.evaluate(()=>{const map=window.routeTestMap,layer=Object.values(map._layers).find(l=>l.options?.className==='mks-route-line'),r=layer._renderer,p=map.latLngToLayerPoint([50,22]).subtract(r._bounds.min);return Array.from(r._ctx.getImageData(Math.round(p.x),Math.round(p.y),1,1).data);});assert.ok(pixel[0]>240&&pixel[1]>100&&pixel[1]<145&&pixel[2]<30,'Canvas paints orange foreground, not grey halo: '+pixel);}
    await page.click('button:nth-child(2)');await new Promise(r=>setTimeout(r,60));
    assert.equal(await page.evaluate(()=>Object.values(window.routeTestMap._layers).filter(l=>l.options?.pane==='routeLinePane'&&l.getLatLngs).length),3,'changing vehicles leaves no old route layers');
    if(round===2)await page.screenshot({path:`test/ui-previews/route-solid-${canvas?'canvas':'svg'}.png`});
    await page.click('button:first-child');await page.waitForSelector('[data-mode="schematic"]');await page.waitForFunction(()=>Object.values(window.routeTestMap._layers).filter(l=>l.options?.pane==='routeLinePane'&&l.getLatLngs).length===1);
   }
  }
  assert.deepEqual(errors,[]);console.log('Route transition passed: Canvas/SVG, solid foreground above halos, repeated mode and vehicle changes.');
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
