const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {COSMIC_METEOR_INTERVAL,COSMIC_METEOR_DURATION,COSMIC_METEOR_MIN_INTERVAL,COSMIC_METEOR_MAX_INTERVAL,cosmicMeteorDelay,cosmicMotionAllowed,cosmicMeteorScheduler}=load('lib/cosmic-effects.ts');
const normal={theme:'dark-cosmos',hidden:false,nativeActive:true,reducedMotion:false,lightEffects:false};
test('cosmic motion stops for hidden/native background apps, both reduced motion preferences, light effects and other themes',()=>{
 assert.equal(cosmicMotionAllowed(normal),true);
 for(const change of [{hidden:true},{nativeActive:false},{reducedMotion:true},{lightEffects:true},{theme:'dark-oled'},{hasRegion:false}])assert.equal(cosmicMotionAllowed({...normal,...change}),false);
 assert.ok(COSMIC_METEOR_DURATION<=800);assert.ok(COSMIC_METEOR_INTERVAL>=8000);
});
test('meteor scheduler is idle between short effects and has zero wakeups when disabled; resume creates only one timer',()=>{
 let enabled=true,next=1,runs=0;const timers=new Map();const clock={set:(fn,ms)=>{assert.ok(ms>=COSMIC_METEOR_MIN_INTERVAL&&ms<=COSMIC_METEOR_MAX_INTERVAL);const id=next++;timers.set(id,fn);return id;},clear:id=>timers.delete(id)};
 const scheduler=cosmicMeteorScheduler(()=>enabled,()=>runs++,clock);scheduler.refresh();scheduler.refresh();assert.equal(timers.size,1);
 const fire=()=>{const [id,fn]=timers.entries().next().value;timers.delete(id);fn();};fire();assert.equal(runs,1);assert.equal(timers.size,1);
 enabled=false;scheduler.refresh();assert.equal(timers.size,0);
 enabled=true;scheduler.refresh();fire();assert.equal(runs,2);assert.equal(timers.size,1);
 scheduler.stop();assert.equal(timers.size,0);scheduler.refresh();assert.equal(timers.size,0);
});
test('visibility loss just before a timer fires cannot start a meteor',()=>{
 let allowed=true,callback,runs=0;const scheduler=cosmicMeteorScheduler(()=>allowed,()=>runs++,{set:fn=>{callback=fn;return 1;},clear:()=>{}});scheduler.refresh();allowed=false;callback();assert.equal(runs,0);scheduler.stop();
});
test('Kosmos replaces Aurora, stays black at first paint, survives backups and uses a small static vector atlas',()=>{
 const {THEME_MODES,normalizeAppTheme,THEME_SCREEN_COLORS,themeDecoration}=load('lib/app-theme.ts');
 assert.ok(THEME_MODES.includes('dark-cosmos'));assert.equal(THEME_MODES.includes('dark-aurora'),false);assert.equal(normalizeAppTheme('dark-aurora'),'dark-cosmos');assert.equal(THEME_SCREEN_COLORS['dark-cosmos'].background,'#000000');
 const {INTERFACE_PRESETS}=load('lib/interface-presets.ts'),preset=INTERFACE_PRESETS.find(p=>p.name==='Kosmos');assert.equal(preset.glass,true);assert.equal(preset.glow,false);assert.equal(preset.appearance.glassBlur,12);
 const {exportAppearanceBackup,parseAppearanceBackup}=load('lib/appearance-backup.ts');const profile={...preset,id:'current',updatedAt:1};assert.equal(parseAppearanceBackup(exportAppearanceBackup(profile,[],{},false)).current.theme,'dark-cosmos');
 const atlas=decodeURIComponent(themeDecoration('dark-cosmos'));assert.ok(atlas.length<44000);assert.match(atlas,/id="sky-cloud"/);assert.ok((atlas.match(/<circle /g)||[]).length>=180);assert.doesNotMatch(atlas,/<animate|<filter|<image/);
});

test('individual cosmic panels have diverse, stable seeded positions and eight real Solar System planets',()=>{
 const {cosmicScene,COSMIC_PLANETS,COSMIC_DUST}=load('lib/cosmic-scene.ts');assert.equal(COSMIC_PLANETS.length,8);assert.equal(COSMIC_DUST.length,4);
 const scenes=Array.from({length:100},(_,i)=>cosmicScene(i*931+77));assert.ok(new Set(scenes.map(s=>s.planet)).size>=5);assert.ok(new Set(scenes.map(s=>s.x.toFixed(0))).size>15);assert.ok(new Set(scenes.map(s=>s.y.toFixed(0))).size>15);assert.ok(scenes.filter(s=>s.showPlanet).length<45);assert.deepEqual(cosmicScene(77),cosmicScene(77));
 for(const scene of scenes){assert.ok(scene.x>=48&&scene.x<=90);assert.ok(scene.y>=64&&scene.y<=88);assert.ok(scene.size>=50&&scene.size<=76);}
});

