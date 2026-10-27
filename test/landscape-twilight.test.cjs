const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const a=load('lib/landscape-astronomy.ts'),{landscapeSkyColors}=load('lib/landscape-renderer.ts');
const place=a.DEFAULT_LANDSCAPE_LOCATION;
const state=degrees=>({sun:{altitude:degrees*Math.PI/180},moon:{altitude:-1},illumination:{fraction:0}});
const sky=degrees=>a.skyState(state(degrees));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const old=degrees=>{const day=a.smoothstep(-7,12,degrees),twilight=a.smoothstep(-6,-.833,degrees)*(1-a.smoothstep(-.5,10,degrees));return {day,twilight,moonlight:0,stars:1-a.smoothstep(-16,-4,degrees),fog:.16+.28*twilight+.07*(1-day)};};
const oldColors=s=>[mix(mix([2,9,31],[28,114,204],s.day),[92,47,102],s.twilight*.8),mix(mix([8,21,51],[88,172,231],s.day),[224,107,128],s.twilight*.9),mix(mix([22,34,66],[200,222,226],s.day),[255,148,64],s.twilight)];
test('reported 05:40 is cool civil dawn, not a full night or an early sunrise',()=>{
 const time=Date.parse('2026-10-27T05:40:00+01:00'),s=a.astronomyAt(time,place),light=a.skyState(s),events=a.solarEvents(time,place),colors=landscapeSkyColors(light);
 assert.ok(s.sun.altitude*180/Math.PI>-6.1&&s.sun.altitude*180/Math.PI<-5.8);
 assert.ok(time<events.sunrise);assert.ok(light.blueHour>.95);assert.ok(light.day>.08&&light.day<.15);
 assert.ok(light.twilight<.001,'diffuse blue-grey light, not a sunrise orange wash');
 assert.ok(colors[0][1]>100&&colors[0][2]>135,'the visible sky is blue-grey already');
 assert.ok(light.stars<.01,'ordinary stars fade in the brightening sky');
});
test('all seasons brighten before sunrise and dim after sunset using solar depression',()=>{
 for(let month=1;month<=12;month++){
  const time=Date.parse(`2026-${String(month).padStart(2,'0')}-15T12:00:00Z`),e=a.solarEvents(time,place);
  for(const [nautical,civil,sun] of [[e.nauticalDawn,e.dawn,e.sunrise],[e.nauticalDusk,e.dusk,e.sunset]]){
   const samples=[nautical,civil,sun].map(t=>a.skyState(a.astronomyAt(t,place)));
   assert.ok(samples[0].day>0&&samples[0].day<samples[1].day);
   assert.ok(samples[1].day<samples[2].day);
   assert.ok(samples[1].blueHour>.99);
  }
 }
 const at=iso=>a.skyState(a.astronomyAt(Date.parse(iso),place));
 assert.ok(at('2026-06-21T05:40:00+02:00').day>.3);
 assert.ok(at('2026-12-21T05:40:00+01:00').blueHour<.03,'05:40 is not a programmed brightening time');
});
test('brightness is monotone and all twilight channels are continuous through the three phase boundaries',()=>{
 let previous=sky(-20);
 for(let degrees=-19.999;degrees<=20;degrees+=.001){const next=sky(degrees);
  assert.ok(next.day>=previous.day-1e-10,'ambient light cannot get darker as the Sun rises');
  for(const key of Object.keys(next))assert.ok(Number.isFinite(next[key])&&Math.abs(next[key]-previous[key])<.002,key);
  previous=next;
 }
 for(const angle of [-18,-12,-7,-6,-.833,0]){
  const before=landscapeSkyColors(sky(angle-1e-5)),after=landscapeSkyColors(sky(angle+1e-5));
  for(let i=0;i<3;i++)for(let c=0;c<3;c++)assert.ok(Math.abs(before[i][c]-after[i][c])<.002,'no sky colour step at '+angle);
 }
});
test('full day and astronomical night preserve the previous lighting and exact sky colours',()=>{
 for(const angle of [-90,-30,-18,0,1,5,12,45,90]){
  const expected=old(angle),actual=sky(angle);assert.equal(actual.blueHour,0);
  for(const key of Object.keys(expected))assert.ok(Math.abs(actual[key]-expected[key])<1e-12,key);
  assert.deepEqual(landscapeSkyColors(actual),oldColors(expected));
 }
});
test('same solar angle gives the same twilight before dawn and after dusk, independent of date or timezone',()=>{
 const first={...state(-9),ms:Date.parse('2026-03-29T02:00:00Z')},second={...state(-9),ms:Date.parse('2026-10-25T22:00:00Z')};
 assert.deepEqual(a.skyState(first),a.skyState(second));
 const stamp=Date.parse('2026-10-25T02:30:00+01:00');assert.deepEqual(a.astronomyAt(stamp,place),a.astronomyAt(Date.parse('2026-10-25T01:30:00Z'),place));
});
