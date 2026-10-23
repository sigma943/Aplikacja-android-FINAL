const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const SunCalc=require('suncalc');
const {horizonSnapshot,moonPhasePath,HORIZON_DEFAULT_LOCATION}=load('lib/horizon-sky.ts');
const {lat,lon}=HORIZON_DEFAULT_LOCATION;
test('solar disc descends through the horizon and night/stars increase continuously',()=>{
  const sunset=SunCalc.getTimes(new Date('2026-10-23T12:00:00Z'),lat,lon).sunset.getTime();
  const before=horizonSnapshot(sunset-30*60_000),at=horizonSnapshot(sunset),after=horizonSnapshot(sunset+60*60_000);
  assert.ok(before.sun.y<at.sun.y&&at.sun.y<after.sun.y);
  assert.ok(before.night<after.night&&before.stars<after.stars);
  assert.ok(before.sun.opacity>after.sun.opacity);assert.equal(after.sun.opacity,0);
  for(let t=sunset-60*60_000;t<sunset+90*60_000;t+=60_000){
    const a=horizonSnapshot(t),b=horizonSnapshot(t+1000);
    assert.ok(Math.abs(a.night-b.night)<.003);
    for(const color of ['top','bottom','accent'])for(const i of [1,3,5])assert.ok(Math.abs(parseInt(a[color].slice(i,i+2),16)-parseInt(b[color].slice(i,i+2),16))<=1);
  }
});
test('lunar illumination is astronomical while observer location changes orientation and altitude',()=>{
  for(const time of ['2026-10-10T12:00Z','2026-10-18T12:00Z','2026-10-26T12:00Z']){
    const ms=Date.parse(time),expected=SunCalc.getMoonIllumination(new Date(ms));
    const local=horizonSnapshot(ms,50,22),south=horizonSnapshot(ms,-34,151);
    assert.equal(local.moon.fraction,expected.fraction);assert.equal(local.moon.phase,expected.phase);
    assert.equal(local.moon.fraction,south.moon.fraction);
    assert.notEqual(local.moon.rotation,south.moon.rotation);assert.notEqual(local.moon.y,south.moon.y);
  }
});
test('moon terminator covers the actual fraction for crescents, quarters and gibbous phases',()=>{
  for(const fraction of [0,.05,.25,.5,.8,1]){
    const path=moonPhasePath(fraction),points=[...path.matchAll(/L(-?[\d.]+),(-?[\d.]+)/g)].map(m=>[+m[1],+m[2]]);
    assert.equal(points.length,49);assert.ok(path.endsWith(' Z'));
    assert.ok(Math.abs(points[24][0]-(1-2*fraction)*24)<.001);
  }
});
test('polar day, polar night and invalid stored locations remain finite',()=>{
  for(const date of ['2026-06-21T12:00Z','2026-12-21T12:00Z']){
    const sky=horizonSnapshot(Date.parse(date),89,20);
    assert.ok(Number.isFinite(sky.sun.x)&&Number.isFinite(sky.sun.y));
    assert.equal(sky.sunrise,null);assert.equal(sky.sunset,null);
  }
  const now=Date.parse('2026-10-23T12:00Z');assert.deepEqual(horizonSnapshot(now,NaN,999),horizonSnapshot(now));
});
test('horizon preset persists through theme normalization and appearance backups',()=>{
  const theme=load('lib/app-theme.ts'),{INTERFACE_PRESETS}=load('lib/interface-presets.ts');
  const p=INTERFACE_PRESETS.find(p=>p.theme==='dark-horizon');assert.equal(p.name,'Horyzont');
  assert.equal(theme.normalizeAppTheme(p.theme),p.theme);
  const {exportAppearanceBackup,parseAppearanceBackup}=load('lib/appearance-backup.ts');
  const profile={...p,id:'horizon',updatedAt:1},restored=parseAppearanceBackup(exportAppearanceBackup(profile,[profile],{},false));
  assert.equal(restored.current.theme,'dark-horizon');assert.equal(p.appearance.glassBlurEnabled,false);
});
