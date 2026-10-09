const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer');
const fixture=require('./build-accent-fixture.cjs')(),root=fixture.root,production=path.resolve('out');
const server=http.createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(404);return res.end();}if(!fs.existsSync(file))file=path.resolve(production,'.'+pathname);if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']}),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));let geometryRequests=0,waiting=false,stopPlan='',stopLater='',stopBoard='';
try{
 await page.setViewport({width:393,height:851,deviceScaleFactor:1});
 await page.evaluateOnNewDocument(()=>{const arc=CanvasRenderingContext2D.prototype.arc;CanvasRenderingContext2D.prototype.arc=function(...args){this.canvas.dataset.testCircleCount=String(Number(this.canvas.dataset.testCircleCount||0)+1);return arc.apply(this,args);};
  const stroke=CanvasRenderingContext2D.prototype.stroke;CanvasRenderingContext2D.prototype.stroke=function(...args){if(this.canvas.closest('.leaflet-routeLine-pane'))this.canvas.dataset.testRouteStrokes=String(Number(this.canvas.dataset.testRouteStrokes||0)+1);return stroke.apply(this,args);};
  localStorage.setItem('mks_transport_providers',JSON.stringify(['mpk_rzeszow']));if(!localStorage.getItem('mks_map_state'))localStorage.setItem('mks_map_state',JSON.stringify({center:{lat:50.025,lng:21.995},zoom:14}));});
 await page.setRequestInterception(true);page.on('request',request=>{const url=request.url(),reply=(body,type='application/json',status=200)=>request.respond({status,contentType:type,headers:{'access-control-allow-origin':'*'},body});
 if(url.includes('GetVehicles?')&&waiting)return reply('<Vehicles><V nb="770" nr="   " nnr="51   " op=" " nop="Bardowskiego p. Dworzec Lokalny" x="22.02432" y="50.11553" px="22.02432" py="50.11553" ik="0" nk="3293" s="6" is="1572" o="1572"/></Vehicles>','application/xml');
 if(url.includes('GetVehicles?'))return reply('<Vehicles><V nb="102" nr="0A" op="Dworzec Główny PKP" x="21.985" y="50.021" ik="2500" s="1" is="0" lp="8" o="-120"/></Vehicles>','application/xml');
 if(url.includes('GetVehicleTimeTable?')){
  const xml=fs.readFileSync(waiting?'test/fixtures/mpk-mybus-51-waiting.xml':'test/fixtures/mpk-mybus-0a-timetable.xml','utf8');
  // Recorded scheduled clocks expire as CI advances through the day. Keep the
  // fixture's order/countdowns, but move its scheduled stops relative to now.
  const fresh=xml.replace(/<Stop\b[^>]*\/>/g,tag=>{
   if(!/m="3"/.test(tag))return tag;
   const seconds=Number(/s="(\d+)"/.exec(tag)?.[1]);
   const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Warsaw',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(Date.now()+seconds*1000)).split(':');
   return tag.replace(/th="[^"]*"/,`th="${clock[0]}"`).replace(/tm="[^"]*"/,`tm="${clock[1]}"`);
  });
  return reply(fresh,'application/xml');
 }
 if(url.includes('GetRouteVariantWithTransitPoints?')){geometryRequests++;return reply(fs.readFileSync(waiting?'test/fixtures/mpk-mybus-51-route.xml':'test/fixtures/mpk-mybus-0a-route.xml','utf8'),'application/xml');}
 if(url.includes('stopscache'))return reply(JSON.stringify([...JSON.parse(fs.readFileSync('test/fixtures/mpk-mybus-canonical-stops.json','utf8')),{stop_id:256,stop_name:'Podkarpacka / Matuszczaka 03',stop_lat:'50.0168',stop_lon:'21.97541',lines:'15,28'}]));
 if(url.includes('GetTimeTableReal?')){assert.equal(new URL(url).searchParams.get('nBusStopId'),'100');return reply(stopBoard,'application/xml');}
 if(url.includes('get_current_service'))return reply(JSON.stringify({service_ids:[2],date_used:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw'}).format(new Date()).replaceAll('-','')}));
 if(url.includes('offline_schedule.php'))return reply(JSON.stringify({schedule:{15:[{line:'15',trip_headsign:'Olbrachta p. Jarową',departure_time:stopPlan,trip_id:234592}],28:[{line:'28',trip_headsign:'Lubelska MPK',departure_time:stopLater,trip_id:251617}]}}));
 if(url.includes('/przystanki/departures.php'))return reply(JSON.stringify([{linia:'15',kierunek:'Olbrachta p. Jarową',czas_odjazdu:stopPlan,trip_id:234592,czas_odjazdu_real:null}]));
 if(url.includes('get_trip_stops'))return reply('{"stops":[]}');
 if(url.includes('vehicles_proxy'))return reply('missing','text/plain',404);
 if(url.includes('api.php?type=mpk'))return reply('{}');
 if(url.includes('mpkrzeszow.pl')||url.includes('api-site.marcel-bus.pl'))return reply('[]');
 if(url.includes('nearest-departures'))return reply('{"journeys":[]}');
 if(url.includes('stop-point-timetable'))return reply('{"items":[]}');
 if(url.includes('/api/pks/'))return reply('{"items":[]}');
 if(url.startsWith(origin))return request.continue();return request.abort();});
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForSelector('.mks-bus-marker');
 await page.evaluate(()=>[...document.querySelectorAll('.mks-bus-marker')].find(el=>el.textContent.includes('0A'))?.click());
 await page.waitForSelector('[data-map-bus-sheet]');
 // Leaflet uses Canvas for performance: SVG CSS selectors cannot inspect its paths.
 await page.waitForFunction(()=>{const canvas=document.querySelector('.leaflet-routeLine-pane canvas');if(!canvas)return false;const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let painted=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0)painted++;return painted>200;},{timeout:30000});
 await page.waitForFunction(()=>Number(document.querySelector('.leaflet-routeStops-pane canvas')?.dataset.testCircleCount)>=10);
 assert.ok(await page.$eval('.leaflet-routeStops-pane canvas',el=>Number(el.dataset.testCircleCount)>=10),'upcoming stop circles are drawn by the Canvas renderer');
 await page.focus('[aria-label="Rozwiń panel autobusu"]');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('[data-map-bus-sheet]')?.textContent.includes('Powst. Warszawy'));
 assert.match(await page.$eval('[data-map-bus-sheet]',el=>el.textContent),/Powst. Warszawy/);
 await page.evaluate(()=>[...document.querySelectorAll('[data-map-bus-sheet] span')].find(el=>el.textContent.includes('Powst. Warszawy')).parentElement.parentElement.click());
 await page.waitForSelector('.stop-highlight-pin .map-stop-pin');
 assert.equal(await page.$eval('.stop-highlight-pin .map-stop-pin',el=>getComputedStyle(el).color),'rgb(255, 122, 0)','MPK route stop pin matches its orange route');
 assert.equal(geometryRequests,1);assert.deepEqual(errors,[]);
 fs.mkdirSync('test/ui-previews',{recursive:true});await page.screenshot({path:'test/ui-previews/mpk-mybus-0a-route.png'});
 waiting=true;
 await page.evaluate(()=>localStorage.setItem('mks_map_state',JSON.stringify({center:{lat:50.11,lng:22.025},zoom:14})));
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.mks-bus-marker');
 await page.evaluate(()=>[...document.querySelectorAll('.mks-bus-marker')].find(el=>el.textContent.includes('51'))?.click());
 await page.waitForFunction(()=>{const text=document.querySelector('[data-map-bus-sheet]')?.textContent||'';return text.includes('Solaris Urbino 18 IV (2018)')&&text.includes('Odjazd za:');});
 const before=await page.$eval('[data-map-bus-sheet]',el=>el.textContent.match(/Odjazd za:\s*(\d+):(\d{2})/).slice(1).map(Number));
 assert.ok(before[0]*60+before[1]>24*60&&before[0]*60+before[1]<=1573);
 await page.waitForFunction(previous=>{const match=document.querySelector('[data-map-bus-sheet]')?.textContent.match(/Odjazd za:\s*(\d+):(\d{2})/);return match&&Number(match[1])*60+Number(match[2])<previous;},{timeout:5000},before[0]*60+before[1]);
 await page.focus('[aria-label="Rozwiń panel autobusu"]');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('[data-map-bus-sheet]')?.textContent.includes('Jasionka - Port Lotniczy'));
 await page.waitForFunction(()=>{const canvas=document.querySelector('.leaflet-routeLine-pane canvas');if(!canvas)return false;const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let painted=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0)painted++;return painted>200;});
 await page.waitForFunction(()=>Number(document.querySelector('.leaflet-routeStops-pane canvas')?.dataset.testCircleCount)>=2);
 assert.equal(geometryRequests,2);assert.deepEqual(errors,[]);
 await page.screenshot({path:'test/ui-previews/mpk-mybus-51-break.png'});
 // The second clock must keep advancing without repainting unchanged route styles.
 await new Promise(resolve=>setTimeout(resolve,500));
 const idleRoute=await page.evaluate(()=>{
  const canvas=document.querySelector('.leaflet-routeLine-pane canvas');
  const match=document.querySelector('[data-map-bus-sheet]').textContent.match(/Odjazd za:\s*(\d+):(\d{2})/);
  return {strokes:Number(canvas.dataset.testRouteStrokes),seconds:Number(match[1])*60+Number(match[2])};
 });
 assert.ok(idleRoute.strokes>0,'route instrumentation observed actual drawing');
 await page.waitForFunction(previous=>{
  const match=document.querySelector('[data-map-bus-sheet]')?.textContent.match(/Odjazd za:\s*(\d+):(\d{2})/);
  return match&&Number(match[1])*60+Number(match[2])<=previous-2;
 },{timeout:5000},idleRoute.seconds);
 assert.equal(await page.$eval('.leaflet-routeLine-pane canvas',el=>Number(el.dataset.testRouteStrokes)),idleRoute.strokes,
  'unchanged route must not repaint on clock ticks');
 // An HTTP-200 primary with scheduled rows must recover actual MPK stop predictions.
 const seconds=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Warsaw',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).split(':').reduce((sum,value)=>sum*60+Number(value),0));
 const clock=value=>`${Math.floor(value/3600)}:${String(Math.floor(value%3600/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
 stopPlan=clock(seconds+300);stopLater=clock(seconds+2400);
 stopBoard=`<Departures i="100"><D i="8212" iks="6462467" r="15" d="Olbrachta p. Jarową" n="815" t="${seconds+660}" vr="660" m="2"/></Departures>`;
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Przystanki').click());
 await page.waitForSelector('input[placeholder*="Babica"]');await page.type('input[placeholder*="Babica"]','Matuszczaka');
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-stop-card-id]')].some(el=>el.textContent.includes('Matuszczaka')));
 await page.evaluate(()=>[...document.querySelectorAll('[data-stop-card-id]')].find(el=>el.textContent.includes('Matuszczaka')).click());
 await page.waitForFunction(()=>document.body.textContent.includes('+6 min')&&document.body.textContent.includes('Lubelska MPK'));
 const rendered=await page.evaluate(()=>{const title=[...document.querySelectorAll('h4')].find(el=>el.textContent==='Olbrachta p. Jarową');return title?.parentElement.parentElement.parentElement.parentElement.textContent;});
 assert.match(rendered,/1[01] min/);assert.match(rendered,/\+6 min/);assert.doesNotMatch(rendered,/Rozkład/);assert.deepEqual(errors,[]);
 assert.doesNotMatch(await page.evaluate(()=>document.body.textContent),/Rozkład/,'scheduled-only departures must also omit the schedule label');
 await page.screenshot({path:'test/ui-previews/mpk-mybus-stop-live.png'});
 console.log('MPK backup: routes, next-stop circles, models, break countdown and actual stop predictions rendered.');
}finally{await browser.close();await new Promise(r=>server.close(r));fixture.cleanup();}})().catch(e=>{console.error(e);process.exitCode=1;});
