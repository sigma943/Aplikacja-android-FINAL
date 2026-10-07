const {test}=require('node:test');
const assert=require('node:assert/strict');
const loadTs=require('./load-ts.cjs');
const {BackStack}=loadTs('lib/app-back.ts');

test('one Back closes only the foremost view: settings, stop detail, full list, tab',()=>{
  const stack=new BackStack(),closed=[];
  const add=(name,priority)=>{const remove=stack.register(()=>{closed.push(name);remove();return true;},priority);};
  add('stops tab',10);add('full list',40);add('stop detail',50);add('settings',100);
  for(const expected of ['settings','stop detail','full list','stops tab']) {
    const count=closed.length;assert.equal(stack.dispatch(),true);
    assert.equal(closed.length,count+1);assert.equal(closed.at(-1),expected);
  }
  assert.equal(stack.canGoBack,false);assert.equal(stack.dispatch(),false);
});

test('inactive and unmounted views cannot consume Back; the latest equal-priority dialog wins',()=>{
  const stack=new BackStack(),closed=[];
  const remove=stack.register(()=>{closed.push('hidden stop');return true;},50);
  remove();
  stack.register(()=>{closed.push('admin');return true;},80);
  stack.register(()=>{closed.push('first dialog');return true;},95);
  const top=stack.register(()=>{closed.push('last dialog');return true;},95);
  stack.dispatch();assert.deepEqual(closed,['last dialog']);top();
  stack.dispatch();assert.deepEqual(closed,['last dialog','first dialog']);
});

test('a root that cannot navigate back yields to app exit; subscriptions reflect current navigation',()=>{
  const stack=new BackStack();let changes=0;
  const off=stack.subscribe(()=>changes++);
  const remove=stack.register(()=>false,10);
  assert.equal(stack.dispatch(),false);assert.equal(changes,1);
  remove();assert.equal(changes,2);off();
  stack.register(()=>true);assert.equal(changes,2);
});

test('Android bridge has one listener: a single hardware press closes a child, then its root, then exits',async()=>{
  const stack=new BackStack();let callback,cleanup,registrations=0,exits=0;
  const App={addListener:async(event,run)=>{assert.equal(event,'backButton');registrations++;callback=run;return {remove:async()=>{}};},exitApp:async()=>{exits++;}};
  const Bridge=loadTs('components/AppBackBridge.tsx',{
    react:{useEffect:run=>{cleanup=run();}},
    '@capacitor/core':{Capacitor:{isNativePlatform:()=>true}},
    '@capacitor/app':{App},
    '@/lib/app-back':{appBackStack:stack},
  }).default;
  Bridge();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(registrations,1);
  const events=[];
  const root=stack.register(()=>{events.push('list');root();return true;},10);
  const child=stack.register(()=>{events.push('detail');child();return true;},50);
  callback();assert.deepEqual(events,['detail']);assert.equal(exits,0);
  callback();assert.deepEqual(events,['detail','list']);assert.equal(exits,0);
  callback();assert.equal(exits,1);
  cleanup();callback();assert.equal(exits,1,'removed listener cannot dispatch later');
});
