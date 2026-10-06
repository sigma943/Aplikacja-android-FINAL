const assert=require('node:assert/strict');
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
const puppeteer=require('puppeteer');
const root=path.resolve('out');
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp'}[path.extname(file)]||'application/octet-stream';
  res.setHeader('Content-Type',type);fs.createReadStream(file).pipe(res);
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  fs.mkdirSync('test/ui-previews',{recursive:true});
  try{
    await page.setViewport({width:393,height:851,deviceScaleFactor:1});
    await page.evaluateOnNewDocument(()=>{
      const Original=Date;const now=Original.parse('2026-10-06T12:18:30Z');
      window.Date=class extends Original {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
      if(!localStorage.getItem('mks_app_theme'))localStorage.setItem('mks_app_theme','dark');
    });
    await page.setRequestInterception(true);
    page.on('request',async request=>{
      const url=request.url();
      const json=data=>request.respond({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
      if(url.includes('stop-point-timetable'))return json({success:true,items:[{line_name:'108',description:'Rzeszów',journeys:[{journey_id:1,time:'14:21',stop_point_code:'69',legends:['D']}]}]});
      if(url.endsWith('/api/pks/vehicles'))return json({items:[]});
      if(url.includes('/api/pks/einfo/stop-point'))return json({items:[]});
      if(url.includes('mpkrzeszow.pl')||url.includes('api-site.marcel-bus.pl'))return json([]);
      if(url.startsWith(origin))return request.continue();
      return request.abort();
    });
    const button=async label=>page.evaluate(text=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text)?.click(),label);
    const openStops=async()=>{
      await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>el.textContent.trim()==='Przystanki'));
      await button('Przystanki');await page.waitForSelector('input[placeholder*="Babica"]');
      await page.type('input[placeholder*="Babica"]','Baryczka');
      await page.waitForFunction(()=>[...document.querySelectorAll('h3')].some(el=>el.textContent==='Baryczka 69'));
    };
    const accent=async name=>{
      await button('Opcje');await page.waitForSelector('[role="dialog"]');
      await page.click(`[aria-label="Kolor akcentu: ${name}"]`);
      await page.mouse.click(4,4);await page.waitForSelector('[role="dialog"]',{hidden:true});
    };
    const overflow=async()=>assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.transit-view')].some(el=>el.scrollWidth>el.clientWidth+1)),false);
    const screenshot=async name=>{await new Promise(resolve=>setTimeout(resolve,450));return page.screenshot({path:`test/ui-previews/${name}.png`});};
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>el.textContent.trim()==='Opcje'));
    await accent('Fioletowy');await openStops();
    await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--pks-accent').trim()==='#8b5cf6');
    const brandBefore=await page.$eval('.transit-stop-card .text-teal-400',el=>getComputedStyle(el).color);
    const before=await page.$eval('.transit-stop-card .ui-accent-soft',el=>getComputedStyle(el).backgroundColor);
    await page.click('.transit-stop-card [aria-label="Dodaj do ulubionych"]');await page.waitForSelector('.transit-stop-card .ui-accent-fill');
    await overflow();await screenshot('stops-dark-purple');
    await page.evaluate(()=>[...document.querySelectorAll('h3')].find(el=>el.textContent==='Baryczka 69').click());
    await page.waitForSelector('button[data-selected="true"]');
    await page.waitForFunction(()=>document.querySelector('.transit-view').innerText.includes('Rzeszów'));
    assert.equal(await page.$eval('.transit-view button.ui-accent-solid',el=>getComputedStyle(el).backgroundColor),'rgb(139, 92, 246)');
    await overflow();await screenshot('departures-dark-purple');
    await accent('Niebieski');
    assert.equal(await page.$eval('.transit-view button.ui-accent-solid',el=>getComputedStyle(el).backgroundColor),'rgb(59, 130, 246)');
    await page.click('[aria-label="Wróć do listy przystanków"]');
    const after=await page.$eval('.transit-stop-card .ui-accent-soft',el=>getComputedStyle(el).backgroundColor);
    assert.notEqual(before,after);
    assert.equal(await page.$eval('.transit-stop-card .text-teal-400',el=>getComputedStyle(el).color),brandBefore);
    await page.evaluate(()=>localStorage.setItem('mks_app_theme','light'));
    await page.reload({waitUntil:'domcontentloaded'});await openStops();
    await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--pks-accent').trim()==='#3b82f6');
    assert.equal(await page.$eval('.transit-view',el=>el.dataset.uiMode),'light');
    await overflow();await screenshot('stops-light-blue');
    assert.deepEqual(errors,[]);
    console.log('Browser: accent changes list, departures, favourites and controls; carrier colours survive; reload persists; light/dark mobile layout has no horizontal overflow.');
  }catch(error){await screenshot('failure').catch(()=>{});console.error(await page.evaluate(()=>document.body.innerText).catch(()=>''));throw error;}
  finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
