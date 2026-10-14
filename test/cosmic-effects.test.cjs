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
 const atlas=decodeURIComponent(themeDecoration('dark-cosmos'));assert.ok(atlas.length<70000);assert.match(atlas,/id="sky-cloud"/);assert.ok((atlas.match(/<circle /g)||[]).length<=110);assert.doesNotMatch(atlas,/<animate|<filter|<image/);
});

test('reference compositions reserve the right side and keep each object in its authored slot',()=>{
 const {cosmicScene}=load('lib/cosmic-scene.ts');
 const scenes=[0,1,2,3].map(slot=>cosmicScene(123,undefined,slot));
 assert.deepEqual(scenes.map(s=>[s.planet,s.x,s.y,s.showPlanet]),[[3,74,5,true],[5,71,56,true],[0,73,95,true],[2,76,68,false]]);
 for(let seed=0;seed<100;seed++){
  const scene=cosmicScene(seed);assert.ok(scene.x>=71&&scene.x<=76);assert.ok(scene.size>=64&&scene.size<=90);
  assert.deepEqual(scene,cosmicScene(seed));
 }
});

test('loading, recreated nodes and discovery order cannot reroll identity-based scenes',()=>{
 const {cosmicScene,cosmicVisitSession}=load('lib/cosmic-scene.ts');
 const session=cosmicVisitSession(731);session.bind('root:tab');
 const first=session.scene('panel:stops-header',cosmicScene),epoch=session.epoch;
 session.bind('stops:tab');assert.equal(session.epoch,epoch);
 assert.strictEqual(session.scene('panel:stops-header',cosmicScene),first);
 const keys=['stop:a','stop:b','stop:c'];
 const original=keys.map(key=>session.scene(key,cosmicScene));
 for(let i=0;i<100;i++)for(const key of [...keys].reverse())assert.strictEqual(session.scene(key,cosmicScene),original[keys.indexOf(key)]);
 assert.equal(session.epoch,epoch);
 session.enter('map:tab');session.enter('stops:tab');
 assert.notDeepEqual(session.scene('stop:a',cosmicScene),original[0]);
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
 for(const image of COSMIC_DUST){
  const filename=image.match(/url\("([^\"]+)"\)/)[1];
  const svg=require('node:fs').readFileSync('public'+filename,'utf8');
  assert.match(svg,/data:image\/png;base64,/);assert.match(svg,/<mask/);
  assert.doesNotMatch(svg,/<filter|<animate|href="https?:/);
 }

 for(let seed=0;seed<40;seed++){const style=cosmicPanelStyle(seed,true);assert.match(style['--cosmos-planet'],/(?:reference-)?(?:mercury|venus|earth|mars|jupiter|saturn|uranus|neptune)\.svg/);assert.equal(style['--cosmos-planet-size'],'48px');assert.deepEqual(style,cosmicPanelStyle(seed,true));}
 const {COSMIC_STAR_POSITIONS,COSMIC_TWINKLE_INTERVAL}=load('lib/cosmic-effects.ts');assert.ok(COSMIC_STAR_POSITIONS.length<=4);assert.ok(COSMIC_TWINKLE_INTERVAL>=9000);
});

test('options overlay preserves the underlying visit and every cached card, real navigation still randomizes',()=>{
 const {cosmicVisitSession,cosmicScene}=load('lib/cosmic-scene.ts'),session=cosmicVisitSession(943);
 session.enter('stops:tab');const epoch=session.epoch,card=session.scene('stop:123',cosmicScene);
 for(let i=0;i<4;i++){
  assert.equal(session.enter('options:tab',true),false);
  assert.equal(session.epoch,epoch);assert.equal(session.tab,'stops:tab');
  assert.strictEqual(session.scene('stop:123',cosmicScene),card);
  assert.equal(session.enter('stops:tab'),false);
 }
 session.enter('map:tab');session.enter('stops:tab');
 assert.notDeepEqual(session.scene('stop:123',cosmicScene),card);
});


test('canvas skies are seeded, contain stars and nebulae, and never contain planets or suns',()=>{
 const {cosmicSky}=load('lib/cosmic-scene.ts');
 assert.equal(cosmicSky(123),cosmicSky(123));assert.notEqual(cosmicSky(123),cosmicSky(456));
 const svg=decodeURIComponent(cosmicSky(123));
 assert.ok((svg.match(/<circle/g)||[]).length<=110);assert.match(svg,/sky-cloud/);assert.match(svg,/star-halo/);assert.doesNotMatch(svg,/data-galaxy/);
 assert.doesNotMatch(svg,/planet|sun|corona|<image/);
});


test('panel starfields and galaxies have independent stable offsets, never a repeated column',()=>{
 const {cosmicPanelStyle}=load('lib/cosmic-scene.ts');
 const positions=Array.from({length:40},(_,seed)=>cosmicPanelStyle(seed)['--cosmos-star-position']);
 assert.ok(new Set(positions).size>35);
 assert.equal(cosmicPanelStyle(93)['--cosmos-star-position'],cosmicPanelStyle(93)['--cosmos-star-position']);
});

// Map artwork must survive actual navigation, modal changes and app restarts.
test('map scenes never re-roll across navigation, overlays or a fresh process seed',()=>{
 const {cosmicVisitSession,cosmicScene}=load('lib/cosmic-scene.ts');
 const session=cosmicVisitSession(31);session.enter('map:tab');
 const first=session.scene('panel:carriers',cosmicScene);
 session.enter('map:carriers');assert.deepEqual(session.scene('panel:carriers',cosmicScene),first);
 session.enter('stops:tab');session.enter('map:tab');
 assert.deepEqual(session.scene('panel:carriers',cosmicScene),first);
 const restart=cosmicVisitSession(999);restart.enter('map:tab');
 assert.deepEqual(restart.scene('panel:carriers',cosmicScene),first);
});

test('missing navigation during loading and overlay tabs never advance the scene epoch',()=>{
 const {cosmicVisitSession,cosmicScene}=load('lib/cosmic-scene.ts');
 const session=cosmicVisitSession(123);session.sync('stops');
 const epoch=session.epoch,first=session.scene('panel:stops-header',cosmicScene);
 for(let i=0;i<100;i++){
  assert.equal(session.sync(undefined),false);assert.equal(session.sync('stops'),false);
  assert.equal(session.sync('options',true),false);assert.equal(session.epoch,epoch);
  assert.strictEqual(session.scene('panel:stops-header',cosmicScene),first);
 }
 assert.equal(session.sync('map'),true);assert.equal(session.epoch,epoch+1);
 assert.equal(session.sync('map'),false);assert.equal(session.sync(undefined),false);
 assert.equal(session.sync('stops'),true);assert.equal(session.epoch,epoch+2);
});
