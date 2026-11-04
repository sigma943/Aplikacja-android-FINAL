const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const start=Date.parse('2026-11-02T12:00:00Z');
async function setup(t,devices){
 t.mock.timers.enable({apis:['setTimeout','Date'],now:start});
 const originalWindow=global.window,originalNavigator=Object.getOwnPropertyDescriptor(global,'navigator');
 const target=new EventTarget();global.window=target;Object.defineProperty(global,'navigator',{value:{onLine:true},configurable:true});
 let effect,activity,visible=true;const calls=[];
 const {useBanExpiry}=load('lib/use-ban-expiry.ts',{
  react:{useEffect:fn=>{effect=fn;}},'./firebase':{db:{}},
  './expire-device-ban':{expireDeviceBan:async(_db,id,actor)=>{calls.push([id,actor]);return true;}},
  './app-activity':{isAppVisible:()=>visible,observeAppActivity:fn=>{activity=fn;return()=>{activity=null;};}},
 });
 useBanExpiry(devices,'user');const cleanup=effect();
 t.after(()=>{cleanup?.();global.window=originalWindow;if(originalNavigator)Object.defineProperty(global,'navigator',originalNavigator);else delete global.navigator;t.mock.timers.reset();});
 return {calls,cleanup,visibility:active=>{visible=active;activity?.(active);},online:active=>{navigator.onLine=active;if(active)window.dispatchEvent(new Event('online'));}};
}
const pending=(id,delta)=>({id,status:'banned',banDetails:{expiresAt:new Date(start+delta).toISOString()}});
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('one deadline wakes at expiry; no polling for future, permanent or active devices',async t=>{
 const f=await setup(t,[pending('user',1000),{id:'permanent',status:'banned',banDetails:{expiresAt:''}},{...pending('active',0),status:'active'}]);
 assert.deepEqual(f.calls,[]);t.mock.timers.tick(1000);await settle();assert.deepEqual(f.calls,[]);
 t.mock.timers.tick(25);await settle();assert.deepEqual(f.calls,[['user','user']]);
 f.cleanup();t.mock.timers.tick(120000);await settle();assert.equal(f.calls.length,1,'unmounted consumers do not retry');
});
test('background and offline expiry wait for resume/reconnection',async t=>{
 const f=await setup(t,[pending('user',1000)]);f.visibility(false);t.mock.timers.tick(2000);await settle();assert.deepEqual(f.calls,[]);
 f.online(false);f.visibility(true);await settle();assert.deepEqual(f.calls,[]);
 f.online(true);await settle();assert.deepEqual(f.calls,[['user','user']]);
});
test('an already expired stored ban is checked on mount',async t=>{
 const f=await setup(t,[pending('legacy',-86400000)]);await settle();assert.deepEqual(f.calls,[['legacy','user']]);
});
