const assert=require('node:assert/strict');
const puppeteer=require('puppeteer-core');
async function storedCatalog(page) {
  return page.evaluate(()=>new Promise(resolve=>{
    const open=indexedDB.open('pks-live-stops-catalog',1);
    open.onsuccess=()=>{
      const db=open.result;
      const request=db.transaction('catalog').objectStore('catalog').get('latest');
      request.onsuccess=()=>{resolve(request.result);db.close();};
    };
    open.onerror=()=>resolve(null);
  }));
}
(async()=>{
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const page=await browser.newPage();const errors=[];
    await page.setViewport({width:1400,height:950});
    page.on('pageerror',e=>errors.push(e.message));
    let offline=false,releasePks;
    await page.setRequestInterception(true);
    page.on('request',async request=>{
      const url=request.url();const reply=data=>request.respond({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
      if(url.includes('/api/pks/einfo/stop-point')&&!url.includes('timetable')) {
        if(offline)await request.abort();
        else releasePks=()=>reply({items:[]}); // Deliberately slow/invalid endpoint; shipped stops must remain visible.
      } else if(url.includes('/przystanki/stopscache')) {
        if(offline)await request.abort();
        else await reply([{stop_id:'cache-mpk',stop_name:'Cache MPK Test',stop_lat:50.08,stop_lon:22.08,lines:'1,2'}]);
      } else if(url.includes('api-site.marcel-bus.pl')) {
        if(offline)await request.abort();
        else if(url.includes('/search/trasy'))await reply([{idTr:1}]);
        else if(url.includes('/wariantTrasy/kusy'))await reply([{idKu:1}]);
        else if(url.includes('/trasy/kurs/'))await reply([{nazMi:'Rzeszow',nazPr:'Cache Sosnowa Terminal Test',szGps:50.09,dlGps:22.09}]);
        else await reply([]);
      } else if(offline&&url.includes('/data/')&&(/stop/i.test(url)))await request.abort();
      else if(url.includes('stop-point-timetable'))await reply({success:true,items:[]});
      else if(url.includes('/api/pks/vehicles'))await reply({items:[]});
      else await request.continue();
    });
    const openList=async()=>{
      await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>el.textContent==='Przystanki'));
      const started=Date.now();
      await page.evaluate(()=>[...document.querySelectorAll('button')].find(el=>el.textContent==='Przystanki').click());
      await page.waitForFunction(()=>document.body.innerText.includes('Babica'),{timeout:15000});
      return Date.now()-started;
    };
    await page.goto('http://localhost:3001',{waitUntil:'domcontentloaded',timeout:60000});
    const coldMs=await openList();assert.ok(releasePks,'endpoint should have started');
    assert.ok(coldMs<5000,'local list must load without waiting for the endpoint');
    await page.type('input[placeholder*="Babica"]','Cache');
    await page.waitForFunction(()=>document.body.innerText.toLowerCase().includes('cache mpk test')&&document.body.innerText.toLowerCase().includes('cache sosnowa terminal test')).catch(async error=>{console.log(await page.evaluate(()=>document.body.innerText));throw error;});
    for(let attempt=0;attempt<40;attempt++) {
      const snapshot=await storedCatalog(page);
      if(snapshot?.mpk.length&&snapshot?.marcel.length)break;
      await new Promise(r=>setTimeout(r,100));
    }
    const before=await storedCatalog(page);
    assert.ok(before.mpk.length&&before.marcel.length);
    assert.ok(before.stops.some(stop=>stop.name.toLowerCase().includes('cache mpk')&&stop.lines.includes('2')));
    await releasePks();await new Promise(r=>setTimeout(r,300));
    // Recreate the JS context, remove the separate source caches and deny provider data.
    // Only the persistent merged catalog can supply provider links and the MPK badges.
    await page.evaluate(()=>localStorage.clear());offline=true;
    await page.reload({waitUntil:'domcontentloaded',timeout:60000});
    const warmMs=await openList();assert.ok(warmMs<2000,'persistent catalog should appear immediately');
    await page.type('input[placeholder*="Babica"]','Cache');
    await page.waitForFunction(()=>document.body.innerText.toLowerCase().includes('cache mpk test')&&document.body.innerText.toLowerCase().includes('cache sosnowa terminal test'));
    await new Promise(r=>setTimeout(r,1500));
    const after=await storedCatalog(page);
    assert.deepEqual(after.stops.filter(stop=>stop.name.includes('Cache')).map(stop=>[stop.name,stop.lines,stop.providerStopIds]),before.stops.filter(stop=>stop.name.includes('Cache')).map(stop=>[stop.name,stop.lines,stop.providerStopIds]));
    assert.deepEqual(errors,[]);
    await page.screenshot({path:'test/stops-cache.tmp.png'});
    console.log(`Browser: local cold load ${coldMs}ms; persistent cache after restart ${warmMs}ms; MPK/Marcel badges survived provider failures`);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
