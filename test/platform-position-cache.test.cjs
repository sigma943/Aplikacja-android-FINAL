const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-ts.cjs');

test('cached platform positions match the uncached resolver for the whole catalog',()=>{
  const {platformPosition,uncachedPosition}=load('lib/stop-platform-position.ts',{},'\nexport function uncachedPosition(stop:StopPoint){return positionWithPlatforms(stop,resolve);}\n');
  for(const stop of Object.values(require('../public/data/pks-stop-points.json').stops)){
    const expected=uncachedPosition(stop);
    assert.deepEqual(platformPosition(stop),expected);
    assert.deepEqual(platformPosition(stop),expected);
  }
});

test('cache checks every matching input and never exposes a mutable cached result',()=>{
  const {platformPosition,uncachedPosition}=load('lib/stop-platform-position.ts',{},'\nexport function uncachedPosition(stop:StopPoint){return positionWithPlatforms(stop,resolve);}\n');
  const stop={n:'GWOŹNICA DOLNA 11',code:'11',lat:49.83774,lon:21.95512};
  const first=platformPosition(stop);first.lat=0;
  assert.deepEqual(platformPosition(stop),uncachedPosition(stop));
  for(const change of [{n:'Different stop'},{name:'Gwoźnica Dolna 11'},{code:'12'},{lat:50},{lon:22},{lat:NaN},{lat:49.9,lon:21.9}]){
    Object.assign(stop,change);
    assert.deepEqual(platformPosition(stop),uncachedPosition(stop));
    assert.deepEqual(platformPosition(stop),uncachedPosition(stop));
  }
});

test('loading surveyed platforms invalidates positions cached before the download',async()=>{
  const {platformPosition,loadStopPlatforms}=load('lib/stop-platform-position.ts');
  const stop={n:'Test platform 07',lat:50.04,lon:22};
  assert.deepEqual(platformPosition(stop),{lat:50.04,lon:22});
  const original=global.fetch;
  try{
    global.fetch=async()=>({ok:true,json:async()=>({points:[{id:'test',name:'Test platform 07',lat:50.04001,lon:22.00001}]})});
    await loadStopPlatforms();
    assert.deepEqual(platformPosition(stop),{lat:50.04001,lon:22.00001});
  }finally{global.fetch=original;}
});
