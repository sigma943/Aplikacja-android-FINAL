const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
(async()=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'horyzont-map-'));let browser,server;
 try{
  await new Promise((resolve,reject)=>{const compiler=webpack.webpack({mode:'development',devtool:false,plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:path.join(root,'test/admin-theme-fixture.tsx'),output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/lib/use-global-api-statistics':path.join(root,'test/admin-statistics-hook-stub.ts'),'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(root,'test/route-tsx-loader.cjs')},{test:/\.css$/,use:path.join(root,'test/journey-css-loader.cjs')}]},optimization:{minimize:false}});compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
  server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/production.css"><div id="root"></div><script src="/fixture.js"></script>');}if(url.pathname==='/production.css'){res.setHeader('Content-Type','text/css');return res.end(css);}const base=/^\/(themes|data)\//.test(url.pathname)?path.join(root,'public'):temp,file=path.resolve(base,'.'+url.pathname);if(!file.startsWith(base+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream');res.end(fs.readFileSync(file));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message);});page.setDefaultTimeout(60000);
  await page.setViewport({width:393,height:851,deviceScaleFactor:1});
  fs.mkdirSync('test/ui-previews',{recursive:true});
  const contrast=(a,b)=>{const lum=c=>c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>c.startsWith('color(srgb')?v:v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  const searchGutter=async selector=>{
   const layout=await page.$eval(selector,e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect(),icon=e.parentElement.querySelector(':scope>svg');return {align:s.textAlign,indent:s.textIndent,left:parseFloat(s.paddingInlineStart),iconRight:icon?icon.getBoundingClientRect().right-r.left:0,width:r.width};});
   assert.equal(layout.align,'left');assert.equal(layout.indent,'0px');assert.equal(layout.left,30);assert.ok(layout.iconRight<=layout.left-4,'search icon does not cover the text');
   await page.type(selector,'108');assert.equal(await page.$eval(selector,e=>e.value),'108');
  };
  const controls={};
  for(const mode of ['day','warm','night']){
   const suffix=mode==='night'?'&night':mode==='warm'?'&warm':'';
   await page.goto(origin+'/?view=devices'+suffix);await page.waitForSelector('input[data-milk-search]');
   controls[mode]=await page.evaluate(()=>[...document.querySelectorAll('[data-admin-milk-control],input[data-milk-search]')].map(e=>{const s=getComputedStyle(e);return {fill:s.backgroundColor,image:s.backgroundImage,blur:s.backdropFilter,ink:s.color};}));
   for(const c of controls[mode])assert.deepEqual(c,controls[mode][0],'all device toolbar controls use identical solar milk');
   await searchGutter('input[data-milk-search]');
   await page.goto(origin+'/?view=bans'+suffix);await page.waitForSelector('[data-admin-milk-control=filter]');
   const bans=await page.evaluate(()=>[...document.querySelectorAll('[data-admin-milk-control],input[data-milk-search]')].map(e=>{const s=getComputedStyle(e);return {fill:s.backgroundColor,image:s.backgroundImage,blur:s.backdropFilter,ink:s.color};}));
   for(const c of bans)assert.deepEqual(c,controls[mode][0],'Bans filter matches Device toolbar');
   await searchGutter('input[data-milk-search]');
   await page.screenshot({path:'test/ui-previews/horyzont-admin-controls-'+mode+'.png'});
   await page.goto(origin+'/?view=badges'+suffix);await page.waitForSelector('[data-admin-badge]');
   const badges=await page.$$eval('[data-admin-badge]',nodes=>nodes.map(e=>{const s=getComputedStyle(e),label=e.querySelector('span');return {text:e.textContent,paper:s.backgroundColor,ink:getComputedStyle(label||e).color,shadow:s.textShadow,stroke:s.webkitTextStrokeWidth};}));
   assert.equal(badges.length,6);for(const b of badges){assert.match(b.paper,/^rgb\(/,'badge paper is opaque over river highlights');assert.ok(contrast(b.paper,b.ink)>=7,b.text+' remains readable');assert.equal(b.shadow,'none');assert.equal(b.stroke,'0px');}
   await page.screenshot({path:'test/ui-previews/horyzont-admin-badges-'+mode+'.png'});
  }
  assert.notEqual(controls.day[0].fill,controls.warm[0].fill,'milk changes with solar warmth');assert.notEqual(controls.day[0].fill,controls.night[0].fill,'milk turns dark at night');
  for(const kind of ['searchmap','searchstops']){await page.goto(origin+'/?view='+kind);await page.waitForSelector('input[data-milk-search]');await searchGutter('input[data-milk-search]');}
  await page.goto(origin+'/?view=connections');await page.waitForSelector('[data-journey-from]');assert.equal(await page.$eval('[data-journey-from]',e=>getComputedStyle(e).paddingInlineStart),'10px');await page.click('[data-journey-from]');await page.waitForSelector('.connections-picker input[data-milk-search]');await searchGutter('.connections-picker input[data-milk-search]');
  console.log('PASS admin solar milk, Bans filter, six badge labels and left-aligned searches across four panels');
  // Disable only the new text layer to compare against the previous material.
  // Real components must keep every fill, filter, border and glow unchanged.
  for(const kind of ['stops','connections','devices'])for(const mode of ['day','warm','night','other']){
   const theme=mode==='other'?'light-sky':'dark-mountains';
   await page.goto(origin+'/?view='+kind+'&theme='+theme+(mode==='night'?'&night':'')+(mode==='warm'?'&warm':''));
   const target=kind==='stops'?'[data-departure-row] h4':kind==='connections'?'.connections-location strong':'.admin-device-card';
   await page.waitForSelector(target);await new Promise(r=>setTimeout(r,550));
   const compare=await page.evaluate(({kind,target})=>{
    const material=()=>[...document.querySelectorAll('.transit-surface,.transit-card,.connections-card,.connections-route-fields,.pks-personal-card,.ui-accent-soft,[data-selected],.pks-options-sheet,.pks-navigation,input[data-milk-search]')].map(e=>{const s=getComputedStyle(e);return [s.backgroundColor,s.backgroundImage,s.backdropFilter,s.borderColor,s.boxShadow,s.opacity];});
    const text=()=>{const s=getComputedStyle(document.querySelector(target));return {color:s.color,weight:s.fontWeight,stroke:s.webkitTextStrokeWidth,shadow:s.textShadow,smallWeight:kind==='connections'?getComputedStyle(document.querySelector('.connections-location small')).fontWeight:null};};
    const milk=()=>{const e=document.querySelector('[data-unrelated-options]');if(!e)return null;const s=getComputedStyle(e);return [s.backgroundColor,s.color,s.textShadow,s.webkitTextStrokeWidth,s.backdropFilter];};
    let sheet,index,rule;
    for(const s of document.styleSheets){const i=[...s.cssRules].findIndex(r=>r.name==='landscape-reading-text'&&r.cssRules);if(i>=0){sheet=s;index=i;rule=s.cssRules[i].cssText;break;}}
    if(!sheet)throw Error('missing readability layer');
    sheet.deleteRule(index);const before={material:material(),text:text(),milk:milk()};
    sheet.insertRule(rule,index);const after={material:material(),text:text(),milk:milk()};
    const month=document.querySelector('[data-cosmic-panel="stop-days"] .ui-accent-soft');
    return {before,after,month:month?getComputedStyle(month).color:null};
   },{kind,target});
   assert.deepEqual(compare.after.material,compare.before.material,'all original panel materials preserved: '+kind+' '+mode);
   assert.deepEqual(compare.after.milk,compare.before.milk,'unrelated milk panels are unchanged');
   if(mode==='day'||mode==='warm'){
    if(kind==='connections')assert.ok(Number(compare.after.text.smallWeight)>=Number(compare.before.text.smallWeight),'existing bold labels stay bold');
    assert.equal(compare.after.text.stroke,'0.45px','sharp outer glyph edge: '+kind);
    assert.ok(contrast(compare.after.text.color,'rgb(255,255,255)')>=12,'dark readable text: '+kind);
    if(kind==='stops')assert.ok(contrast(compare.month,'rgb(255,255,255)')>=7,'calendar month no longer pale on sunrise glass');
   }else assert.deepEqual(compare.after.text,compare.before.text,'night and other themes unchanged');
   if(mode==='day'||mode==='warm')await page.screenshot({path:'test/ui-previews/horyzont-reading-'+kind+'-'+mode+'.png'});
   console.log('PASS text-only contrast, unchanged materials',kind,mode,compare.after.text);
  }
  // Exercise the real device card shown in the report, not a synthetic text box.
  for(const theme of ['dark-mountains','dark-cosmos','dark-forest','dark-oled','dark','light','light-warm','light-sky','light-pink'])for(const night of theme==='dark-mountains'?[false,true]:[false]){
   await page.goto(origin+'/?view=devices&theme='+theme+(night?'&night':''));await page.waitForSelector('.admin-device-card');
   await page.waitForFunction(()=>[...document.querySelectorAll('.admin-device-card')].some(e=>e.getBoundingClientRect().height>100)&&[...document.querySelectorAll('.admin-device-card')].every(e=>getComputedStyle(e.parentElement).opacity==='1'));
   const read=()=>page.evaluate(()=>{const card=document.querySelector('.admin-device-card'),input=document.querySelector('input[data-milk-search]'),text=[...card.querySelectorAll('div')].find(e=>e.textContent==='ID urządzenia'),s=getComputedStyle(card),i=getComputedStyle(input);return {fill:s.backgroundColor,blur:s.backdropFilter,shadow:getComputedStyle(text).textShadow,ink:getComputedStyle(text).color,inputFill:i.backgroundColor,inputImage:i.backgroundImage,inputBlur:i.backdropFilter,menuFill:getComputedStyle(document.querySelector('[data-admin-milk-control=menu]')).backgroundColor,menuImage:getComputedStyle(document.querySelector('[data-admin-milk-control=menu]')).backgroundImage,placeholder:getComputedStyle(input,'::placeholder').color};});
   const material=await read();
   if(theme==='dark-mountains'){
    assert.ok(material.fill.endsWith('0.2)'),'device card retains the exact 20% fill');
    assert.equal(material.shadow==='none',night,'text halo only in daylight');
    assert.equal(material.inputFill,material.menuFill,'search and sidebar trigger share solar milk');assert.equal(material.inputImage,material.menuImage);assert.notEqual(material.inputImage,'none');
    assert.match(material.inputBlur,/blur\(18px\)/);
    assert.ok(contrast(material.ink,material.inputFill)>7,'readable search milk family');
    await page.evaluate(()=>{const style=document.createElement('style');style.id='before-readability';style.textContent='.admin-device-card,.admin-device-card * {text-shadow:none!important}';document.head.append(style);});
    const withoutHalo=await read();if(!night)await page.screenshot({path:'test/ui-previews/horyzont-device-readable-before.png'});assert.equal(material.fill,withoutHalo.fill);assert.equal(material.blur,withoutHalo.blur,'glyph halo does not change panel blur');
    await page.evaluate(()=>document.getElementById('before-readability').remove());
    // Search remains usable; its material is independent of user card opacity.
    await page.type('input[data-milk-search]','Windows');assert.ok(await page.$('.admin-device-card'));
    for(const opacity of [.2,.85]){
     await page.evaluate(opacity=>document.documentElement.style.setProperty('--landscape-surface','rgba(245,249,252,'+opacity+')'),opacity);
     assert.equal((await read()).inputFill,material.inputFill);
    }
    await page.evaluate(()=>document.documentElement.style.setProperty('--landscape-surface',getComputedStyle(document.documentElement).getPropertyValue('--landscape-solid').trim().replace('rgb(','rgba(').replace(')',',0.2)')));
    await page.screenshot({path:'test/ui-previews/horyzont-device-readable-'+(night?'night':'day')+'.png'});
   }else{
    assert.equal(material.shadow,'none','other theme text unchanged');assert.equal(material.inputImage,'none','other search material unchanged');
   }
   console.log('PASS device daylight text/search milk',theme,night?'night':'day',material);
  }
  for(const theme of ['dark-mountains','dark-cosmos','dark-forest','dark-oled','dark','light','light-warm','light-sky','light-pink'])for(const night of theme==='dark-mountains'?[false,true]:[false]){
   await page.goto(origin+'/?theme='+theme+(night?'&night':''));await page.waitForSelector('[data-statistics-chart]');
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent==='Dzisiaj').click());
   const stats=await page.evaluate(()=>{const chart=document.querySelector('[data-statistics-chart="requests"]'),plot=chart.querySelector('[data-statistics-plot]'),marks=chart.querySelectorAll('[data-statistics-marks] circle');return {plot:getComputedStyle(plot).fill,marks:[...marks].map(e=>({fill:getComputedStyle(e).fill,r:e.getAttribute('r')})),rects:[...chart.querySelectorAll('rect[role="button"]')].map(e=>getComputedStyle(e).stroke),exportBorder:getComputedStyle(document.querySelector('[data-statistics-export]')).borderTopWidth};});

   assert.equal(stats.marks.length,2,'single-day requests and errors both have marks');for(const m of stats.marks)assert.ok(contrast(m.fill,stats.plot)>=3,theme+' series contrast '+JSON.stringify(stats));assert.ok(stats.rects.every(s=>s==='none'));assert.equal(stats.exportBorder,'0px');
   await page.$eval('[data-statistics-chart="requests"]',e=>e.scrollIntoView({block:'center'}));await page.screenshot({path:'test/ui-previews/horyzont-admin-chart-'+theme+(night?'-night':'')+'.png'});
   await page.$eval('[data-statistics-chart="requests"] rect[role="button"]',e=>e.dispatchEvent(new MouseEvent('click',{bubbles:true})));await page.waitForSelector('[data-statistics-tooltip]');assert.match(await page.$eval('[data-statistics-tooltip]',e=>e.textContent),/100/);await page.keyboard.press('Escape');
   await page.$eval('[aria-label="Otwórz menu statystyk"]',e=>e.scrollIntoView());await page.click('[aria-label="Otwórz menu statystyk"]');await new Promise(r=>setTimeout(r,350));
   const sidebar=await page.$eval('[data-admin-sidebar]',e=>({bg:getComputedStyle(e).backgroundColor,ink:getComputedStyle(e).color,width:e.getBoundingClientRect().width,body:document.body.scrollWidth,card:getComputedStyle(document.querySelector('[data-control-card]')).backgroundColor}));
   assert.ok(sidebar.width<=393);assert.ok(sidebar.body<=393,'no sidebar or SVG overflow');
   if(theme==='dark-mountains'){assert.equal(sidebar.bg,night?'rgb(16, 29, 44)':'rgb(245, 249, 252)');assert.ok(contrast(sidebar.bg,sidebar.ink)>7);assert.ok(sidebar.card.endsWith('0.2)'),'other panels keep 20%');}
   if(theme==='dark-mountains'){
    for(const period of ['night','day',night?'night':'day']){
     await page.evaluate(period=>document.documentElement.dataset.landscapePeriod=period,period);
     assert.equal(await page.$eval('[data-admin-sidebar]',e=>getComputedStyle(e).backgroundColor),period==='night'?'rgb(16, 29, 44)':'rgb(245, 249, 252)','open sidebar follows live day/night change');
    }
   }
   await page.screenshot({path:'test/ui-previews/horyzont-admin-sidebar-'+theme+(night?'-night':'')+'.png'});console.log('PASS admin',theme,night?'night':'day',stats,sidebar);
  }
  for(const theme of ['dark-mountains','dark-cosmos','dark-forest','dark-oled','dark','light','light-warm','light-sky','light-pink'])for(const night of theme==='dark-mountains'?[false,true]:[false])for(const provider of theme==='dark-mountains'?['pks','mpk_rzeszow','marcel']:['pks']){
   await page.goto(origin+'/?view=bus&theme='+theme+(night?'&night':'')+'&provider='+provider);await page.waitForSelector('[data-map-bus-sheet]');
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-map-bus-sheet]')).opacity==='1');
   for(const expanded of [false,true,false]){
    if(expanded!==(await page.$eval('[data-map-bus-sheet]',e=>e.dataset.expanded==='true')))await page.click('[data-vehicle-header]');
    await page.waitForFunction(expanded=>document.querySelector('[data-map-bus-sheet]').dataset.expanded===String(expanded),{},expanded);await new Promise(r=>setTimeout(r,400));
    const panel=await page.$eval('[data-map-bus-sheet]',e=>{const h=e.querySelector('[data-vehicle-header]'),s=getComputedStyle(e),hs=getComputedStyle(h),r=e.getBoundingClientRect(),hr=h.getBoundingClientRect();return {fill:s.backgroundColor,image:s.backgroundImage,header:hs.backgroundColor,headerImage:hs.backgroundImage,ink:hs.color,height:r.height,headerHeight:hr.height,bottom:r.bottom,nav:document.querySelector('[data-test-navigation]').getBoundingClientRect().top,text:h.textContent};});
    assert.match(panel.text,/108/);assert.match(panel.text,/Scania/);assert.ok(panel.height>150&&panel.headerHeight>100,'bus header has its actual size');assert.ok(panel.bottom<=panel.nav+2,'sheet remains above navigation');
    // Collapsed sheets intentionally paint their carrier material on the
    // parent, with a transparent child header. Inspect the composed surface.
    const headerImage=panel.headerImage!=='none'?panel.headerImage:panel.image;
    const headerFill=/^rgb\(/.test(panel.header)?panel.header:panel.fill;
    assert.ok(headerImage!=='none'||/^rgb\(/.test(headerFill),'carrier header or its parent must paint an opaque surface: '+JSON.stringify(panel));
    if(theme==='dark-mountains')assert.ok(/^rgb\(/.test(panel.fill),'landscape bus sheet must retain a solid backing: '+JSON.stringify(panel));
    const headerColors=headerImage==='none'?[headerFill]:headerImage.match(/rgb\([^)]+\)/g)||[];assert.ok(headerColors.length>0);for(const c of headerColors)assert.ok(contrast(c,panel.ink)>=4.5,'readable vehicle header: '+JSON.stringify(panel));
    if(provider==='pks')await page.screenshot({path:'test/ui-previews/horyzont-bus-'+theme+(night?'-night':'')+(expanded?'-expanded':'-collapsed')+'.png'});
   }
   console.log('PASS bus sheet',theme,night?'night':'day',provider,'collapsed/expanded/collapsed');
  }
  await page.goto(origin+'/?view=stop&theme=dark-mountains&night');await page.waitForSelector('[data-departure-row]');
  assert.equal(await page.$('[role="alert"]'),null,'available timetable hides only the requested forecast banner');assert.match(await page.$eval('[data-departure-row]',e=>e.textContent),/05:20/);
  for(const kind of ['error','mixed']){await page.evaluate(kind=>window.__mapStopCase(kind),kind);await page.waitForSelector('[role="alert"]');const message=await page.$eval('[role="alert"]',e=>e.textContent);assert.match(message,/Nie udało się odświeżyć/);assert.ok(!message.includes('prognozy na żywo'));}
  await page.evaluate(()=>window.__mapStopCase('empty'));await page.waitForFunction(()=>!document.querySelector('[data-departure-row]'));assert.match(await page.$eval('[role="alert"]',e=>e.textContent),/prognozy na żywo/,'an unavailable timetable still exposes the error');
  await page.evaluate(()=>window.__mapStopCase('schedule'));await page.waitForSelector('[data-departure-row]');assert.equal(await page.$('[role="alert"]'),null);await page.screenshot({path:'test/ui-previews/horyzont-map-stop-timetable.png'});console.log('PASS map stop warning: timetable shown quietly, real errors preserved');
  await page.setRequestInterception(true);page.on('request',r=>r.url().includes('/data/stop-platform-index.json')?r.respond({status:404,body:'{}'}):r.url().includes('/data/stop-platforms.json')?r.respond({status:200,contentType:'application/json',body:JSON.stringify({points:[{id:'platform/1',name:'Test wspólny peron 01',lat:50.00007,lon:22.00007}]})}):r.continue());
  for(const provider of ['pks','mpk_rzeszow','marcel']){
   await page.goto(origin+'/?view=platform&provider='+provider);await page.waitForSelector('.map-stop-ring.is-selected');
   const state=()=>page.evaluate(()=>({circles:window.__platformCenters().circles.length,icons:window.__platformCenters().icons.length,glows:document.querySelectorAll('.map-stop-ring.is-selected').length,panel:!!document.querySelector('[data-stop-details]')}));
   assert.deepEqual(await state(),{circles:0,icons:2,glows:1,panel:false},'high zoom shows only highlighted catalog stop');
   await page.evaluate(()=>window.__platformZoom(15));await page.waitForFunction(()=>window.__platformCenters().circles.length===1&&window.__platformCenters().icons.length===0);
   assert.deepEqual(await state(),{circles:1,icons:0,glows:0,panel:false},'zoom out restores ordinary route dots');
   for(const zoom of [16,19,20]){
    await page.evaluate(zoom=>window.__platformZoom(zoom),zoom);await page.waitForFunction(()=>window.__platformCenters().circles.length===0&&window.__platformCenters().icons.length===2);
    assert.deepEqual(await state(),{circles:0,icons:2,glows:1,panel:false},'zoom '+zoom+' '+provider+' hides white dot and glows only the matching stop');
   }
   await page.evaluate(()=>window.__platformRefresh());await new Promise(r=>setTimeout(r,150));assert.deepEqual(await state(),{circles:0,icons:2,glows:1,panel:false},'catalog refresh keeps glow without a duplicate or panel');
   await page.evaluate(()=>window.__routeVisible(false));await page.waitForFunction(()=>!document.querySelector('.map-stop-ring.is-selected'));assert.deepEqual(await state(),{circles:0,icons:2,glows:0,panel:false},'deselecting route removes automatic glow');
   await page.evaluate(()=>window.__routeVisible(true));await page.waitForSelector('.map-stop-ring.is-selected');
   await page.evaluate(()=>window.__catalogVisible(false));await page.waitForFunction(()=>window.__platformCenters().circles.length===1&&window.__platformCenters().icons.length===0);assert.equal((await state()).panel,false,'disabled catalog retains route dots');
   await page.evaluate(()=>window.__catalogVisible(true));await page.waitForSelector('.map-stop-ring.is-selected');await new Promise(r=>setTimeout(r,300));
   assert.deepEqual(await state(),{circles:0,icons:2,glows:1,panel:false});assert.notEqual(await page.$eval('.map-stop-ring.is-selected',e=>getComputedStyle(e).boxShadow),'none','same visible halo as a pressed stop');
   await page.screenshot({path:'test/ui-previews/horyzont-platform-glow-'+provider+'.png'});
   await page.click('.map-stop-ring.is-selected');await page.waitForSelector('[data-stop-details]');assert.match(await page.$eval('[data-stop-details]',e=>e.textContent),/kliknięcia: 1/,'an explicit click still opens stop details');
   console.log('PASS route stop glow',provider,'zoom 15/16/19/20, refresh, deselection, hidden catalog; no automatic panel');
  }
  await page.goto(origin+'/?view=clouds');const clouds=await page.evaluate(()=>window.__cloudMaterialCheck);assert.equal(clouds.alphaMismatch,0,'identical cloud silhouettes day and night');assert.ok(clouds.visible>1000);assert.ok(clouds.nightRatio>.25&&clouds.nightRatio<.8,'night clouds keep visible texture without daytime lighting: '+JSON.stringify(clouds));console.log('PASS same cloud asset day/night',clouds);
  await page.goto(origin+'/?view=twilight');await page.waitForFunction(()=>window.__setTwilight||window.__twilightError);
  const twilight={};
  for(const [name,iso] of [['night','2026-10-27T02:00:00+01:00'],['0540','2026-10-27T05:40:00+01:00'],['evening','2026-10-27T17:00:00+01:00']]){
   twilight[name]=await page.evaluate(iso=>window.__setTwilight(iso),iso);
   assert.ok(twilight[name].gpu.available,'test uses the real landscape GPU');
   await page.screenshot({path:'test/ui-previews/horyzont-twilight-'+name+'.png'});
  }
  assert.ok(twilight['0540'].meanSky>twilight.night.meanSky+30,'reported dawn is visibly lighter than deep night');
  assert.ok(twilight.evening.meanSky>twilight.night.meanSky+20,'scattered light remains after sunset too');
  assert.ok(twilight['0540'].altitude<0&&twilight['0540'].sky.blueHour>.95);
  console.log('PASS actual twilight landscape before sunrise and after sunset',twilight);
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
