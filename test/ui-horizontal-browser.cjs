// Focused presentation regression: real views, fixture identity, no live backend.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const puppeteer=require('puppeteer');
const fixture=require('./build-accent-fixture.cjs')();
const production=path.resolve('out');
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const suffix='.'+(pathname.endsWith('/')?pathname+'index.html':pathname);
  let file=path.resolve(fixture.root,suffix);
  if(!file.startsWith(fixture.root+path.sep)){res.writeHead(404);res.end();return;}
  if(!fs.existsSync(file))file=path.resolve(production,suffix);
  if(!file.startsWith(production+path.sep)&&!file.startsWith(fixture.root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request',request=>request.url().startsWith(origin)?request.continue():request.abort());
  await page.evaluateOnNewDocument(expectedOrigin=>{
    if(location.origin!==expectedOrigin)return;
    localStorage.setItem('mks_app_theme',location.pathname.startsWith('/light-dialog-fixture')?'light':'dark-cosmos');
    const Original=Date,now=Original.parse('2026-10-06T12:18:30Z');
    window.Date=class extends Original{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
  },origin);
  const cdp=await page.createCDPSession();
  const button=label=>page.evaluate(text=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text)?.click(),label);
  const pause=()=>new Promise(resolve=>setTimeout(resolve,350));
  fs.mkdirSync('test/ui-previews',{recursive:true});
  const check=async(selector,label)=>{
    await page.waitForSelector(selector,{visible:true});await pause();
    const before=await page.$eval(selector,el=>{
      const r=el.getBoundingClientRect(),css=getComputedStyle(el);
      return {left:r.left,right:r.right,width:el.clientWidth,scrollWidth:el.scrollWidth,scrollLeft:el.scrollLeft,overflowX:css.overflowX,viewport:innerWidth};
    });
    assert.ok(before.left>=-1&&before.right<=before.viewport+1,label+' viewport: '+JSON.stringify(before));
    assert.ok(before.scrollWidth<=before.width+1,label+' content width: '+JSON.stringify(before));
    assert.ok(['hidden','clip'].includes(before.overflowX),label+' does not expose horizontal scrolling');
    const target=await page.$eval(selector,el=>{const r=el.getBoundingClientRect();return {x:(r.left+r.right)/2,y:Math.min(innerHeight-100,Math.max(130,(r.top+r.bottom)/2))};});
    await page.mouse.move(target.x,target.y);await page.mouse.wheel({deltaX:120,deltaY:0});
    await cdp.send('Input.synthesizeScrollGesture',{...target,xDistance:80,yDistance:0,speed:600,gestureSourceType:'touch'});
    await pause();
    const after=await page.$eval(selector,el=>({left:el.getBoundingClientRect().left,scrollLeft:el.scrollLeft}));
    assert.equal(after.scrollLeft,0,label+' stays at scrollLeft=0 after horizontal gestures');
    assert.ok(Math.abs(after.left-before.left)<1,label+' stays in the same horizontal position');
    console.log('Layout passed:',label);
  };
  try{
    for(const width of [320,393]){
      await page.setViewport({width,height:851,deviceScaleFactor:1,isMobile:true,hasTouch:true});
      await page.goto(origin+'/statistics-fixture/',{waitUntil:'domcontentloaded'});
      await page.waitForSelector('[data-statistics-fixture-ready="true"]');
      await button('Otwórz menu testowe');await pause();
      await page.click('nav button:nth-child(2)');
      for(const theme of ['dark-cosmos','light-sky']){
        await page.$eval(`[data-statistics-theme="${theme}"]`,el=>el.click());
        await page.waitForSelector(`[data-ui-theme="${theme}"]`);
        for(const fontSize of [16,20]){
          await page.evaluate(size=>document.documentElement.style.fontSize=size+'px',fontSize);
          await check('[data-statistics-view]',`statistics ${width}px ${theme} font ${fontSize}`);
          await page.screenshot({path:`test/ui-previews/layout-statistics-${width}-${theme}-${fontSize}.png`});
        }
      }
    }
    await page.setViewport({width:393,height:851,deviceScaleFactor:1,isMobile:true,hasTouch:true});
    await page.goto(origin+'/startup-home/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('.pks-navigation [data-nav-item="admin"]');
    await page.click('.pks-navigation [data-nav-item="admin"]');
    await page.waitForSelector('[data-admin-viewport] .admin-topbar');
    for(const [view,label] of [['devices','Urządzenia'],['operators','Administratorzy'],['bans','Bany / Blokady'],['logs','Logi aktywności'],['maintenance','Konserwacja'],['statistics','Statystyki']]){
      await page.evaluate(text=>[...document.querySelectorAll('[data-admin-viewport] nav button')].find(el=>el.textContent.trim()===text)?.click(),label);
      await page.waitForSelector(`[data-admin-viewport][data-cosmic-view="admin:${view}"]`);
      await check('[data-admin-viewport] [data-cosmic-content] > '+(view==='statistics'?'[data-statistics-view]':'[data-cosmic-canvas]'),'admin '+view);
    }
    // Date controls retain native editing while their icon follows the panel palette.
    await page.evaluate(()=>[...document.querySelectorAll('[data-admin-viewport] nav button')].find(el=>el.textContent.trim()==='Logi aktywności').click());
    await page.waitForSelector('[data-admin-viewport][data-cosmic-view="admin:logs"]');
    await button('Wszystkie daty');await button('Zakres niestandardowy');
    await page.waitForSelector('#logs-range-start',{visible:true});await pause();
    for(const id of ['logs-range-start','logs-range-end']){
      const style=await page.$eval('#'+id,el=>({type:el.type,scheme:getComputedStyle(el).colorScheme,display:getComputedStyle(el).display,padding:parseFloat(getComputedStyle(el).paddingRight)}));
      assert.equal(style.type,'date');assert.equal(style.scheme,'dark');assert.equal(style.display,'block');assert.ok(style.padding>=40,'date text reserves room for the trailing picker icon');
    }
    await page.$eval('#logs-range-start',el=>el.scrollIntoView({block:'center'}));await pause();
    await page.screenshot({path:'test/ui-previews/calendar-logs-dark.png'});
    await button('Zastosuj okres');
    await page.evaluate(()=>[...document.querySelectorAll('[data-admin-viewport] nav button')].find(el=>el.textContent.trim()==='Bany / Blokady').click());
    await page.waitForSelector('[data-admin-viewport][data-cosmic-view="admin:bans"]');
    await page.type('input[placeholder="Szukaj urządzenia lub ID..."]','test-query');
    await button('Filtry');await pause();
    const choices=await page.evaluate(()=>[...document.querySelectorAll('[data-cosmic-content] button')].map(el=>el.textContent.trim()).filter(text=>['Wszystkie','Permanentne','Czasowe','Wyczyść filtry'].includes(text)));
    assert.deepEqual(choices,['Wszystkie','Permanentne','Czasowe']);
    await page.screenshot({path:'test/ui-previews/bans-filter-order.png'});
    await button('Permanentne');await button('Filtry');await button('Wszystkie');
    assert.equal(await page.$eval('input[placeholder="Szukaj urządzenia lub ID..."]',el=>el.value),'test-query','all ban types preserves the search query');
    for(const [route,scheme] of [['dialog-fixture','dark'],['light-dialog-fixture','light']]){
      await page.goto(origin+'/'+route+'/',{waitUntil:'domcontentloaded'});
      await page.waitForSelector('.admin-modal-overlay',{visible:true});await button('Ban');
      await page.waitForSelector('#ban-date',{visible:true});await pause();
      assert.equal(await page.$eval('#ban-date',el=>getComputedStyle(el).colorScheme),scheme);
      assert.equal(await page.$eval('#ban-date',el=>el.disabled),false,'temporary ban date remains editable');
      await page.screenshot({path:`test/ui-previews/calendar-ban-${scheme}.png`});
    }
    await page.goto(origin+'/colors-fonts-fixture/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('[data-picker-ready="true"]');
    const fill=async(selector,text)=>{await page.click(selector,{clickCount:3});await page.keyboard.press('Backspace');await page.type(selector,text);};
    for(const width of [320,393])for(const scheme of ['dark','light']){
      await page.setViewport({width,height:851,deviceScaleFactor:1});
      if((await page.$eval('[data-picker-ready]',el=>el.dataset.uiTheme==='light'))!==(scheme==='light'))await page.click('[data-picker-theme]');
      await page.click('[aria-label="Własny kolor akcentu"]');await page.waitForSelector('.color-picker-dialog');
      await fill('[aria-label="Kod HEX"]','#38BDF8');
      assert.equal(await page.$eval('[aria-label="Kod RGB"]',el=>el.value),'56, 189, 248');
      await fill('[aria-label="Kod RGB"]','256, 1, 2');
      assert.equal(await page.$eval('.color-picker-dialog footer button:last-child',el=>el.disabled),true,'invalid RGB cannot be saved');
      await fill('[aria-label="Kod RGB"]','56, 189, 248');
      assert.equal(await page.$eval('[aria-label="Kod HEX"]',el=>el.value),'#38bdf8');
      const bounds=await page.$eval('.color-picker-dialog',el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight};});
      assert.ok(bounds.left>=0&&bounds.right<=bounds.width&&bounds.top>=0&&bounds.bottom<=bounds.height,'colour dialog fits '+width+' '+scheme);
      if(width===393)await page.screenshot({path:`test/ui-previews/color-picker-${scheme}.png`});
      await button('Zastosuj kolor');await page.waitForSelector('.color-picker-dialog',{hidden:true});
      assert.equal(await page.$eval('[data-saved-color]',el=>el.textContent),'#38bdf8');
      await page.click('[aria-label="Własny kolor akcentu"]');await fill('[aria-label="Kod HEX"]','#ff0000');await button('Anuluj');
      assert.equal(await page.$eval('[data-saved-color]',el=>el.textContent),'#38bdf8','cancel preserves the saved colour');
    }
    await page.click('[aria-label="Własny kolor akcentu"]');
    await page.setViewport({width:320,height:480,deviceScaleFactor:1});await pause();
    const smallDialog=await page.$eval('.color-picker-dialog',el=>{const r=el.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:innerHeight};});
    assert.ok(smallDialog.top>=0&&smallDialog.bottom<=smallDialog.height,'dialog and action footer fit a reduced keyboard-height viewport');
    await page.keyboard.press('Escape');await page.waitForSelector('.color-picker-dialog',{hidden:true});
    await page.setViewport({width:393,height:851,deviceScaleFactor:1});
    assert.equal(await page.$$eval('input[type="color"]',els=>els.length),0,'no native colour picker');
    await page.click('[aria-label="Wybierz krój pisma"]');
    await page.keyboard.press('Escape');await page.waitForSelector('.personal-font-list',{hidden:true});
    await page.click('[aria-label="Wybierz krój pisma"]');
    assert.ok(await page.$$eval('.personal-font-list button',els=>els.length)>=16);
    await page.screenshot({path:'test/ui-previews/font-list.png'});
    await fill('[aria-label="Szukaj czcionki"]','Monospace');
    await page.$eval('.personal-font-list button',el=>el.click());
    await page.waitForFunction(()=>document.documentElement.dataset.personalFont==='mono');
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('[data-picker-ready="true"]');
    await page.waitForFunction(()=>document.documentElement.dataset.personalFont==='mono');
    assert.ok(await page.$eval('.personal-font-sample',el=>getComputedStyle(el).fontFamily.includes('monospace')));
    await fill('[aria-label="Link do Google Fonts"]','https://example.com/Inter');await button('Zastosuj z linku');
    assert.ok((await page.$eval('[role="status"]',el=>el.textContent)).includes('Wklej link'));
    await fill('[aria-label="Link do Google Fonts"]','https://fonts.google.com/specimen/Inter');await button('Zastosuj z linku');
    await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent.includes('Nie udało się pobrać'));
    assert.equal(await page.$eval('[aria-label="Wybierz krój pisma"]',el=>el.textContent),'Monospace','offline/failed import preserves the selected font');
    console.log('Colour editor passed: HEX/RGB synchronization, validation, apply/cancel, dark/light 320/393px. Font list/search/persistence and invalid/offline imports passed.');
    await page.goto(origin+'/bus-sheet-fixture/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('[data-map-bus-sheet][data-expanded="true"]');
    await page.evaluate(()=>{document.documentElement.dataset.cosmicTheme='on';});
    for(const count of [0,1,30]){
      await page.click(`[data-stop-count="${count}"]`);await pause();
      const geometry=await page.evaluate(()=>{
        const sheet=document.querySelector('[data-map-bus-sheet]'),body=sheet.querySelector('.map-detail-body');
        return{sheetBottom:sheet.getBoundingClientRect().bottom,bodyBottom:body.getBoundingClientRect().bottom,clientHeight:body.clientHeight,scrollHeight:body.scrollHeight,background:getComputedStyle(body).backgroundImage,headerBackground:getComputedStyle(sheet.querySelector('[data-vehicle-header]')).backgroundImage};
      });
      assert.ok(Math.abs(geometry.sheetBottom-geometry.bodyBottom)<=2,'bus sheet sky fills its remaining height with '+count+' stops: '+JSON.stringify(geometry));
      assert.ok(geometry.background.includes('nebula.jpg'),'cosmic sky remains visible with '+count+' stops');
      assert.equal(geometry.headerBackground,'none','carrier header remains untextured');
      if(count===30){
        assert.ok(geometry.scrollHeight>geometry.clientHeight,'long lists retain scrolling');
        await page.$eval('.map-detail-body',el=>{el.scrollTop=el.scrollHeight;});
        assert.ok(await page.$eval('.map-detail-body',el=>el.scrollTop>0),'long stop list can scroll');
      }else await page.screenshot({path:`test/ui-previews/cosmos-bus-${count}-stops.png`});
    }
    console.log('Bus sheet sky fills empty and single-stop panels; long lists remain scrollable and carrier headers retain their colour.');
    console.log('Calendar and ban filter checks passed: dark/light native pickers, trailing range icons, all types first and search preserved.');
    await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>Boolean(document.querySelector('.pks-theme-root')?.style.getPropertyValue('--pks-accent').trim()));
    await page.click('.pks-navigation [data-nav-item="stops"]');
    await page.waitForSelector('input[placeholder*="Babica"]');
    await check('.transit-view','stops');
    await page.click('.pks-navigation [data-nav-item="options"]');
    await page.waitForSelector('[data-options-sheet]');
    await check('[data-options-scroll]','options general');
    await page.click('#options-personal-tab');
    await page.waitForSelector('[data-personalization-panel]');
    await check('[data-options-scroll]','options personalization');
    assert.deepEqual(errors,[]);
    console.log('Focused layout checks passed: 320/393px, enlarged text, light/Kosmos, all admin sections, stops and both options tabs. No live backend writes.');
  }catch(error){
    await page.screenshot({path:'test/ui-previews/layout-failure.png'}).catch(()=>{});
    console.error(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+1).map(el=>({tag:el.tagName,class:el.className,width:el.clientWidth,scrollWidth:el.scrollWidth}))).catch(()=>[]));
    throw error;
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));fixture.cleanup();}
})().catch(error=>{console.error(error);server.close();fixture.cleanup();process.exitCode=1;});
