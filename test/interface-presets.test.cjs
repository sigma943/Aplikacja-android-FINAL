const test=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
const {INTERFACE_PRESETS,matchesInterfacePreset}=load('lib/interface-presets.ts');
const {normalizeInterfaceAppearance}=load('lib/interface-appearance.ts');

test('all complete presets survive saved-setting normalization unchanged',()=>{
 assert.deepEqual(INTERFACE_PRESETS.map(p=>p.name),['Żywy Krajobraz – Dynamiczne Góry','Różowy','Leśny','Niebo','Kosmos','Spokojny','Nocny','Czytelny']);
 for(const preset of INTERFACE_PRESETS){
  const saved=normalizeInterfaceAppearance(JSON.parse(JSON.stringify(preset.appearance)));
  assert.deepEqual(saved,preset.appearance);
  assert.ok(matchesInterfacePreset(preset,{...preset,appearance:saved}));
  assert.ok(!matchesInterfacePreset(preset,{...preset,appearance:saved,accent:'#f43f5e'}),'custom changes clear the preset selection');
 }
});
test('glowing presets coordinate their accents while the readable preset preserves contrast',()=>{
 for(const preset of INTERFACE_PRESETS.filter(p=>p.glow))assert.equal(preset.appearance.glowColor,preset.accent);
 const readable=INTERFACE_PRESETS.find(p=>p.name==='Czytelny');
 assert.equal(readable.glass,false);assert.equal(readable.glow,false);assert.equal(readable.appearance.textContrast,'strong');
});

test('pink theme retains default geometry and survives profile storage with readable colours',()=>{
 const {normalizeProfiles}=load('lib/personalization-profiles.ts');
 const {DEFAULT_INTERFACE_APPEARANCE,interfaceAppearanceVariables}=load('lib/interface-appearance.ts');
 const pink=INTERFACE_PRESETS.find(p=>p.name==='Różowy');
 assert.deepEqual(pink.appearance,DEFAULT_INTERFACE_APPEARANCE);
 const saved=normalizeProfiles([{...pink,id:'pink',updatedAt:1}])[0];
 assert.equal(saved.theme,'light-pink');
 assert.equal(interfaceAppearanceVariables(pink.appearance,false,pink.accent,false,pink.theme)['--personal-surface'],'rgb(255,209,232)');
 const luminance=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
 assert.ok((luminance('#ffb8db')+.05)/(luminance('#832557')+.05)>4.5);
});

test('older pink saved profiles upgrade to the requested light pink theme while preserving custom accents',()=>{
 const {normalizeProfiles}=load('lib/personalization-profiles.ts');const old={id:'old',name:'Różowy',theme:'dark-pink',accent:'#f9a8d4'};
 assert.equal(normalizeProfiles([old])[0].theme,'light-pink');assert.equal(normalizeProfiles([old])[0].accent,'#c02674');assert.equal(normalizeProfiles([{...old,accent:'#3b82f6'}])[0].accent,'#3b82f6');
});
