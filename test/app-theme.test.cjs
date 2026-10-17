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
  const expected=theme.resolveAppTheme(brokenStorage?'dark-oled':mode,dark);assert.equal(root.dataset.pksTheme,expected);assert.equal(style.backgroundColor,theme.THEME_SCREEN_COLORS[expected].background);assert.equal(style.color,theme.THEME_SCREEN_COLORS[expected].text);
 }
 const root={style:{setProperty(){}},dataset:{}};vm.runInNewContext(theme.INITIAL_THEME_SCRIPT,{localStorage:{getItem(){throw Error();}},matchMedia(){throw Error();},document:{documentElement:root}});assert.equal(root.dataset.pksTheme,'dark-oled');
});
test('blocked storage uses AMOLED, and selected forest/sky profiles survive backup and preserve effects',()=>{
 const old=global.window;global.window={localStorage:{getItem(){throw Error('Denied');}},matchMedia:()=>({matches:true})};
 try{assert.equal(theme.readAppTheme(),'dark-oled');assert.equal(theme.resolveAppTheme(theme.readAppTheme()),'dark-oled');}finally{global.window=old;}
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

test('a clean first launch is AMOLED regardless of system palette, while an explicit theme stays selected',()=>{
 for(const dark of [true,false])for(const selected of [null,'dark-cosmos']){
  const root={style:{setProperty(){}},dataset:{}};
  vm.runInNewContext(theme.INITIAL_THEME_SCRIPT,{localStorage:{getItem(){return selected;}},matchMedia:()=>({matches:dark}),document:{documentElement:root}});
  assert.equal(root.dataset.pksTheme,selected||'dark-oled');
 }
 assert.equal(theme.DEFAULT_APP_THEME,'dark-oled');
});

test('first-paint loading accent follows the saved colour independently of every theme',()=>{
 for(const mode of theme.THEME_MODES)for(const accent of ['#00A3A2','#8b5cf6','#125ABF',null,'red','#123','bad; color:red']){
  const values={},root={style:{setProperty(k,v){values[k]=v;}},dataset:{}};
  vm.runInNewContext(theme.INITIAL_THEME_SCRIPT,{localStorage:{getItem:key=>key==='mks_theme'?accent:mode},matchMedia:()=>({matches:true}),document:{documentElement:root}});
  assert.equal(values['--pks-accent'],/^#[0-9a-f]{6}$/i.test(accent||'')?accent.toLowerCase():'#00a3a2');
 }
 const values={},root={style:{setProperty(k,v){values[k]=v;}},dataset:{}};
 vm.runInNewContext(theme.INITIAL_THEME_SCRIPT,{localStorage:{getItem(){throw Error('Denied');}},matchMedia(){throw Error('Denied');},document:{documentElement:root}});
 assert.equal(values['--pks-accent'],'#00a3a2');
});
