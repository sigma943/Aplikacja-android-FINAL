const assert=require('node:assert/strict');const puppeteer=require('puppeteer-core');
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
 const page=await browser.newPage();await page.setViewport({width:1400,height:1000});
 const raw=structuredClone(require('./fixtures/pks-vehicle.json'));
 const clock=ms=>new Date(ms).toLocaleString('sv-SE',{timeZone:'Europe/Warsaw'});
 const start=Date.now()+5*60000;
 raw.position.position_date=clock(Date.now());raw.journey.vehicle_journey_date=clock(start).slice(0,10);raw.journey.departure_time=clock(start).slice(11);
 raw.next_stop_points=raw.next_stop_points.map((stop,index)=>({...stop,planned_departure_time:clock(start+index*120000),real_departure_time:clock(start+index*120000)}));
 const errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setRequestInterception(true);page.on('request',async request=>{
  const url=request.url();requests.push(url);
  if(url.includes('/pks/get_vehicles.php')||url.endsWith('/api/pks/vehicles'))await request.respond({status:200,contentType:'application/json',body:JSON.stringify(url.endsWith('/api/pks/vehicles')?{items:[raw]}:[raw])});
  else await request.continue();
 });
 await page.evaluateOnNewDocument(()=>localStorage.setItem('mks_map_state',JSON.stringify({center:{lat:50.14922,lng:21.95757},zoom:12})));
 console.log('opening app');
 await page.goto('http://localhost:3001',{waitUntil:'domcontentloaded',timeout:60000});
 console.log('waiting for vehicle');
 await page.waitForSelector('.leaflet-marker-icon.mks-bus-marker',{timeout:60000});
 await page.evaluate(()=>document.querySelector('.leaflet-marker-icon.mks-bus-marker').click());
 console.log('vehicle selected');
 await page.waitForFunction(()=>document.body.innerText.toLowerCase().includes('następne przystanki'),{timeout:20000}).catch(async e=>{console.log(await page.evaluate(()=>document.body.innerText));await page.screenshot({path:'test/vehicle-failure.tmp.png'});throw e;});
 await page.waitForFunction(()=>document.body.innerText.includes('Budy'),{timeout:60000});
 await page.waitForFunction(()=>[...performance.getEntriesByType('resource')].some(entry=>entry.name.includes('/data/bus-routes/pks/643.json')),{timeout:60000});
 const text=await page.evaluate(()=>document.body.innerText);assert.match(text,/Przerwa/);assert.ok(!text.includes('Przystanek nieznany'));
 await page.screenshot({path:'test/vehicle-route.tmp.png',fullPage:true});assert.deepEqual(errors,[]);
 assert.ok(!requests.some(url=>url.includes('/routes/geometry')));console.log('Browser: full PKS route, stop names, provider geometry and terminal break passed');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
