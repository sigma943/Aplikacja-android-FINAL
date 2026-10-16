const assert=require('node:assert/strict');const http=require('node:http');const fs=require('node:fs');const path=require('node:path');const puppeteer=require('puppeteer');
fs.mkdirSync(path.resolve('test/ui-previews'),{recursive:true});
const fixture=require('./build-accent-fixture.cjs')();const root=fixture.root,production=path.resolve('out');
const server=http.createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}if(!fs.existsSync(file))file=path.resolve(production,'.'+pathname);if((!file.startsWith(root+path.sep)&&!file.startsWith(production+path.sep))||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage();const errors=[];let marcelCatalogRequests=0;page.on('pageerror',e=>errors.push(e.message));
try{
 await page.setViewport({width:393,height:851,deviceScaleFactor:1});
 await page.evaluateOnNewDocument(()=>{const Original=Date;window.Date=class extends Original{constructor(...args){super(...(args.length?args:[Original.parse('2026-10-07T11:45:20Z')]));}static now(){return Original.parse('2026-10-07T11:45:20Z');}};if(!localStorage.getItem('mks_map_state'))localStorage.setItem('mks_map_state',JSON.stringify({center:{lat:50.04,lng:22},zoom:17}));});
 await page.setRequestInterception(true);
 page.on('request',request=>{const url=request.url();const json=data=>request.respond({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
  if(url.endsWith('/data/pks-stop-points.json'))return json({stops:{'900002':{n:'Boguchwała TestMap',lat:49.9822,lon:21.94,areaId:'1',code:'01'},'900003':{n:'Rzeszów TestMap',lat:50.04025,lon:22,areaId:'2',code:'03'},'3795':{n:'RZESZÓW, PODKARP.MATUSZCZAKA',lat:50.01679,lon:21.9753,areaId:'1945',code:'03'},...Object.fromEntries(['1365','9026','11462','11461','10694','10695','3721','3723','6155','6154'].map(id=>[id,require('../public/data/pks-stop-points.json').stops[id]]))}});
  if(url.includes('api-site.marcel-bus.pl/client/api/search/trasy?')){marcelCatalogRequests++;return json([{idTr:18,nazTr:'Jasło-Rzeszów'},{idTr:3,nazTr:'Rzeszów-Jasło'}]);}
  if(url.includes('api-site.marcel-bus.pl/client/api/search/wariantTrasy/kusy?'))return json([{idKu:new URL(url).searchParams.get('idTr')==='18'?1181798:1182201,nazTr:new URL(url).searchParams.get('idTr')==='18'?'Jasło-Rzeszów':'Rzeszów-Jasło'}]);
  if(url.includes('api-site.marcel-bus.pl/client/api/trasy/kurs/')){
    const north=url.includes('/1181798?');const pks=require('../public/data/pks-stop-points.json').stops;
    const lutoryz=north?{...require('./fixtures/marcel-jaslo-rzeszow-1181798.json').course.find(s=>s.kol===40),godz:'14:05'}:
      {nazMi:'Lutoryż',nazPr:'Babia Góra 76N',szGps:pks['6154'].lat,dlGps:pks['6154'].lon,godz:'14:15',kol:40};
    return setTimeout(()=>json([require('./fixtures/babica-dps-providers.json').marcel[north?0:1],lutoryz,{nazMi:'Babica',nazPr:'(81) za torami',szGps:null,dlGps:null,kol:69,godz:'16:01'}]),600);
  }
  if(url.includes('mpkrzeszow.pl/przystanki/stopscache'))return json([{stop_id:186,stop_name:'Lisa-Kuli / Moniuszki 02',stop_lat:50.0365064452402,stop_lon:21.9974981993437,lines:'8'},{stop_id:900001,stop_name:'Rzeszów TestMap 03',stop_lat:50.04,stop_lon:22,lines:'2'},{stop_id:256,stop_name:'Podkarpacka / Matuszczaka 03',stop_lat:50.0168019697084,stop_lon:21.9754108786583,lines:'11'}]);
  if(url.includes('offline_schedule.php'))return json({schedule:{'2':[{line:'2',trip_headsign:'Centrum',departure_time:'13:55:00',trip_id:'test-map'}]}});
  if(url.includes('mpkrzeszow.pl')||url.includes('api-site.marcel-bus.pl')||url.includes('/pks/get_vehicles.php'))return json([]);
  if(url.includes('nearest-departures'))return json({journeys:url.includes('/6155')?[{line_name:'108',route_description:'Rzeszów D.A.',timetable_time:'2026-10-07T12:00:00Z'}]:[]});
  if(url.includes('stop-point-timetable'))return json({items:[]});
  if(url.includes('/api/pks/'))return json({items:[]});
  if(url.startsWith(origin))return request.continue();return request.abort();
 });
 const button=async label=>page.evaluate(text=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text)?.click(),label);
 const option=async()=>{await button('Opcje');await page.waitForSelector('[data-options-sheet][data-expanded="true"]');
  // Wait for the expanded sheet to settle before interacting with its controls.
  await page.waitForFunction(()=>{const sheet=document.querySelector('[data-options-sheet]');if(!sheet)return false;const transform=getComputedStyle(sheet).transform;return transform==='none'||Math.abs(new DOMMatrixReadOnly(transform).m42)<.5;});
  assert.equal(await page.$eval('[data-options-sheet]',el=>el.dataset.expanded),'true','settings open expanded');await page.evaluate(()=>document.querySelector('[aria-label="Pokaż przystanki na mapie"]').click());await page.mouse.click(4,4);await page.waitForSelector('[role="dialog"]',{hidden:true});};
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForSelector('.leaflet-container');
 assert.equal(await page.$$('.map-catalog-stop').then(rows=>rows.length),0,'stops are disabled initially');
 await option();
 await page.waitForSelector('.map-catalog-stop[title^="Rzeszów TestMap" i]');
 await page.waitForFunction(()=>document.querySelectorAll('.map-catalog-stop[title^="Rzeszów TestMap" i]').length===1);
 const color=await page.$eval('.map-catalog-stop[title^="Rzeszów TestMap" i] .map-stop-ring',el=>getComputedStyle(el).backgroundColor);assert.equal(color,'rgb(255, 122, 0)');
 assert.equal(await page.$eval('.map-catalog-stop[title^="Rzeszów TestMap" i] svg',el=>getComputedStyle(el).color),'rgb(255, 255, 255)');
 assert.equal(marcelCatalogRequests,0,'map startup and enabling icons do not download the Marcel timetable catalog');
 // Open the reported shared platform before ever visiting the stop list.
 await page.evaluate(()=>localStorage.setItem('mks_map_state',JSON.stringify({center:{lat:49.957836,lng:21.916802},zoom:18})));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForSelector('.map-catalog-stop[title*="Lutoryż" i][title*="89N" i]');
 await page.click('.map-catalog-stop[title*="Lutoryż" i][title*="89N" i]');
 await page.waitForSelector('[data-map-stop-sheet]');
 await page.waitForFunction(()=>document.querySelector('[data-map-stop-sheet]')?.textContent.includes('108'));
 // Data can finish before the lazy panel's entrance animation. Click a settled handle.
 await page.waitForFunction(()=>{const sheet=document.querySelector('[data-map-stop-sheet]');return sheet&&Math.abs(new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42)<.5;});
 await page.click('[aria-label="Rozwiń panel przystanku"]');
 await page.waitForSelector('[data-map-stop-sheet][data-expanded="true"]');
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-map-stop-sheet] [data-departure-row]')].some(row=>row.querySelector('span')?.textContent==='M'));
 const marcelRows=await page.$$eval('[data-map-stop-sheet] [data-departure-row]',rows=>rows.filter(row=>row.querySelector('span')?.textContent==='M').map(row=>({text:row.textContent,color:getComputedStyle(row.querySelector('span')).color})));
 assert.ok(marcelRows.every(row=>row.text.includes('Rzeszów')&&!row.text.includes('Jasło')),'89N does not borrow reverse-platform departures');
 assert.ok(marcelRows.every(row=>row.color==='rgb(104, 196, 74)'));
 assert.ok(await page.$$eval('[data-map-stop-sheet] [data-departure-row]',rows=>rows.some(row=>row.querySelector('span')?.textContent==='108')),'PKS departures remain visible alongside Marcel');
 await page.screenshot({path:path.resolve('test/ui-previews/map-lutoryz-shared-marcel-departures.png')});
 await page.evaluate(()=>localStorage.setItem('mks_map_state',JSON.stringify({center:{lat:50.04,lng:22},zoom:17})));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForSelector('.map-catalog-stop[title^="Rzeszów TestMap" i]');
 await page.click('.map-catalog-stop[title^="Rzeszów TestMap" i]');await page.waitForSelector('[data-map-stop-sheet]');
 await page.waitForSelector('.map-stop-ring.is-selected');assert.match(await page.$eval('[data-map-stop-sheet]',el=>el.textContent),/Rzeszów TestMap/i);
 await page.$eval('.leaflet-container',el=>{el.focus();el.dispatchEvent(new KeyboardEvent('keydown',{key:'-',keyCode:189,which:189,bubbles:true}));});
 await new Promise(resolve=>setTimeout(resolve,400));
 await page.$eval('.leaflet-container',el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'-',keyCode:189,which:189,bubbles:true})));
 await page.waitForSelector('.map-catalog-stop',{hidden:true});await page.waitForSelector('.stop-highlight-pin');
 assert.equal(await page.$eval('.stop-highlight-pin .map-stop-pin',el=>getComputedStyle(el).color),'rgb(255, 122, 0)',
  'a selected city stop keeps its orange colour when the catalog marker becomes a pin');
 await page.$eval('.leaflet-container',el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'+',keyCode:187,which:187,bubbles:true})));
 await new Promise(resolve=>setTimeout(resolve,400));
 await page.$eval('.leaflet-container',el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'+',keyCode:187,which:187,bubbles:true})));
 await page.waitForSelector('.map-stop-ring.is-selected');await page.waitForSelector('.stop-highlight-pin',{hidden:true});

 await page.waitForFunction(()=>document.querySelector('[data-map-stop-sheet]')?.textContent.includes('Centrum'));
 await page.click('[aria-label="Rozwiń panel przystanku"]');await page.waitForSelector('#map-stop-departures');
 const preview=process.env.MAP_STOPS_PREVIEW||path.resolve('test/ui-previews/map-stops.png');fs.mkdirSync(path.dirname(preview),{recursive:true});await page.screenshot({path:preview});
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.map-catalog-stop[title^="Rzeszów TestMap" i]');
 assert.equal(await page.evaluate(()=>localStorage.getItem('mks_show_map_stops')),'true','preference survives reload');
 await page.evaluate(()=>localStorage.setItem('mks_map_state',JSON.stringify({center:{lat:50.0168,lng:21.9754},zoom:18})));await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForSelector('.map-catalog-stop[title*="Matuszczaka" i]');
 await page.waitForFunction(()=>document.querySelectorAll('.map-catalog-stop[title*="Matuszczaka" i]').length===1);
 await page.click('.map-catalog-stop[title*="Matuszczaka" i]');await page.waitForSelector('.map-stop-ring.is-selected');
 assert.match(await page.$eval('[data-map-stop-sheet]',el=>el.textContent),/matuszczaka/i);
 await page.screenshot({path:path.resolve('test/ui-previews/map-real-platform-merged.png')});
 // Regression for the reported two markers on one side of the school road.
 await page.evaluate(()=>localStorage.setItem('mks_map_state',JSON.stringify({center:{lat:49.83034,lng:21.9972},zoom:19})));
 await page.reload({waitUntil:'domcontentloaded'});
 const schoolSelector=code=>`.map-catalog-stop[title*="Gwoźnica Górna" i][title*="Szkoła" i][title$="${code}"]`;
 await page.waitForSelector(schoolSelector('19'));await page.waitForSelector(schoolSelector('20'));
 const schoolSides=await page.evaluate(()=>{
  const rect=document.querySelector('.leaflet-container').getBoundingClientRect(),scale=256*2**19;
  const world=(lat,lon)=>{const sine=Math.sin(lat*Math.PI/180);return {x:(lon+180)/360*scale,y:(.5-Math.log((1+sine)/(1-sine))/(4*Math.PI))*scale};};
  const centre=world(49.83034,21.9972);
  const project=(lat,lon)=>{const p=world(lat,lon);return {x:rect.x+rect.width/2+p.x-centre.x,y:rect.y+rect.height/2+p.y-centre.y};};
  const a=project(49.8299308,21.9977376),b=project(49.830288,21.997325);
  const side=p=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
  const marker=code=>{const r=document.querySelector(`.map-catalog-stop[title*="Gwoźnica Górna" i][title*="Szkoła" i][title$="${code}"]`).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};};
  return {side19:side(marker('19')),side20:side(marker('20')),schoolSide:side(project(49.8300183,21.9977235))};
 });
 assert.ok(schoolSides.side19*schoolSides.schoolSide>0,'school 19 is displayed on the school side');
 assert.ok(schoolSides.side19*schoolSides.side20<0,'school 19 and 20 are displayed on opposite sides of the road');
 // Regression: the raw PKS API point for Lisa-Kuli 03 is ~130 m south;
 // the catalog and selected marker must retain its established GTFS platform.
 await page.evaluate(()=>localStorage.setItem('mks_map_state',JSON.stringify({center:{lat:50.035944,lng:21.99708},zoom:19})));
 await page.reload({waitUntil:'domcontentloaded'});
 const lisa03='.map-catalog-stop[title*="Lisa" i][title*="Mochn" i][title$="03"]';
 await page.waitForSelector(lisa03);
 await page.waitForFunction(selector=>{
  const dot=document.querySelector(selector)?.getBoundingClientRect(),map=document.querySelector('.leaflet-container')?.getBoundingClientRect();
  return dot&&map&&Math.abs(dot.x+dot.width/2-map.x-map.width/2)<2&&Math.abs(dot.y+dot.height/2-map.y-map.height/2)<2;
 },{},lisa03);
 await page.click(lisa03);await page.waitForSelector('.map-stop-ring.is-selected');
 assert.match(await page.$eval('[data-map-stop-sheet]',el=>el.textContent),/Lisa.*Mochn.*03/i);
 // Rzeszów D.A.: numbers belong in the stop panel and list cards, not on icons.
 // Set the camera in the new document: an outgoing map animation can still save its old center.
 const terminalCamera=await page.evaluateOnNewDocument(()=>localStorage.setItem('mks_map_state',JSON.stringify({center:{lat:50.042372,lng:22.003212},zoom:19})));
 await page.goto(origin+'/?terminal-test=1',{waitUntil:'domcontentloaded'});
 await page.removeScriptToEvaluateOnNewDocument(terminalCamera.identifier);
 const terminal='.map-catalog-stop[title="Rzeszów D.A. st. 5"]';
 try{await page.waitForSelector(terminal);}catch(error){console.error('Terminal map diagnostics',await page.evaluate(()=>{let camera;try{camera=localStorage.getItem('mks_map_state');}catch(e){camera=String(e);}return {url:location.href,document:document.documentURI,camera,text:document.body?.textContent?.slice(0,500),titles:[...document.querySelectorAll('.map-catalog-stop')].map(el=>el.title)};}));throw error;}
 assert.equal(await page.$$('.map-stop-platform').then(rows=>rows.length),0,'icons have no platform badge');
 await page.click(terminal);await page.waitForSelector('.map-stop-ring.is-selected');
 await page.waitForFunction(()=>document.querySelector('[data-map-stop-sheet]')?.textContent.includes('Rzeszów D.A. st. 5'));
 assert.equal(await page.$$('.map-stop-platform').then(rows=>rows.length),0);
 await page.screenshot({path:path.resolve('test/ui-previews/map-terminal-platforms.png')});
 await button('Przystanki');await page.waitForSelector('input[placeholder*="Babica"]');
 await page.type('input[placeholder*="Babica"]','Rzeszów D');
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-stop-card-id] h3')].some(el=>el.textContent==='Rzeszów D.A. st. 5'));
 assert.ok(await page.evaluate(()=>[...document.querySelectorAll('[data-stop-card-id] h3')].some(el=>el.textContent==='Rzeszów D.A. st. 2')));
 await page.screenshot({path:path.resolve('test/ui-previews/list-terminal-platforms.png')});
 await page.$eval('input[placeholder*="Babica"]',el=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(el,'');el.dispatchEvent(new Event('input',{bubbles:true}));});
 await button('Mapa');
 await page.evaluate(()=>localStorage.setItem('mks_map_state',JSON.stringify({center:{lat:50.03651,lng:21.99752},zoom:19})));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForSelector('.map-catalog-stop[title*="Moniuszki" i]');
 await page.waitForFunction(()=>document.querySelectorAll('.map-catalog-stop[title*="Moniuszki" i]').length===1);
 await page.screenshot({path:path.resolve('test/ui-previews/map-lisa-kuli-provider-alias.png')});
 await button('Przystanki');await page.waitForSelector('input[placeholder*="Babica"]');
 await page.type('input[placeholder*="Babica"]','Moniuszki');
 await page.waitForFunction(()=>{const rows=[...document.querySelectorAll('[data-stop-card-id]')];return rows.length===1&&/lisa/i.test(rows[0].textContent);});
 const lisaId=await page.$eval('[data-stop-card-id]',el=>el.dataset.stopCardId);
 for(const provider of ['PKS Rzeszów','MPK Rzeszów']){
  await button(provider);
  await page.waitForFunction(provider=>[...document.querySelectorAll('button[aria-pressed="true"]')].some(el=>el.textContent.trim()===provider),{},provider);
  await page.waitForFunction(id=>{const rows=[...document.querySelectorAll('[data-stop-card-id]')];return rows.length===1&&rows[0].dataset.stopCardId===id;},{},lisaId);
 }
 await button('Wszystkie');
 assert.match(await page.$eval('[data-stop-card-id]',el=>el.textContent),/PKS.*MPK|MPK.*PKS/,'merged stop lists its providers only on the stop card');
 assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].some(el=>el.textContent.trim()==='Tylko ulubione')),false,'the unrequested favourites filter is absent');
 await page.screenshot({path:path.resolve('test/ui-previews/list-lisa-kuli-provider-alias.png')});
 await page.$eval('input[placeholder*="Babica"]',el=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(el,'');el.dispatchEvent(new Event('input',{bubbles:true}));});
 await button('Mapa');
 // Load the Marcel timetable catalog, then render the actual differently numbered Babica platform.
 await button('Przystanki');await page.waitForSelector('input[placeholder*="Babica"]');
 await page.type('input[placeholder*="Babica"]','Babica');
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-stop-card-id]')].some(el=>/dps 45/i.test(el.textContent)));
 const dpsId=await page.evaluate(()=>[...document.querySelectorAll('[data-stop-card-id]')].find(el=>/dps 45/i.test(el.textContent)).dataset.stopCardId);
 await button('Marcel');
 await page.waitForFunction(()=>[...document.querySelectorAll('button[aria-pressed="true"]')].some(el=>el.textContent.trim()==='Marcel'));
 await page.waitForFunction(id=>[...document.querySelectorAll('[data-stop-card-id]')].some(el=>el.dataset.stopCardId===id&&/dps 45/i.test(el.textContent)),{},dpsId);
 await button('Wszystkie');
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-stop-card-id]')].some(el=>/za torami/i.test(el.textContent)));
 await page.evaluate(()=>[...document.querySelectorAll('[data-stop-card-id]')].find(el=>/za torami/i.test(el.textContent)).click());
 await page.waitForSelector('[aria-label="Pokaż przystanek na mapie"]');
 assert.equal(await page.$eval('[aria-label="Pokaż przystanek na mapie"]',el=>el.disabled),true,'missing GPS must not center the map at Africa');
 await page.screenshot({path:path.resolve('test/ui-previews/babica-za-torami-no-gps.png')});
 await page.click('[aria-label="Wróć do listy przystanków"]');
 await page.evaluate(()=>localStorage.setItem('mks_map_state',JSON.stringify({center:{lat:49.933608,lng:21.86101},zoom:19})));
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.map-catalog-stop[title*="DPS 45" i]');
 assert.equal(await page.$$('.map-catalog-stop[title*="Dom Pomocy" i]').then(rows=>rows.length),0,'Marcel 53 must share the PKS 45 dot');
 assert.equal(await page.$$('.map-catalog-stop[title*="DPS 45" i]').then(rows=>rows.length),1);
 await page.click('.map-catalog-stop[title*="DPS 45" i]');await page.waitForSelector('.map-stop-ring.is-selected');
 await page.screenshot({path:path.resolve('test/ui-previews/map-babica-dps-merged.png')});
 await page.evaluate(()=>localStorage.setItem('mks_map_state',JSON.stringify({center:{lat:49.9822,lng:21.94},zoom:17})));await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForSelector('.map-catalog-stop[title^="Boguchwała Testmap"]');
 // Loading the platform catalog can replace a Leaflet icon between $eval's
 // lookup and evaluation. Read the currently attached ring in one DOM task.
 await page.waitForFunction(()=>{
  const ring=document.querySelector('.map-catalog-stop[title^="Boguchwała Testmap"] .map-stop-ring');
  return ring?.isConnected&&getComputedStyle(ring).backgroundColor==='rgb(20, 184, 166)';
 });
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.map-catalog-stop[title^="Boguchwała Testmap"] .map-stop-ring')).backgroundColor),'rgb(20, 184, 166)');
 await page.evaluate(()=>localStorage.setItem('mks_map_state',JSON.stringify({center:{lat:49.9822,lng:21.94},zoom:15})));await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.leaflet-container');
 await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--pks-accent').trim()!=='');assert.equal(await page.$$('.map-catalog-stop').then(rows=>rows.length),0,'overview zoom hides dots');
 await option();assert.equal(await page.evaluate(()=>localStorage.getItem('mks_show_map_stops')),'false');
 await button('Przystanki');
 await page.waitForSelector('input[placeholder*="Babica"]');
 await page.type('input[placeholder*="Babica"]','Rzeszów TestMap');
 await page.waitForFunction(()=>[...document.querySelectorAll('h3')].some(el=>el.textContent.toLowerCase()==='rzeszów testmap 03'));
 await page.evaluate(()=>[...document.querySelectorAll('h3')].find(el=>el.textContent.toLowerCase()==='rzeszów testmap 03').click());
 await page.waitForSelector('[aria-label="Generuj widżet przystanku"]');await page.click('[aria-label="Generuj widżet przystanku"]');
 await page.waitForSelector('[aria-labelledby="widget-title"]');
 assert.equal(await page.$eval('[aria-labelledby="widget-title"]',el=>el.parentElement.parentElement.tagName),'BODY','widget dialog uses a portal above transformed panels');
 assert.match(await page.$eval('[aria-labelledby="widget-title"]',el=>el.textContent),/Generuj widżet/);
 assert.equal(await page.$eval('[aria-label="Zamknij okno widżetu"]',el=>el.querySelector('svg')===null),true,'text cancellation replaces the handle and X');
 assert.equal(await page.$('[aria-label="Efekt szkła widżetu"]'),null,'redundant glass toggle is removed');
 assert.match(await page.$eval('[data-widget-preview]',el=>el.style.background),/linear-gradient/,'the existing preview retains its default appearance');
 assert.equal(await page.$eval('#widget-refresh-interval',el=>el.value),'30');
 assert.equal(await page.$eval('input[name="widget-refresh-mode"]:checked',el=>el.parentElement.textContent.includes('Pauza')),true);
 for(const minutes of ['1','2','5']){await page.select('#widget-refresh-interval',minutes);assert.equal(await page.$eval('#widget-refresh-interval',el=>el.value),minutes);}
 await page.select('#widget-refresh-interval','custom');
 await page.waitForSelector('#widget-refresh-custom');
 const enterInterval=async value=>{await page.click('#widget-refresh-custom',{clickCount:3});await page.keyboard.press('Backspace');await page.type('#widget-refresh-custom',value);};
 for(const value of ['0','2.5']){await enterInterval(value);assert.equal(await page.$eval('#widget-refresh-custom',el=>el.getAttribute('aria-invalid')),'true');}
 await enterInterval('7');assert.equal(await page.$eval('#widget-refresh-custom',el=>el.getAttribute('aria-invalid')),'false');
 await page.evaluate(()=>[...document.querySelectorAll('label')].find(el=>el.textContent.includes('Wyłączone — tylko ręcznie')).click());
 assert.equal(await page.$eval('#widget-refresh-custom',el=>el.disabled),true);
 await page.evaluate(()=>[...document.querySelectorAll('label')].find(el=>el.textContent.includes('Pauza w oszczędzaniu')).click());
 assert.equal(await page.$eval('#widget-refresh-custom',el=>el.disabled),false);
 await page.select('#widget-refresh-interval','120');
 await page.evaluate(()=>[...document.querySelectorAll('label')].find(el=>el.textContent.includes('Wyłączone — tylko ręcznie')).click());
 assert.equal(await page.$eval('#widget-refresh-interval',el=>el.disabled),true);
 await page.evaluate(()=>[...document.querySelectorAll('label')].find(el=>el.textContent.includes('Pauza w oszczędzaniu')).click());
 assert.equal(await page.$eval('#widget-refresh-interval',el=>el.disabled),false);
 await page.waitForFunction(()=>{const r=document.querySelector('[aria-labelledby="widget-title"] footer')?.getBoundingClientRect();return r&&r.top>=0&&r.bottom<=window.innerHeight+.5;},{timeout:5000});
 await page.screenshot({path:path.resolve('test/ui-previews/generate-widget-overview.png')});
 await page.$eval('#widget-refresh-interval',el=>el.scrollIntoView({block:'center'}));
 const pinned=await page.$eval('[aria-labelledby="widget-title"] footer',el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=window.innerHeight+.5;});assert.equal(pinned,true,'generate action remains visible after scrolling settings');
 await page.screenshot({path:path.resolve('test/ui-previews/generate-widget-refresh.png')});
 assert.equal(await page.$eval('[aria-labelledby="widget-title"]',el=>getComputedStyle(el).backgroundColor),'rgb(16, 30, 38)','opaque dark dialog');
 await page.evaluate(()=>[...document.querySelectorAll('label')].find(el=>el.textContent.includes('Tylko wybrane linie')).click());
 await page.waitForSelector('[aria-label="Linia 2"]');assert.equal(await page.$eval('[aria-label="Linia 2"]',el=>el.checked),false);
 assert.equal(await page.$eval('[aria-labelledby="widget-title"] footer button',el=>el.disabled),true,'empty selected lines cannot create a widget');
 await page.click('[aria-label="Linia 2"]');assert.equal(await page.$eval('[aria-label="Linia 2"]',el=>el.checked),true);
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(el=>el.textContent.includes('Duży')).click());
 assert.equal(await page.$eval('[aria-labelledby="widget-title"] button[aria-pressed="true"]',el=>el.textContent.includes('Duży')),true);
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(el=>el.textContent==='Jasny').click());
 const widgetPreview=path.resolve('test/ui-previews/generate-widget.png');await page.screenshot({path:widgetPreview});
 await page.keyboard.press('Escape');await page.waitForSelector('[aria-labelledby="widget-title"]',{hidden:true});
 const runner=await browser.newPage();const runnerErrors=[];runner.on('pageerror',e=>runnerErrors.push(e.message));
 await runner.evaluateOnNewDocument(()=>{
  const Original=Date;window.Date=class extends Original{constructor(...args){super(...(args.length?args:[Original.parse('2026-10-07T11:45:20Z')]));}static now(){return Original.parse('2026-10-07T11:45:20Z');}};
  window.widgetUrls=[];
  window.NativeWidget={config:()=>JSON.stringify({stop:{id:'900002',name:'Boguchwała TestMap',type:'bus',carriers:[],lines:['108'],isFavorite:false,sourceProviderIds:['pks']},lines:null,size:'medium',theme:'system'}),
   http:(id,url)=>{window.widgetUrls.push(url);const data=url.includes('nearest-departures')?{journeys:[{line_name:'108',route_description:'Rzeszów',timetable_time:'2026-10-07 13:55:00'}]}:[];setTimeout(()=>window.widgetHttpResult(id,200,JSON.stringify(data)),0);},
   complete:(rows)=>{window.widgetResult=JSON.parse(rows);},failed:()=>{window.widgetFailed=true;}};
 });
 await runner.goto(origin+'/widget-data/index.html',{waitUntil:'domcontentloaded'});
 await runner.waitForFunction(()=>window.widgetResult||window.widgetFailed,{timeout:30000});
 assert.equal(await runner.evaluate(()=>window.widgetFailed),undefined,'background runner succeeds without Firebase login');
 assert.equal(await runner.evaluate(()=>window.widgetResult[0].line),'108');
 assert.ok(await runner.evaluate(()=>window.widgetUrls.some(url=>url.startsWith('http://einfo.zgpks.rzeszow.pl/api/its/infoboard/nearest-departures/'))),'runner uses the Android transport endpoint, not a missing local API route');
 assert.ok(await runner.evaluate(()=>window.widgetUrls.every(url=>!url.includes('get_vehicles')&&!url.includes('/api/its/vehicles'))),'background widgets do not download the entire vehicle fleet');
 assert.deepEqual(runnerErrors,[]);await runner.close();
 // All three operators replace the pin with the selected catalog icon at close zoom.
 await page.evaluate(()=>localStorage.setItem('mks_map_state',JSON.stringify({center:{lat:50.04,lng:22},zoom:17})));
 await page.goto(origin+'/map-selection-fixture/',{waitUntil:'domcontentloaded'});
 for(const [provider,color] of [['marcel','rgb(104, 196, 74)'],['pks','rgb(20, 184, 166)'],['mpk_rzeszow','rgb(255, 122, 0)']]){
  await page.click(`[data-test-provider="${provider}"]`);
  await page.waitForFunction(expected=>{const ring=document.querySelector('.map-stop-ring.is-selected');return ring&&getComputedStyle(ring).backgroundColor===expected;},{},color);
  assert.equal(await page.$$('.stop-highlight-pin').then(rows=>rows.length),0,provider+' has no duplicate pin');
  await page.click('[data-test-icons]');
  await page.waitForSelector('.map-catalog-stop',{hidden:true});
  await page.waitForFunction(expected=>{const pin=document.querySelector('.stop-highlight-pin .map-stop-pin');return pin&&getComputedStyle(pin).color===expected;},{},color);
  await page.click('[data-test-icons]');
  await page.waitForSelector('.map-stop-ring.is-selected');await page.waitForSelector('.stop-highlight-pin',{hidden:true});
 }
 await page.click('[data-test-provider="marcel"]');
 const zoomKey=async key=>{await page.$eval('.leaflet-container',(el,key)=>{el.focus();el.dispatchEvent(new KeyboardEvent('keydown',{key,keyCode:key==='-'?189:187,which:key==='-'?189:187,bubbles:true}));},key);await new Promise(resolve=>setTimeout(resolve,400));};
 await zoomKey('-');await zoomKey('-');
 await page.waitForSelector('.map-catalog-stop',{hidden:true});
 await page.waitForFunction(()=>{const pin=document.querySelector('.stop-highlight-pin .map-stop-pin');return pin&&getComputedStyle(pin).color==='rgb(104, 196, 74)';});
 await zoomKey('+');await zoomKey('+');
 await page.waitForSelector('.map-stop-ring.is-selected');await page.waitForSelector('.stop-highlight-pin',{hidden:true});
 // Re-render the parent clock repeatedly without moving an unchanged Leaflet marker.
 const idleTicks=await page.evaluate(()=>{window.idleMarkerMutations=0;const marker=document.querySelector('.map-catalog-stop');window.idleMarkerObserver=new MutationObserver(records=>{window.idleMarkerMutations+=records.length;});window.idleMarkerObserver.observe(marker,{attributes:true,attributeFilter:['style']});return window.fixtureMapTicks;});
 await page.waitForFunction(start=>window.fixtureMapTicks>=start+5,{},idleTicks);
 assert.equal(await page.evaluate(()=>{window.idleMarkerObserver.disconnect();return window.idleMarkerMutations;}),0,'unchanged markers do not repeat DOM position writes on clock ticks');
 await page.screenshot({path:path.resolve('test/ui-previews/marcel-selected-catalog-stop.png')});
 assert.deepEqual(errors,[]);console.log('Map stops: enable, city/rural colours, click/highlight/sheet, persistence, zoom threshold and disable passed.');
}catch(error){console.error('Map regression context:',await page.evaluate(()=>({text:document.body.innerText,sheet:document.querySelector('[data-map-stop-sheet]')?.outerHTML})),{errors,marcelCatalogRequests});await page.screenshot({path:path.resolve('test/ui-previews/map-failure.png')}).catch(()=>{});throw error;}finally{await browser.close();server.close();fixture.cleanup();}
})().catch(error=>{console.error(error);server.close();fixture.cleanup();process.exitCode=1;});
