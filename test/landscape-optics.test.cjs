const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {glassFresnel,solarShaftStrength,landscapeOptics,landscapeViewport}=load('lib/landscape-optics.ts');
const state=degrees=>({sun:{altitude:degrees*Math.PI/180,azimuth:0}});
test('Fresnel rises at grazing angles; shafts favour low sun and fade at night and noon',()=>{
 assert.equal(glassFresnel(1),.04);assert.equal(glassFresnel(0),1);
 assert.ok(glassFresnel(.1)>glassFresnel(.7));
 assert.equal(solarShaftStrength(-15*Math.PI/180),0);assert.equal(solarShaftStrength(40*Math.PI/180),0);
 assert.ok(solarShaftStrength(1*Math.PI/180)>.9);
});
test('glass reflections follow transparency, sunlight and the glass toggle',()=>{
 const strength=(alt,opacity,glass)=>Number(landscapeOptics(state(alt),opacity,glass)['--landscape-reflection-strength']);
 assert.equal(strength(1,20,false),0);assert.equal(strength(1,100,true),0);
 assert.ok(strength(1,20,true)>strength(1,80,true));assert.ok(strength(1,40,true)>strength(40,40,true));
 for(let alt=-20;alt<80;alt++)for(const opacity of [20,64,100])assert.ok(strength(alt,opacity,true)>=0&&strength(alt,opacity,true)<.3);
});
test('keyboard shrink keeps the composition; dismissal and rotation resize it',()=>{
 const start=landscapeViewport(undefined,{width:393,height:851},false);
 const keyboard=landscapeViewport(start,{width:393,height:500},true);
 assert.equal(keyboard.height,851);assert.equal(keyboard.keyboard,true);
 assert.equal(landscapeViewport(keyboard,{width:393,height:620},false).height,851);
 const closed=landscapeViewport(keyboard,{width:393,height:851},false);assert.equal(closed.keyboard,false);
 assert.deepEqual(landscapeViewport(keyboard,{width:851,height:393},true),{width:851,height:393,keyboard:false});
 assert.equal(landscapeViewport(start,{width:393,height:600},false).height,600,'normal window resizing still works');
});
