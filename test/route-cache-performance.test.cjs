const {test}=require('node:test');
const assert=require('node:assert/strict');
const loadTs=require('./load-ts.cjs');
const encode=require('./encode-polyline.cjs');

test('course IDs and clocks do not invalidate geometry; direction, order and stop variants do',()=>{
  const {routeGeometryKey:key}=loadTs('lib/route-geometry-key.ts');
  const stops=[{id:1,lat:50,lon:22,time:'10:00'},{id:2,lat:50.01,lon:22.01}];
  const a=key('road','marcel','M','Rzeszów',stops);
  assert.equal(a,key('road','marcel','M','Rzeszow',stops.map(s=>({...s,id:'different',time:'11:00'}))));
  assert.notEqual(a,key('road','marcel','M','Sanok',stops));
  assert.notEqual(a,key('road','marcel','M','Rzeszów',[...stops].reverse()));
  assert.notEqual(a,key('road','marcel','M','Rzeszów',[stops[0],{...stops[1],lon:22.02}]));
});

test('Marcel geometry persists with the same identity used by the map and ignores course variants',async()=>{
  const previous=global.fetch, oldWindow=global.window;
  const values=new Map(); let calls=0;
  global.window={localStorage:{setItem:(key,value)=>values.set(key,value)}};
  const points=[[50,22],[50.01,22.01]];
  global.fetch=async()=>{calls++;return new Response(JSON.stringify({trip:{legs:[{shape:encode(points)}]}}));};
  try {
    const client=loadTs('lib/pks-client.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}}});
    const {routeGeometryKey}=loadTs('lib/route-geometry-key.ts');
    const request={carrier:'marcel',line:'M',direction:'Rzeszów',variant:'course-1',mode:'road',dataVersion:'road-v9-validated-stop-waypoints',stops:points.map(([lat,lon],id)=>({lat,lon,id}))};
    await client.fetchRouteGeometryClient(request);
    const key=routeGeometryKey('road','marcel','M','Rzeszow',request.stops);
    const saved=JSON.parse(values.get('routeGeometry:'+key));
    assert.deepEqual(saved.points,points);assert.equal(saved.version,request.dataVersion);assert.ok(saved.expiresAt>Date.now());
    await client.fetchRouteGeometryClient({...request,variant:'course-2'});
    assert.equal(calls,1);
  } finally {global.fetch=previous;if(oldWindow===undefined)delete global.window;else global.window=oldWindow;}
});

test('timetable ticks reuse Warsaw conversions and shared formatters, preserving winter and summer time',()=>{
  const Original=Intl.DateTimeFormat; let formats=0, constructors=0;
  Intl.DateTimeFormat=class extends Original {
    constructor(...args){super(...args);constructors++;}
    formatToParts(...args){formats++;return super.formatToParts(...args);}
  };
  try {
    const {warsawTimeMs}=loadTs('lib/transit-time.ts');
    assert.equal(warsawTimeMs('2026-01-07','10:00'),Date.parse('2026-01-07T09:00:00Z'));
    assert.equal(warsawTimeMs('2026-10-07','10:00'),Date.parse('2026-10-07T08:00:00Z'));
    assert.equal(warsawTimeMs('2026-10-07','25:10'),Date.parse('2026-10-07T23:10:00Z'));
    const cold=formats;
    for(let tick=0;tick<100;tick++) for(let row=0;row<200;row++) warsawTimeMs('2026-10-07','10:00');
    assert.equal(formats,cold);assert.equal(constructors,3);
  } finally {Intl.DateTimeFormat=Original;}
});
