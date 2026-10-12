const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-ts.cjs');

test('map code preloading does not render or request data and shares the import with the map loader',async()=>{
 const original=global.window;global.window={};let accesses=0;
 const module={__esModule:true,default:()=>{throw Error('Map must not mount while preloading');}};
 const overrides={};Object.defineProperty(overrides,'@/components/BusMap',{enumerable:true,get(){accesses++;return module;}});
 try {
  const api=load('lib/map-startup-code.ts',overrides,'',new Map([['seed',{}]]));api.preloadMapCode();const first=api.loadMapCode();
  assert.equal(first,api.loadMapCode());assert.equal((await first).default,module.default);assert.equal(accesses,1);
 } finally {global.window=original;}
});

test('failed code preload does not lock out a later normal map import',async()=>{
 const original=global.window;global.window={};let attempts=0;
 const overrides={};Object.defineProperty(overrides,'@/components/BusMap',{enumerable:true,get(){if(++attempts===1)throw Error('Temporary asset read error');return {__esModule:true,default:'map'};}});
 try {
  const api=load('lib/map-startup-code.ts',overrides,'',new Map([['seed',{}]]));api.preloadMapCode();await assert.rejects(api.loadMapCode(),/Temporary/);
  assert.equal((await api.loadMapCode()).default,'map');assert.equal(attempts,2);
 } finally {global.window=original;}
});

test('server rendering does not preload browser map code',()=>{
 const original=global.window;global.window=undefined;
 try {const api=load('lib/map-startup-code.ts',{'@/components/BusMap':{}});api.preloadMapCode();}finally{global.window=original;}
});
