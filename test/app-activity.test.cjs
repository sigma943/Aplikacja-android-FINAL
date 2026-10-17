const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function surface(native=false){
 const saved={window:global.window,document:global.document};
 const doc=new EventTarget();doc.visibilityState='visible';global.document=doc;global.window=new EventTarget();
 let nativeChange,finishState,adds=0,removes=0;
 const api=load('lib/app-activity.ts',{
  '@capacitor/core':{Capacitor:{isNativePlatform:()=>native}},
  '@capacitor/app':{App:{addListener:async(_,fn)=>{adds++;nativeChange=fn;return{remove:async()=>{removes++;}};},getState:()=>new Promise(resolve=>finishState=resolve)}}
 });
 return {api,doc,hide(){doc.visibilityState='hidden';doc.dispatchEvent(new Event('visibilitychange'));},show(){doc.visibilityState='visible';doc.dispatchEvent(new Event('visibilitychange'));},native(value){nativeChange({isActive:value});},state(value){finishState({isActive:value});},counts:()=>({adds,removes}),restore(){global.window=saved.window;global.document=saved.document;}};
}
test('activity shares one native listener, combines DOM/native state, and ignores a stale native getState result',async()=>{
 const s=surface(true);const first=[],second=[];let stop1,stop2;
 try{
  stop1=s.api.observeAppActivity(value=>first.push(value));stop2=s.api.observeAppActivity(value=>second.push(value));await flush();
  assert.equal(s.counts().adds,1);s.native(false);s.state(true);await flush();assert.equal(s.api.isAppVisible(),false);
  s.hide();s.native(true);assert.equal(s.api.isAppVisible(),false);s.show();s.show();
  assert.deepEqual(first,[false,true]);assert.deepEqual(second,first);
  stop1();assert.equal(s.counts().removes,0);stop2();await flush();assert.equal(s.counts().removes,1);
 }finally{stop1?.();stop2?.();s.restore();}
});
test('hidden app rejects new requests, aborts browser work, ignores completed native results, and resumes normally',async()=>{
 const s=surface();let signal,finish,calls=0;
 try{
  const pending=s.api.foregroundRequest(active=>{calls++;signal=active;return new Promise(resolve=>finish=resolve);});
  s.hide();assert.equal(signal.aborted,true);finish('late native response');await assert.rejects(pending,{name:'AbortError'});
  await assert.rejects(s.api.foregroundRequest(async()=>{calls++;}),{name:'AbortError'});assert.equal(calls,1);
  s.show();assert.equal(await s.api.foregroundRequest(async()=>++calls),2);
  const cancelled=new AbortController();cancelled.abort();await assert.rejects(s.api.foregroundRequest(async()=>++calls,cancelled.signal),{name:'AbortError'});assert.equal(calls,2);
 }finally{s.restore();}
});
test('headless widget requests work while hidden without attaching native listeners',async()=>{
 const s=surface(true);
 try{window.NativeWidget={};s.hide();assert.equal(s.api.isAppVisible(),true);assert.equal(await s.api.foregroundRequest(async()=>42),42);assert.equal(s.counts().adds,0);}
 finally{s.restore();}
});
