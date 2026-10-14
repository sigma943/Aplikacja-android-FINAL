const assert=require('node:assert/strict');
const backgroundSvgs=require('./helpers/css-background-svg.cjs');
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
const puppeteer=require('puppeteer');
const fixture=require('./build-accent-fixture.cjs')();const root=fixture.root;const productionRoot=path.resolve('out');
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file=path.resolve(root,'.'+(pathname.endsWith('/')?`${pathname}index.html`:pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
  if(!fs.existsSync(file))file=path.resolve(productionRoot,'.'+pathname);
  if(!file.startsWith(productionRoot+path.sep)&&!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';
  res.setHeader('Content-Type',type);fs.createReadStream(file).pipe(res);
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  fs.mkdirSync('test/ui-previews',{recursive:true});
  const stableClick=async selector=>{
    await page.evaluate(()=>delete window.__clickGeometry);
    await page.waitForFunction(selector=>{
      const node=document.querySelector(selector);if(!node)return false;
      const r=node.getBoundingClientRect(),values=[r.x,r.y,r.width,r.height],old=window.__clickGeometry;
      const count=old&&values.every((v,i)=>Math.abs(v-old.values[i])<.25)?old.count+1:0;
      window.__clickGeometry={values,count};
      return count>=4&&r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight;
    },{polling:50,timeout:5000},selector);
    await page.click(selector);
  };
  try{
    await page.setViewport({width:393,height:851,deviceScaleFactor:1});
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
    await page.evaluateOnNewDocument(()=>{
      const Original=Date;const now=Original.parse('2026-10-06T12:18:30Z');
      window.Date=class extends Original {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
    });
    await page.setRequestInterception(true);
    let showFixtureBus=false, showMarcel=false;
    const marcelRoad=require('./fixtures/marcel-jaslo-rzeszow-1181798.json');
    const {decodePolyline}=require('./load-ts.cjs')('lib/bus-road-geometry.ts');
    let marcelSecondary=0;
    let fixtureBus=structuredClone(require('./fixtures/pks-vehicle.json'));
    fixtureBus.trip_id=987654321; // A live ID absent from the packaged GTFS index.
    fixtureBus.position.position_date='2026-10-06 14:18:30';
    fixtureBus.journey.vehicle_journey_date='2026-10-06';fixtureBus.journey.departure_time='14:25:00';
    fixtureBus.next_stop_points=fixtureBus.next_stop_points.map((stop,index)=>({...stop,planned_departure_time:`2026-10-06 14:${String(25+index*2).padStart(2,'0')}:00`,real_departure_time:`2026-10-06 14:${String(25+index*2).padStart(2,'0')}:00`}));
    page.on('request',async request=>{
      const url=request.url();
      const json=data=>request.respond({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
      if(url.includes('stop-point-timetable'))return json({success:true,items:[{line_name:'108',description:'Rzeszów',journeys:[{journey_id:1,time:'14:21',stop_point_code:'69',legends:['D']}]}]});
      if(url.includes('/pks/get_vehicles.php'))return json(showFixtureBus?[fixtureBus]:[]);
      if(url.endsWith('/api/pks/vehicles'))return json({items:[]});
      if(url.includes('/api/pks/einfo/stop-point'))return json({items:[]});
      if(showMarcel && url.includes('/trasy/lokalizacjaBusow'))return json([{idKu:1181798,idPo:42,szGps:49.95,dlGps:21.88,nazTr:'Jasło-Rzeszów',timestamp:'2026-10-06T12:18:30Z'}]);
      if(showMarcel && url.includes('/trasy/kurs/1181798'))return json(marcelRoad.course.map(stop=>{
        const [hour,minute]=stop.godz.split(':');return {...stop,godz:`${Number(hour)+10}:${minute}`};
      }));
      if(showMarcel && (url.includes('valhalla')||url.includes('router.project-osrm.org'))) {
        const points=url.includes('valhalla')?JSON.parse(new URL(url).searchParams.get('json')).locations.map(p=>[p.lat,p.lon]):new URL(url).pathname.split('/driving/')[1].split(';').map(p=>p.split(',').map(Number).reverse());
        const chunk=marcelRoad.chunks.find(c=>JSON.stringify(c.stops)===JSON.stringify(points));
        if(!chunk)return json({error:'Unexpected route pattern'});
        if(url.includes('valhalla'))return json({trip:{legs:chunk.primary}});
        marcelSecondary++;return json({code:'Ok',routes:[{geometry:{coordinates:decodePolyline(chunk.secondary).map(([a,b])=>[b,a])}}]});
      }
      if(url.includes('mpkrzeszow.pl')||url.includes('api-site.marcel-bus.pl'))return json([]);
      if(url.startsWith(origin))return request.continue();
      return request.abort();
    });
    const button=async label=>page.evaluate(text=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text)?.click(),label);
    const visible=async selector=>{
      await page.waitForFunction(css=>[...document.querySelectorAll(css)].some(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight;}),{},selector);
      const handle=await page.evaluateHandle(css=>[...document.querySelectorAll(css)].find(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight;}),selector);
      return handle.asElement();
    };
    const style=async(selector,property)=>(await visible(selector)).evaluate((el,key)=>getComputedStyle(el)[key],property);
    const openStops=async()=>{
      console.log('Opening stops');
      await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--pks-accent').trim()!=='');
      await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>el.textContent.trim()==='Przystanki'));
      await button('Przystanki');await page.waitForSelector('input[placeholder*="Babica"]');
      await page.type('input[placeholder*="Babica"]','Baryczka');
      await page.waitForFunction(()=>[...document.querySelectorAll('h3')].some(el=>el.textContent==='Baryczka 69'));
      await new Promise(resolve=>setTimeout(resolve,650));
    };
    const accent=async name=>{
      console.log('Selecting accent:',name);
      await button('Opcje');await page.waitForSelector('[role="dialog"]');
      await stableClick('#options-personal-tab');await page.waitForSelector('[data-personalization-panel]');
      await page.click(`[aria-label="Kolor akcentu: ${name}"]`);
      await page.mouse.click(4,4);await page.waitForSelector('[role="dialog"]',{hidden:true});
    };
    const overflow=async()=>assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.transit-view')].some(el=>el.scrollWidth>el.clientWidth+1)),false);
    const screenshot=async name=>{await new Promise(resolve=>setTimeout(resolve,650));return page.screenshot({path:`test/ui-previews/${name}.png`});};
    await page.goto(origin+'/ban-fixture/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('[data-ban-image]');
    for(const [kind,ratio] of [['wide',4],['tall',.25]]){
      await page.click('[data-ban-kind="'+kind+'"]');await page.waitForFunction(r=>{const img=document.querySelector('[data-ban-image]');return img?.complete&&img.naturalWidth/img.naturalHeight===r;}, {}, ratio);
      const size=await page.$eval('[data-ban-image]',el=>({w:el.clientWidth,h:el.clientHeight,fit:getComputedStyle(el).objectFit}));
      assert.ok(Math.abs(size.w/size.h-ratio)<.025,'ban image retains its full aspect ratio: '+kind);assert.equal(size.fit,'contain');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'ban fits mobile width');
      await screenshot('ban-'+kind);
    }
    await page.click('[data-ban-kind="silent"]');await page.waitForSelector('[data-ban-screen]',{hidden:true});
    assert.equal(await page.evaluate(()=>document.body.innerText.includes('Przykładowy powód')),false,'silent ban still hides reason and ban state');
    await page.click('[data-ban-kind="none"]');await page.waitForSelector('[data-ban-screen]');assert.equal(await page.$('[data-ban-image]'),null);
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    console.log('App loaded');
    await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--pks-accent').trim()!=='');
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>el.textContent.trim()==='Opcje'));
    await page.waitForSelector('[data-ui-theme="dark-oled"]');
    assert.equal(await page.evaluate(()=>localStorage.getItem('mks_app_theme')),null,'AMOLED is the default without overwriting a saved preference');
    await page.click('[aria-label="Przewoźnicy"]');await page.waitForSelector('[data-carrier-grid]');
    assert.equal(await page.$eval('[data-carrier-sheet]',el=>el.dataset.glass),'on');
    assert.notEqual(await page.$eval('[data-carrier-sheet]',el=>getComputedStyle(el).backdropFilter),'none');
    assert.equal(await page.$$eval('[data-carrier-grid] img',els=>els.length),0,'bus selection uses no raster artwork');
    assert.equal(await page.$$eval('[data-carrier-bus-svg]',els=>els.length),3);
    const carrierGeometry=await page.$eval('[data-carrier-grid] button[aria-label="PKS Rzeszów"] svg[data-bus-glyph]',el=>[...el.querySelectorAll('rect,circle')].map(node=>[node.tagName,...['x','y','width','height','rx','cx','cy','r'].map(key=>node.getAttribute(key))]));
    assert.equal(carrierGeometry.length,6,'the carrier comparison selects the bus rather than the checkmark');
    const pksSelected=await page.$eval('[data-carrier-grid] button[aria-label="PKS Rzeszów"]',el=>el.getAttribute('aria-pressed'));
    await page.click('[data-carrier-grid] button[aria-label="PKS Rzeszów"]');
    assert.notEqual(await page.$eval('[data-carrier-grid] button[aria-label="PKS Rzeszów"]',el=>el.getAttribute('aria-pressed')),pksSelected);
    await page.click('[data-carrier-grid] button[aria-label="PKS Rzeszów"]');
    assert.ok(await page.$eval('[data-carrier-grid]',el=>el.scrollWidth<=el.clientWidth+1));
    await screenshot('carriers-amoled');await page.click('[aria-label="Zamknij panel przewoźników"]');
    const beforeNewThemes=await page.evaluate(()=>({...localStorage}));
    for(const [name,mode,canvas] of [['Leśny','dark-forest','#061a13'],['Niebo','light-sky','#d5efff'],['Kosmos','dark-cosmos','#000000']]){
      await button('Opcje');await page.waitForSelector('[data-options-sheet]');await stableClick('#options-personal-tab');
      await page.waitForSelector(`[aria-label="Zestaw: ${name}"]`);
      await page.$eval(`[aria-label="Zestaw: ${name}"]`,el=>el.click());await page.waitForSelector(`[data-ui-theme="${mode}"]`);
      assert.equal(await page.$eval('.pks-theme-root',el=>getComputedStyle(el).backgroundColor),`rgb(${[1,3,5].map(index=>parseInt(canvas.slice(index,index+2),16)).join(', ')})`);
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.panelGlow),mode==='dark-cosmos'?'off':'on');assert.equal(await page.evaluate(()=>localStorage.getItem('mks_transparent')),mode==='dark-cosmos'?'false':'true');
      const pattern=await page.$eval(mode==='dark-cosmos'?'.pks-theme-root':'[data-options-sheet]',el=>getComputedStyle(el).backgroundImage);
      if(mode==='dark-cosmos'){assert.ok(pattern.includes('sky-cloud')&&pattern.includes('/themes/kosmos/deep-space-'),'cosmic canvas includes stars and nebulae throughout the app');assert.ok(await page.$$eval('.personal-group[data-cosmic-scene]',els=>els.length>0),'settings groups receive celestial artwork too');}else {assert.ok(pattern.includes('svg'),'selected theme has static decorations');assert.ok(pattern.includes('radial-gradient'),'decoration and glow are both present');}
      if(mode==='dark-cosmos'){
        assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].some(el=>el.textContent.trim()==='Aurora')),false);
        const planetImages=await page.evaluate(async()=>Promise.all(['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune'].map(async name=>{
          const image=new Image();image.src=`/themes/kosmos/${name}.svg`;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d');context.drawImage(image,0,0);
          return {name,width:image.naturalWidth,centerAlpha:context.getImageData(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1).data[3],cornerAlpha:context.getImageData(0,0,1,1).data[3]};
        })));
        assert.ok(planetImages.every(image=>image.width===512&&image.centerAlpha>0&&image.cornerAlpha<85),'each planet image decodes with visible artwork and a transparent background: '+JSON.stringify(planetImages));
        await page.waitForFunction(()=>document.documentElement.dataset.cosmicMotion==='on');
        await page.waitForFunction(()=>document.querySelector('[data-cosmic-meteor]')?.getAnimations().some(a=>a.playState==='running'),{timeout:12000,polling:25});
        assert.equal(await page.$$eval('[data-cosmic-meteor]',els=>els.length),1);
        assert.equal(await page.$$eval('[data-cosmic-star]',els=>els.reduce((sum,el)=>sum+el.getAnimations().length,0)),0,'plain cosmic canvas has no animated stars');
        const cosmicPaint=await page.$$eval('[data-cosmic-scene]',els=>els.map(el=>{const style=getComputedStyle(el);return {node:el.className,blend:style.backgroundBlendMode,blur:style.backdropFilter};}));
        assert.ok(cosmicPaint.every(style=>style.blend.split(',').every(mode=>mode.trim()==='normal')&&style.blur==='none'),'cosmic surfaces use ordinary image painting without blended or blurred panel layers: '+JSON.stringify(cosmicPaint.filter(style=>style.blend.split(',').some(mode=>mode.trim()!=='normal')||style.blur!=='none')));
        const layouts=await page.$$eval('[data-cosmic-scene]',els=>els.map(el=>el.style.getPropertyValue('--cosmos-planet-position')));
        assert.ok(new Set(layouts).size>1,'panels have individual scattered planet positions');
        await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
        await page.waitForFunction(()=>document.documentElement.dataset.cosmicMotion==='off');
        assert.equal(await page.$eval('[data-cosmic-meteor]',el=>el.getAnimations().length),0);
        assert.equal(await page.$$eval('[data-cosmic-star]',els=>els.reduce((sum,el)=>sum+el.getAnimations().length,0)),0);
        await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
        await page.waitForFunction(()=>document.documentElement.dataset.cosmicMotion==='on');
        await page.evaluate(()=>{localStorage.setItem('mks_light_effects','true');window.dispatchEvent(new Event('pks-interface-appearance'));});
        await page.waitForFunction(()=>document.documentElement.dataset.cosmicMotion==='off');
        await page.evaluate(()=>{localStorage.setItem('mks_light_effects','false');window.dispatchEvent(new Event('pks-interface-appearance'));});
        await page.waitForFunction(()=>document.documentElement.dataset.cosmicMotion==='on');
        const idleTab=await browser.newPage();await idleTab.bringToFront();
        await page.waitForFunction(()=>document.hidden&&document.documentElement.dataset.cosmicMotion==='off');
        assert.equal(await page.$eval('[data-cosmic-meteor]',el=>el.getAnimations().length),0);
        assert.equal(await page.$$eval('[data-cosmic-star]',els=>els.reduce((sum,el)=>sum+el.getAnimations().length,0)),0);
        await idleTab.close();await page.bringToFront();
        await page.waitForFunction(()=>document.documentElement.dataset.cosmicMotion==='on');
      }
      await screenshot('personalization-'+mode);
      await page.mouse.click(4,4);await page.waitForSelector('[data-options-sheet]',{hidden:true});
      await button('Przystanki');await page.waitForSelector('.transit-surface');
      if(mode==='dark-cosmos'){
        await page.waitForFunction(()=>document.querySelectorAll('.transit-card[data-cosmic-scene]').length>3);
        const positions=await page.$$eval('.transit-card[data-cosmic-scene]',els=>els.map(el=>el.style.getPropertyValue('--cosmos-planet-position')));
        assert.ok(new Set(positions).size>3,'stop cards do not repeat a three-row planet pattern');
        assert.equal(await page.$eval('.transit-view',el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)','stop list reveals one shared nebula field');
        assert.equal(await page.$eval('[data-map-canvas]',el=>getComputedStyle(el).visibility),'hidden','inactive map cannot cover the shared sky');
        const skyPixels=await page.evaluate(async image=>{
          const img=new Image();img.src=image;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const context=canvas.getContext('2d');context.drawImage(img,0,0);
          return [120,400,innerHeight-120].map(y=>[...context.getImageData(4,Math.floor(y),1,1).data]);
        },'data:image/png;base64,'+Buffer.from(await page.screenshot()).toString('base64'));
        assert.ok(skyPixels.every(pixel=>pixel[0]<24&&pixel[1]<24&&pixel[2]<32),'space between cards remains deep black with a restrained starfield: '+JSON.stringify(skyPixels));

        const scenes=await page.$$eval('.transit-stop-card[data-cosmic-scene]',els=>els.map(el=>({planet:el.dataset.cosmicPlanet==='on',size:parseFloat(el.style.getPropertyValue('--cosmos-planet-size'))})));
        assert.ok(scenes.length>3);
        assert.ok(scenes.some(scene=>scene.planet),'some stable compositions include planets');
        assert.ok(scenes.every(scene=>scene.size>=52&&scene.size<=76),'small planets fit mobile cards');
        assert.ok(await page.$$eval('.transit-stop-card[data-cosmic-planet=on]',nodes=>nodes.every(node=>{
          const rect=node.getBoundingClientRect(),size=parseFloat(node.style.getPropertyValue('--cosmos-planet-size'));
          const [x,y]=node.style.getPropertyValue('--cosmos-planet-position').split(' ').map(parseFloat);
          const left=(rect.width-size)*x/100,top=(rect.height-size)*y/100;
          return left>=0&&left+size<=rect.width&&top>=0&&top+size<=rect.height&&size<=rect.width*.28;
        })),'planet bounds stay inside responsive card backgrounds');
        const snapshot=()=>page.$$eval('.transit-stop-card[data-cosmic-scene]',els=>Object.fromEntries(els.map(el=>[el.dataset.stopCardId,[...el.style].filter(key=>key.startsWith('--cosmos-')).map(key=>[key,el.style.getPropertyValue(key)])])));
        const beforeFavorite=await snapshot();
        const favoriteId=await page.evaluate(()=>{const card=document.querySelectorAll('.transit-stop-card')[3];card.querySelector('button').click();return card.dataset.stopCardId;});
        await page.waitForFunction(id=>{const transform=document.querySelector(`[data-stop-card-id="${id}"]`).style.transform;return transform&&transform!=='none';},{},favoriteId);
        await new Promise(resolve=>setTimeout(resolve,700));
        assert.deepEqual(await snapshot(),beforeFavorite,'favorite reordering preserves every existing scene by stop identity');
        // Exercise independent image layers at phone density after FLIP moved
        // the cards. A mathematically correct CSS position cannot detect a
        // WebView that actually paints only half of a planet.
        const planetScroll=await page.$eval('[data-stop-list-scroll]',node=>node.scrollTop);
        await page.setViewport({width:393,height:851,deviceScaleFactor:2.5});
        await page.$$eval('[data-cosmic-card-orb]:not([hidden])',nodes=>{const img=nodes.find(n=>!n.src.includes('/reference-'));if(img)img.closest('.transit-stop-card').scrollIntoView({block:'center'});});
        await page.waitForFunction(()=>[...document.querySelectorAll('[data-cosmic-card-orb]:not([hidden])')].every(img=>img.complete&&img.naturalWidth>0));
        await new Promise(resolve=>setTimeout(resolve,200));
        const planetBoxes=await page.$$eval('[data-cosmic-card-orb]:not([hidden])',nodes=>nodes.filter(img=>{const r=img.closest('.transit-stop-card').getBoundingClientRect();const viewport=document.querySelector('[data-stop-list-scroll]').getBoundingClientRect();return r.top>=Math.max(0,viewport.top)&&r.bottom<Math.min(innerHeight-70,viewport.bottom)&&!img.src.includes('/reference-');}).map(img=>({rect:img.getBoundingClientRect().toJSON(),src:img.src})));
        assert.ok(planetBoxes.length>0,'complete planet images are visible after favourite reordering');
        const {PNG}=require('pngjs');
        const planetsPainted=PNG.sync.read(Buffer.from(await page.screenshot({path:'test/ui-previews/cosmos-planets-after-favorite-high-dpi.png'})));
        await page.$$eval('[data-cosmic-card-orb]',nodes=>nodes.forEach(img=>img.style.visibility='hidden'));
        const planetsHidden=PNG.sync.read(Buffer.from(await page.screenshot()));
        await page.$$eval('[data-cosmic-card-orb]',nodes=>nodes.forEach(img=>img.style.removeProperty('visibility')));
        const scale=planetsPainted.width/393;
        for(const {rect,src} of planetBoxes){
          const count=(from,to)=>{let changed=0;
            for(let y=Math.ceil((rect.top+rect.height*from)*scale);y<Math.floor((rect.top+rect.height*to)*scale);y++)for(let x=Math.ceil((rect.left+rect.width*.2)*scale);x<Math.floor((rect.left+rect.width*.8)*scale);x++){
              const i=(y*planetsPainted.width+x)*4;if(Math.max(...[0,1,2].map(c=>Math.abs(planetsPainted.data[i+c]-planetsHidden.data[i+c])))>=8)changed++;
            }return changed;};
          const upper=count(.2,.5),lower=count(.5,.8);
          assert.ok(upper>10&&lower>10,'both halves of the planet are actually painted: '+JSON.stringify({src,upper,lower}));
        }
        await page.setViewport({width:393,height:851,deviceScaleFactor:1});
        await page.$eval('[data-stop-list-scroll]',(node,top)=>node.scrollTop=top,planetScroll);
        await new Promise(resolve=>setTimeout(resolve,100));
        await page.evaluate(()=>{
          const node=document.querySelector('.transit-stop-card');
          const clone=node.cloneNode(true);for(const key of [...clone.style])if(key.startsWith('--cosmos-'))clone.style.removeProperty(key);
          node.after(clone);window.__sceneClone=clone;window.dispatchEvent(new Event('focus'));
        });
        await new Promise(resolve=>setTimeout(resolve,100));
        assert.deepEqual(await snapshot(),beforeFavorite,'recreated rows recover the same tab visit artwork');
        await page.evaluate(id=>{window.__sceneClone.remove();delete window.__sceneClone;document.querySelector(`[data-stop-card-id="${id}"] button`).click();},favoriteId);
        await new Promise(resolve=>setTimeout(resolve,800));
        const saved=await page.evaluate(()=>{
          const appearance=localStorage.getItem('mks_interface_appearance_v1'),glass=localStorage.getItem('mks_transparent'),glow=localStorage.getItem('mks_panel_glow');
          localStorage.setItem('mks_interface_appearance_v1',JSON.stringify({...JSON.parse(appearance||'{}'),density:'spacious',textScale:120,glassOpacity:35,glassBlur:28}));
          localStorage.setItem('mks_panel_glow','true');localStorage.setItem('mks_transparent','true');window.dispatchEvent(new Event('storage'));window.dispatchEvent(new Event('pks-interface-appearance'));
          return {appearance,glass,glow};
        });
        await page.waitForFunction(()=>document.documentElement.dataset.personalDensity==='spacious');
        assert.equal(await page.evaluate(()=>document.documentElement.dataset.panelGlow),'off','saved cosmic profiles cannot enable glow');
        await screenshot('stops-dark-cosmos-resized');
        const bottomPixels=await page.evaluate(async image=>{
          const img=new Image();img.src=image;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const context=canvas.getContext('2d');context.drawImage(img,0,0);
          return [...document.querySelectorAll('.transit-stop-card')].map(el=>el.getBoundingClientRect()).filter(rect=>rect.top>=0&&rect.bottom<innerHeight-70).map(rect=>[...context.getImageData(Math.floor(rect.left+rect.width*.5),Math.floor(rect.bottom-8),1,1).data]);
        },'data:image/png;base64,'+Buffer.from(await page.screenshot()).toString('base64'));
        assert.ok(bottomPixels.length>0&&bottomPixels.every(pixel=>pixel[3]===255&&pixel[2]<60),'resized cards retain opaque dark artwork down to the bottom');
        assert.ok(await page.$$eval('.transit-stop-card',els=>els.every(el=>{const style=getComputedStyle(el);return style.backgroundBlendMode.split(',').every(mode=>mode.trim()==='normal')&&style.backdropFilter==='none'&&style.backgroundClip.split(',').every(clip=>clip.trim()==='border-box');})),'saved glass preferences cannot reintroduce clipping on cosmic cards');
        await page.evaluate(saved=>{for(const [key,value]of [['mks_interface_appearance_v1',saved.appearance],['mks_transparent',saved.glass],['mks_panel_glow',saved.glow]]){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}window.dispatchEvent(new Event('storage'));window.dispatchEvent(new Event('pks-interface-appearance'));},saved);
        await page.waitForFunction(()=>document.documentElement.dataset.personalDensity==='comfortable');
        const captureCosmic=()=>page.$$eval('.transit-stop-card[data-cosmic-scene]',els=>els.map(el=>{
          let hash=2166136261;const dust=el.style.getPropertyValue('--cosmos-dust');for(let i=0;i<dust.length;i++)hash=Math.imul(hash^dust.charCodeAt(i),16777619)>>>0;
          return {id:el.dataset.stopCardId,visit:el.dataset.cosmicVisit,art:[el.dataset.cosmicPlanet,el.dataset.cosmicPlanetName,el.style.getPropertyValue('--cosmos-planet-position'),el.style.getPropertyValue('--cosmos-planet-size'),el.style.getPropertyValue('--cosmos-dust-position'),el.style.getPropertyValue('--cosmos-star-position'),hash].join('|')};
        }));
        assert.ok(await page.$$eval('.transit-stop-card',nodes=>nodes.every(node=>{
          const style=getComputedStyle(node),rect=node.getBoundingClientRect();
          return style.transform==='none'&&style.opacity==='1'&&parseFloat(style.borderBottomWidth)>=1&&rect.height>80;
        })),'cosmic stop cards retain full borders and avoid transformed clipping layers');
        assert.ok(await page.$$eval('.transit-stop-card',nodes=>nodes.every(node=>{
          const outline=getComputedStyle(node,'::after');
          return outline.content!=='none'&&parseFloat(outline.borderBottomWidth)===1&&outline.pointerEvents==='none';
        })),'foreground outlines cover all four card edges independently of the artwork');
        const skyArt=await page.$eval('.pks-theme-root',node=>getComputedStyle(node).backgroundImage);
        assert.ok(skyArt.includes('sky-cloud')&&skyArt.includes('/themes/kosmos/deep-space-'),'cosmic artwork covers the canvas beyond cards');
        assert.ok(skyArt.includes('/themes/kosmos/'),'global canvas has its own stable celestial composition');
        assert.doesNotMatch(skyArt,/(?:reference-)?(?:mercury|venus|earth|mars|jupiter|saturn|uranus|neptune)\.svg/,'global canvas cannot place planets over controls');
        const stable=await captureCosmic();
        const skyBeforeOptions=await page.$eval('.pks-theme-root',el=>getComputedStyle(el).backgroundImage);
        for(let repeat=0;repeat<2;repeat++){
          await button('Opcje');await page.waitForSelector('[data-options-sheet]');
          await stableClick('#options-personal-tab');await page.waitForSelector('[data-personalization-panel]');
          await new Promise(resolve=>setTimeout(resolve,650));
          await page.waitForFunction(()=>[...document.querySelectorAll('[data-cosmic-orbit=options] img')].every(img=>img.complete&&img.naturalWidth>0));
          assert.ok(await page.$eval('[data-cosmic-orbit=options]',node=>{const box=node.getBoundingClientRect();return box.width>70&&[...node.querySelectorAll('img')].every(img=>{const r=img.getBoundingClientRect();return r.width>20&&r.left>=box.left&&r.right<=box.right;});}),'options show a planet and sun clear of the title and controls');
          assert.deepEqual(await captureCosmic(),stable,'opening options and previewing settings never changes the underlying stop layout');
          const locked=await page.$$eval('[aria-label="Efekt szkła"],[aria-label="Miękka poświata paneli"]',els=>els.map(el=>({disabled:el.matches(':disabled'),checked:el.checked,grey:Number(getComputedStyle(el.closest('fieldset')).opacity)<1})));
          assert.equal(locked.length,2);assert.ok(locked.every(value=>value.disabled&&!value.checked&&value.grey),'both effects are visibly greyed out, switched off and disabled in Kosmos');
          const savedEffects=await page.evaluate(()=>({glass:localStorage.getItem('mks_transparent'),glow:localStorage.getItem('mks_panel_glow')}));
          await page.$$eval('[aria-label="Efekt szkła"],[aria-label="Miękka poświata paneli"]',els=>els.forEach(el=>el.click()));
          assert.deepEqual(await page.evaluate(()=>({glass:localStorage.getItem('mks_transparent'),glow:localStorage.getItem('mks_panel_glow')})),savedEffects,'disabled controls cannot modify stored preferences');
          await page.mouse.click(4,4);await page.waitForSelector('[data-options-sheet]',{hidden:true});
          assert.deepEqual(await captureCosmic(),stable,'closing options preserves the underlying stop layout');
          assert.equal(await page.$eval('.pks-theme-root',el=>getComputedStyle(el).backgroundImage),skyBeforeOptions,'options preserves the screen sky too');
        }
        await page.evaluate(()=>{for(const event of ['focus','storage','pks-interface-appearance','pks-profile-applied'])window.dispatchEvent(new Event(event));});
        await new Promise(resolve=>setTimeout(resolve,8500));
        assert.deepEqual(await captureCosmic(),stable,'focus, appearance refreshes and meteor ticks never randomize existing scenes');
        assert.ok(await page.$$eval('.transit-stop-card',els=>els.every(el=>{const art=el.querySelector('[data-cosmic-card-art]'),style=getComputedStyle(art),orb=el.querySelector('[data-cosmic-card-orb]');return getComputedStyle(el).backgroundImage==='none'&&getComputedStyle(art).transform!=='none'&&style.backgroundRepeat.split(',')[0].trim()==='no-repeat'&&!style.backgroundSize.includes('cover')&&style.backgroundImage.includes('sky-cloud')&&style.backgroundImage.includes('/themes/kosmos/deep-space-')&&Boolean(orb);})),'independent image layers paint complete card scenes without using the moving card background');
        await page.type('input[placeholder*="Babica"]','Albigowa');
        await page.waitForFunction(count=>{const titles=[...document.querySelectorAll('.transit-stop-card h3')];return titles.length>0&&titles.length<count&&titles.every(el=>el.textContent.includes('Albigowa'));},{},stable.length);
        await page.click('[aria-label="Wyczysc wyszukiwanie"]');
        await page.waitForFunction(count=>document.querySelectorAll('.transit-stop-card').length===count,{},stable.length);
        assert.deepEqual(await captureCosmic(),stable,'filtering and rebuilding the stop list preserves each stop’s composition');
        const captureStopPanels=()=>page.$$eval('[data-cosmic-panel]',els=>els.map(el=>({
          key:el.dataset.cosmicPanel,visit:el.dataset.cosmicVisit,
          art:[...el.style].filter(name=>name.startsWith('--cosmos-')).map(name=>el.style.getPropertyValue(name)).join('|'),
        })));
        await page.click('.transit-stop-card');
        await page.waitForSelector('[data-cosmic-panel="stop-header"][data-cosmic-scene]');
        const stopPanels=await captureStopPanels();
        await page.waitForFunction(()=>!document.querySelector('[data-cosmic-panel="stop-departures"] .animate-pulse'));
        await page.evaluate(()=>{for(const event of ['focus','storage','pks-interface-appearance','pks-profile-applied'])window.dispatchEvent(new Event(event));});
        await new Promise(resolve=>setTimeout(resolve,1200));
        assert.deepEqual(await captureStopPanels(),stopPanels,'stop detail composition survives completed loading, clock refreshes and preference events');
        assert.equal(await page.$eval('[data-cosmic-panel="stop-departures"]',el=>el.style.getPropertyValue('--cosmos-planet')),'none','timetables reserve their space for text instead of floating planets');
        assert.equal(await page.$eval('[data-cosmic-panel="stop-departures"]',el=>getComputedStyle(el).minHeight),'0px','planet artwork cannot stretch departure panels');
        assert.ok(await page.$eval('[data-cosmic-panel="stop-departures"]',el=>getComputedStyle(el.closest('.pks-theme-root')).backgroundSize.includes('480px')),'long timetables cannot magnify stars to their content height');
        assert.equal(await page.$$eval('[data-departure-row]',els=>els.some(el=>el.getAnimations().some(animation=>animation.playState==='running'))),false,'Kosmos refreshes departure values without replaying row entrance animations');
        await screenshot('departures-dark-cosmos-stable');
        await page.click('[aria-label="Wróć do listy przystanków"]');
        await page.waitForSelector('.transit-stop-card');
        await page.click('.transit-stop-card');
        await page.waitForSelector('[data-cosmic-panel="stop-header"][data-cosmic-scene]');
        assert.deepEqual((await captureStopPanels()).map(panel=>panel.art),stopPanels.map(panel=>panel.art),'reopening stop detail preserves the composition until leaving the tab');
        await page.click('[aria-label="Wróć do listy przystanków"]');
        await page.waitForSelector('.transit-stop-card');
        await button('Mapa');await page.waitForFunction(()=>document.querySelector('.pks-navigation [data-nav-item="map"]')?.getAttribute('aria-current')==='page');
        await button('Przystanki');await page.waitForFunction(()=>document.querySelector('.pks-navigation [data-nav-item="stops"]')?.getAttribute('aria-current')==='page');
        await page.waitForFunction(visit=>document.querySelector('.transit-stop-card')?.dataset.cosmicVisit!==visit,{},stable[0].visit);
        assert.notDeepEqual((await captureCosmic()).map(scene=>scene.art),stable.map(scene=>scene.art),'leaving the tab and returning creates a fresh composition');
      }
      await screenshot('stops-'+mode);await button('Mapa');
      await page.waitForFunction(()=>document.querySelector('.pks-navigation [data-nav-item="map"]')?.getAttribute('aria-current')==='page');
      if(mode==='dark-cosmos'){
        await page.waitForFunction(()=>document.documentElement.dataset.cosmicMotion==='off');
        assert.equal(await page.$eval('[data-cosmic-effects]',el=>getComputedStyle(el).display),'none','map keeps static celestial decoration without meteor animations');assert.equal(await page.$eval('[data-map-canvas]',el=>getComputedStyle(el).visibility),'visible','map is visible again after closing the cosmic panels');
        assert.equal(await page.$$eval('[data-cosmic-star],[data-cosmic-meteor]',els=>els.reduce((n,el)=>n+el.getAnimations().length,0)),0,'map cancels star and meteor animations');
        const mapSky=await page.$eval('[data-map-canvas]',el=>{const s=getComputedStyle(el,'::after');return {image:s.backgroundImage,content:s.content,pointer:s.pointerEvents};});
        assert.equal(mapSky.image,'none','map geography has no separate decorative overlay');assert.equal(mapSky.content,'none','no planet can float out of a panel onto the map');assert.equal(mapSky.pointer,'none','map decoration cannot intercept map gestures');
        await button('Opcje');await page.waitForSelector('[data-options-sheet]');
        assert.equal(await page.$eval('[data-map-canvas]',node=>getComputedStyle(node).visibility),'visible','opening options or switching to Kosmos must never hide the parent map');
        await page.mouse.click(4,4);await page.waitForSelector('[data-options-sheet]',{hidden:true});
        await page.click('[aria-label="Przewoźnicy"]');await page.waitForSelector('[data-carrier-sheet]');
        assert.equal(await page.$eval('[data-map-canvas]',node=>getComputedStyle(node).visibility),'visible','carrier sheet cannot hide its own parent map');
        assert.ok(await page.$eval('[data-carrier-sheet]',node=>getComputedStyle(node).visibility==='visible'&&node.getBoundingClientRect().height>80),'cosmic carrier sheet is visible above the real map');
        assert.equal(await page.$$eval('[data-carrier-grid] button',nodes=>nodes.filter(node=>node.getBoundingClientRect().width>0&&getComputedStyle(node).visibility==='visible').length),3,'all carrier choices remain visible');
        await page.waitForSelector('[data-carrier-sheet][data-cosmic-scene]');
        const carrierArt=await page.$eval('[data-carrier-sheet]',node=>[...node.style].filter(key=>key.startsWith('--cosmos-')).map(key=>node.style.getPropertyValue(key)).join('|'));
        await screenshot('carriers-dark-cosmos');
        await page.click('[aria-label="Zamknij panel przewoźników"]');await page.waitForSelector('[data-carrier-sheet]',{hidden:true});
        await button('Przystanki');await page.waitForSelector('.transit-stop-card');
        await button('Mapa');await page.click('[aria-label="Przewoźnicy"]');
        await page.waitForSelector('[data-carrier-sheet][data-cosmic-scene]');
        assert.equal(await page.$eval('[data-carrier-sheet]',node=>[...node.style].filter(key=>key.startsWith('--cosmos-')).map(key=>node.style.getPropertyValue(key)).join('|')),carrierArt,'map artwork stays fixed after switching tabs and reopening carriers');
        await page.click('[aria-label="Zamknij panel przewoźników"]');await page.waitForSelector('[data-carrier-sheet]',{hidden:true});
        assert.equal(await page.$eval('.pks-map-search-panel',el=>el.style.getPropertyValue('--cosmos-planet')),'none','map search panel never receives planet artwork');
        assert.ok(!await page.$eval('.pks-map-search-panel',el=>getComputedStyle(el).backgroundImage.match(/\/(mercury|venus|earth|mars|jupiter|saturn|uranus|neptune)\.svg/)),'no planet is painted underneath map search controls');
      }
      const screens=await browser.newPage();screens.on('pageerror',e=>errors.push(e.message));
      await screens.setViewport({width:393,height:851,deviceScaleFactor:1});
      await screens.goto(`${origin}/theme-screens-fixture/`,{waitUntil:'domcontentloaded'});
      for(const kind of ['loading','error','maintenance','ban','silent']){
        await screens.click(`[data-screen-kind="${kind}"]`);await screens.waitForSelector(`[data-startup-theme="${mode}"]`);
        const background=await screens.$eval('[data-startup-theme]',el=>getComputedStyle(el).backgroundColor);
        assert.equal(background,mode==='dark-cosmos'?'rgb(0, 0, 0)':mode==='dark-forest'?'rgb(6, 26, 19)':'rgb(213, 239, 255)',kind+' uses selected theme');
        const decoration=await screens.$eval('[data-startup-theme]',el=>getComputedStyle(el).backgroundImage);
        if(mode==='dark-cosmos'&&kind!=='loading')assert.ok(decoration.includes('sky-cloud')&&decoration.includes('/themes/kosmos/deep-space-'),'non-loading cosmic screens retain stars and nebulae');
        else if(kind==='loading')assert.equal(decoration,'none','every loading theme keeps a uniform background');
        else assert.ok(decoration.includes('svg'));
        if(kind==='loading'&&mode==='dark-cosmos')assert.equal(await screens.$eval('[data-cosmic-effects]',el=>getComputedStyle(el).display),'none');
        if(kind==='silent'){assert.equal(await screens.$('[data-ban-screen]'),null);assert.equal(await screens.evaluate(()=>document.body.innerText.includes('Prywatny powód')),false);}
        if(kind==='ban'||kind==='loading')await screens.screenshot({path:`test/ui-previews/${kind}-${mode}.png`});
      }
      await screens.close();await page.bringToFront();await page.waitForSelector(`[data-ui-theme="${mode}"]`);
    }
    const fallbackScreens=await browser.newPage();fallbackScreens.on('pageerror',e=>errors.push(e.message));
    await fallbackScreens.goto(`${origin}/theme-screens-fixture/`,{waitUntil:'domcontentloaded'});
    for(const dark of [false,true]){
      await fallbackScreens.emulateMediaFeatures([{name:'prefers-color-scheme',value:dark?'dark':'light'}]);
      await fallbackScreens.evaluate(()=>{localStorage.setItem('mks_app_theme','damaged-theme');window.dispatchEvent(new Event('pks-interface-appearance'));});
      await fallbackScreens.waitForSelector(`[data-startup-theme="${dark?'dark':'light'}"]`);
      await fallbackScreens.evaluate(()=>{window.__themeGetItem=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key==='mks_app_theme')throw new Error('Blocked theme storage');return window.__themeGetItem.call(this,key);};window.dispatchEvent(new Event('pks-profile-applied'));});
      await fallbackScreens.waitForSelector(`[data-startup-theme="${dark?'dark':'light'}"]`);
      await fallbackScreens.evaluate(()=>{Storage.prototype.getItem=window.__themeGetItem;});
    }
    await fallbackScreens.close();await page.bringToFront();
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
    await page.evaluate(saved=>{localStorage.clear();for(const [key,value] of Object.entries(saved))localStorage.setItem(key,value);},beforeNewThemes);
    await page.goto('about:blank');await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForSelector('[data-ui-theme="dark-oled"]');
    const beforePink=await page.evaluate(()=>({...localStorage}));
    await page.click('.pks-navigation [aria-label="Opcje"]');await page.waitForSelector('[data-options-sheet]');await stableClick('#options-personal-tab');
    await page.$eval('[aria-label="Zestaw: Różowy"]',el=>el.click());
    await page.waitForSelector('[data-ui-theme="light-pink"]');
    await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--pks-accent').trim()==='#c02674');
    assert.equal(await page.$eval('.pks-theme-root',el=>getComputedStyle(el).getPropertyValue('--ui-surface').trim()),'#ffd1e8');
    assert.equal(await page.$eval('[data-options-sheet]',el=>el.scrollWidth>el.clientWidth+1),false,'pink theme fits a phone');
    await screenshot('personalization-pink');
    await page.click('[aria-label="Podgląd: Autobus"]');
    await page.waitForSelector('[data-vehicle-header][data-ui-mode="light"]');
    const readableHeader=await page.$eval('[data-vehicle-header]',el=>({background:getComputedStyle(el).backgroundColor,text:getComputedStyle(el.querySelector('h2')).color,gps:getComputedStyle(el.querySelector('.text-white')).color}));
    assert.equal(readableHeader.text,'rgb(23, 37, 54)');assert.equal(readableHeader.gps,readableHeader.text);
    assert.ok(!readableHeader.background.startsWith('rgba'),'light vehicle header is opaque over the map');
    await screenshot('bus-header-pink');
    await page.click('[aria-label="Podgląd: Mapa"]');

    await page.goto('about:blank');await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('[data-ui-theme="light-pink"]');
    await page.click('[aria-label="Przewoźnicy"]');await page.waitForSelector('[data-carrier-sheet]');
    const carrierPink=await page.$eval('[data-carrier-sheet]',el=>{
      const color=getComputedStyle(el).backgroundColor;
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
      const context=canvas.getContext('2d');context.fillStyle=color;context.fillRect(0,0,1,1);
      return {color,rgba:[...context.getImageData(0,0,1,1).data]};
    });
    assert.ok(carrierPink.rgba.slice(0,3).every((value,i)=>Math.abs(value-[255,184,219][i])<=1),'carrier panel uses pink theme: '+carrierPink.color);
    await screenshot('carriers-pink');
    await page.click('[aria-label="Zamknij panel przewoźników"]');
    await button('Przystanki');await page.waitForSelector('.transit-surface');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.transit-surface')).backgroundImage.includes('svg'));
    const pinkStops=await page.$eval('.transit-surface',el=>({pattern:getComputedStyle(el).backgroundImage,surface:getComputedStyle(el).backgroundColor,canvas:getComputedStyle(el.closest('.transit-view')).getPropertyValue('--transit-canvas').trim()}));
    assert.ok(backgroundSvgs(pinkStops.pattern).some(svg=>svg.includes('id="heart"')),'pink stop panels have heart decorations');
    assert.equal(pinkStops.canvas,'#ffd1e8');assert.notEqual(pinkStops.surface,'rgb(255, 255, 255)');
    await screenshot('stops-pink-hearts');

    // Real computed colours, including alpha compositing of glass and line chips.
    for(const mode of ['light','light-warm','light-pink','light-sky'])for(const glass of [false,true]){
      await page.evaluate(({mode,glass})=>{
        localStorage.setItem('mks_app_theme',mode);localStorage.setItem('mks_transparent',String(glass));
        window.dispatchEvent(new Event('pks-profile-applied'));
      },{mode,glass});
      await page.waitForSelector(`[data-ui-theme="${mode}"]`);
      await page.waitForFunction(glass=>document.querySelector('.transit-view')?.closest('.pks-panel-scope')?.dataset.glass===(glass?'on':'off'),{},glass);
      await page.$eval('input[placeholder*="Babica"]',el=>{
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Boguchwała');
        el.dispatchEvent(new Event('input',{bubbles:true}));
      });
      await page.waitForFunction(()=>document.querySelector('input[placeholder*="Babica"]')?.value==='Boguchwała');
      await page.waitForSelector('[data-stop-line-overflow]');
      const contrasts=await page.evaluate(()=>{
        const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
        const context=canvas.getContext('2d',{willReadFrequently:true});
        const rgba=color=>{
          context.clearRect(0,0,1,1);context.fillStyle=color;context.fillRect(0,0,1,1);
          const [r,g,b,a]=context.getImageData(0,0,1,1).data;return [r,g,b,a/255];
        };
        const blend=(fg,bg)=>fg.slice(0,3).map((v,i)=>v*(fg[3]??1)+bg[i]*(1-(fg[3]??1)));
        const background=el=>{
          if(!el)return [255,255,255];
          return blend(rgba(getComputedStyle(el).backgroundColor),background(el.parentElement));
        };
        const luminance=rgb=>rgb.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
        const ratio=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        const nodes=[...document.querySelectorAll('[data-stop-card-id] h3,[data-stop-card-id] .text-slate-600,[data-stop-line-badges] span')];
        const input=document.querySelector('input[placeholder*="Babica"]');
        return [...nodes.map(el=>({label:el.textContent,ratio:ratio(luminance(blend(rgba(getComputedStyle(el).color),background(el))),luminance(background(el)))})),
          {label:'search placeholder',ratio:ratio(luminance(rgba(getComputedStyle(input,'::placeholder').color)),luminance(background(input)))}];
      });
      assert.ok(contrasts.some(row=>/^\+\d/.test(row.label)),'overflow chip is checked');
      for(const row of contrasts)assert.ok(row.ratio>=4.5,`${mode}, glass=${glass}: ${row.label} contrast ${row.ratio}`);
      await screenshot(`stops-contrast-${mode}-${glass?'glass':'solid'}`);
      if(mode==='light-pink'){
        const tile=await page.$eval('.transit-surface',el=>getComputedStyle(el).backgroundSize);
        assert.ok(tile.startsWith('320px 180px'),'hearts cover full-width tiles like clouds');
      }
    }

    await page.evaluate(saved=>{localStorage.clear();for(const [key,value] of Object.entries(saved))localStorage.setItem(key,value);},beforePink);
    // Check saved theme in a fresh document, preserving the browser context's
    // storage. Page.reload sporadically times out at this animated-view boundary.
    await page.evaluate(()=>localStorage.setItem('mks_app_theme','dark'));
    await page.goto('about:blank');await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('[data-ui-theme="dark"]');
    await accent('Fioletowy');
    await button('Przystanki');
    await page.waitForFunction(()=>document.querySelectorAll('[data-stop-card-id]').length>=3);
    await page.evaluate(()=>{const button=[...document.querySelectorAll('button')].find(el=>el.textContent.trim().startsWith('Pokaż wszystkie ('));button.scrollIntoView();});
    const previewScroll=await page.$eval('[data-stop-list-scroll]',el=>el.scrollTop);
    await page.evaluate(()=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim().startsWith('Pokaż wszystkie (')).click());
    await page.waitForSelector('[data-stop-list-mode="full"]');
    assert.ok(await page.$eval('[data-stop-list-mode="full"]',el=>Number(getComputedStyle(el).opacity))<1,'full list enters with a fade instead of teleporting');
    await new Promise(resolve=>setTimeout(resolve,650));
    assert.equal(await page.$$eval('[data-stop-list-scroll]',els=>els.length),1,'full view replaces the preview scroll container');
    assert.equal(await page.$$eval('input[placeholder*="Babica"]',els=>els.length),1,'full view has no preview header underneath');
    const assertCards=async()=>assert.equal(await page.$$eval('[data-stop-card-id]',cards=>cards.every((card,index)=>{
      const bounds=card.getBoundingClientRect();const next=cards[index+1]?.getBoundingClientRect();
      return bounds.height>=70&&(!next||bounds.bottom<=next.top+1);
    })),true,'full stop cards retain their height and never overlap');
    await page.waitForSelector('[data-virtual-stop-cards]');await assertCards();assert.equal(await page.$eval('[data-virtual-stop-cards]',el=>Number(el.dataset.totalStops)),40);assert.ok(await page.$$eval('[data-stop-card-id]',els=>els.length)<25,'full list renders only nearby cards');
    const assertLineBadges=async()=>assert.equal(await page.$$eval('[data-stop-line-badges]',rows=>rows.every(row=>{
      const badges=[...row.children],bounds=row.getBoundingClientRect();
      const counter=row.querySelector('[data-stop-line-overflow]');
      const visible=badges.length-(counter?1:0),remaining=counter?Number(counter.textContent.slice(1)):0;
      return visible<=5&&visible+remaining===Number(row.dataset.lineTotal)&&row.scrollWidth<=row.clientWidth+1&&badges.every(badge=>{
        const rect=badge.getBoundingClientRect();return Math.abs(rect.top-badges[0].getBoundingClientRect().top)<1&&rect.right<=bounds.right+1;
      });
    })),true,'stop lines stay in one row with a visible and accurate +N tile');
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-stop-line-badges]')].every(row=>row.scrollWidth<=row.clientWidth+1));
    await assertLineBadges();
    await page.setViewport({width:320,height:568,deviceScaleFactor:1});
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-stop-line-badges]')].every(row=>row.scrollWidth<=row.clientWidth+1));
    await assertLineBadges();
    await page.setViewport({width:393,height:851,deviceScaleFactor:1});
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-stop-line-badges]')].every(row=>row.scrollWidth<=row.clientWidth+1));
    await screenshot('stops-full-glass');
    await page.evaluate(()=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim().startsWith('Pokaż więcej (')).click());
    await page.waitForFunction(()=>document.querySelector('[data-virtual-stop-cards]').dataset.totalStops==='80');await assertCards();assert.ok(await page.$$eval('[data-stop-card-id]',els=>els.length)<25,'loading more stops does not inflate DOM');
    await page.$eval('[data-stop-list-scroll]',el=>{el.scrollTop=500;});
    assert.ok(await page.$eval('[data-stop-list-scroll]',el=>el.scrollTop)>=499,'full list scrolls independently');
    await page.click('[aria-label="Zamknij pełną listę przystanków"]');
    await page.waitForSelector('[data-stop-list-mode="preview"]');
    assert.equal(await page.$$eval('[data-stop-card-id]',els=>els.length),30);
    assert.ok(Math.abs(await page.$eval('[data-stop-list-scroll]',el=>el.scrollTop)-previewScroll)<2,'closing restores the previous scroll position');
    // Browser and Android use the same dispatcher. Each press must consume one view.
    await page.evaluate(()=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim().startsWith('Pokaż wszystkie (')).click());
    await page.waitForSelector('[data-full-stop-list]');
    await new Promise(resolve=>setTimeout(resolve,650));
    await page.click('[data-full-stop-list] [data-stop-card-id]');
    await page.waitForSelector('[aria-label="Wróć do listy przystanków"]');
    await page.evaluate(()=>history.back());
    await page.waitForSelector('[data-full-stop-list]');
    assert.equal(await page.$eval('[data-full-stop-list]',el=>el.closest('[aria-hidden]').getAttribute('aria-hidden')),'false','Back from detail stays on stops and restores the full list');
    await page.waitForFunction(()=>history.state?.pksBackGuard===true);
    await page.evaluate(()=>history.back());
    await page.waitForSelector('[data-stop-list-mode="preview"]');
    assert.equal(await page.$eval('[data-stop-list-mode="preview"]',el=>el.closest('[aria-hidden]').getAttribute('aria-hidden')),'false','second Back closes only the full list');
    await new Promise(resolve=>setTimeout(resolve,650));
    await page.$eval('[data-stop-list-scroll]',el=>{el.scrollTop=0;});
    const favorite=await page.evaluate(()=>{const card=document.querySelectorAll('[data-stop-card-id]')[2];return {id:card.dataset.stopCardId,top:card.getBoundingClientRect().top};});
    await page.evaluate(id=>document.querySelector(`[data-stop-card-id="${id}"] [aria-label="Dodaj do ulubionych"]`).click(),favorite.id);
    await page.waitForFunction(id=>{const card=document.querySelector(`[data-stop-card-id="${id}"]`);return card.style.transform&&card.style.transform!=='none';},{},favorite.id);
    await new Promise(resolve=>setTimeout(resolve,650));
    assert.ok(await page.evaluate(id=>document.querySelector(`[data-stop-card-id="${id}"]`).getBoundingClientRect().top,favorite.id)<favorite.top-20,'favourite card moves smoothly to the top');
    await openStops();
    await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--pks-accent').trim()==='#8b5cf6');
    const brandBefore=await style('.transit-stop-card .text-teal-400','color');
    const before=await style('.transit-stop-card .ui-accent-soft','backgroundColor');
    await (await visible('.transit-stop-card [aria-label="Dodaj do ulubionych"]')).click();await visible('.transit-stop-card .ui-accent-fill');
    await overflow();await screenshot('stops-dark-purple');
    await page.evaluate(()=>[...document.querySelectorAll('h3')].find(el=>el.textContent==='Baryczka 69'&&el.getClientRects().length).click());
    await page.waitForSelector('button[data-selected="true"]');
    await page.waitForFunction(()=>document.querySelector('.transit-view').innerText.includes('Rzeszów'));
    assert.equal(await style('.transit-view button.ui-accent-solid','backgroundColor'),'rgb(139, 92, 246)');
    await overflow();await screenshot('departures-dark-purple');
    const themeBeforeCosmos=await page.evaluate(()=>localStorage.getItem('mks_app_theme'));
    await page.evaluate(()=>{localStorage.setItem('mks_app_theme','dark-cosmos');window.dispatchEvent(new Event('pks-profile-applied'));});
    await page.waitForSelector('[data-ui-theme="dark-cosmos"]');
    await page.waitForFunction(()=>document.querySelectorAll('[data-departure-row]').length>0);
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await new Promise(resolve=>setTimeout(resolve,1200));
    assert.equal(await page.$$eval('[data-departure-row]',els=>els.some(el=>el.getAnimations().some(animation=>animation.playState==='running'))),false,'populated Kosmos timetables update without row entrance animations');
    await overflow();await screenshot('departures-dark-cosmos-loaded');
    await page.evaluate(theme=>{if(theme===null)localStorage.removeItem('mks_app_theme');else localStorage.setItem('mks_app_theme',theme);window.dispatchEvent(new Event('pks-profile-applied'));},themeBeforeCosmos);
    await page.waitForFunction(()=>!document.querySelector('.pks-theme-root[data-ui-theme="dark-cosmos"]'));
    const departureDirection=await page.$eval('[data-departure-row] h4',el=>el.textContent);
    const detailedDepartureHeight=await page.$eval('[data-departure-row]',el=>el.getBoundingClientRect().height);
    await page.evaluate(()=>document.documentElement.dataset.personalDepartures='simple');
    assert.ok(await page.$eval('[data-departure-row]',el=>el.getBoundingClientRect().height)<detailedDepartureHeight,'simple departures visibly reduce row height');
    assert.ok(await page.$eval('[data-departure-row]',(el,direction)=>el.innerText.includes(direction),departureDirection),'simple departures keep the direction');
    await page.evaluate(()=>document.documentElement.dataset.personalDepartures='detailed');

    assert.ok(await page.$eval('.transit-view',el=>parseFloat(getComputedStyle(el).paddingBottom))<=90,'departure detail has one compact bottom inset');
    assert.equal(await page.$eval('[data-stop-lines]',el=>parseFloat(getComputedStyle(el).paddingBottom)),0,'line badges do not add a second spacer');
    await accent('Niebieski');
    assert.equal(await style('.transit-view button.ui-accent-solid','backgroundColor'),'rgb(59, 130, 246)');
    await (await visible('[aria-label="Pokaż przystanek na mapie"]')).click();
    await page.waitForSelector('[data-map-stop-sheet]');
    await page.evaluate(()=>history.back());
    await page.waitForFunction(()=>{const button=document.querySelector('[aria-label="Wróć do listy przystanków"]');return button&&button.closest('[aria-hidden]').getAttribute('aria-hidden')==='false';});
    await page.waitForSelector('[data-map-stop-sheet]',{hidden:true});
    assert.equal(await page.$('[data-map-stop-sheet]'),null,'Back from a map preview returns to its stop detail');

    await (await visible('[aria-label="Wróć do listy przystanków"]')).click();
    const after=await style('.transit-stop-card .ui-accent-soft','backgroundColor');
    assert.notEqual(before,after);
    assert.equal(await style('.transit-stop-card .text-teal-400','color'),brandBefore);
    await page.evaluate(()=>localStorage.setItem('mks_app_theme','light'));
    await page.reload({waitUntil:'domcontentloaded'});await openStops();
    await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--pks-accent').trim()==='#3b82f6');
    assert.equal(await page.$eval('.transit-view',el=>el.dataset.uiMode),'light');
    await overflow();await screenshot('stops-light-blue');
    const showStopOnMap=async()=>{
      await page.evaluate(()=>[...document.querySelectorAll('h3')].find(el=>el.textContent==='Baryczka 69'&&el.getClientRects().length).click());
      await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>el.textContent.trim()==='Pokaż na mapie'));
      await button('Pokaż na mapie');
      await page.waitForSelector('[data-map-stop-sheet]');
      await new Promise(resolve=>setTimeout(resolve,600));
    };
    await showStopOnMap();
    assert.equal(await style('.stop-highlight-pin .map-stop-pin','color'),'rgb(20, 184, 166)','show on map uses turquoise for a suburban stop');
    await accent('Fioletowy');
    assert.equal(await page.$eval('.stop-highlight-pin .map-stop-pin',el=>getComputedStyle(el).color),'rgb(20, 184, 166)','stop category colour stays independent of the app accent');
    await accent('Niebieski');
    assert.equal(await page.$eval('[data-map-stop-sheet]',el=>el.dataset.glass),'on','fresh install enables glass');
    assert.equal(await page.$eval('[data-map-stop-sheet]',el=>el.dataset.expanded),'false','show on map opens compact card');
    assert.ok(await page.$eval('[data-map-stop-sheet]',el=>el.getBoundingClientRect().height)<120);
    await page.click('[aria-label="Rozwiń panel przystanku"]');
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-map-stop-sheet] .map-detail-row')].some(el=>el.textContent.includes('Rzeszów')));
    await new Promise(resolve=>setTimeout(resolve,400));
    assert.ok(await page.$eval('[data-map-stop-sheet]',el=>el.getBoundingClientRect().height)<=851*0.42+1);
    const mapBefore=await page.$eval('.leaflet-map-pane',el=>el.style.transform);
    await page.mouse.move(70,330);await page.mouse.down();await page.mouse.move(160,370,{steps:12});await page.mouse.up();
    await page.waitForFunction(before=>document.querySelector('.leaflet-map-pane').style.transform!==before,{},mapBefore);
    assert.equal(await page.$eval('[data-map-stop-sheet]',el=>el.dataset.expanded),'true','panning map retains the expanded sheet');
    await screenshot('map-stop-glass-expanded');
    const handle=await page.$('[aria-label="Zwiń panel przystanku"]');const bounds=await handle.boundingBox();
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+12);await page.mouse.down();const stopExpandedHeight=await page.$eval('[data-map-stop-sheet]',el=>el.getBoundingClientRect().height);await page.mouse.move(bounds.x+bounds.width/2,bounds.y+65,{steps:10});assert.ok(await page.$eval('[data-map-stop-sheet]',el=>el.getBoundingClientRect().height)<stopExpandedHeight-20,'stop sheet follows the finger before release');await page.mouse.up();
    await page.waitForFunction(()=>document.querySelector('[data-map-stop-sheet]').dataset.expanded==='false');
    await page.evaluate(()=>{localStorage.setItem('mks_transparent','false');localStorage.setItem('mks_app_theme','dark-oled');});
    await page.reload({waitUntil:'domcontentloaded'});await openStops();await showStopOnMap();
    assert.equal(await page.$eval('[data-map-stop-sheet]',el=>el.dataset.glass),'off','saved glass preference survives reload');
    await page.click('[aria-label="Rozwiń panel przystanku"]');await screenshot('map-stop-amoled-solid');
    assert.equal(await style('[data-map-stop-sheet]','backgroundColor'),'rgb(20, 29, 38)','AMOLED surfaces use the balanced palette');
    assert.equal(await style('.pks-navigation','backgroundColor'),'rgb(20, 29, 38)','AMOLED navigation shares the surface palette');
    await page.evaluate(()=>localStorage.setItem('mks_transparent','true'));
    await page.reload({waitUntil:'domcontentloaded'});await openStops();await showStopOnMap();
    const oledGlass=await style('[data-map-stop-sheet]','backgroundColor');
    assert.equal(await style('.pks-navigation','backgroundColor'),oledGlass,'AMOLED glass is consistent between navigation and stop panel');
    await screenshot('map-stop-amoled-glass');
    await page.evaluate(()=>localStorage.setItem('mks_app_theme','dark'));
    await page.reload({waitUntil:'domcontentloaded'});await openStops();await showStopOnMap();
    assert.notEqual(await style('[data-map-stop-sheet]','backgroundColor'),oledGlass,'dark and AMOLED have distinct glass palettes');
    assert.equal(await page.$$eval('.map-stop-handle .rounded-2xl',els=>els.length),0,'stop handle retains only the title and arrow');
    await button('Opcje');await page.waitForSelector('[data-options-sheet]');await new Promise(resolve=>setTimeout(resolve,650));
    assert.equal(await page.$eval('[data-options-sheet]',el=>el.dataset.expanded),'true','options open expanded');
    assert.ok(await page.$eval('[data-options-scroll]',el=>el.clientHeight-el.querySelector('[data-options-content]').getBoundingClientRect().height)<24,'general settings fit their content without a blank gap');
    await page.click('[aria-label="Zwiń opcje"]');await new Promise(resolve=>setTimeout(resolve,650));
    const compactHeight=await page.$eval('[data-options-sheet]',el=>el.getBoundingClientRect().height);
    const optionsHandle=await page.$('[aria-label="Rozwiń opcje"]');const optionsBounds=await optionsHandle.boundingBox();
    const handleX=optionsBounds.x+optionsBounds.width/2,handleY=optionsBounds.y+optionsBounds.height/2;
    await page.mouse.move(handleX,handleY);await page.mouse.down();await page.mouse.move(handleX,handleY-70,{steps:8});
    const draggingHeight=await page.$eval('[data-options-sheet]',el=>el.getBoundingClientRect().height);
    assert.ok(draggingHeight>compactHeight+45,'settings follow the pointer before release');
    await page.mouse.up();await page.waitForFunction(()=>document.querySelector('[data-options-sheet]').dataset.expanded==='true');
    assert.equal(await page.$$eval('#options-general-panel input',els=>els.length),3,'general contains only app behaviour and performance preferences');
    assert.equal(await page.$$eval('#options-general-panel input[type="color"],#options-general-panel input[type="range"]',els=>els.length),0,'appearance settings are not repeated under general');
    await page.$eval('[aria-label="Lżejsze efekty"]',el=>el.click());
    await page.waitForFunction(()=>document.querySelector('.pks-theme-root').classList.contains('pks-light-effects'));
    await page.$eval('[aria-label="Lżejsze efekty"]',el=>el.click());
    await page.waitForFunction(()=>!document.querySelector('.pks-theme-root').classList.contains('pks-light-effects'));
    await new Promise(resolve=>setTimeout(resolve,650));await screenshot('options-expanded');
    const expandedHeight=await page.$eval('[data-options-sheet]',el=>el.getBoundingClientRect().height);
    const collapseHandle=await page.$('[aria-label="Zwiń opcje"]');const collapseBounds=await collapseHandle.boundingBox();
    const collapseY=collapseBounds.y+collapseBounds.height/2;
    await page.mouse.move(handleX,collapseY);await page.mouse.down();await page.mouse.move(handleX,collapseY+70,{steps:8});
    assert.ok(await page.$eval('[data-options-sheet]',el=>el.getBoundingClientRect().height)<expandedHeight-45,'settings follow a downward drag before release');
    await page.mouse.up();await page.waitForFunction(()=>document.querySelector('[data-options-sheet]').dataset.expanded==='false');
    await new Promise(resolve=>setTimeout(resolve,650));await screenshot('options-compact');
    await page.mouse.click(4,4);await page.waitForSelector('[role="dialog"]',{hidden:true});
    await button('Opcje');await page.waitForSelector('[data-options-sheet]');
    assert.equal(await page.$eval('[data-options-sheet]',el=>el.dataset.expanded),'true','reopening options expands them again');
    await page.waitForFunction(()=>history.state?.pksBackGuard===true);
    await page.evaluate(()=>history.back());await page.waitForSelector('[data-options-sheet]',{hidden:true});
    // Exercise real preferences against the map, reload persistence and the compact editor.
    const savedAppearance=await page.evaluate(()=>Object.fromEntries(['mks_app_theme','mks_theme','mks_transparent','mks_panel_glow','mks_panel_glow_strength','mks_light_effects','mks_interface_appearance_v1'].map(k=>[k,localStorage.getItem(k)])));
    await button('Opcje');await page.waitForSelector('[data-options-sheet]');
    await stableClick('#options-personal-tab');await page.waitForSelector('[data-interface-preview]');
    assert.ok(await page.$$eval('[data-personalization-panel] details',els=>els.length)>=7);
    const openGroup=async text=>page.evaluate(label=>[...document.querySelectorAll('.personal-group summary')].find(el=>el.textContent.includes(label)).parentElement.open=true,text);
    const choose=async(legend,name)=>page.evaluate((title,label)=>[...document.querySelectorAll('.personal-field')].find(el=>el.querySelector('legend').textContent===title).querySelectorAll('button').forEach(button=>{if(button.textContent.trim()===label)button.click();}),legend,name);
    const range=async(label,key)=>{await page.focus(`[aria-label="${label}"]`);await page.keyboard.press(key);};
    const sameChrome=async()=>{
      await page.waitForFunction(()=>{const actual=document.querySelector('.pks-map-surface'),preview=document.querySelector('[data-interface-preview] .pks-map-surface');return ['backgroundColor','borderTopLeftRadius','borderTopColor','boxShadow','backdropFilter'].every(key=>getComputedStyle(actual)[key]===getComputedStyle(preview)[key]);});
      assert.deepEqual(await page.$eval('[data-interface-preview] svg[data-bus-glyph]',el=>[...el.querySelectorAll('rect,circle')].map(node=>[node.tagName,...['x','y','width','height','rx','cx','cy','r'].map(key=>node.getAttribute(key))])),carrierGeometry,'preview renders the real front-facing bus artwork');
      assert.equal(await page.$eval('.personal-preview-wrap',el=>getComputedStyle(el).position),'relative','preview is not sticky or fixed');
    };
    await sameChrome();
    await openGroup('Miękka poświata');
    assert.equal(await page.$eval('[aria-label="Miękka poświata paneli"]',el=>el.checked),false);
    await page.$eval('[aria-label="Miękka poświata paneli"]',el=>el.click());
    await page.waitForFunction(()=>document.documentElement.dataset.panelGlow==='on');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.pks-map-surface')).backdropFilter==='none');
    const glowBlur=await page.$eval('.pks-map-surface',el=>getComputedStyle(el).backdropFilter);
    await range('Siła miękkiej poświaty','End');
    await page.waitForFunction(()=>localStorage.getItem('mks_panel_glow_strength')==='100');
    await range('Siła miękkiej poświaty','Home');
    await page.waitForFunction(()=>document.documentElement.dataset.panelGlow==='off');
    for(let i=0;i<14;i++)await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>localStorage.getItem('mks_panel_glow_strength')==='70');
    const savedAccent=await page.evaluate(()=>localStorage.getItem('mks_theme'));
    await page.$eval('[aria-label="Kolor poświaty: Fioletowy"]',el=>el.click());
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('mks_interface_appearance_v1')).glowColor==='#8b5cf6');
    assert.equal(await page.$eval('[aria-label="Kolor poświaty: Fioletowy"]',el=>el.getAttribute('aria-pressed')),'true');
    assert.equal(await page.evaluate(()=>localStorage.getItem('mks_theme')),savedAccent,'glow palette is independent from the UI accent');
    assert.equal(await page.$eval('[aria-label="Kolor miękkiej poświaty"]',el=>el.value),'#8b5cf6');
    await page.$eval('[aria-label="Kolor poświaty: Turkusowy"]',el=>el.click());

    assert.equal(await page.$eval('.pks-map-surface',el=>getComputedStyle(el).backdropFilter),glowBlur,'glowing panels keep ordinary painting without stale backdrop clipping');
    await sameChrome();
    for(const selector of ['[data-options-sheet]','.pks-navigation','.personal-group']){
      assert.match(await page.$eval(selector,el=>getComputedStyle(el).backgroundImage),/radial-gradient/,'glow reaches settings, cards and navigation');
    }
    await openGroup('Wzór tła');await choose('Faktura paneli','Kropki');
    await page.waitForFunction(()=>document.documentElement.dataset.personalPattern==='dots');
    for(const selector of ['.pks-map-surface','[data-options-sheet]','.pks-navigation','.personal-group']){
      const background=await page.$eval(selector,el=>getComputedStyle(el).backgroundImage);
      assert.match(background,/radial-gradient/);assert.match(background,/data:image\/svg\+xml/,'texture and glow coexist');
    }
    await choose('Faktura paneli','Gładkie');
    await choose('Zabarwienie paneli','Akcent');
    await range('Siła zabarwienia paneli','End');
    await page.waitForFunction(()=>document.documentElement.dataset.personalSurface==='accent'&&JSON.parse(localStorage.getItem('mks_interface_appearance_v1')).panelTintStrength===55);
    await sameChrome();
    await choose('Styl kart','Wyraźna ramka');
    assert.equal(await page.$eval('.personal-group',el=>getComputedStyle(el).borderTopWidth),'2px');
    await choose('Styl przycisków','Obrys');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.personal-choice[aria-pressed="true"]')).backgroundColor==='rgba(0, 0, 0, 0)');
    assert.equal(await page.$eval('.personal-choice[aria-pressed="true"]',el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    await choose('Styl przycisków','Standardowy');await choose('Styl kart','Standardowy');await choose('Zabarwienie paneli','Według motywu');
    await openGroup('Kształty i głębia');
    await page.focus('[aria-label="Zaokrąglenie paneli"]');await page.keyboard.press('End');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.pks-map-surface')).borderTopLeftRadius==='36px');
    await range('Zaokrąglenie przycisków','Home');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.pks-map-surface input')).borderTopLeftRadius==='0px');
    await range('Widoczność obramowań','End');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.pks-map-surface')).borderTopColor.includes('0.4'));
    await range('Siła cieni','Home');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.pks-map-surface')).boxShadow.includes('rgba(0, 0, 0, 0)'));
    await sameChrome();
    await openGroup('Tekst i czytelność');
    await range('Wielkość tekstu interfejsu','End');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.pks-map-surface .text-lg')).fontSize==='21.6px');
    await choose('Krój pisma','Monospace');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.pks-map-surface')).fontFamily.includes('monospace'));
    await range('Grubość nagłówków','End');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.pks-map-surface .font-extrabold')).fontWeight==='800');
    await openGroup('Szkło i przezroczystość');
    await page.focus('[aria-label="Krycie tła paneli"]');await page.keyboard.press('Home');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.pks-map-surface')).backgroundColor.includes('0.2'));
    await openGroup('Nawigacja i ikony');
    await range('Rozmiar ikon nawigacji','End');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.pks-navigation button > svg')).width==='30px');
    await range('Grubość ikon','End');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.pks-navigation button > svg path')).strokeWidth==='3px');
    await choose('Aktywna zakładka','Miękkie tło');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.pks-navigation button[aria-current="page"]'),'::before').backgroundColor!=='rgba(0, 0, 0, 0)');
    await page.$eval('[aria-label="Podpisy pod ikonami"]',el=>el.click());
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.pks-navigation [data-nav-label]')).display==='none');
    assert.ok(await page.$('.pks-navigation [aria-label="Przystanki"]'),'hidden labels retain accessible navigation names');
    await sameChrome();
    await page.$eval('[aria-label="Podgląd: Przystanek"]',el=>el.click());
    assert.match(await page.$eval('[data-interface-preview]',el=>el.textContent),/Matuszczaka/);
    await openGroup('Kształty i głębia');await range('Zaokrąglenie kart','Home');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-interface-preview] .map-detail-row')).borderTopLeftRadius==='0px');
    await openGroup('Układ i komfort');await choose('Odstępy w kartach','Większe');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-interface-preview] .map-detail-row')).paddingTop==='18px');
    await choose('Styl kart','Wyraźna ramka');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-interface-preview] .map-detail-row')).borderTopWidth==='2px');

    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.documentElement.dataset.personalRadius==='true'&&document.documentElement.dataset.personalLabels==='false'&&getComputedStyle(document.querySelector('.pks-map-surface')).borderTopLeftRadius==='36px');
    assert.equal(await page.$eval('.pks-map-surface',el=>getComputedStyle(el).borderTopLeftRadius),'36px','saved shape survives app restart');
    await page.click('.pks-navigation [aria-label="Opcje"]');await page.waitForSelector('[data-options-sheet]');await stableClick('#options-personal-tab');
    await screenshot('personalization-dark');
    await page.$eval('[data-options-scroll]',el=>el.scrollTo(0,el.scrollHeight));
    assert.ok(await page.$eval('.personal-preview-wrap',el=>el.getBoundingClientRect().bottom)<await page.$eval('[data-options-scroll]',el=>el.getBoundingClientRect().top),'preview scrolls away instead of covering settings');
    await page.$eval('.personal-preview-wrap button',el=>el.click());
    assert.equal(await page.$('[data-interface-preview]'),null,'preview can be hidden');
    await page.$eval('.personal-preview-wrap button',el=>el.click());
    await page.waitForSelector('[data-interface-preview]');
    await page.evaluate(()=>document.querySelector('.personal-presets [aria-label="Zestaw: Czytelny"]').click());
    await page.waitForFunction(()=>document.documentElement.dataset.personalText==='true');
    await page.setViewport({width:320,height:740,deviceScaleFactor:1});
    await screenshot('personalization-light-compact');
    assert.equal(await page.$eval('[data-options-sheet]',el=>el.scrollWidth>el.clientWidth+1),false,'personalization fits a narrow phone');
    assert.ok(await page.$eval('[data-options-scroll]',el=>el.scrollHeight>el.clientHeight),'advanced settings remain scrollable');
    assert.ok(await page.$eval('.personal-reset',el=>{const style=getComputedStyle(el);return style.color!==style.backgroundColor&&style.backgroundColor!=='rgba(0, 0, 0, 0)';}),'reset has a contrasting label and solid surface on a light theme');
    await openGroup('Nawigacja i profile');
    const tools=await page.$('.personal-tools');assert.ok(tools);
    assert.equal(await page.$eval('.personal-order',el=>el.innerText.includes('Admin')),Boolean(await page.$('.pks-navigation [data-nav-item="admin"]')),'tab order only shows Admin when the real navigation grants access');
    assert.equal(await page.$eval('.personal-tools',el=>el.innerText.includes('Zakładka Admin jest widoczna')),false,'tab order has no Admin explanation');
    const visibleTabOrder=await page.$$eval('.personal-order > div > span',els=>els.map(el=>el.textContent));
    await page.$eval('[aria-label="Przesuń Opcje wcześniej"]',el=>el.click());
    assert.deepEqual(await page.$$eval('.personal-order > div > span',els=>els.map(el=>el.textContent)),[...visibleTabOrder.slice(0,-2),'Opcje',visibleTabOrder.at(-2)],'moving skips tabs hidden by permissions');
    await page.$eval('[aria-label="Przesuń Opcje później"]',el=>el.click());
    const chooseTool=async(title,label)=>page.evaluate((title,label)=>[...document.querySelectorAll('.personal-tools .personal-field')].find(el=>el.querySelector('legend').textContent===title)?.querySelectorAll('button').forEach(el=>{if(el.textContent.trim()===label)el.click();}),title,label);
    const startChoices=await page.$$eval('.personal-tools fieldset',fields=>[...fields].find(el=>el.querySelector('legend')?.textContent==='Ekran startowy').innerText);
    assert.ok(!startChoices.includes('Ulubione'),'favourites is absent from start screen choices');
    assert.equal(startChoices.includes('Admin'),visibleTabOrder.includes('Admin'),'Admin start choice follows tab permissions');
    assert.ok(!(await page.$eval('.personal-tools',el=>el.innerText)).includes('Obsługa jedną ręką'),'one-hand mode is removed');
    await chooseTool('Ekran startowy','Przystanki');
    await chooseTool('Podpis znacznika','Przewoźnik');
    await page.$eval('[aria-label="Przesuń Przystanki wcześniej"]',el=>el.click());
    await page.waitForFunction(()=>document.querySelector('.pks-navigation button').dataset.navItem==='stops');
    await page.$eval('.personal-profile-save',el=>el.scrollIntoView({block:'center'}));
    assert.ok(await page.$eval('.personal-profile-save button',el=>el.disabled),'save remains visible and disabled without a name');
    assert.ok(await page.$eval('.personal-profile-save',el=>{const button=el.querySelector('button').getBoundingClientRect(),box=el.getBoundingClientRect();return button.width>0&&button.right<=box.right+1&&button.left>=box.left;}),'save fits next to the name at 320px');
    const transfer=await page.$$eval('[data-appearance-transfer] button',els=>els.map(el=>{const icon=el.querySelector('svg').getBoundingClientRect(),label=el.querySelector('span').getBoundingClientRect(),box=el.getBoundingClientRect();return {display:getComputedStyle(el).display,aligned:Math.abs(icon.y+icon.height/2-label.y-label.height/2)<1,contained:icon.left>=box.left&&label.right<=box.right+1,ordered:icon.right<=label.left};}));
    assert.equal(transfer.length,2);assert.ok(transfer.every(el=>['flex','inline-flex'].includes(el.display)&&el.aligned&&el.contained&&el.ordered),'import/export icons and labels share a centred row and fit a 320px phone');
    await page.$eval('[data-appearance-transfer]',el=>el.scrollIntoView({block:'center'}));await screenshot('appearance-transfer-mobile');
    await page.type('[aria-label="Nazwa własnego zestawu"]','Mój zestaw testowy');
    await page.click('.personal-profile-save button');
    await page.waitForSelector('[aria-label="Zastosuj zestaw Mój zestaw testowy"]');
    await chooseTool('Podpis znacznika','Sama ikona');
    await page.$eval('[aria-label="Zastosuj zestaw Mój zestaw testowy"]',el=>el.click());
    await page.waitForFunction(()=>document.documentElement.dataset.personalMarker==='carrier');
    assert.equal(await page.$eval('.personal-tools',el=>el.scrollWidth>el.clientWidth+1),false,'profile and scheduling controls fit 320px');
    await page.$eval('[aria-label="Usuń zestaw Mój zestaw testowy"]',el=>el.click());
    await page.waitForSelector('[aria-label="Zastosuj zestaw Mój zestaw testowy"]',{hidden:true});
    await page.evaluate(()=>{const original=URL.createObjectURL;URL.createObjectURL=function(blob){if(blob.type==='application/json')window.__appearanceExport=blob.text();return original.call(this,blob);};});
    await page.$$eval('.personal-tools button',els=>els.find(el=>el.textContent.includes('Eksportuj wygląd')).click());
    const exported=await page.evaluate(()=>window.__appearanceExport);assert.equal(JSON.parse(exported).format,'pks-live-appearance');
    const importPath=path.join(root,'appearance-roundtrip.json');fs.writeFileSync(importPath,exported);
    const beforeImport=await page.evaluate(()=>({theme:localStorage.getItem('mks_app_theme'),accent:localStorage.getItem('mks_theme'),appearance:localStorage.getItem('mks_interface_appearance_v1')}));
    await page.evaluate(()=>{localStorage.setItem('mks_app_theme','dark-pink');localStorage.setItem('mks_theme','#22c55e');window.dispatchEvent(new Event('pks-profile-applied'));});
    await (await page.$('[data-appearance-import]')).uploadFile(importPath);
    await page.waitForFunction(()=>[...document.querySelectorAll('[role="status"]')].some(el=>el.textContent.includes('Przywrócono bieżący wygląd')));
    assert.deepEqual(await page.evaluate(()=>({theme:localStorage.getItem('mks_app_theme'),accent:localStorage.getItem('mks_theme'),appearance:localStorage.getItem('mks_interface_appearance_v1')})),beforeImport,'import restores theme, accent and full appearance');
    fs.writeFileSync(importPath,'{}');await (await page.$('[data-appearance-import]')).uploadFile(importPath);
    await page.waitForFunction(()=>[...document.querySelectorAll('[role="status"]')].some(el=>el.textContent.includes('To nie jest obsługiwana kopia')));
    assert.deepEqual(await page.evaluate(()=>({theme:localStorage.getItem('mks_app_theme'),accent:localStorage.getItem('mks_theme'),appearance:localStorage.getItem('mks_interface_appearance_v1')})),beforeImport,'invalid import leaves appearance unchanged');
    await page.evaluate(()=>document.querySelector('.personal-reset').click());
    await page.waitForFunction(()=>document.documentElement.dataset.personalRadius==='false'&&document.documentElement.dataset.personalLabels==='true');
    await openGroup('Nawigacja i ikony');
    await choose('Układ nawigacji','Podpis obok ikony');await choose('Aktywna zakładka','Pełny akcent');
    await page.waitForFunction(()=>document.documentElement.dataset.personalLayout==='inline');
    assert.equal(await page.$eval('.pks-navigation [aria-label="Opcje"]',el=>el.getAttribute('aria-current')),'page');
    assert.equal(await page.$eval('.pks-navigation [aria-label="Opcje"]',el=>getComputedStyle(el).flexDirection),'row');
    assert.notEqual(await page.$eval('.pks-navigation [aria-label="Opcje"]',el=>getComputedStyle(el,'::before').backgroundColor),'rgba(0, 0, 0, 0)');
    assert.equal(await page.$eval('.pks-navigation',el=>el.scrollWidth>el.clientWidth+1),false,'inline navigation fits 320px');
    await openGroup('Tekst i czytelność');await choose('Kontrast tekstu','Mocniejszy');
    await page.waitForFunction(()=>document.documentElement.dataset.personalContrast==='strong');
    assert.equal(await page.$eval('.personal-note',el=>getComputedStyle(el).opacity),'1');
    await openGroup('Wzór tła');await choose('Faktura paneli','Siatka');
    await openGroup('Miękka poświata');await page.$eval('[aria-label="Miękka poświata paneli"]',el=>el.click());
    await page.waitForFunction(()=>document.documentElement.dataset.panelGlow==='on');
    // Saving disables the focused button. Keys must still reach the active dialog.
    await page.evaluate(()=>document.activeElement?.blur());
    await page.keyboard.press('Tab');
    assert.ok(await page.$eval('[data-options-sheet]',el=>el.contains(document.activeElement)),'Tab restores focus to the settings after the focused control becomes disabled');
    await page.evaluate(()=>document.activeElement?.blur());
    await page.keyboard.press('Escape');await page.waitForSelector('[data-options-sheet]',{hidden:true});
    await page.click('.pks-navigation [aria-label="Przystanki"]');await page.waitForSelector('.transit-stop-card');
    for(const selector of ['.transit-surface','.transit-stop-card']){
      const background=await page.$eval(selector,el=>getComputedStyle(el).backgroundImage);
      assert.match(background,/radial-gradient/);assert.match(background,/data:image\/svg\+xml/);
    }
    await screenshot('personalization-stops-texture');
    await page.evaluate(entries=>{for(const [key,value]of Object.entries(entries)){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}},savedAppearance);
    await page.setViewport({width:393,height:851,deviceScaleFactor:1});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.evaluate(()=>{localStorage.setItem('mks_panel_glow','true');localStorage.setItem('mks_panel_glow_strength','70');});
    showFixtureBus=true;
    await page.evaluate(()=>localStorage.setItem('mks_map_state',JSON.stringify({center:{lat:50.14922,lng:21.95757},zoom:12})));
    // A fresh document preserves storage without Chrome's occasional animated reload timeout.
    await page.goto('about:blank');await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForSelector('.leaflet-marker-icon.mks-bus-marker');
    await page.waitForFunction(()=>document.documentElement.dataset.panelGlow==='on'&&localStorage.getItem('mks_panel_glow_strength')==='70');
    assert.deepEqual(await page.$eval('.mks-bus-marker svg[data-bus-glyph]',el=>[...el.querySelectorAll('rect,circle')].map(node=>[node.tagName,...['x','y','width','height','rx','cx','cy','r'].map(key=>node.getAttribute(key))])),carrierGeometry,'map and carrier picker use exactly the same bus geometry');
    await page.setViewport({width:393,height:851,deviceScaleFactor:1});
    await page.evaluate(()=>document.querySelector('.leaflet-marker-icon.mks-bus-marker').click());
    await page.waitForSelector('[data-map-bus-sheet]');
    await page.waitForFunction(()=>{
      const canvas=document.querySelector('.leaflet-routeLine-pane canvas');
      if(!canvas || !canvas.width || !canvas.height)return false;
      const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let painted=0;
      for(let i=3;i<pixels.length;i+=4)if(pixels[i]>100 && ++painted>100)return true;
      return false;
    },{timeout:20000});
    assert.equal(await page.$eval('[data-map-bus-sheet]',el=>el.dataset.expanded),'false','a bus selection opens its compact panel');
    await page.click('[aria-label="Rozwiń panel autobusu"]');
    await page.waitForFunction(()=>document.querySelector('[data-map-bus-sheet]').dataset.expanded==='true');await new Promise(resolve=>setTimeout(resolve,450));const busHandle=await page.$('[aria-label="Zwiń panel autobusu"]');const busBounds=await busHandle.boundingBox();const busHeight=await page.$eval('[data-map-bus-sheet]',el=>el.getBoundingClientRect().height);await page.mouse.move(busBounds.x+30,busBounds.y+12);await page.mouse.down();await page.mouse.move(busBounds.x+30,busBounds.y+62,{steps:8});assert.ok(await page.$eval('[data-map-bus-sheet]',el=>el.getBoundingClientRect().height)<busHeight-20,'bus sheet follows finger');await page.mouse.up();await page.waitForFunction(()=>document.querySelector('[data-map-bus-sheet]').dataset.expanded==='false');await page.click('[aria-label="Rozwiń panel autobusu"]');
    await page.evaluate(()=>document.querySelector('.leaflet-marker-icon.mks-bus-marker').click());
    await page.waitForFunction(()=>document.querySelector('[data-map-bus-sheet]').dataset.expanded==='false');
    await screenshot('bus-compact');
    await page.waitForFunction(()=>history.state?.pksBackGuard===true);
    await page.evaluate(()=>history.back());await page.waitForSelector('[data-map-bus-sheet]',{hidden:true});
    fixtureBus=structuredClone(require('./fixtures/pks-251-107-2026-10-08.json'));
    fixtureBus.position.position_date='2026-10-06 14:18:30';fixtureBus.journey.vehicle_journey_date='2026-10-06';
    fixtureBus.journey.departure_time='14:15:00';
    fixtureBus.next_stop_points=fixtureBus.next_stop_points.map((stop,index)=>({...stop,planned_departure_time:`2026-10-06 14:${String(25+index).padStart(2,'0')}:00`,real_departure_time:`2026-10-06 14:${String(25+index).padStart(2,'0')}:00`}));
    await page.evaluate(()=>localStorage.setItem('mks_map_state',JSON.stringify({center:{lat:49.925,lng:21.963},zoom:12})));
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.leaflet-marker-icon.mks-bus-marker');
    await page.evaluate(()=>document.querySelector('.leaflet-marker-icon.mks-bus-marker').click());await page.waitForSelector('[data-map-bus-sheet]');
    assert.match(await page.$eval('[data-map-bus-sheet]',el=>el.textContent),/251/);
    await page.waitForFunction(()=>{
      const canvas=document.querySelector('.leaflet-routeLine-pane canvas');if(!canvas?.width||!canvas?.height)return false;
      const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let painted=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>100&&++painted>100)return true;return false;
    },{timeout:20000});
    await screenshot('pks-251-107-route');
    await page.click('[aria-label="Rozwiń panel autobusu"]');
    await page.waitForSelector('[data-route-stop-id="5324"]');
    await page.$eval('[data-route-stop-id="5324"]',el=>el.click());
    await page.waitForSelector('.stop-highlight-pin .map-stop-pin');
    assert.equal(await page.$eval('.stop-highlight-pin .map-stop-pin',el=>getComputedStyle(el).color),'rgb(20, 184, 166)',
      'a city stop selected from a PKS timetable follows the turquoise route');
    showFixtureBus=false;showMarcel=true;
    await page.evaluate(()=>{localStorage.setItem('mks_transport_providers',JSON.stringify(['marcel']));localStorage.setItem('mks_map_state',JSON.stringify({center:{lat:49.95,lng:21.88},zoom:12}));});
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.leaflet-marker-icon.mks-bus-marker');
    await page.evaluate(()=>document.querySelector('.leaflet-marker-icon.mks-bus-marker').click());await page.waitForSelector('[data-map-bus-sheet]');
    assert.match(await page.$eval('[data-map-bus-sheet]',el=>el.textContent),/Rzeszów/);
    await page.waitForFunction(()=>{const canvas=document.querySelector('.leaflet-routeLine-pane canvas');if(!canvas?.width||!canvas?.height)return false;const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let painted=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>100&&++painted>100)return true;return false;},{timeout:20000});
    assert.equal(marcelSecondary,0,'the complete known Marcel course paints from local road assets without an external router');
    await screenshot('marcel-jaslo-rzeszow-route');
    await page.click('[aria-label="Rozwiń panel autobusu"]');
    await page.waitForSelector('[data-map-bus-sheet] [data-route-stop-id]');
    await page.evaluate(()=>document.querySelector('[data-map-bus-sheet] [data-route-stop-id]').click());
    await page.waitForSelector('.stop-highlight-pin .map-stop-pin');
    assert.equal(await page.$eval('.stop-highlight-pin .map-stop-pin',el=>getComputedStyle(el).color),'rgb(104, 196, 74)','Marcel route stop pin matches its green route');
    await screenshot('marcel-route-green-pin');
    await page.goto(`${origin}/maintenance/`,{waitUntil:'domcontentloaded'});await page.waitForSelector('[data-transport-diagnostics]');
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>el.textContent.trim()==='Dodaj'&&!el.disabled));
    await button('Dodaj');
    await page.waitForFunction(()=>document.querySelector('[aria-label="Adres API"]').value==='');
    await page.click('[aria-label="Nazwa endpointu"]',{clickCount:3});await page.type('[aria-label="Nazwa endpointu"]','Backup UI');
    await page.type('[aria-label="Adres API"]','https://backup.example');
    await button('Testuj ponownie');
    await page.waitForFunction(()=>window.__maintenanceCalls.some(call=>call.name==='testMaintenanceEndpoint'&&call.data.url==='https://backup.example'));
    await page.waitForFunction(()=>[...document.querySelectorAll('[role="status"]')].some(el=>el.textContent.includes('Połączenie z API działa')));
    await button('Zapisz zmiany');
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>el.textContent.trim()==='Ustaw jako aktywny'&&!el.disabled));
    await button('Ustaw jako aktywny');
    await page.waitForFunction(()=>window.__maintenanceCalls.some(call=>call.name==='setActiveMaintenanceEndpoint'&&call.data.endpointId==='created-endpoint'));
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>el.textContent.trim()==='Przywróć poprzedni endpoint'&&!el.disabled));
    await button('Przywróć poprzedni endpoint');
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>el.textContent.trim()==='Wyłącz endpoint'&&!el.disabled));
    await button('Wyłącz endpoint');
    await page.waitForFunction(()=>[...document.querySelectorAll('label')].some(el=>el.textContent.includes('Endpoint włączony')&&!el.querySelector('input').checked));
    await page.evaluate(()=>[...document.querySelectorAll('label')].find(el=>el.textContent.includes('Endpoint włączony')).querySelector('input').click());
    await button('Zapisz zmiany');
    await page.waitForFunction(()=>window.__maintenanceCalls.some(call=>call.name==='saveMaintenanceEndpoint'&&call.data.endpoint.id==='created-endpoint'&&call.data.endpoint.enabled));
    await screenshot('maintenance-mobile');
    await button('Historia zmian');await page.waitForFunction(()=>document.body.innerText.includes('rollbackMaintenanceEndpoint'));
    const fitDialog=async()=>{
      await page.waitForSelector('.admin-modal-overlay');await new Promise(resolve=>setTimeout(resolve,450));
      const box=await page.evaluate(()=>{const overlay=document.querySelector('.admin-modal-overlay'),card=overlay.firstElementChild,r=card.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:innerHeight,width:innerWidth};});
      assert.ok(box.top>=10&&box.bottom<=box.height-10,JSON.stringify(box));assert.ok(box.left>=10&&box.right<=box.width-10,JSON.stringify(box));
    };
    await fitDialog();
    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.admin-modal-overlay div')].some(el=>el.scrollWidth>el.clientWidth+1)),false,'History must fit long endpoint and action names');
    await screenshot('admin-history-mobile');
    await button('Wyczyść historię');await page.waitForFunction(()=>document.body.innerText.includes('Potwierdź usunięcie historii'));
    await button('Anuluj');assert.ok(await page.$eval('.admin-modal-overlay',el=>el.innerText.includes('rollbackMaintenanceEndpoint')));
    await button('Wyczyść historię');await button('Potwierdź usunięcie historii');
    await page.waitForFunction(()=>document.querySelector('.admin-modal-overlay').innerText.includes('Brak historii zmian.'));
    assert.ok(await page.evaluate(()=>window.__maintenanceCalls.some(call=>call.name==='clearMaintenanceHistory')));
    await page.goto(`${origin}/dialog-fixture/`,{waitUntil:'domcontentloaded'});
    await fitDialog();
    const shield=await page.evaluate(()=>{const el=document.querySelector('.admin-modal-overlay .lucide-shield');const r=el.getBoundingClientRect(),parent=el.parentElement.getBoundingClientRect();return {w:r.width,h:r.height,pw:parent.width,ph:parent.height};});
    assert.equal(shield.w,24);assert.equal(shield.h,24);assert.equal(shield.pw,shield.ph);
    const checkSave=async()=>{const result=await page.evaluate(()=>{const buttons=[...document.querySelectorAll('.admin-modal-overlay button')];const b=buttons.find(el=>el.textContent.trim()==='Zapisz zmiany'),r=b.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight,covered:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)!==b};});assert.ok(result.top>=0&&result.bottom<=result.height,JSON.stringify(result));assert.equal(result.covered,false);};
    await checkSave();await screenshot('admin-roles-mobile');

    await page.setViewport({width:320,height:568,deviceScaleFactor:1,isMobile:true,hasTouch:true});await fitDialog();await checkSave();
    await page.setViewport({width:393,height:400,deviceScaleFactor:1,isMobile:true,hasTouch:true});await fitDialog();await checkSave();await screenshot('admin-roles-keyboard-height');
    await page.waitForSelector('[data-permission="statistics"]');
    assert.equal(await page.$eval('[data-permission="statistics"]',el=>el.disabled),false);
    await page.$eval('[data-permission="statistics"]',el=>el.click());
    assert.equal(await page.$eval('[data-permission="statistics"]',el=>el.getAttribute('aria-pressed')),'false');
    await button('WŁAŚCICIEL');
    assert.equal(await page.$eval('[data-permission="statistics"]',el=>el.disabled),true);
    assert.equal(await page.$eval('[data-permission="statistics"]',el=>el.getAttribute('aria-pressed')),'true');
    assert.ok(await page.$eval('[data-permission="statistics"]',el=>Number(getComputedStyle(el).opacity)<1));
    await button('ADMIN');
    await page.waitForFunction(()=>{const el=document.querySelector('[data-permission="statistics"]');return !el.disabled&&el.getAttribute('aria-pressed')==='true';});
    await page.$eval('[data-permission="statistics"]',el=>el.click());
    await page.waitForFunction(()=>document.querySelector('[data-permission="statistics"]').getAttribute('aria-pressed')==='false');

    await button('Zapisz zmiany');await page.waitForFunction(()=>!document.querySelector('.admin-modal-overlay'));assert.equal(await page.evaluate(()=>window.__savedRole.permissions.statistics),false);await button('Ban');await fitDialog();
    await page.evaluate(()=>{const body=document.querySelector('.admin-modal-overlay .overflow-y-auto');body.scrollTop=body.scrollHeight;});
    await button('ZABLOKUJ URZĄDZENIE');await page.waitForFunction(()=>!document.querySelector('.admin-modal-overlay'));
    console.log('Browser: real role, ban and history dialogs escape transformed parents, fit small phones and keyboard height, stay above navigation and keep the shield square.');
    await page.goto(`${origin}/light-dialog-fixture/`,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('[data-permission="statistics"]');
    assert.equal(await page.$eval('[data-permission="statistics"]',el=>getComputedStyle(el).opacity),'1');
    assert.equal(await page.$eval('[data-permission="statistics"]',el=>getComputedStyle(el).filter),'none');
    assert.equal(await page.$eval('[aria-label="Edycja uprawnień"] input',el=>getComputedStyle(el,'::placeholder').color),'rgb(51, 65, 85)');
    await screenshot('admin-roles-light');
    await page.$eval('[aria-label="Edycja uprawnień"] button',el=>el.click());
    await button('Ban');await page.evaluate(()=>[...document.querySelectorAll('button')].find(el=>el.textContent.includes('Dodaj obrazek')).click());await page.waitForSelector('input[type="file"]');
    const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
    const gifPath=path.join('test/ui-previews','ban-test.gif');fs.writeFileSync(gifPath,gif);
    await (await page.$('input[type="file"]')).uploadFile(gifPath);
    await page.waitForFunction(()=>document.querySelector('img[alt="Podgląd obrazka blokady"]')?.complete);
    assert.equal(await page.$eval('img[alt="Podgląd obrazka blokady"]',el=>el.src),'data:image/gif;base64,'+gif.toString('base64'));
    await button('ZABLOKUJ URZĄDZENIE');
    assert.equal(await page.evaluate(()=>window.__banUrl),'data:image/gif;base64,'+gif.toString('base64'),'saved ban retains the original GIF');
    await page.evaluateOnNewDocument(()=>{const original=window.setTimeout.bind(window);window.setTimeout=((callback,delay,...args)=>original(callback,delay===30000?100:delay,...args));});
    await page.goto(`${origin}/startup-fixture/`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.body.innerText.includes('Przekroczono czas połączenia'));
    await page.waitForSelector('[data-restored-role="owner"]');
    assert.ok(await page.$eval('[data-restored-role]',el=>el.innerText.includes('owner')));
    assert.equal(await page.evaluate(()=>document.body.innerText.includes('Przekroczono czas połączenia')),false);
    await page.evaluate(()=>window.__startupTest.grants());
    await page.waitForFunction(()=>window.__startupTest.profile()?.role==='admin');
    assert.deepEqual(await page.evaluate(()=>window.__startupTest.profile().permissions),{monitor:true,canBan:false});
    const profileWrites=await page.evaluate(()=>window.__startupTest.writes());await page.evaluate(()=>window.__startupTest.heartbeat());
    assert.equal(await page.evaluate(()=>window.__startupTest.writes()),profileWrites,'heartbeats must not overwrite saved grants');
    await page.evaluate(()=>window.__startupTest.deleteDevice());
    await page.waitForSelector('[data-restored-role="user"]');
    assert.equal(await page.evaluate(()=>window.__startupTest.profile()?.role),'user','deleted administrator re-registers without the revoked rank');
    assert.equal(await page.evaluate(()=>window.__startupTest.profile()?.verified),false);
    console.log('Browser: deleting both admin device and installation revokes admin immediately and re-registers as an unverified user without a stuck loading screen.');
    console.log('Browser: real FirebaseProvider recovers after startup deadline and restores owner despite old Firestore rules without reload or downgrade.');
    await page.evaluate(()=>localStorage.setItem('mks_app_theme','dark'));
    await page.goto(`${origin}/startup-home/`,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('.pks-navigation [data-nav-item="admin"]');
    await page.click('.pks-navigation [data-nav-item="admin"]');
    await page.waitForSelector('.admin-topbar');

    for(const [mode,color] of [['dark-forest','rgb(25, 67, 51)'],['light-sky','rgb(174, 219, 250)'],['dark-cosmos','rgb(2, 3, 6)']]){
      await page.evaluate(mode=>{localStorage.setItem('mks_app_theme',mode);window.dispatchEvent(new Event('pks-profile-applied'));},mode);
      await page.waitForSelector(`[data-ui-theme="${mode}"]`);await page.waitForFunction(color=>getComputedStyle(document.querySelector('.admin-topbar')).backgroundColor===color,{},color);
      if(mode==='dark-forest')assert.equal(await page.$eval('.pks-panel-scope input[placeholder="Szukaj..."]',el=>getComputedStyle(el,'::placeholder').color),'rgb(183, 216, 195)','forest admin hints use the readable muted palette');
      await screenshot('admin-'+mode);
    }
    await page.evaluate(()=>{localStorage.setItem('mks_app_theme','dark');window.dispatchEvent(new Event('pks-profile-applied'));});await page.waitForSelector('[data-ui-theme="dark"]');
    const adminBeforePink=await page.$eval('.admin-topbar',el=>getComputedStyle(el).backgroundColor);
    await page.evaluate(()=>{localStorage.setItem('mks_app_theme','light-pink');window.dispatchEvent(new Event('pks-profile-applied'));});
    await page.waitForSelector('[data-ui-theme="light-pink"]');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.admin-topbar')).backgroundColor==='rgb(255, 184, 219)');
    assert.ok(backgroundSvgs(await page.$eval('.admin-topbar',el=>getComputedStyle(el).backgroundImage)).some(svg=>svg.includes('id="heart"')));
    assert.equal(await page.$eval('.admin-light .pks-personal-card',el=>getComputedStyle(el).backgroundColor),'rgb(255, 184, 219)');
    await screenshot('admin-pink-hearts');
    await page.evaluate(()=>{localStorage.setItem('mks_app_theme','dark');window.dispatchEvent(new Event('pks-profile-applied'));});
    await page.waitForSelector('[data-ui-theme="dark"]');
    await page.waitForFunction(color=>getComputedStyle(document.querySelector('.admin-topbar')).backgroundColor===color,{},adminBeforePink);
    await page.evaluate(()=>window.__startupTest.revoke());
    await page.waitForSelector('.admin-topbar',{hidden:true});
    await page.waitForFunction(()=>document.querySelector('.pks-navigation [data-nav-item="map"]')?.getAttribute('aria-current')==='page');
    assert.equal(await page.$('.pks-navigation [data-nav-item="admin"]'),null,'revoked admin tab disappears');
    await screenshot('admin-revoked-map');

    await page.setViewport({width:393,height:851,deviceScaleFactor:1});
    await page.evaluate(()=>localStorage.setItem('pks-live:api-statistics:v1',JSON.stringify({version:1,startedAt:Date.now(),days:[{date:'2026-10-06',providers:{pks:{requests:80,errors:2,latencyMs:16000},mpk_rzeszow:{requests:15,errors:1,latencyMs:3000},marcel:{requests:5,errors:0,latencyMs:1000}}}]})));
    await page.goto(`${origin}/statistics-fixture/`,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('[data-statistics-fixture-ready="true"]');
    await button('Otwórz menu testowe');await page.waitForFunction(()=>{const r=document.querySelector('nav button:nth-child(2)').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;});await page.click('nav button:nth-child(2)');await page.waitForSelector('[data-statistics-view]');
    await page.waitForFunction(()=>document.querySelector('[data-statistic="Zapytania API"]').textContent==='100');
    assert.equal(await page.$eval('[data-statistic="Nowe urządzenia"]',el=>el.textContent),'2');
    assert.equal(await page.$eval('[data-statistic="Aktywne urządzenia"]',el=>el.textContent),'2');
    assert.equal(await page.$eval('[data-statistic="Skuteczność API"]',el=>el.textContent),'97%');
    const statisticsFits=async()=>assert.equal(await page.$eval('[data-statistics-view]',el=>el.scrollWidth>el.clientWidth+1),false,'Statistics must fit without horizontal overflow');
    await statisticsFits();await screenshot('statistics-dark-mobile');
    const headerStyle=await page.$eval('[data-statistics-view] header',el=>({position:getComputedStyle(el).position,background:getComputedStyle(el).backgroundColor}));
    assert.ok(!['fixed','sticky'].includes(headerStyle.position));assert.equal(headerStyle.background,'rgba(0, 0, 0, 0)');
    await page.$eval('[data-statistics-view]',el=>el.scrollTop=400);
    await page.waitForFunction(()=>document.querySelector('[data-statistics-view] header').getBoundingClientRect().bottom<document.querySelector('[data-statistics-view]').getBoundingClientRect().top);
    await screenshot('statistics-header-scrolled-away');await page.$eval('[data-statistics-view]',el=>el.scrollTop=0);

    await button('90 dni');assert.equal(await page.$$eval('[data-statistics-chart="requests"] rect[role="button"]',nodes=>nodes.length),90);
    await button('Dzisiaj');assert.equal(await page.$$eval('[data-statistics-chart="installations"] rect[role="button"]',nodes=>nodes.length),1);
    await button('7 dni');
    await page.evaluate(()=>{URL.createObjectURL=blob=>{blob.text().then(text=>window.__statisticsCsv=text);return 'blob:test-statistics';};HTMLAnchorElement.prototype.click=()=>{};});
    await button('Eksport CSV');await page.waitForFunction(()=>window.__statisticsCsv);
    const csv=await page.evaluate(()=>window.__statisticsCsv);assert.match(csv,/2026-10-06;2;100;3/);assert.ok(!csv.includes('same'));
    await button('Zmień motyw testowy');await statisticsFits();await screenshot('statistics-light-mobile');
    await page.setViewport({width:320,height:568,deviceScaleFactor:1});await statisticsFits();await screenshot('statistics-small-phone');
    await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});await statisticsFits();await screenshot('statistics-desktop');
    await page.click('nav button:first-child');await page.waitForFunction(()=>!document.querySelector('[data-statistics-view]'));
    await page.click('nav button:nth-child(2)');await page.waitForSelector('[data-statistics-view]');
    // Admin statistics keeps solid surfaces even with personalised glass enabled.
    await page.evaluate(()=>{document.documentElement.dataset.personalGlass='true';document.documentElement.style.setProperty('--personal-glass','rgba(255,255,255,.2)');});
    for(const theme of ['dark-forest','light-sky','light-pink','dark-cosmos']){
      await page.click(`[data-statistics-theme="${theme}"]`);
      await page.waitForSelector(`[data-ui-theme="${theme}"]`);
      const surfaces=await page.$eval('[data-statistics-view]',el=>{
        const root=getComputedStyle(el),card=getComputedStyle(el.querySelector('.pks-personal-card'));
        return {root:root.backgroundColor,card:card.backgroundColor,blur:card.backdropFilter,decoration:card.backgroundImage,canvas:getComputedStyle(el.closest('.pks-theme-root')).backgroundImage};
      });
      if(theme==='dark-cosmos'){assert.equal(surfaces.root,'rgba(0, 0, 0, 0)','statistics reveals the shared cosmic canvas');assert.equal(surfaces.card,'rgb(2, 3, 6)','cosmic statistics cards use opaque black backgrounds for readability');}else{assert.ok(surfaces.root.startsWith('rgb('),'statistics background is fully opaque: '+theme);assert.ok(surfaces.card.startsWith('rgb('),'statistics cards are fully opaque: '+theme);}
      assert.equal(surfaces.blur,'none');
      if(theme==='dark-cosmos')assert.ok(surfaces.canvas.includes('sky-cloud')&&surfaces.canvas.includes('/themes/kosmos/deep-space-'),'statistics has celestial artwork on the canvas as well as cards');
      else assert.ok(backgroundSvgs(surfaces.decoration).length>0,'statistics uses the selected theme decoration: '+theme);
      await statisticsFits();await screenshot('statistics-'+theme);
    }
    console.log('Browser: statistics navigation, unique installations, local API totals, date ranges, CSV, light/dark and 320px mobile layouts passed without backend writes.');
    await page.setViewport({width:393,height:851,deviceScaleFactor:1});
    await page.goto(`${origin}/widget-fixture/`,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('[data-widget-preview]');
    assert.equal(await page.$('#widget-transparency'),null,'advanced widget options start collapsed');
    const assertDelaySpacing=async()=>{
      const spacing=await page.$eval('[data-widget-delay]',el=>{
        const badge=el.getBoundingClientRect(),row=el.closest('[data-widget-departure]').getBoundingClientRect(),time=el.previousElementSibling.getBoundingClientRect();
        return {below:row.bottom-badge.bottom,above:badge.top-time.bottom};
      });
      assert.ok(spacing.below>=1.5,'delay badge leaves room above the separator');
      assert.ok(spacing.above>=1.5,'delay badge leaves room below the departure time');
    };
    await assertDelaySpacing();
    await screenshot('widget-default-dark');
    await page.evaluate(()=>[...document.querySelectorAll('button')].find(el=>el.textContent.includes('Więcej opcji personalizacji')).click());
    await page.waitForSelector('#widget-transparency');
    assert.equal(await page.$eval('[aria-label="Miękkie tło widżetu"]',el=>el.checked),false);
    await page.$eval('[aria-label="Miękkie tło widżetu"]',el=>el.click());
    await page.waitForFunction(()=>document.querySelector('[data-widget-preview]').style.background.includes('radial-gradient'));
    await page.focus('#widget-soft-background-strength');await page.keyboard.press('End');
    await page.waitForFunction(()=>document.querySelector('#widget-soft-background-strength').value==='100');
    await screenshot('widget-soft-background');
    await page.focus('#widget-transparency');await page.keyboard.press('End');
    await page.waitForFunction(()=>(document.querySelector('[data-widget-preview]').style.background.match(/rgba\([^)]*, 0\)/g)||[]).length===2);
    assert.equal(await page.$eval('[data-widget-preview]',el=>getComputedStyle(el).opacity),'1','full transparency affects background, not text');
    await page.focus('#widget-transparency');await page.keyboard.press('Home');
    await page.waitForFunction(()=>document.querySelector('#widget-transparency').value==='0');
    await page.click('[aria-label="Akcent: Fiolet"]');
    const changeInput=async(selector,value)=>page.$eval(selector,(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);
    await changeInput('#widget-custom-accent','#ee00aa');
    await page.waitForFunction(()=>document.querySelector('#widget-custom-accent').value==='#ee00aa'&&document.body.textContent.includes('#EE00AA'));
    await page.focus('#widget-radius');await page.keyboard.press('Home');
    await page.waitForFunction(()=>document.querySelector('[data-widget-preview]').style.borderRadius==='0px');
    await button('Większy');await button('Kompaktowe');await button('Kolor akcentu');
    await page.evaluate(()=>[...document.querySelectorAll('label')].find(el=>el.textContent.trim()==='Pokazuj kierunki').querySelector('input').click());
    assert.ok(!(await page.$eval('[data-widget-preview]',el=>el.textContent)).includes('Rzeszów D.A.'));
    assert.match(await page.$eval('[data-widget-preview]',el=>el.textContent),/\+1 min/);
    await assertDelaySpacing();
    await page.evaluate(()=>[...document.querySelectorAll('label')].find(el=>el.textContent.trim()==='Pokazuj opóźnienie w minutach').querySelector('input').click());
    assert.doesNotMatch(await page.$eval('[data-widget-preview]',el=>el.textContent),/\+1 min/);
    await page.setViewport({width:320,height:568,deviceScaleFactor:1});
    assert.equal(await page.$eval('[role="dialog"]',el=>el.scrollWidth>el.clientWidth+1),false);
    await button('Przywróć domyślny wygląd');
    await page.waitForFunction(()=>document.querySelector('#widget-transparency').value==='20'&&document.querySelector('[data-widget-preview]').style.borderRadius==='24px');
    await button('Jasny');
    assert.equal(await page.$eval('[data-widget-preview]',el=>getComputedStyle(el).color),'rgb(15, 23, 42)');
    await assertDelaySpacing();
    await screenshot('widget-personalization-small-phone');
    await page.click('[aria-label="Zamknij okno widżetu"]');
    await page.waitForSelector('[role="dialog"]',{hidden:true});
    assert.deepEqual(errors,[]);
    console.log('Browser: widget advanced options start collapsed; transparency, custom accents, corners, density, text, direction/delay toggles, defaults and light theme update the preview without mobile overflow.');
    const loginPage=await browser.newPage();
    loginPage.on('pageerror',error=>errors.push(error.message));
    await loginPage.goto(origin+'/login-fixture/',{waitUntil:'domcontentloaded'});
    await loginPage.waitForSelector('[data-login-open]',{timeout:15000});
    await loginPage.evaluate(()=>window.__startupTest.loginPolicy(false));
    await loginPage.waitForSelector('[data-login-blocked]');
    assert.equal(await loginPage.$('[data-login-open]'),null);
    for(const [role,verified] of [['user',true],['admin',false],['owner',false]]){
      await loginPage.evaluate((role,verified)=>window.__startupTest.loginPolicy(false,role,verified),role,verified);
      await loginPage.waitForSelector('[data-login-open]');
      assert.equal(await loginPage.$('[data-login-blocked]'),null);
      await loginPage.evaluate(()=>window.__startupTest.loginPolicy(false));
      await loginPage.waitForSelector('[data-login-blocked]');
    }
    await loginPage.evaluate(()=>window.__startupTest.loginPolicy(true));
    await loginPage.waitForSelector('[data-login-open]');
    await loginPage.evaluate(()=>window.__startupTest.loginPolicy(false,'user',false,true));
    await loginPage.waitForSelector('[data-login-open]');
    for(const width of [320,393,1024]){
      await loginPage.setViewport({width,height:800,deviceScaleFactor:1});
      const pending=await loginPage.evaluate(()=>[...document.querySelectorAll('[data-login-pending]')].filter(el=>el.getBoundingClientRect().width>0).map(el=>({text:el.textContent,right:el.getBoundingClientRect().right,left:el.getBoundingClientRect().left,overflow:el.scrollWidth>el.clientWidth+1})));
      assert.ok(pending.length>0);
      for(const label of pending){assert.equal(label.text,'Oczekuje na dostęp');assert.ok(label.left>=0&&label.right<=width);assert.equal(label.overflow,false);}
      assert.equal(await loginPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      await loginPage.screenshot({path:'test/ui-previews/login-pending-'+width+'.png'});
    }
    await loginPage.screenshot({path:'test/ui-previews/login-pending-device.png'});
    assert.deepEqual(errors,[]);
    await loginPage.close();
    const cosmosPage=await browser.newPage();cosmosPage.on('pageerror',e=>errors.push(e.message));await cosmosPage.setViewport({width:393,height:851,deviceScaleFactor:1});
    await cosmosPage.evaluateOnNewDocument(()=>{const Base=Date,now=Date.now();window.Date=class extends Base{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};});
    await cosmosPage.goto(origin);await cosmosPage.evaluate(()=>{localStorage.setItem('mks_app_theme','dark-cosmos');localStorage.setItem('mks_light_effects','false');localStorage.removeItem('mks_interface_appearance_v1');});
    await cosmosPage.goto(origin+'/cosmos-fixture/',{waitUntil:'domcontentloaded'});
    await cosmosPage.waitForFunction(()=>document.querySelectorAll('[data-departure-row]').length===5);
    await cosmosPage.evaluate(()=>[...document.querySelectorAll('button')].find(node=>node.textContent.includes('Pokaż wszystkie odjazdy')).click());
    await cosmosPage.waitForFunction(()=>document.querySelectorAll('[data-departure-row]').length===40);
    const expandedPaint=await cosmosPage.$eval('[data-cosmic-expanded="true"]',node=>{const style=getComputedStyle(node.closest('.pks-theme-root'));return {image:style.backgroundImage,repeat:style.backgroundRepeat,size:style.backgroundSize};});
    assert.ok(expandedPaint.image.includes('sky-cloud')&&expandedPaint.image.includes('/themes/kosmos/deep-space-'),'expanded timetables retain celestial artwork outside their rows');
    // Check rendered pixels, not only declared CSS. Long schedules must keep
    // visible decoration even far beyond the first background image.
    const {PNG}=require('pngjs');
    for(const [label,fraction] of [['top',0],['middle',.5],['bottom',1]]){
      await cosmosPage.$eval('.transit-view',(node,fraction)=>node.scrollTop=(node.scrollHeight-node.clientHeight)*fraction,fraction);
      await cosmosPage.waitForFunction(()=>[...document.querySelectorAll('[data-departure-row]')].every(node=>node.dataset.cosmicScene));
      await new Promise(resolve=>setTimeout(resolve,650));
      const visible=await cosmosPage.$$eval('[data-departure-row]',nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()).filter(r=>r.top>=4&&r.bottom<=innerHeight-4));
      assert.ok(visible.length>=3,'several complete departure rows are visible at '+label);
      const samples=[visible[0],visible[Math.floor(visible.length/2)],visible[visible.length-1]];
      const decorated=PNG.sync.read(Buffer.from(await cosmosPage.screenshot({path:'test/ui-previews/cosmos-departures-'+label+'.png'})));
      await cosmosPage.$$eval('[data-departure-row]',nodes=>nodes.forEach(node=>node.style.setProperty('background-image','none','important')));
      const plain=PNG.sync.read(Buffer.from(await cosmosPage.screenshot()));
      await cosmosPage.$$eval('[data-departure-row]',nodes=>nodes.forEach(node=>node.style.removeProperty('background-image')));
      for(const rect of samples){
        let changed=0;
        for(let y=Math.ceil(rect.top+5);y<Math.floor(rect.bottom-5);y++)for(let x=Math.ceil(rect.left+5);x<Math.floor(rect.right-5);x++){
          const at=(y*decorated.width+x)*4;
          if(Math.max(...[0,1,2].map(c=>Math.abs(decorated.data[at+c]-plain.data[at+c])))>=8)changed++;
        }
        assert.ok(changed>=25,'visible celestial pixels in every sampled row at '+label+': '+changed);
      }
    }
    const departureArtwork=()=>cosmosPage.$$eval('[data-departure-row]',nodes=>nodes.map(n=>[n.dataset.cosmicPanel,n.style.getPropertyValue('--cosmos-star-position')]));
    const departureBeforeRefresh=await departureArtwork();
    await cosmosPage.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pks-interface-appearance'));});
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.deepEqual(await departureArtwork(),departureBeforeRefresh,'row decorations survive refreshes');
    await cosmosPage.goto(origin+'/cosmos-operators-fixture/',{waitUntil:'domcontentloaded'});
    await cosmosPage.waitForFunction(()=>document.querySelectorAll('[data-cosmic-panel^="admin-operator:"][data-cosmic-scene]').length===3);
    for(const width of [320,393,707]){
      await cosmosPage.setViewport({width,height:851,deviceScaleFactor:1});
      await new Promise(resolve=>setTimeout(resolve,300));
      const cards=await cosmosPage.$$eval('[data-cosmic-panel^="admin-operator:"]',nodes=>nodes.map(n=>({key:n.dataset.cosmicScene,planet:n.style.getPropertyValue('--cosmos-planet'),image:getComputedStyle(n).backgroundImage,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right,stars:n.style.getPropertyValue('--cosmos-star-position')})));
      assert.equal(new Set(cards.map(c=>c.key)).size,3,'operator cards use distinct stable identities');
      assert.ok(new Set(cards.map(c=>c.stars)).size>1,'operator cards do not repeat one composition');
      assert.ok(cards.every(c=>c.planet==='none'&&!/(?:reference-)?(?:mercury|venus|earth|mars|jupiter|saturn|uranus|neptune)\.svg/.test(c.image)),'no planet covers administrative permissions');
      assert.ok(cards.every(c=>c.left>=0&&c.right<=width),'administrator cards fit phone width '+width);
      assert.equal(await cosmosPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      await cosmosPage.screenshot({path:'test/ui-previews/cosmos-operators-'+width+'.png'});
    }
    await cosmosPage.waitForFunction(()=>[...document.querySelectorAll('[data-cosmic-orbit] img')].every(img=>img.complete&&img.naturalWidth>0));
    assert.ok(await cosmosPage.$eval('[data-cosmic-orbit=admin]',node=>{
      const box=node.getBoundingClientRect();return [...node.querySelectorAll('img')].every(img=>{const r=img.getBoundingClientRect();return r.width>20&&r.left>=box.left&&r.right<=box.right&&r.top>=box.top&&r.bottom<=box.bottom;});
    }),'administration has a planet and sun in a reserved strip, inside their bounds');
    await cosmosPage.setViewport({width:393,height:851,deviceScaleFactor:1});
    await cosmosPage.click('[aria-label^="Menu administratora"]');
    await new Promise(resolve=>setTimeout(resolve,300));
    await cosmosPage.screenshot({path:'test/ui-previews/cosmos-operators-menu.png'});
    await cosmosPage.goto(origin+'/cosmos-fixture/',{waitUntil:'domcontentloaded'});
    await cosmosPage.waitForFunction(()=>document.querySelectorAll('[data-departure-row]').length===5);
    await cosmosPage.evaluate(()=>[...document.querySelectorAll('button')].find(n=>n.textContent.includes('Pokaż wszystkie odjazdy')).click());
    await cosmosPage.$eval('.transit-view',node=>node.scrollTop=650);await new Promise(resolve=>setTimeout(resolve,150));
    await cosmosPage.screenshot({path:'test/ui-previews/cosmos-expanded-departures.png'});
    const effects=await cosmosPage.$eval('[data-cosmic-effects]',node=>node.getBoundingClientRect().toJSON());assert.ok(effects.height>=850,'twinkles cover gaps between panels, not just one card');
    await cosmosPage.goto(origin+'/cosmos-train-fixture/',{waitUntil:'domcontentloaded'});
    await cosmosPage.waitForSelector('[data-cosmic-surface="train-detail"][data-cosmic-scene]');
    await cosmosPage.waitForFunction(()=>document.querySelectorAll('[data-cosmic-carrier="train"][data-cosmic-scene]').length===3);
    assert.ok(await cosmosPage.$$eval('[data-cosmic-surface]',nodes=>nodes.every(n=>getComputedStyle(n).backgroundImage.includes('sky-cloud'))),'train header, body and route rows receive celestial backgrounds');
    assert.equal(await cosmosPage.$eval('[data-cosmic-carrier="train"][data-cosmic-highlighted="true"]',n=>getComputedStyle(n).backgroundColor),'rgb(16, 39, 83)','train highlight retains its blue meaning');
    await new Promise(resolve=>setTimeout(resolve,700));await cosmosPage.screenshot({path:'test/ui-previews/cosmos-train-panel.png'});
    await cosmosPage.goto(origin+'/cosmos-admin-fixture/',{waitUntil:'domcontentloaded'});
    await cosmosPage.waitForSelector('[data-cosmic-view="admin:devices"][data-cosmic-seed]');
    const adminSeed=await cosmosPage.$eval('[data-cosmic-view="admin:devices"]',node=>node.dataset.cosmicSeed);
    await cosmosPage.waitForFunction(()=>typeof window.__startupTest?.loginPolicy==='function');
    await cosmosPage.evaluate(()=>{
      window.__adminCosmicChanges=[];
      const seen=new WeakMap();
      new MutationObserver(records=>{
        for(const record of records){
          const node=record.target;
          if(!(node instanceof HTMLElement)||!node.closest('[data-cosmic-view^="admin:"]'))continue;
          const art=['--cosmos-planet','--cosmos-planet-position','--cosmos-planet-size','--cosmos-dust'].map(key=>node.style.getPropertyValue(key)).join('|');
          if(!node.dataset.cosmicScene)continue;
          const previous=seen.get(node);
          if(previous&&previous.visit===node.dataset.cosmicVisit&&previous.art!==art)window.__adminCosmicChanges.push(node.dataset.cosmicScene);
          seen.set(node,{visit:node.dataset.cosmicVisit,art});
        }
      }).observe(document.body,{subtree:true,attributes:true,attributeFilter:['data-cosmic-scene','data-cosmic-visit','style']});
      window.__startupTest.loginPolicy(true,'owner',true,true);
    });
    await cosmosPage.waitForSelector('.admin-topbar');await cosmosPage.waitForSelector('[data-cosmic-view="admin:devices"] [data-cosmic-scene]');assert.equal(await cosmosPage.$eval('[data-cosmic-view="admin:devices"]',node=>node.dataset.cosmicSeed),adminSeed,'admin preserves the visit seed from loading to loaded data');
    const adminArt=()=>cosmosPage.$$eval('[data-cosmic-scene]',nodes=>nodes.map(node=>({key:node.dataset.cosmicScene,art:[...node.style].filter(name=>name.startsWith('--cosmos-')).map(name=>node.style.getPropertyValue(name)).join('|')})).sort((a,b)=>a.key.localeCompare(b.key)));
    await cosmosPage.waitForSelector('[data-cosmic-panel="admin-device:restored-owner-uid"]');
    assert.equal(await cosmosPage.$eval('[data-cosmic-canvas]',node=>getComputedStyle(node).backgroundColor),'rgba(0, 0, 0, 0)','admin list canvas reveals the sky outside its cards');
    const beforeData=await adminArt();await cosmosPage.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.__startupTest.heartbeat();});await new Promise(resolve=>setTimeout(resolve,600));assert.deepEqual(await adminArt(),beforeData,'admin data snapshots do not randomize the existing arrangement');
    assert.deepEqual(await cosmosPage.evaluate(()=>window.__adminCosmicChanges),[],'admin panels receive only one composition while loading completes');
    await cosmosPage.waitForSelector('[data-cosmic-panel="admin-sidebar"][data-cosmic-scene]');
    const sidebarArt=await cosmosPage.$eval('[data-cosmic-panel="admin-sidebar"]',node=>node.getAttribute('style'));
    const menu=await cosmosPage.$('[aria-label="Otwórz menu"]');
    if(menu){await menu.click();await new Promise(resolve=>setTimeout(resolve,400));}
    assert.equal(await cosmosPage.$eval('[data-cosmic-panel="admin-sidebar"]',node=>node.getAttribute('style')),sidebarArt,'opening admin sidebar keeps its composition');
    await cosmosPage.screenshot({path:'test/ui-previews/cosmos-admin-stable.png'});
    await cosmosPage.goto(origin+'/cosmos-route-fixture/',{waitUntil:'domcontentloaded'});await cosmosPage.waitForSelector('.leaflet-interactive');await cosmosPage.waitForFunction(()=>window.__stationRoute?.length>0);
    assert.ok(!await cosmosPage.evaluate(()=>window.__stationRoute.some(p=>p[0]===50.041991&&p[1]===22.002377)),'map paints the corrected station corridor');
    await new Promise(resolve=>setTimeout(resolve,1000));await cosmosPage.screenshot({path:'test/ui-previews/station-route-corrected.png'});await cosmosPage.click('[data-route-toggle]');await new Promise(resolve=>setTimeout(resolve,150));await cosmosPage.screenshot({path:'test/ui-previews/station-route-original.png'});
    await cosmosPage.close();assert.deepEqual(errors,[]);
    console.log('Browser: closed new logins wait for approval; verification and admin/owner roles unblock immediately; existing admission is preserved; pending device label fits phone and desktop.');
    console.log('Browser: accent changes list, departures, favourites and controls; carrier colours survive; reload persists; light/dark mobile layout has no horizontal overflow.');
    console.log('Browser: default glass, compact map stop card, limited expanded height, map panning, handle swipe, saved glass preference and brighter AMOLED surfaces passed.');
    console.log('Browser: full list replaces the preview, 40 and 80 cards do not overlap, scrolling works, closing restores position, and map and carrier SVG geometry is identical.');
    console.log('Browser: fresh install defaults to AMOLED; saved themes survive; carrier selection uses three SVG buses with functional selection and no overflow.');
    console.log('Browser: real maintenance controls add a draft, test its URL, retain the saved ID, activate, roll back, disable, re-enable and display history. Firebase calls use a fixture adapter; backend behaviour is tested separately.');
    console.log('Browser: favourites animate their position, departure spacing is compact, the new pin follows accent, settings track upward and downward dragging before release, backdrop dismisses, and bus panels default to collapsed.');
  }catch(error){await page.screenshot({path:'test/ui-previews/failure.png'}).catch(()=>{});console.error(await page.evaluate(()=>document.body.innerText).catch(()=>''));console.error(await page.evaluate(()=>[...document.querySelectorAll('.transit-view,.transit-stop-card,.transit-stop-card button')].map(el=>({tag:el.tagName,rect:el.getBoundingClientRect().toJSON(),display:getComputedStyle(el).display}))).catch(()=>[]));console.error('Page errors:',errors);throw error;}
  finally{await browser.close();await new Promise(resolve=>server.close(resolve));fixture.cleanup();}
})().catch(error=>{console.error(error);server.close();fixture.cleanup();process.exitCode=1;});
