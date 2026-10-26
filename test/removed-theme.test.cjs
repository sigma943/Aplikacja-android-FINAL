const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const load=require('./load-ts.cjs');const theme=load('lib/app-theme.ts');
test('removed theme migrates to Cosmos and is absent from available themes and presets',()=>{
 assert.equal(theme.normalizeAppTheme('dark-horizon'),'dark-cosmos');
 assert.ok(!theme.THEME_MODES.includes('dark-horizon'));
 assert.ok(load('lib/interface-presets.ts').INTERFACE_PRESETS.every(p=>p.name!=='Horyzont'));
});
test('startup persists migration before rendering and removes obsolete location storage',()=>{
 const data=new Map([['mks_app_theme','dark-horizon'],['mks_horizon_location_v1','old']]);const style={setProperty(){}};const document={documentElement:{style,dataset:{}}};
 vm.runInNewContext(theme.INITIAL_THEME_SCRIPT,{localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},matchMedia:()=>({matches:false}),document});
 assert.equal(data.get('mks_app_theme'),'dark-cosmos');assert.equal(data.has('mks_horizon_location_v1'),false);assert.equal(document.documentElement.dataset.pksTheme,'dark-cosmos');
});
