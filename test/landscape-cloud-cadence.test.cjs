const {test}=require('node:test'),assert=require('node:assert/strict');
const {landscapeMotionPolicy,landscapeDrawInterval}=require('./load-ts.cjs')('lib/landscape-motion.ts');
test('visible cloud window targets 60 fps while covered water stays unrendered',()=>{
 const base={hidden:false,nativeActive:true,reduced:false,light:false,limited:false,critical:false,slow:false};
 for(const fps of [20,30,60])assert.equal(landscapeDrawInterval('active',1000/30,fps,true),1000/60);
 assert.equal(landscapeDrawInterval('active',1000/30,30,false),1000/30);
 for(const flag of ['hidden','reduced','light','limited','critical']){
  const policy=landscapeMotionPolicy({...base,[flag]:true});
  assert.equal(landscapeDrawInterval(policy.reason,policy.interval,60,true),policy.interval);
 }
});
