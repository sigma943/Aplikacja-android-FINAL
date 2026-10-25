const test=require('node:test'),assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
const a=load('lib/landscape-astronomy.ts'),r=load('lib/landscape-renderer.ts');
const place=a.DEFAULT_LANDSCAPE_LOCATION;
const at=iso=>a.astronomyAt(Date.parse(iso),place);
test('clouds continue their original steady drift',()=>{
 assert.ok(r.cloudOffset(3)-r.cloudOffset(0)>=12);
 assert.ok(Math.abs(r.cloudOffset(61)-r.cloudOffset(60))<=12);
});
test('mirrored cloud coverage is continuous at tile edges and through the complete drift cycle',()=>{
 for(const x of [0,.2,.7,1])for(const seconds of [0,1000/require('../lib/landscape-water-calibration.json').cloudSpeed,2000/require('../lib/landscape-water-calibration.json').cloudSpeed]){
  const before=r.cloudSampleX(x,r.cloudOffset(seconds-.0001)),after=r.cloudSampleX(x,r.cloudOffset(seconds+.0001));
  assert.ok(Math.abs(before-after)<.00001,'no coverage jump at the loop seam');
 }
 for(const seam of [-1,0,1,2])assert.ok(Math.abs(r.cloudSampleX(seam-.00001,0)-r.cloudSampleX(seam+.00001,0))<1e-9);
});
test('power policy keeps a live world in saver mode and recovers from one expensive frame',()=>{
 const {landscapeMotionPolicy:p,landscapeFrameBudget:budget}=load('lib/landscape-motion.ts');
 const base={hidden:false,nativeActive:true,reduced:false,light:false,limited:false,critical:false,slow:false};
 assert.equal(p(base).animate,true);assert.ok(p(base).interval<100);
 assert.equal(p({...base,light:true}).animate,true);assert.equal(p({...base,light:true}).interval,1000/15);
 assert.equal(p({...base,limited:true}).animate,true);assert.equal(p({...base,limited:true}).interval,1000/15);
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

test('solar palette makes daytime maps light and night maps dark with readable ink through twilight',()=>{
 const {landscapePalette:palette}=load('lib/landscape-palette.ts');
 const noon=palette(at('2026-10-23T10:00:00Z')),night=palette(at('2026-10-26T22:00:00Z'));
 assert.match(noon['--landscape-map-filter'],/^invert\(0\.000%\)/);
 assert.match(night['--landscape-map-filter'],/^invert\(100\.000%\)/);
 assert.equal(noon['--landscape-ink'],'rgb(11,27,38)');assert.equal(night['--landscape-ink'],'rgb(244,248,252)');
 // Across a whole twilight, only readable map endpoints are targeted.
 // Map filters switch directly so roads never pass through a grey midpoint.
 const sunset=a.solarEvents(Date.parse('2026-10-23T12:00:00Z'),place).sunset;
 for(let t=sunset-3600000;t<sunset+3600000;t+=60000){
  const p=palette(a.astronomyAt(t,place));
  assert.match(p['--landscape-map-filter'],/^invert\((0|100)\.000%\)/);
  assert.ok(p['--landscape-ink'].startsWith('rgb('));
 }
});

test('solar glass stays translucent with restrained colours throughout dawn and dusk',()=>{
 const {landscapePalette:palette}=load('lib/landscape-palette.ts');
 const numbers=value=>value.match(/[\d.]+/g).map(Number);
 const luminance=color=>color.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 let previous;
 for(let altitude=-18;altitude<=60;altitude+=.01){
  const p=palette({sun:{altitude:altitude*Math.PI/180}}),surface=numbers(p['--landscape-surface']),ink=numbers(p['--landscape-ink']);
  assert.ok(surface[3]===.64,'artwork remains visible at solar altitude '+altitude);
  for(const key of ['field','panel-row'])assert.ok(numbers(p['--landscape-'+key])[3]<=.30,'nested surfaces do not accumulate opaque fills');
  assert.ok(ink.every(value=>Number.isFinite(value)));
  const values=['surface','field','panel-scrim','panel-row','nav-top','nav-bottom'].flatMap(key=>numbers(p['--landscape-'+key]));
  if(previous&&previous.day===p['--landscape-ink'])assert.ok(values.every((v,i)=>Math.abs(v-previous.values[i])<=2),'temperature stays continuous within each material at '+altitude);
  previous={day:p['--landscape-ink'],values};
 }
 const sunset=palette({sun:{altitude:Math.PI/180}});
 const surface=numbers(sunset['--landscape-surface']);
 assert.ok(luminance(numbers(palette({sun:{altitude:30*Math.PI/180}})['--landscape-surface']).slice(0,3))>.8,'daytime cards must be light');
 assert.ok(luminance(numbers(palette({sun:{altitude:-15*Math.PI/180}})['--landscape-surface']).slice(0,3))<.03,'nighttime cards must be dark');
 assert.ok(surface[0]>surface[2],'sunset glass keeps a subtle warm tint');
 assert.ok(Math.max(...surface.slice(0,3))-Math.min(...surface.slice(0,3))<40,'sunset tint never becomes saturated pink or orange');
});

test('sunrise and sunset reuse the same two readable material families',()=>{
 const {landscapePalette:palette}=load('lib/landscape-palette.ts');
 const levels=[30,12,6,3,0,-2,-4,-6,-12,-18];
 const values=levels.map(altitude=>palette({sun:{altitude:altitude*Math.PI/180}})['--landscape-surface']);
 assert.deepEqual([...levels].reverse().map(altitude=>palette({sun:{altitude:altitude*Math.PI/180}})['--landscape-surface']),[...values].reverse());
 for(const value of values){
  const channels=value.match(/[\d.]+/g).slice(0,3).map(Number);
  assert.ok(channels.every(v=>v>220)||channels.every(v=>v<50),'no grey intermediate material');
 }
});

test('solar material uses the saved opacity across every period, including fully opaque mode',()=>{
 const {landscapePalette:p}=load('lib/landscape-palette.ts');
 for(const altitude of [-15,-3,0,5,30])for(const opacity of [20,40,64,85,100]){
  const value=p({sun:{altitude:altitude*Math.PI/180}},opacity);
  assert.equal(Number(value['--landscape-surface'].match(/[\d.]+/g).pop()),opacity/100);
  for(const key of ['panel-scrim','nav-top','nav-bottom'])assert.equal(Number(value['--landscape-'+key].match(/[\d.]+/g).pop()),opacity/100);
 }
});


test('solid solar materials keep AA contrast while translucent opacity remains user-controlled',()=>{
 const {landscapePalette:p}=load('lib/landscape-palette.ts');
 const numbers=c=>c.startsWith('#')?[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)):c.match(/[\d.]+/g).map(Number);
 const lum=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 for(let altitude=-18;altitude<=60;altitude+=.25)for(const opacity of [100]){
  const palette=p({sun:{altitude:altitude*Math.PI/180}},opacity);
  for(const material of ['panel-scrim','nav-top','nav-bottom'])for(const background of [0,255]){
   const rgba=numbers(palette['--landscape-'+material]);
   const bg=lum(rgba.slice(0,3).map(v=>v*rgba[3]+background*(1-rgba[3])));
   for(const foreground of ['ink','muted','accent']){
    const fg=lum(numbers(palette['--landscape-'+foreground]));
    assert.ok((Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)>=4.5,`${altitude} / ${opacity} / ${material} / ${foreground}`);
   }
  }
 }
});
test('solar period dead band avoids flicker and handles direct clock jumps',()=>{
 const {isLandscapeDay:day}=load('lib/landscape-palette.ts');
 const state=degrees=>({sun:{altitude:degrees*Math.PI/180}});
 assert.equal(day(state(-2),true),true);assert.equal(day(state(-2),false),false);
 assert.equal(day(state(-3),true),false);assert.equal(day(state(-1),false),true);
 assert.equal(day(state(30),false),true);assert.equal(day(state(-18),true),false);
});

test('mountain materials apply saved panel tint, border and native control colour scheme',()=>{
 const {landscapePalette:p}=load('lib/landscape-palette.ts'),{normalizeInterfaceAppearance:n}=load('lib/interface-appearance.ts');
 for(const day of [true,false]){
  const state={sun:{altitude:(day?30:-18)*Math.PI/180}},a=p(state,35,day,n({surfaceTint:'custom',panelColor:'#ff0088',panelTintStrength:55,borderStrength:32}));
  assert.equal(a['--landscape-color-scheme'],day?'light':'dark');
  assert.notEqual(a['--landscape-surface'],p(state,35,day)['--landscape-surface']);
  assert.match(a['--landscape-edge'],/0.32\)$/);
  assert.equal(a['--landscape-view-veil'],undefined);
  for(const key of ['surface','panel-scrim','nav-top','nav-bottom'])assert.match(a['--landscape-'+key],/0.35\)$/);
 }
});

