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
