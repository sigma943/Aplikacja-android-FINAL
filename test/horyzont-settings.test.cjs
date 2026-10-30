const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const settings=load('lib/landscape-settings.ts');
test('Horyzont settings reject invalid data and bound every numeric effect',()=>{
 assert.deepEqual(settings.normalizeLandscapeSettings(null),settings.DEFAULT_LANDSCAPE_SETTINGS);
 assert.deepEqual(settings.normalizeLandscapeSettings({quality:'medium',bloom:Infinity,reflections:-20,rays:999,waveSpeed:0,exposure:4}),{quality:'medium',filterBackground:'sky',bloom:100,reflections:0,rays:200,waveSpeed:0,exposure:50});
});
test('Horyzont settings survive reload and notify the live renderer',()=>{
 const before={localStorage:global.localStorage,window:global.window},data=new Map(),events=[];
 global.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};global.window={dispatchEvent:e=>events.push(e.type)};
 try{settings.saveLandscapeSettings({...settings.DEFAULT_LANDSCAPE_SETTINGS,quality:'low',rays:0,filterBackground:'solid'});assert.equal(settings.readLandscapeSettings().quality,'low');assert.equal(settings.readLandscapeSettings().rays,0);assert.equal(settings.readLandscapeSettings().filterBackground,'solid');assert.deepEqual(events,[settings.LANDSCAPE_SETTINGS_EVENT]);data.set(settings.LANDSCAPE_SETTINGS_KEY,'invalid');assert.deepEqual(settings.readLandscapeSettings(),settings.DEFAULT_LANDSCAPE_SETTINGS);}finally{Object.assign(global,before);}
});
