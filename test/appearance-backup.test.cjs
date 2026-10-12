const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {exportAppearanceBackup,parseAppearanceBackup,restoreAppearanceBackup}=load('lib/appearance-backup.ts');
const {INTERFACE_PRESETS}=load('lib/interface-presets.ts');
const profile={...INTERFACE_PRESETS.find(p=>p.name==='Różowy'),id:'current',updatedAt:1};
function setup(t){const oldStorage=global.localStorage,oldWindow=global.window;const items=new Map([['installationId','keep-owner'],['mks_show_map_stops','true']]);const events=[];global.localStorage={getItem:k=>items.get(k)??null,setItem:(k,v)=>items.set(k,v),removeItem:k=>items.delete(k)};global.window={dispatchEvent:e=>events.push(e.type)};t.after(()=>{global.localStorage=oldStorage;global.window=oldWindow;});return {items,events};}
test('appearance backup restores all visual data after reinstall while leaving identity, map and carrier settings untouched',t=>{
 const {items,events}=setup(t),profiles=[{...profile,id:'day'},{...profile,id:'night',theme:'dark-oled'}];
 const content=exportAppearanceBackup(profile,profiles,{enabled:true,dayAt:'07:00',nightAt:'20:00',dayProfile:'day',nightProfile:'night'},true);
 const result=restoreAppearanceBackup(content);assert.equal(items.get('mks_app_theme'),'light-pink');assert.equal(items.get('mks_light_effects'),'true');assert.equal(result.profiles.length,2);assert.equal(result.schedule.enabled,true);assert.equal(items.get('installationId'),'keep-owner');assert.equal(items.get('mks_show_map_stops'),'true');assert.deepEqual(events,['pks-profiles-changed','pks-profile-applied','pks-interface-appearance']);
 assert.equal(JSON.parse(items.get('mks_interface_appearance_v1')||JSON.stringify(profile.appearance)).markerSize,profile.appearance.markerSize);
});
test('wrong, damaged, oversized and future backups never write storage or emit apply events',t=>{
 const {items,events}=setup(t),before=[...items];
 for(const content of ['invalid','{}',JSON.stringify({format:'pks-live-appearance',version:99}), 'x'.repeat(262145)])assert.throws(()=>restoreAppearanceBackup(content));
 assert.deepEqual([...items],before);assert.deepEqual(events,[]);
 assert.equal(parseAppearanceBackup(exportAppearanceBackup(profile,[],{enabled:true},false)).schedule.enabled,false);
});
test('storage failure reverts a partially imported appearance',t=>{
 const {items,events}=setup(t),before=[...items];const original=global.localStorage.setItem;let once=true;global.localStorage.setItem=(key,value)=>{if(key==='mks_theme'&&once){once=false;throw Error('Full');}original(key,value);};
 assert.throws(()=>restoreAppearanceBackup(exportAppearanceBackup(profile,[],{},false)));assert.deepEqual([...items],before);assert.deepEqual(events,[]);
});
