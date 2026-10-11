// Manual CPU comparison; timings are diagnostic, never a flaky CI threshold.
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const load=require('./load-ts.cjs');
const positions=load('lib/stop-platform-position.ts',{},'\nexport function uncachedPosition(stop:StopPoint){return positionWithPlatforms(stop,resolve);}\n');
const stops=Object.values(require('../public/data/pks-stop-points.json').stops);
(async()=>{
  const original=global.fetch;
  try{
    global.fetch=async()=>({ok:true,json:async()=>require('../public/data/stop-platforms.json')});
    await positions.loadStopPlatforms();
  }finally{global.fetch=original;}
  for(const stop of stops)assert.deepEqual(positions.platformPosition(stop),positions.uncachedPosition(stop));
  const measure=fn=>{
    const samples=[];
    for(let sample=0;sample<5;sample++){
      const start=performance.now();
      for(let repeat=0;repeat<50;repeat++)for(const stop of stops)fn(stop);
      samples.push(performance.now()-start);
    }
    return samples.sort((a,b)=>a-b)[2];
  };
  const before=measure(positions.uncachedPosition),after=measure(positions.platformPosition);
  console.log(JSON.stringify({stops:stops.length,repeats:50,medianBeforeMs:+before.toFixed(2),medianAfterMs:+after.toFixed(2),speedup:+(before/after).toFixed(1),coordinatesIdentical:true}));
})().catch(error=>{console.error(error);process.exitCode=1;});
