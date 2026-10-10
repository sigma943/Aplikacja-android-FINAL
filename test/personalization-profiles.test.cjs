const test=require('node:test'),assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
const {normalizeInterfaceAppearance,DEFAULT_INTERFACE_APPEARANCE,INTERFACE_APPEARANCE_KEY}=load('lib/interface-appearance.ts');
const {normalizeProfiles,normalizeSchedule,scheduleSlot,applyScheduledProfile,activateProfile,PROFILES_KEY,SCHEDULE_KEY}=load('lib/personalization-profiles.ts');
function storage(){const entries=new Map();global.localStorage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};return entries;}
const profile=(id)=>({id,name:id,updatedAt:1,appearance:{...DEFAULT_INTERFACE_APPEARANCE},theme:'dark',accent:'#00a3a2',glass:false,glow:false,glowStrength:40});

test('damaged navigation records keep every tab exactly once and bound marker sizes',()=>{
 const value=normalizeInterfaceAppearance({navOrder:['options','map','options','bad'],markerSize:900,startScreen:'bad',markerLabel:'bad'});
 assert.deepEqual(value.navOrder,['options','map','stops','admin']);assert.equal(value.markerSize,140);assert.equal(value.startScreen,'map');assert.equal(value.markerLabel,'line');
});
test('profile normalization isolates appearance, limits counts and rejects duplicate or empty IDs',()=>{
 const profiles=normalizeProfiles([profile('one'),profile('one'),{...profile('two'),accent:'url(bad)',appearance:{markerSize:-1}},profile('')]);
 assert.equal(profiles.length,2);assert.equal(profiles[1].appearance.markerSize,80);assert.equal(profiles[1].accent,'#00a3a2');
 assert.equal(normalizeProfiles(Array.from({length:20},(_,i)=>profile(String(i)))).length,8);
 assert.equal(normalizeSchedule({dayAt:'99:99'}).dayAt,'07:00');
});
test('day/night schedules resolve boundaries and reversed schedules across midnight',()=>{
 for(const [minutes,expected]of [[0,'night'],[419,'night'],[420,'day'],[1199,'day'],[1200,'night'],[1439,'night']])assert.equal(scheduleSlot(minutes,'07:00','20:00'),expected);
 assert.equal(scheduleSlot(100,'20:00','07:00'),'day');assert.equal(scheduleSlot(600,'20:00','07:00'),'night');assert.equal(scheduleSlot(600,'07:00','07:00'),null);
});
test('schedule changes once per boundary, preserves manual edits and catches up after sleep',()=>{
 const entries=storage();entries.set(PROFILES_KEY,JSON.stringify([profile('day'),{...profile('night'),accent:'#8b5cf6'}]));entries.set(SCHEDULE_KEY,JSON.stringify({enabled:true,dayAt:'07:00',nightAt:'20:00',dayProfile:'day',nightProfile:'night'}));
 assert.equal(applyScheduledProfile(new Date(2026,9,10,19,59)),true);assert.equal(entries.get('mks_theme'),'#00a3a2');
 entries.set('mks_theme','#f43f5e');assert.equal(applyScheduledProfile(new Date(2026,9,10,19,59)),false);assert.equal(entries.get('mks_theme'),'#f43f5e');
 assert.equal(applyScheduledProfile(new Date(2026,9,10,22,30)),true);assert.equal(entries.get('mks_theme'),'#8b5cf6');
 assert.equal(applyScheduledProfile(new Date(2026,9,11,0,30)),false,'midnight is not a new night boundary');
 assert.equal(applyScheduledProfile(new Date(2026,9,11,8,0)),true);assert.equal(entries.get('mks_theme'),'#00a3a2');
});
test('missing scheduled profiles never activate a partial schedule',()=>{
 const entries=storage();entries.set(PROFILES_KEY,JSON.stringify([profile('day')]));entries.set(SCHEDULE_KEY,JSON.stringify({enabled:true,dayAt:'07:00',nightAt:'20:00',dayProfile:'day',nightProfile:'missing'}));assert.equal(applyScheduledProfile(new Date(2026,9,10,8,0)),false);
});
test('activating a saved profile restores all appearance keys without mutating the snapshot',()=>{
 const entries=storage(),saved=profile('mine');saved.appearance=normalizeInterfaceAppearance({navOrder:['stops','map'],markerSize:130,startScreen:'favorites'});
 activateProfile(saved,false);const restored=JSON.parse(entries.get(INTERFACE_APPEARANCE_KEY));assert.equal(restored.markerSize,130);assert.equal(restored.startScreen,'favorites');assert.deepEqual(restored.navOrder,['stops','map','admin','options']);assert.equal(saved.appearance.markerSize,130);
});
