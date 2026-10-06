const {test}=require('node:test');const assert=require('node:assert/strict');const loadTs=require('./load-ts.cjs');
const {punctualityTimeClass}=loadTs('lib/punctuality-color.ts');
test('punctuality colours are white on time, green early and red late for every bus provider',()=>{
 for(const provider of ['pks','mpk_rzeszow','marcel']){
  assert.equal(punctualityTimeClass(0),'text-white',provider);
  assert.equal(punctualityTimeClass(-1),'text-emerald-500',provider);
  assert.equal(punctualityTimeClass(1),'text-rose-500',provider);
  assert.equal(punctualityTimeClass(undefined),'text-white',provider);
  assert.equal(punctualityTimeClass(NaN),'text-white',provider);
 }
});
test('Marcel badges warm visible courses with two requests, return positions immediately and reuse schedules',async()=>{
 const original=global.fetch, gates=[], courseCalls=[];let active=0,maxActive=0,lat=50.05;
 const clock=ms=>new Date(ms).toLocaleTimeString('sv-SE',{timeZone:'Europe/Warsaw',hour:'2-digit',minute:'2-digit'});
 const now=Date.now();const stops=[{kol:1,szGps:50,dlGps:22,godz:clock(now-33*60000),nazPr:'Początek'}, {kol:2,szGps:50.1,dlGps:22.1,godz:clock(now+27*60000),nazPr:'Koniec'}];
 const vehicles=()=>[1,2,3,4].map(id=>({idKu:id,szGps:id===4?51:lat,dlGps:id===4?23:22+lat-50,nazTr:'Lutcza-Rzeszów'}));
 global.fetch=async url=>{
  if(!String(url).includes('/kurs/'))return new Response(JSON.stringify(vehicles()));
  courseCalls.push(String(url));maxActive=Math.max(maxActive,++active);
  return new Promise(resolve=>gates.push(()=>{active--;resolve(new Response(JSON.stringify(stops)));}));
 };
 const options={pkpViewport:{bbox:[21.9,49.9,22.2,50.2]}};
 try{
  const api=loadTs('lib/pks-client.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}}});
  const notifications=[];
  const unsubscribe=api.subscribeMarcelCourseDelays(id=>notifications.push(id));
  const first=await api.fetchVehiclesClient(true,['marcel'],options);
  assert.equal(first.length,4);assert.ok(first.every(v=>v.delay===undefined));assert.equal(courseCalls.length,2);
  while(gates.length){gates.splice(0).forEach(release=>release());await new Promise(resolve=>setImmediate(resolve));}
  assert.equal(maxActive,2);assert.equal(courseCalls.length,3);assert.ok(!courseCalls.some(url=>url.includes('/kurs/4?')));
  // No click or second fleet poll: the original marker data gets its badge
  // immediately after the background request publishes the course.
  assert.deepEqual(new Set(notifications),new Set(['1','2','3']));
  const automatic=first.map(v=>api.withCachedMarcelDelay(v));
  assert.ok(automatic.slice(0,3).every(v=>v.delay>120));
  assert.equal(automatic[3].delay,undefined);
  assert.equal(first[0].delay,undefined); // Never mutate an old position snapshot.
  const movedMarker=api.withCachedMarcelDelay({...first[0],lat:50.07,lon:22.07});
  assert.ok(movedMarker.delay<0);
  assert.equal(api.withCachedMarcelDelay({...first[0],provider:'pks'}).delay,undefined);
  // Panning onto a new course warms it independently of the fleet poll.
  api.warmMarcelBadgeCourses(first,[22.9,50.9,23.1,51.1]);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(courseCalls.length,4);
  unsubscribe();
  gates.splice(0).forEach(release=>release());
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(notifications.length,3);
  const warmed=await api.fetchVehiclesClient(true,['marcel'],options);
  assert.ok(warmed.slice(0,3).every(v=>v.delay>120));assert.ok(Number.isFinite(warmed[3].delay));
  assert.ok(warmed.every(v=>v.routeStops.length===0));
  const details=await api.fetchVehicleDetailsClient('marcel','marcel_1');assert.equal(details.routeStops.length,2);assert.equal(courseCalls.length,4);
  lat=50.07;
  const moved=await api.fetchVehiclesClient(true,['marcel'],options);
  assert.ok(moved.slice(0,3).every(v=>v.delay<0));assert.equal(courseCalls.length,4);
 }finally{gates.splice(0).forEach(release=>release());global.fetch=original;}
});
test('Marcel marker HTML retains signed green/red badges including exactly one minute',()=>{
 const {getCachedBusIcon}=loadTs('components/BusMap.tsx',{'react-leaflet':{},leaflet:{divIcon:options=>options},'leaflet/dist/leaflet.css':{},'@/lib/pks-client':{}});
 const late=getCachedBusIcon('M','marcel_late',60,false,'#68c44a',0,true,'marcel','',16).html;
 const early=getCachedBusIcon('M','marcel_early',-60,false,'#68c44a',0,true,'marcel','',16).html;
 assert.match(late,/text-rose-600/);assert.match(late,/\+1/);
 assert.match(early,/text-emerald-600/);assert.match(early,/-1/);
});
