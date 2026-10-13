const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {COSMIC_METEOR_INTERVAL,COSMIC_METEOR_DURATION,cosmicMotionAllowed,cosmicMeteorScheduler}=load('lib/cosmic-effects.ts');
const normal={theme:'dark-cosmos',hidden:false,nativeActive:true,reducedMotion:false,lightEffects:false};
test('cosmic motion stops for hidden/native background apps, both reduced motion preferences, light effects and other themes',()=>{
 assert.equal(cosmicMotionAllowed(normal),true);
 for(const change of [{hidden:true},{nativeActive:false},{reducedMotion:true},{lightEffects:true},{theme:'dark-oled'},{hasRegion:false}])assert.equal(cosmicMotionAllowed({...normal,...change}),false);
 assert.ok(COSMIC_METEOR_DURATION<=800);assert.ok(COSMIC_METEOR_INTERVAL>=8000);
});
test('meteor scheduler is idle between short effects and has zero wakeups when disabled; resume creates only one timer',()=>{
 let enabled=true,next=1,runs=0;const timers=new Map();const clock={set:(fn,ms)=>{assert.equal(ms,COSMIC_METEOR_INTERVAL);const id=next++;timers.set(id,fn);return id;},clear:id=>timers.delete(id)};
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
 const {INTERFACE_PRESETS}=load('lib/interface-presets.ts'),preset=INTERFACE_PRESETS.find(p=>p.name==='Kosmos');assert.equal(preset.glass,false);assert.equal(preset.glow,false);assert.equal(preset.appearance.glassBlur,0);
 const {exportAppearanceBackup,parseAppearanceBackup}=load('lib/appearance-backup.ts');const profile={...preset,id:'current',updatedAt:1};assert.equal(parseAppearanceBackup(exportAppearanceBackup(profile,[],{},false)).current.theme,'dark-cosmos');
 const atlas=decodeURIComponent(themeDecoration('dark-cosmos'));assert.ok(atlas.length<44000);assert.match(atlas,/id="nebula"/);assert.match(atlas,/id="mist"/);assert.doesNotMatch(atlas,/<animate|<filter|<image/);
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
  assert.ok(sprite.includes(photo.toString('base64')),'sprites embed the unchanged NASA photograph');
  assert.match(sprite,/<feColorMatrix/);assert.doesNotMatch(sprite,/<animate|href="https?:/);
 }
});
