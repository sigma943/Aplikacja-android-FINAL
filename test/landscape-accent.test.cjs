const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {normalizeInterfaceAppearance:normalize,activeInterfaceAccent:active,interfaceAppearanceVariables:variables}=load('lib/interface-appearance.ts');
const {landscapePalette}=load('lib/landscape-palette.ts');
const {uiAccentVariables}=load('lib/ui-accent.ts');

test('old settings disable solar accents and uninitialized colours follow the general accent',()=>{
 const v=normalize({});assert.equal(v.landscapeAccentEnabled,false);assert.equal(v.landscapeDayAccent,'');assert.equal(v.landscapeNightAccent,'');
 for(const day of [true,false])for(const color of ['#ff8000','#3b82f6','#000000','#ffffff']){
  assert.equal(active(v,'dark-mountains',color,day),color);
  assert.equal(active({...v,landscapeAccentEnabled:true},'dark-mountains',color,day),color);
 }
});
test('only Horyzont uses independent saved day/night accents; disabling preserves all three colours',()=>{
 const v=normalize({landscapeAccentEnabled:true,landscapeDayAccent:'#FF8000',landscapeNightAccent:'#818CF8'}),general='#00a3a2';
 const before=JSON.stringify(v);
 assert.equal(active(v,'dark-mountains',general,true),'#ff8000');assert.equal(active(v,'dark-mountains',general,false),'#818cf8');
 for(const theme of ['system','light','light-warm','light-pink','light-sky','dark','dark-oled','dark-forest','dark-cosmos'])for(const day of [true,false])assert.equal(active(v,theme,general,day),general);
 for(const day of [true,false])assert.equal(active({...v,landscapeAccentEnabled:false},'dark-mountains',general,day),general);
 assert.equal(JSON.stringify(v),before);
 assert.equal(active(v,'dark-mountains','#ffffff',true),'#ff8000','changing general accent cannot overwrite an independent day choice');
});
test('corrupt saved solar colours fall back to general; switch values require booleans',()=>{
 for(const bad of [null,42,'red','#123','var(--bad)','#ffffff; color:red']){
  const v=normalize({landscapeAccentEnabled:true,landscapeDayAccent:bad,landscapeNightAccent:bad});
  for(const day of [true,false])assert.equal(active(v,'dark-mountains','#f59e0b',day),'#f59e0b');
 }
 assert.equal(normalize({landscapeAccentEnabled:'true'}).landscapeAccentEnabled,false);
});
test('Horyzont materials and personalized tint use the same active accent as buttons and navigation',()=>{
 const v=normalize({landscapeAccentEnabled:true,landscapeDayAccent:'#ff8000',landscapeNightAccent:'#818cf8',surfaceTint:'accent'}),general='#00a3a2';
 for(const day of [true,false]){
  const color=active(v,'dark-mountains',general,day),state={sun:{altitude:day?.5:-.5}};
  const actual=landscapePalette(state,64,day,v,general),expected=landscapePalette(state,64,day,{...v,landscapeAccentEnabled:false},color);
  assert.deepEqual(actual,expected);assert.equal(actual['--landscape-accent'],uiAccentVariables(color,!day)['--pks-accent-text']);
  assert.deepEqual(variables(v,!day,general,false,'dark-mountains'),variables({...v,landscapeAccentEnabled:false},!day,color,false,'dark-mountains'));
 }
});
test('day/night choices survive preference, profile and appearance-backup round trips',()=>{
 const appearance=normalize({landscapeAccentEnabled:true,landscapeDayAccent:'#ff8000',landscapeNightAccent:'#818cf8'});
 assert.deepEqual(normalize(JSON.parse(JSON.stringify(appearance))),appearance);
 const profile={id:'test',name:'Mój Horyzont',updatedAt:1,appearance,theme:'dark-mountains',accent:'#00a3a2',glass:true,glow:false,glowStrength:40};
 const {normalizeProfiles}=load('lib/personalization-profiles.ts');assert.deepEqual(normalizeProfiles([profile])[0].appearance,appearance);
 const {exportAppearanceBackup,parseAppearanceBackup}=load('lib/appearance-backup.ts');
 const restored=parseAppearanceBackup(exportAppearanceBackup(profile,[profile],{},false));
 assert.deepEqual(restored.current.appearance,appearance);assert.deepEqual(restored.profiles[0].appearance,appearance);assert.equal(restored.current.accent,profile.accent);
});