// Reference: https://www.timeanddate.com/astronomy/poland/rzeszow (25 Oct 2026).
test('Warsaw DST days and Sun/Moon rise-set agree with Rzeszow references',()=>{
 const autumn=a.landscapeDayBounds(Date.parse('2026-10-25T12:00Z')),spring=a.landscapeDayBounds(Date.parse('2026-03-29T12:00Z'));
 assert.equal(autumn.end-autumn.start,25*3600000);assert.equal(spring.end-spring.start,23*3600000);
 const references=[['2026-10-24','07:08','17:23','+02:00'],['2026-10-25','06:09','16:21','+01:00'],['2026-10-26','06:11','16:19','+01:00']];
 for(const [date,rise,set,offset]of references){
  const events=a.solarEvents(Date.parse(date+'T12:00:00'+offset),place);
  for(const [key,clock]of [['sunrise',rise],['sunset',set]])assert.ok(Math.abs(events[key]-Date.parse(date+'T'+clock+':00'+offset))<90000,key+' '+date);
  assert.deepEqual(a.solarEvents(Date.parse(date+'T00:05:00'+(date==='2026-10-25'?'+02:00':offset)),place),events,'same local day around midnight');
 }
 const moon=a.lunarEvents(Date.parse('2026-10-25T12:00:00+01:00'),place);
 assert.ok(Math.abs(moon.moonrise-Date.parse('2026-10-25T15:35:00+01:00'))<90000);
 assert.ok(Math.abs(moon.moonset-Date.parse('2026-10-25T05:12:00+01:00'))<90000);
});
test('both bodies rise vertically at their actual apparent horizon and stay inside the sky',()=>{
 const ms=Date.parse('2026-10-25T12:00Z'),events={...a.solarEvents(ms,place),...a.lunarEvents(ms,place)};
 for(const kind of ['sun','moon']){
  const rise=events[kind==='sun'?'sunrise':'moonrise'],set=events[kind==='sun'?'sunset':'moonset'];
  for(const t of [rise,set]){
   const body=a.astronomyAt(t,place)[kind],point=a.projectCelestial(body,kind),radius=(kind==='sun'?26:36)/(1000*1850/850);
   assert.equal(point.x,kind==='sun'?.32:.68);assert.ok(Math.abs(point.y-radius-r.mountainHorizon(point.x))<.0015,'upper limb at skyline: '+kind);
  }
  assert.ok(a.projectCelestial(a.astronomyAt(rise-60000,place)[kind],kind).y>a.projectCelestial(a.astronomyAt(rise+60000,place)[kind],kind).y);
  assert.ok(a.projectCelestial(a.astronomyAt(set-60000,place)[kind],kind).y<a.projectCelestial(a.astronomyAt(set+60000,place)[kind],kind).y);
  for(let h=0;h<24;h++){const body=a.astronomyAt(ms+h*3600000,place)[kind];if(a.apparentLandscapeAltitude(body,kind)>0){const p=a.projectCelestial(body,kind);assert.equal(p.x,kind==='sun'?.32:.68);assert.ok(p.y>.06);}}
 }
});
test('cloud thinning preserves silhouettes with roughly a quarter less coverage',()=>{
 const {cloudDensity}=load('lib/landscape-clouds.ts');let sum=0,min=1,max=0;
 for(let y=0;y<50;y++)for(let x=0;x<100;x++){const n=cloudDensity(x/100,y/100);assert.ok(n>=0&&n<=1);sum+=n;min=Math.min(min,n);max=Math.max(max,n);}
 assert.ok(sum/5000>.70&&sum/5000<.8);assert.ok(min>=.66-1e-12&&max<=.84+1e-12,'never carve a new edge through a cloud');assert.ok(max-min>.1);
});

test('simultaneous sunset and moonrise have separate tracks and a gentle twilight handover',()=>{
 const s=at('2026-10-25T16:10:00+01:00'),sun=a.projectCelestial(s.sun),moon=a.projectCelestial(s.moon,'moon');
 assert.ok(s.sun.altitude>0&&s.moon.altitude>0,'real simultaneous visibility is retained');
 assert.ok(moon.x-sun.x>.3,'discs cannot overlap even at matching heights');
 assert.ok(a.moonPresentationOpacity(s.sun.altitude)<.4,'Moon stays subdued while the Sun sets');
 let previous=0;
 for(let degrees=3;degrees>=-8;degrees-=.02){const opacity=a.moonPresentationOpacity(degrees*Math.PI/180);assert.ok(opacity>=previous-1e-12&&opacity>=.1-1e-12&&opacity<=1+1e-12);if(previous)assert.ok(opacity-previous<.01);previous=opacity;}
 assert.equal(a.moonPresentationOpacity(-10*Math.PI/180),1);
});