test('successive visible planet scenes cannot align in one column or repeat their planet family',()=>{
 const {cosmicScene}=load('lib/cosmic-scene.ts');let previous=cosmicScene(11);
 for(let i=0;i<100;i++){const scene=cosmicScene(127*i+79,previous);assert.ok(Math.abs(scene.x-previous.x)>=22);assert.notEqual(scene.planet,previous.planet);previous=scene;}
});

test('stop lists leave two to four quiet cards between small planets for every session seed',()=>{
 const {cosmicListScene}=load('lib/cosmic-scene.ts');
 for(let seed=0;seed<40;seed++){
  let previous,gap=2,last=-1,count=0;
  for(let i=0;i<60;i++){
   const scene=cosmicListScene(seed*941+i*127,previous,gap);
   if(scene.showPlanet){
    if(last>=0){assert.ok(i-last>=3&&i-last<=5);assert.ok(Math.abs(scene.x-previous.x)>=22);assert.notEqual(scene.planet,previous.planet);}
    previous=scene;gap=0;last=i;count++;
   }else gap++;
  }
  assert.ok(count>=12&&count<=20);
 }
});

test('all eight planet photographs are packaged locally for offline Android use',()=>{
 const fs=require('node:fs');const {COSMIC_PLANET_NAMES,COSMIC_PLANETS}=load('lib/cosmic-scene.ts');
 assert.deepEqual([...COSMIC_PLANET_NAMES],['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune']);
 for(let i=0;i<COSMIC_PLANET_NAMES.length;i++){
  assert.equal(COSMIC_PLANETS[i],`url("/themes/kosmos/${COSMIC_PLANET_NAMES[i]}.svg")`);
  const photo=fs.readFileSync(`public/themes/kosmos/${COSMIC_PLANET_NAMES[i]}.jpg`);
  assert.equal(photo.readUInt16BE(0),0xffd8);assert.ok(photo.length>1000&&photo.length<100000);
  const sprite=fs.readFileSync(`public/themes/kosmos/${COSMIC_PLANET_NAMES[i]}.svg`,'utf8');
  const decoded=require('pngjs').PNG.sync.read(Buffer.from(sprite.match(/data:image\/png;base64,([^" ]+)/)[1],'base64'));
  const source=require('jpeg-js').decode(photo,{useTArray:true});assert.equal(decoded.width,source.width);assert.equal(decoded.height,source.height);
  for(let offset=0;offset<source.data.length;offset+=4096){assert.deepEqual([...decoded.data.slice(offset,offset+3)],[...source.data.slice(offset,offset+3)]);assert.equal(decoded.data[offset+3],Math.min(255,4*(source.data[offset]+source.data[offset+1]+source.data[offset+2])));}
  assert.doesNotMatch(sprite,/<filter|<feColorMatrix|<animate|href="https?:/);
 }
});

test('cosmic scenes survive repeated refreshes and recreated nodes, and reset only on real tab entries',()=>{
 const {cosmicVisitSession,cosmicScene}=load('lib/cosmic-scene.ts');const session=cosmicVisitSession(943);let created=0;
 const create=seed=>{created++;return cosmicScene(seed);};
 assert.equal(session.enter('stops'),true);const epoch=session.epoch,first=session.scene('stop:babica-80',create);
 for(let i=0;i<100;i++){assert.equal(session.enter('stops'),false);assert.strictEqual(session.scene('stop:babica-80',create),first);}
 assert.equal(created,1);assert.equal(session.epoch,epoch);
 session.scene('stop:other-new-row',create);assert.strictEqual(session.scene('stop:babica-80',create),first);
 session.enter('map');session.enter('stops');const returned=session.scene('stop:babica-80',create);assert.notDeepEqual(returned,first);
 const restart=cosmicVisitSession(944);restart.enter('stops');assert.notDeepEqual(restart.scene('stop:babica-80',create),first);
});

test('panel dust uses a bounded cover position instead of offsets crossing repeated tile edges',()=>{
 const {cosmicScene}=load('lib/cosmic-scene.ts');
 for(let i=0;i<300;i++){const scene=cosmicScene(i);assert.ok(scene.dustX>=0&&scene.dustX<=100);assert.ok(scene.dustY>=0&&scene.dustY<=100);}
});

test('cosmic nebulae contain fine stars without oversized cross shapes, and departures always have one modest planet',()=>{
 const {COSMIC_DUST,COSMIC_PLANETS,COSMIC_SUN,cosmicPanelStyle}=load('lib/cosmic-scene.ts');
 for(const image of COSMIC_DUST){const svg=decodeURIComponent(image);assert.doesNotMatch(svg,/<path|<rect/);assert.ok((svg.match(/<circle/g)||[]).length>=350);const radii=[...svg.matchAll(/\br="([\d.]+)"/g)].map(match=>Number(match[1]));assert.ok(Math.max(...radii)<=4);}
 for(let seed=0;seed<40;seed++){const style=cosmicPanelStyle(seed,true);assert.ok([...COSMIC_PLANETS,COSMIC_SUN].includes(style['--cosmos-planet']));assert.equal(style['--cosmos-planet-size'],'56px');assert.deepEqual(style,cosmicPanelStyle(seed,true));}
 const {COSMIC_STAR_POSITIONS,COSMIC_TWINKLE_INTERVAL}=load('lib/cosmic-effects.ts');assert.ok(COSMIC_STAR_POSITIONS.length>=12&&COSMIC_STAR_POSITIONS.length<=18);assert.ok(COSMIC_TWINKLE_INTERVAL>=9000);
});


test('screen compositions stay stable on refresh and change on tab re-entry and restart',()=>{
 const {cosmicBackdrop,cosmicBackdropStyle,cosmicVisitSession}=load('lib/cosmic-scene.ts');
 const session=cosmicVisitSession(100);session.enter('stops');
 const first=cosmicBackdrop(session.seedFor('screen-sky'));
 session.enter('stops');assert.deepEqual(cosmicBackdrop(session.seedFor('screen-sky')),first);
 session.enter('map');session.enter('stops');assert.notDeepEqual(cosmicBackdrop(session.seedFor('screen-sky')),first);
 const restarted=cosmicVisitSession(101);restarted.enter('stops');assert.notDeepEqual(cosmicBackdrop(restarted.seedFor('screen-sky')),first);
 assert.match(cosmicBackdropStyle(first)['--cosmos-scene-image'],/nebula.jpg/);
});
test('compositions separate distinct planet families and keep them within the viewport',()=>{
 const {cosmicBackdrop}=load('lib/cosmic-scene.ts');
 for(let seed=0;seed<1000;seed++){
  const scene=cosmicBackdrop(seed);assert.ok(scene.planets.length>=2&&scene.planets.length<=4);
  assert.equal(new Set(scene.planets.map(p=>p.planet)).size,scene.planets.length);
  assert.ok(scene.planets[0].diameter>=90&&scene.planets[1].diameter>=46);
  assert.ok(scene.planets[0].diameter>scene.planets[1].diameter*1.35);
  for(const [i,p] of scene.planets.entries()){
   assert.ok(p.x>=10&&p.x<=90&&p.y>=10&&p.y<=95);
   for(const q of scene.planets.slice(i+1))assert.ok(Math.hypot(p.x-q.x,p.y-q.y)>=27);
  }
 }
});


test('screen sky is created once and only main menu changes may replace it',()=>{
 const {cosmicScreenSession}=load('lib/cosmic-scene.ts');
 const session=cosmicScreenSession(943),first=session.scene;
 assert.equal(session.enterTab(undefined),false);
 assert.equal(session.enterTab('stops'),false,'initial navigation adopts the startup sky');
 for(const next of ['stops','options',undefined,'stop:123','admin:devices','carriers','stops']){
  assert.equal(session.enterTab(next),false);assert.strictEqual(session.scene,first);
 }
 assert.equal(session.epoch,0);
 assert.equal(session.enterTab('map'),true);assert.notDeepEqual(session.scene,first);
 const map=session.scene;session.enterTab('options');session.enterTab('map');assert.strictEqual(session.scene,map);
 session.enterTab('stops');assert.notDeepEqual(session.scene,first);
 const restart=cosmicScreenSession(944);restart.enterTab('stops');assert.notDeepEqual(restart.scene,first);
});


test('each meteor schedules a fresh random pause without resetting on UI refresh',()=>{
 const delays=[],timers=new Map();let next=0,calls=0;
 const values=[0,.5,1],clock={set:(fn,ms)=>{delays.push(ms);timers.set(++next,fn);return next;},clear:id=>timers.delete(id)};
 const scheduler=cosmicMeteorScheduler(()=>true,()=>{},clock,()=>cosmicMeteorDelay(()=>values[calls++]));
 scheduler.refresh();scheduler.refresh();assert.equal(calls,1);
 for(let i=0;i<2;i++){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}
 assert.deepEqual(delays,[3000,8000,13000]);scheduler.stop();assert.equal(timers.size,0);
});


test('parallax is bounded for extreme sensor readings and rejects invalid numbers',()=>{
 const {cosmicParallaxOffset}=load('lib/cosmic-effects.ts');
 assert.deepEqual(cosmicParallaxOffset(100,-100),{x:7,y:-5});
 assert.deepEqual(cosmicParallaxOffset(NaN,Infinity),{x:0,y:0});
 assert.deepEqual(cosmicParallaxOffset(0,0),{x:0,y:0});
});
test('rare celestial accents stay sparse and use the existing meteor clock',()=>{
 const {cosmicAccentEvent}=load('lib/cosmic-effects.ts');
 const events=Array.from({length:1000},(_,i)=>cosmicAccentEvent(()=>i/1000));
 assert.equal(events.filter(e=>e==='nova').length,80);
 assert.equal(events.filter(e=>e==='fragment').length,140);
 assert.equal(events.filter(e=>e==='meteor').length,780);
});
test('cinematic layers derive their light and nebula from the unchanged screen scene',()=>{
 const {cosmicScreenSession,cosmicBackdropStyle}=load('lib/cosmic-scene.ts');const session=cosmicScreenSession(42);
 const style=cosmicBackdropStyle(session.scene);assert.match(style['--cosmos-nebula-image'],/nebula.jpg/);assert.match(style['--cosmos-light-rgb'],/^\d+,\d+,\d+$/);
 session.enterTab('stops');session.enterTab('options');assert.deepEqual(cosmicBackdropStyle(session.scene),style);
});


test('main-tab visits visibly relocate the dominant planet without refreshing on data or Options',()=>{
 const {cosmicScreenSession}=load('lib/cosmic-scene.ts');
 for(let seed=0;seed<100;seed++){
  const session=cosmicScreenSession(seed);session.enterTab('map');
  for(const tab of ['stops','admin','stops','map','stops']){
   const previous=session.scene.planets[0];session.enterTab(tab);
   const next=session.scene.planets[0];assert.ok(Math.hypot(next.x-previous.x,next.y-previous.y)>=24);
   const stable=session.scene;session.enterTab(tab);session.enterTab('options');assert.equal(session.scene,stable);
  }
 }
});


test('meteor and comet delays have separate bounded distributions averaging 8s and 15s',()=>{
 const {cosmicMeteorDelay,cosmicCometDelay,cosmicMeteorScheduler}=load('lib/cosmic-effects.ts');
 let m=0,c=0;for(let i=0;i<=1000;i++){m+=cosmicMeteorDelay(()=>i/1000);c+=cosmicCometDelay(()=>i/1000);}
 assert.equal(m/1001,8000);assert.equal(c/1001,15000);
 let enabled=true,id=0;const timers=new Map(),clock={set:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clear:id=>timers.delete(id)};
 const meteor=cosmicMeteorScheduler(()=>enabled,()=>{},clock,()=>cosmicMeteorDelay(()=>.5));
 const comet=cosmicMeteorScheduler(()=>enabled,()=>{},clock,()=>cosmicCometDelay(()=>.5));
 meteor.refresh();comet.refresh();assert.deepEqual([...timers.values()].map(t=>t.ms),[8000,15000]);
 enabled=false;meteor.refresh();comet.refresh();assert.equal(timers.size,0);meteor.stop();comet.stop();
});
test('planet scenes cover the screen, offer 2/3/4 bodies and a strong near-to-far size hierarchy',()=>{
 const {cosmicBackdrop}=load('lib/cosmic-scene.ts');const counts=new Set(),cells=new Set();
 for(let seed=0;seed<1000;seed++){
  const scene=cosmicBackdrop(seed);counts.add(scene.planets.length);const p=scene.planets[0];cells.add(Math.floor(p.x/15)+':'+Math.floor(p.y/15));
  scene.planets.forEach((p,i)=>{if(i)assert.ok(scene.planets[i-1].diameter>p.diameter*1.2);});
 }
 assert.deepEqual([...counts].sort(),[2,3,4]);assert.ok(cells.size>=20,'dominant planets are not locked to two bands');
});
