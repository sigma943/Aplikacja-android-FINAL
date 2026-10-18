const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadRouteWithRetry}=require('./load-ts.cjs')('lib/route-load-retry.ts');

test('empty geometry retries beyond the initial attempts until the active route arrives',async()=>{
  let calls=0;
  const route=[[22,50],[22.01,50.01]];
  const result=await loadRouteWithRetry(async()=>++calls<5?[]:route,new AbortController().signal,[1,1],{keepRetrying:true,isUsable:value=>value.length>1});
  assert.deepEqual(result,route);assert.equal(calls,5);
});

test('a cancelled selection cannot publish a late geometry response',async()=>{
  const controller=new AbortController();
  await assert.rejects(loadRouteWithRetry(async()=>{controller.abort();return [[22,50],[22.01,50.01]];},controller.signal,[1],{keepRetrying:true}),{name:'AbortError'});
});

test('closing an empty route cancels its continuing retries',async()=>{
  const controller=new AbortController();let calls=0;
  const pending=loadRouteWithRetry(async()=>{calls++;return [];},controller.signal,[10000],{keepRetrying:true,isUsable:value=>value.length>1});
  const rejected=assert.rejects(pending,{name:'AbortError'});
  await new Promise(resolve=>setImmediate(resolve));controller.abort();await rejected;
  assert.equal(calls,1);
});

test('restoring connectivity wakes the waiting route without waiting for the timer',async()=>{
  const previous=global.window;const events=new EventTarget();global.window=events;let calls=0;
  try{
    const pending=loadRouteWithRetry(async()=>++calls===1?[]:['route'],new AbortController().signal,[10000],{keepRetrying:true,isUsable:value=>value.length>0});
    await new Promise(resolve=>setImmediate(resolve));events.dispatchEvent(new Event('online'));
    assert.deepEqual(await pending,['route']);assert.equal(calls,2);
  }finally{global.window=previous;}
});
