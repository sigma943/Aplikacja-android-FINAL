const assert=require('node:assert/strict');
const puppeteer=require('puppeteer-core');
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
  const page=await browser.newPage();await page.setViewport({width:1400,height:950});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:3001',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>el.textContent==='Przystanki'));
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(el=>el.textContent==='Przystanki').click());
  await page.waitForSelector('input[placeholder*="Babica"]',{timeout:60000});
  await page.type('input[placeholder*="Babica"]','Baryczka');
  await page.waitForFunction(()=>document.body.innerText.includes('Baryczka 69'),{timeout:60000});
  await page.evaluate(()=>[...document.querySelectorAll('h3')].find(el=>el.textContent==='Baryczka 69').click());
  // Works after the last departure too: carrier labels are rendered in uppercase.
  await page.waitForFunction(()=>document.body.innerText.toLowerCase().includes('rzesz')&&document.body.innerText.includes('108'),{timeout:20000});
  const text=await page.evaluate(()=>document.body.innerText);assert.match(text,/108/);assert.match(text,/Rzesz/i);
  await page.waitForFunction(()=>![...document.querySelectorAll('div')].some(el=>el.classList.contains('space-y-1.5')&&el.classList.contains('animate-pulse')));
  await page.screenshot({path:'test/stops-baryczka.tmp.png',fullPage:true});

  // A late Tuesday response must never replace the selected Wednesday.
  await page.setRequestInterception(true);
  let sawTuesday;
  const tuesdayStarted=new Promise(resolve=>sawTuesday=resolve);
  const mockedDay='2026-10-07';
  page.on('request',async request=>{
    const url=request.url();
    if(url.includes('/api/pks/einfo/stop-point-timetable/1054') && (url.includes('2026-10-06')||url.includes(mockedDay))) {
      const slow=url.includes('2026-10-06');if(slow){sawTuesday();await new Promise(r=>setTimeout(r,1500));}
      await request.respond({status:200,contentType:'application/json',body:JSON.stringify({success:true,items:[{line_name:'108',description:slow?'TUESDAY_TEST':'WEDNESDAY_TEST',journeys:[{time:'16:16',stop_point_code:'69',legends:['D']}]}]})});
    } else if(url.includes('/api/pks/einfo/stop-point-timetable/1054') && url.includes('2026-10-08')) {
      await request.respond({status:502,contentType:'application/json',body:JSON.stringify({error:'offline test'})});
    } else await request.continue();
  });
  await page.evaluate(()=>document.querySelectorAll('button[data-selected]')[1].click());
  await tuesdayStarted;
  await page.evaluate(()=>document.querySelectorAll('button[data-selected]')[2].click());
  await page.waitForFunction(()=>document.body.innerText.includes('WEDNESDAY_TEST'));
  await new Promise(r=>setTimeout(r,1800));
  assert.ok(!(await page.evaluate(()=>document.body.innerText)).includes('TUESDAY_TEST'));
  await page.evaluate(()=>document.querySelectorAll('button[data-selected]')[3].click());
  await page.waitForSelector('[role="alert"]');
  const failed=await page.evaluate(()=>document.body.innerText);
  assert.ok(!failed.includes('WEDNESDAY_TEST'));assert.ok(!failed.includes('Brak zaplanowanych'));
  assert.deepEqual(errors,[]);console.log('Browser: Baryczka line badges, out-of-order date responses and network failure passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
