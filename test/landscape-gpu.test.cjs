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
 state.illumination.fraction=1;state.moon.altitude=-.01;
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
 assert.deepEqual(Object.values(WATER_QUALITY).map(v=>v.fps),[30,24,15]);
 assert.ok(WATER_QUALITY.low.pixels<WATER_QUALITY.medium.pixels&&WATER_QUALITY.medium.pixels<WATER_QUALITY.high.pixels);
});
test('solar material adds no CSS solar gradients; shafts are supplied by GPU',()=>{
 const {landscapeOptics}=load('lib/landscape-optics.ts');
 assert.equal(landscapeOptics(at('2026-10-23T17:10:00+02:00'),64,true)['--landscape-reflection-image'],'none');
});
