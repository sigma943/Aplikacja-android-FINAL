const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
test('useful UI motion ignores decorative light effects but honours app and system reduction',()=>{
 const beforeWindow=global.window,beforeDocument=global.document;
 let system=false;global.window={matchMedia:()=>({matches:system})};global.document={documentElement:{dataset:{personalMotion:'normal',personalLightEffects:'off'}}};
 try{
  const {journeyReducedMotion}=load('lib/journey-motion.ts');
  assert.equal(journeyReducedMotion(),false);
  document.documentElement.dataset.personalLightEffects='on';assert.equal(journeyReducedMotion(),false);
  document.documentElement.dataset.personalMotion='reduced';assert.equal(journeyReducedMotion(),true);
  document.documentElement.dataset.personalMotion='normal';system=true;assert.equal(journeyReducedMotion(),true);
  system=false;assert.equal(journeyReducedMotion(),false);
 }finally{global.window=beforeWindow;global.document=beforeDocument;}
});
