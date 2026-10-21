const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
test('map navigation remains animated with light effects while respecting explicit reduced motion',()=>{
 const originalWindow=global.window,originalDocument=global.document;
 try{
  global.window={matchMedia:()=>({matches:false})};global.document={documentElement:{dataset:{personalLightEffects:'on',personalMotion:'reduced',personalMapMotion:'normal'}}};
  const {mapReducedMotion}=load('lib/map-motion.ts');assert.equal(mapReducedMotion(),false);
  document.documentElement.dataset.personalMapMotion='reduced';assert.equal(mapReducedMotion(),true);
  document.documentElement.dataset.personalMapMotion='normal';window.matchMedia=()=>({matches:true});assert.equal(mapReducedMotion(),true);
 }finally{if(originalWindow===undefined)delete global.window;else global.window=originalWindow;if(originalDocument===undefined)delete global.document;else global.document=originalDocument;}
});
