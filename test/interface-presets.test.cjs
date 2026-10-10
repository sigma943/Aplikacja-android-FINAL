const test=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
const {INTERFACE_PRESETS,matchesInterfacePreset}=load('lib/interface-presets.ts');
const {normalizeInterfaceAppearance}=load('lib/interface-appearance.ts');

test('all four complete presets survive saved-setting normalization unchanged',()=>{
 assert.deepEqual(INTERFACE_PRESETS.map(p=>p.name),['Spokojny','Nocny','Czytelny','Minimalny']);
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
