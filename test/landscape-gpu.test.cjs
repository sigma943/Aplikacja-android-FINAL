const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {landscapeLighting}=load('lib/landscape-lighting.ts');
const {astronomyAt,DEFAULT_LANDSCAPE_LOCATION,projectCelestial}=load('lib/landscape-astronomy.ts');
const {WATER_QUALITY}=load('lib/landscape-water-gpu.ts');
const at=iso=>astronomyAt(Date.parse(iso),DEFAULT_LANDSCAPE_LOCATION);
test('shared lighting preserves the established projection and accounts for cloud occlusion',()=>{
 const state=at('2026-10-23T12:00:00+02:00'),lit=landscapeLighting(state,15),cloud=landscapeLighting(state,15,0,0);
 assert.equal(lit.sun.x,projectCelestial(state.sun).x);assert.equal(lit.sun.y,projectCelestial(state.sun).y);
 assert.ok(lit.sun.intensity>0);assert.equal(cloud.sun.intensity,0);assert.equal(cloud.moon.intensity,0);
 assert.equal(lit.time,15);
});
test('below-horizon bodies and a new moon cannot create bright night reflections',()=>{
 const state=at('2026-10-26T23:00:00+01:00');
 state.moon={...state.moon,altitude:.6,azimuth:0};state.sun.altitude=-.5;state.illumination.fraction=1;
 assert.ok(landscapeLighting(state,0).moon.intensity>0);
 state.illumination.fraction=0;assert.equal(landscapeLighting(state,0).moon.intensity,0);
 state.illumination.fraction=1;state.moon.altitude=-.03; // Entire apparent limb is below the horizon.
 assert.equal(landscapeLighting(state,0).moon.intensity,0);assert.equal(landscapeLighting(state,0).sun.intensity,0);
});
test('lighting has no discontinuity at sunset or arbitrary warm colour thresholds',()=>{
 const state=at('2026-10-23T17:10:00+02:00');
 let previous;
 for(let alt=-.1;alt<.5;alt+=.0001){
  state.sun.altitude=alt;const next=landscapeLighting(state,0);
  if(previous){assert.ok(Math.abs(next.sun.intensity-previous.sun.intensity)<.02);for(let i=0;i<3;i++)assert.ok(Math.abs(next.sun.color[i]-previous.sun.color[i])<.002);}
  previous=next;
 }
});
test('water budgets remain bounded with three distinct frame and pixel limits',()=>{
 assert.deepEqual(Object.values(WATER_QUALITY).map(v=>v.fps),[60,30,15]);
 assert.ok(WATER_QUALITY.low.pixels<WATER_QUALITY.medium.pixels&&WATER_QUALITY.medium.pixels<WATER_QUALITY.high.pixels);
});
test('solar material adds no CSS solar gradients; shafts are supplied by GPU',()=>{
 const {landscapeOptics}=load('lib/landscape-optics.ts');
 assert.equal(landscapeOptics(at('2026-10-23T17:10:00+02:00'),64,true)['--landscape-reflection-image'],'none');
});

test('a subpixel solar limb never produces a non-finite exposure',()=>{
 const state=at('2026-10-25T16:00:00+01:00');
 // Sample both sides of the apparent rise/set horizon at floating-point scale.
 for(let i=-100;i<=100;i++){
  state.sun.altitude=-.833*Math.PI/180+i*1e-14;
  const light=landscapeLighting(state,0);assert.ok(Number.isFinite(light.sun.intensity)&&light.sun.intensity>=0);
 }
});

test('GPU uploads retain float32 precision while skipping repeated and unused uniforms',()=>{
 const {LandscapeWaterGPU}=load('lib/landscape-water-gpu.ts');
 const documentBefore=global.document,calls=[],locations=[];
 const gl={getUniformLocation:(_p,name)=>{locations.push(name);return name==='unused'?null:name;}};
 for(const n of [1,2,3,4])gl['uniform'+n+'f']=(name,...values)=>calls.push({name,values});
 global.document={createElement:()=>({addEventListener(){},getContext:()=>gl})};
 try{
  const gpu=new LandscapeWaterGPU(),p={program:{},uniforms:new Map(),values:new Map()};
  gpu.upload(p,'time',1);gpu.upload(p,'time',1+1e-10); // Same GPU float32.
  gpu.upload(p,'time',1+2**-22);
  gpu.upload(p,'size',425,925);gpu.upload(p,'size',425,925);
  gpu.upload(p,'color',.67,.81,1);gpu.upload(p,'color',.67,.81,1);gpu.upload(p,'color',.67,.82,1);
  gpu.upload(p,'frame',425,925,0,0);gpu.upload(p,'frame',425,925,0,0);
  gpu.upload(p,'unused',1);gpu.upload(p,'unused',2);
  assert.deepEqual(calls.map(c=>c.name),['time','time','size','color','color','frame']);
  assert.deepEqual(calls[3].values,[Math.fround(.67),Math.fround(.81),1]);
  assert.equal(locations.filter(name=>name==='unused').length,1);
 }finally{global.document=documentBefore;}
});
