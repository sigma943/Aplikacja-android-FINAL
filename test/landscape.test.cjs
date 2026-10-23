const test=require('node:test'),assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
const a=load('lib/landscape-astronomy.ts'),r=load('lib/landscape-renderer.ts');
const place=a.DEFAULT_LANDSCAPE_LOCATION;
const at=iso=>a.astronomyAt(Date.parse(iso),place);
test('water crests move gently and clouds drift steadily across the seamless tile',()=>{
 const values=[];
 for(const y of [1350,1600,2000])for(let x=0;x<1000;x+=71){
  const first=r.waterWave(x,y,0),later=r.waterWave(x,y,2);
  assert.ok(Math.abs(first)<14&&Math.abs(later)<14,'wave displacement remains bounded');values.push(Math.abs(first-later));
 }
 assert.ok(values.some(value=>value>.5),'crests move rather than drawing static full-width lines');
 assert.ok(r.cloudOffset(3)-r.cloudOffset(0)>=12,'cloud movement is visible within seconds');
 assert.ok(Math.abs(r.cloudOffset(61)-r.cloudOffset(60))<=12);
});
test('power policy keeps a live world in saver mode and recovers from one expensive frame',()=>{
 const {landscapeMotionPolicy:p,landscapeFrameBudget:budget}=load('lib/landscape-motion.ts');
 const base={hidden:false,nativeActive:true,reduced:false,light:false,limited:false,critical:false,slow:false};
 assert.equal(p(base).animate,true);assert.ok(p(base).interval<100);
 assert.equal(p({...base,light:true}).animate,true);assert.equal(p({...base,light:true}).interval,500);
 assert.equal(p({...base,limited:true}).animate,true);assert.equal(p({...base,limited:true}).interval,500);
 for(const flags of [{critical:true},{reduced:true},{hidden:true},{nativeActive:false}])assert.equal(p({...base,...flags}).animate,false);
 let avg=budget(12,75);assert.ok(avg<28,'an isolated relight does not permanently select a low frame rate');
 for(let i=0;i<30;i++)avg=budget(avg,12);assert.ok(avg<18);
});
test('Rzeszow solar events agree with seasonal reference windows and do not hard-code hours',()=>{
 for(const [date,rise,set] of [['2026-06-21',[2,3],[18,19]],['2026-12-21',[6,7],[14,15]],['2026-03-20',[4,6],[16,18]]]){
  const e=a.solarEvents(Date.parse(date+'T12:00:00Z'),place);
  assert.ok(new Date(e.sunrise).getUTCHours()>=rise[0]&&new Date(e.sunrise).getUTCHours()<=rise[1]);
  assert.ok(new Date(e.sunset).getUTCHours()>=set[0]&&new Date(e.sunset).getUTCHours()<=set[1]);
  assert.ok(e.nauticalDawn<e.dawn&&e.dawn<e.sunrise&&e.sunset<e.dusk);
  if(e.night!==null)assert.ok(e.dusk<e.night&&e.nightEnd<e.nauticalDawn);
 }
});
test('known lunar phases use a continuous illuminated fraction',()=>{
 // NASA 2026 UTC phase instants; tolerances account for SunCalc low precision.
 assert.ok(at('2026-10-10T15:50:00Z').illumination.fraction<.02);
 assert.ok(at('2026-10-26T04:12:00Z').illumination.fraction>.98);
 for(const iso of ['2026-10-18T18:12:00Z','2026-11-01T20:28:00Z'])assert.ok(Math.abs(at(iso).illumination.fraction-.5)<.06);
 const f1=at('2026-10-15T12:00:00Z').illumination.fraction,f2=at('2026-10-16T12:00:00Z').illumination.fraction;
 assert.ok(f2>f1&&f2-f1<.2);
});
test('moon can be above the daytime horizon and below the night horizon',()=>{
 let dayMoon=false,nightWithoutMoon=false;
 for(let h=0;h<24*30;h++){
  const s=a.astronomyAt(Date.parse('2026-10-01T00:00:00Z')+h*3600000,place);
  if(s.sun.altitude>.1&&s.moon.altitude>.1)dayMoon=true;
  if(s.sun.altitude<-.2&&s.moon.altitude<-.1)nightWithoutMoon=true;
 }
 assert.ok(dayMoon&&nightWithoutMoon);
});
test('light and celestial projection stay continuous through twilight, midnight and angle wrap',()=>{
 const e=a.solarEvents(Date.parse('2026-10-23T12:00:00Z'),place);
 for(const t of [e.sunrise,e.sunset,e.dusk,e.night,Date.parse('2026-10-23T23:59:59Z')]){
  const before=a.astronomyAt(t-1000,place),after=a.astronomyAt(t+1000,place),b=a.skyState(before),c=a.skyState(after);
  for(const key of Object.keys(b))assert.ok(Math.abs(b[key]-c[key])<.01,key);
  assert.ok(Math.abs(a.projectCelestial(before.sun).y-a.projectCelestial(after.sun).y)<.001);
 }
 const start=at('2026-10-23T10:00:00Z'),end=at('2026-10-23T10:00:30Z'),mid=a.interpolateAstronomy(start,end,start.ms+15000),exact=a.astronomyAt(mid.ms,place);
 assert.ok(Math.abs(mid.sun.altitude-exact.sun.altitude)<.00001);
 start.sun.azimuth=Math.PI-.01;end.sun.azimuth=-Math.PI+.01;
 assert.ok(Math.abs(a.interpolateAstronomy(start,end,start.ms+15000).sun.azimuth-Math.PI)<.00001);
});
test('mountain occlusion smoothly removes reflections; bodies below horizon contribute none',()=>{
 const x=.7,y=r.mountainHorizon(x),radius=.02;
 assert.equal(r.discVisibility(x,y,radius,-.1),0);
 assert.equal(r.discVisibility(x,y+radius,radius,.1),0);
 assert.ok(Math.abs(r.discVisibility(x,y,radius,.1)-.5)<.00001);
 assert.equal(r.discVisibility(x,y-radius,radius,.1),1);
});
test('invalid and denied locations use explicit Rzeszow fallback; polar events stay absent',()=>{
 for(const value of [null,{}, {lat:NaN,lon:22},{lat:91,lon:22},{lat:50,lon:181}])assert.equal(a.landscapeLocation(value).source,'default-rzeszow');
 assert.equal(a.landscapeLocation({lat:51,lon:21}).source,'saved-location');
 const e=a.solarEvents(Date.parse('2026-06-21T12:00:00Z'),{lat:89,lon:0,source:'saved-location'});assert.equal(e.sunrise,null);assert.equal(e.sunset,null);
 // Same absolute time with different ISO offsets, including DST fallback, yields identical sky.
 assert.deepEqual(at('2026-10-25T02:30:00+02:00'),at('2026-10-25T00:30:00Z'));
 assert.notEqual(at('2026-10-25T02:30:00+02:00').sun.altitude,at('2026-10-25T02:30:00+01:00').sun.altitude);
});

test('solar palette makes daytime maps light and night maps dark with continuous readable ink',()=>{
 const {landscapePalette:palette}=load('lib/landscape-palette.ts');
 const noon=palette(at('2026-10-23T10:00:00Z')),night=palette(at('2026-10-26T22:00:00Z'));
 assert.match(noon['--landscape-map-filter'],/^invert\(0\.000%\)/);
 assert.match(night['--landscape-map-filter'],/^invert\(100\.000%\)/);
 assert.equal(noon['--landscape-ink'],'rgb(20,45,57)');assert.equal(night['--landscape-ink'],'rgb(244,248,252)');
 const sunset=a.solarEvents(Date.parse('2026-10-23T12:00:00Z'),place).sunset;
 for(let t=sunset-3600000;t<sunset+3600000;t+=60000){
  const p=palette(a.astronomyAt(t,place)),q=palette(a.astronomyAt(t+1000,place));
  const value=x=>Number(x['--landscape-map-filter'].match(/invert\(([\d.]+)/)[1]);assert.ok(Math.abs(value(p)-value(q))<.1);
 }
});
