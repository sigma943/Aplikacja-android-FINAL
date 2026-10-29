const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
test('native system icons follow light, dark and Horyzont day/night without adding a scrim',async()=>{
 const names=['document','window','MutationObserver'],saved=Object.fromEntries(names.map(k=>[k,global[k]]));
 let effect,changed;const calls=[],listeners=new Map(),properties=new Map();
 const root={dataset:{pksTheme:'light'},style:{setProperty:(k,v)=>properties.set(k,v)}};
 global.document={documentElement:root};global.window={addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
 global.MutationObserver=class{constructor(callback){changed=callback;}observe(){}disconnect(){}};
 try{
  const component=load('components/NativeSystemBars.tsx',{'react':{useLayoutEffect:f=>{effect=f;}},'@capacitor/core':{Capacitor:{getPlatform:()=> 'android'},registerPlugin:()=>({getInsets:async()=>({top:32,bottom:24,left:0,right:0}),setStyle:async options=>{calls.push(options.darkIcons);}})}}).default;
  assert.equal(component(),null,'no coloured view or overlay is rendered');const cleanup=effect();await Promise.resolve();
  assert.equal(calls.at(-1),true);assert.equal(properties.get('--native-top'),'32px');
  for(const theme of ['light-warm','light-pink','light-sky','dark','dark-oled','dark-forest','dark-cosmos']){
   root.dataset.pksTheme=theme;changed();assert.equal(calls.at(-1),!theme.startsWith('dark'),theme);
  }
  root.dataset.pksTheme='dark-mountains';root.dataset.systemBarIcons='dark';changed();assert.equal(calls.at(-1),true,'Horyzont day');
  root.dataset.systemBarIcons='light';changed();assert.equal(calls.at(-1),false,'Horyzont night');
  const count=calls.length;changed();assert.equal(calls.length,count,'no repeated native work without a colour change');
  cleanup();assert.equal(listeners.size,0);
 }finally{for(const k of names)if(saved[k]===undefined)delete global[k];else global[k]=saved[k];}
});
