const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const load=require('./load-ts.cjs');const theme=load('lib/app-theme.ts');
test('theme aliases remain supported; damaged values fall back to system',()=>{
 assert.equal(theme.normalizeAppTheme(null),'dark-oled');assert.equal(theme.normalizeAppTheme('dark-pink'),'light-pink');assert.equal(theme.normalizeAppTheme('OLED'),'dark-oled');
 for(const input of ['bad-theme','',{},42]){assert.equal(theme.normalizeAppTheme(input),'system');assert.equal(theme.resolveAppTheme(input,true),'dark');assert.equal(theme.resolveAppTheme(input,false),'light');}
});
test('first-paint script uses selected palettes and safely recovers when storage or media queries fail',()=>{
 for(const mode of ['dark-cosmos','dark-aurora','dark-forest','light-sky','light-pink','bad-theme','system','','constructor','__proto__','toString'])for(const dark of [true,false])for(const brokenStorage of [true,false]){
  const style={values:{},setProperty(k,v){this.values[k]=v}},root={style,dataset:{}};
  vm.runInNewContext(theme.INITIAL_THEME_SCRIPT,{localStorage:{getItem(){if(brokenStorage)throw Error('Denied');return mode;}},matchMedia:()=>({matches:dark}),document:{documentElement:root}});
  const expected=theme.resolveAppTheme(brokenStorage?'system':mode,dark);assert.equal(root.dataset.pksTheme,expected);assert.equal(style.backgroundColor,theme.THEME_SCREEN_COLORS[expected].background);assert.equal(style.color,theme.THEME_SCREEN_COLORS[expected].text);
 }
 const root={style:{setProperty(){}},dataset:{}};vm.runInNewContext(theme.INITIAL_THEME_SCRIPT,{localStorage:{getItem(){throw Error();}},matchMedia(){throw Error();},document:{documentElement:root}});assert.equal(root.dataset.pksTheme,'light');
});
test('blocked storage uses system, and selected forest/sky profiles survive backup and preserve effects',()=>{
 const old=global.window;global.window={localStorage:{getItem(){throw Error('Denied');}},matchMedia:()=>({matches:true})};
 try{assert.equal(theme.readAppTheme(),'system');assert.equal(theme.resolveAppTheme(theme.readAppTheme()),'dark');}finally{global.window=old;}
 const {INTERFACE_PRESETS}=load('lib/interface-presets.ts'),{exportAppearanceBackup,parseAppearanceBackup}=load('lib/appearance-backup.ts');
 for(const mode of ['dark-forest','light-sky']){
  const preset=INTERFACE_PRESETS.find(p=>p.theme===mode);assert.equal(preset.glass,true);assert.equal(preset.glow,true);assert.ok(preset.glowStrength>0);assert.equal(preset.appearance.glowColor,preset.accent);
  const profile={...preset,id:'current',updatedAt:1};const backup=parseAppearanceBackup(exportAppearanceBackup(profile,[profile],{},false));assert.equal(backup.current.theme,mode);assert.equal(backup.current.glow,true);assert.deepEqual(backup.current.appearance,preset.appearance);
  assert.ok(theme.themeDecoration(mode).startsWith('url('));
 }
});

test('forest and sky accents remain readable on their raised panels',()=>{
 const {INTERFACE_PRESETS}=load('lib/interface-presets.ts');
 const lum=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
 for(const [mode,bg] of [['dark-forest','#194333'],['light-sky','#aedbfa']]){
  const accent=INTERFACE_PRESETS.find(p=>p.theme===mode).accent,a=lum(accent),b=lum(bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5);
 }
});
