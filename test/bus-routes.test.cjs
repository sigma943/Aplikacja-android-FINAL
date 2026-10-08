const {test}=require('node:test');
const assert=require('node:assert/strict');
const loadTs=require('./load-ts.cjs');
const fs=require('node:fs');
const {busOperatingState,transitTimestamp}=loadTs('lib/bus-operating-state.ts');
const {decodePolyline,routeChunks,joinRouteChunks}=loadTs('lib/bus-road-geometry.ts');
const {mpkFeedVehicles,mpkSignalTime}=loadTs('lib/mpk-vehicle-feed.ts');
const now=Date.parse('2026-10-05T10:00:00Z');
const first={id:1,lat:50,lon:22,planned:'2026-10-05T10:05:00Z'};
const last={id:2,lat:50.1,lon:22.1,planned:'2026-10-05T10:45:00Z'};

test('current MPK JSON feed loads positions and uses GPS timestamp rather than signed wait duration',()=>{
  const rows=mpkFeedVehicles(require('./fixtures/mpk-vehicles.json'));
  assert.ok(rows.length>20);
  const row=rows.find(row=>row.nb==='102');
  assert.equal(row.tripid,'219833');
  assert.equal(mpkSignalTime(row,Date.now()),Number(row.timestamp)*1000);
  assert.ok(Number(row.is)<0);
  assert.ok(!('remaining_stops' in row));
});

test('break at the first stop includes the exact next trip countdown',()=>{
  const result=busOperatingState({lat:50,lon:22,speed:0,nowMs:now,stops:[first,last]});
  assert.equal(result.status,'break');assert.equal(result.nextTripStartAtMs,now+300000);assert.equal(result.nextTripFirstStopId,1);
});
test('future intermediate departures and a stationary intermediate stop are active trips',()=>{
  const result=busOperatingState({lat:50.05,lon:22.05,speed:0,nowMs:now,stops:[{...first,planned:'2026-10-05T09:45:00Z'},last]});
  assert.equal(result.status,'active');
  assert.equal(busOperatingState({lat:50,lon:22,speed:20,nowMs:now,stops:[first,last]}).status,'active');
});
test('completed terminal is a break, but an active circular route is not',()=>{
  assert.equal(busOperatingState({lat:last.lat,lon:last.lon,speed:0,nowMs:now,stops:[first,{...last,planned:'2026-10-05T09:59:00Z'}]}).status,'break');
  assert.equal(busOperatingState({lat:first.lat,lon:first.lon,speed:0,nowMs:now,stops:[{...first,planned:'2026-10-05T09:45:00Z'},{...first,planned:'2026-10-05T10:45:00Z'}]}).status,'active');
});
test('PKS wall clock timestamps are interpreted in Warsaw regardless of device timezone',()=>{
  assert.equal(transitTimestamp('2026-10-05 19:37:00'),Date.parse('2026-10-05T17:37:00Z'));
});
test('bus routing retains all stops, overlapping chunks and loops',()=>{
  const points=Array.from({length:70},(_,i)=>[50+i/1000,22]);points[69]=points[0];
  const chunks=routeChunks(points);assert.ok(chunks.every(chunk=>chunk.length<=10));assert.deepEqual(joinRouteChunks(chunks),points);
  assert.throws(()=>routeChunks(points,25));
  assert.throws(()=>joinRouteChunks([chunks[0],[]]));
  assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@',5),[[38.5,-120.2],[40.7,-120.95],[43.252,-126.453]]);
});
test('official geometry uses distinct PKS/MPK files and exact trip IDs',async()=>{
  const original=global.fetch;const urls=[];
  global.fetch=async url=>{urls.push(String(url));return new Response(fs.readFileSync('public'+url));};
  try {
    const {officialBusRoute}=loadTs('lib/official-bus-routes.ts');
    const pks=await officialBusRoute('pks','7780',[]),mpk=await officialBusRoute('mpk_rzeszow','219833',[]);
    assert.ok(pks.length>100);assert.ok(mpk.length>100);
    assert.ok(urls.some(url=>url.includes('/pks/643.json')));assert.ok(urls.some(url=>url.includes('/mpk_rzeszow/25.json')));
    assert.notDeepEqual(pks,mpk);
  }finally{global.fetch=original;}
});
test('PKS panel loads the full ordered route, names and positions, not just upcoming stops',async()=>{
  const original=global.fetch;const raw=structuredClone(require('./fixtures/pks-vehicle.json'));raw.position.position_date=new Date().toISOString();const snapshot=require('../public/data/pks-stop-points.json');
  global.fetch=async url=>{
    let data;
    if(String(url).includes('get_vehicles.php'))data=[raw];
    else if(String(url)==='/api/pks/vehicles')data={items:[]};
    else if(String(url)==='/api/pks/einfo/stop-point')data={items:raw.journey.route.stop_points.map(id=>({stop_point_id:id,stop_point_code:snapshot.stops[id].code,name:snapshot.stops[id].n,stop_area_name:snapshot.stops[id].n,location:{lat:snapshot.stops[id].lat,lon:snapshot.stops[id].lon}}))};
    else data=JSON.parse(fs.readFileSync('public'+url));
    return new Response(JSON.stringify(data));
  };
  try {
    const api=loadTs('lib/pks-client.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}}});
    const result=await api.fetchVehicleDetailsClient('pks','16');
    assert.equal(result.routeStops.length,raw.journey.route.stop_points.length);
    assert.deepEqual(result.routeStops.map(stop=>stop.id),raw.journey.route.stop_points);
    assert.ok(result.routeStops.every(stop=>stop.name&&!stop.name.includes('nieznany')));
    assert.ok(result.routeStops.every(stop=>Number.isFinite(stop.lat)&&Number.isFinite(stop.lon)));
  }finally{global.fetch=original;}
});
test('PKS route renders from bundled GTFS geometry with live IDs and corrected map coordinates',async()=>{
  const original=global.fetch;
  const raw=require('./fixtures/pks-vehicle.json');
  const snapshot=require('../public/data/pks-stop-points.json').stops;
  const index=require('../public/data/bus-routes/pks.json');
  const ids=raw.journey.route.stop_points;
  const coordinates=ids.map(id=>[snapshot[id].lat,snapshot[id].lon]);
  const urls=[];
  global.fetch=async url=>{urls.push(String(url));return new Response(fs.readFileSync('public'+url));};
  try {
    const {officialBusRoute}=loadTs('lib/official-bus-routes.ts');
    assert.equal(index.stopShapes[ids.join('-')],undefined);
    assert.notDeepEqual(ids.map(String),index.patterns[index.tripPatterns[raw.trip_id]]);
    const route=await officialBusRoute('pks',raw.trip_id,ids,coordinates);
    assert.ok(route.length>100,'complete official route must render without a routing service');
    assert.equal(urls.length,2);
    assert.deepEqual(await officialBusRoute('pks',raw.trip_id,[...ids].reverse(),[...coordinates].reverse()),[]);
    assert.deepEqual(await officialBusRoute('pks',raw.trip_id,ids.slice(1),coordinates.slice(1)),[]);
    assert.deepEqual(await officialBusRoute('pks',raw.trip_id,ids,coordinates.map(([lat,lon])=>[lat+1,lon])),[]);
  }finally{global.fetch=original;}
});
test('MPK trip coordinates use MPK stop namespace and exact advanced trip data',async()=>{
  const original=global.fetch;const fixture=require('./fixtures/mpk-trip.json');
  global.fetch=async url=>new Response(JSON.stringify(String(url).includes('get_trip_stops_advanced')?fixture:[]));
  try {
    const api=loadTs('lib/pks-client.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}}},'\nexport {fetchMpkTripSchedule};');
    const result=await api.fetchMpkTripSchedule('219833',0);
    assert.equal(result.routeStops.length,fixture.stops.length);
    assert.equal(result.routeStops[0].name,'Dworzec Główny PKP 01');
    assert.equal(result.routeStops[0].lat,50.042346);assert.equal(result.routeStops[0].lon,22.006614);
  }finally{global.fetch=original;}
});

test('a new live course ID reuses the unique complete bundled stop pattern without a routing server',async()=>{
  const original=global.fetch,raw=require('./fixtures/pks-vehicle.json'),snapshot=require('../public/data/pks-stop-points.json').stops;
  const ids=raw.journey.route.stop_points,coordinates=ids.map(id=>[snapshot[id].lat,snapshot[id].lon]);
  global.fetch=async url=>new Response(fs.readFileSync('public'+url));
  try{
    const {officialBusRoute}=loadTs('lib/official-bus-routes.ts');
    const points=await officialBusRoute('pks','live-new-course-id',ids,coordinates);
    assert.ok(points.length>100);
    assert.deepEqual(await officialBusRoute('pks','live-new-course-id',ids.slice(1),coordinates.slice(1)),[]);
    assert.deepEqual(await officialBusRoute('pks','live-new-course-id',ids,coordinates.map(([lat,lon])=>[lat+1,lon])),[]);
  }finally{global.fetch=original;}
});
test('coordinate pattern fallback rejects ambiguous shapes and preserves return-leg order',async()=>{
  const original=global.fetch,a=[50,22],b=[50.01,22.01];
  global.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/pks.json')?{tripShapes:{},tripPatterns:{},stopShapes:{'1-2':'one','3-4':'two'},patterns:[['1','2'],['3','4']],stops:{'1':{lat:a[0],lon:a[1]},'2':{lat:b[0],lon:b[1]},'3':{lat:a[0],lon:a[1]},'4':{lat:b[0],lon:b[1]}}}:[a,b]));
  try{const {officialBusRoute}=loadTs('lib/official-bus-routes.ts');
    assert.deepEqual(await officialBusRoute('pks','new',[90,91],[a,b]),[]);
    assert.deepEqual(await officialBusRoute('pks','new',[90,91],[b,a]),[]);
    assert.deepEqual(await officialBusRoute('pks','new',[90,91,90],[a,b,a]),[]);
  }finally{global.fetch=original;}
});

test('actual PKS 251/bus 107 renders the entire road route including the Sołonka return leg',async()=>{
  const raw=require('./fixtures/pks-251-107-2026-10-08.json'),snapshot=require('../public/data/pks-stop-points.json').stops;
  const ids=raw.journey.route.stop_points,coords=ids.map(id=>[snapshot[id].lat,snapshot[id].lon]);
  const oldFetch=global.fetch;global.fetch=async url=>new Response(fs.readFileSync('public'+url));
  try{
    const {officialBusRoute}=loadTs('lib/official-bus-routes.ts'),{roadRouteMatchesStops}=loadTs('lib/bus-road-geometry.ts');
    const route=await officialBusRoute('pks',raw.trip_id,ids,coords);
    assert.ok(route.length>1000);assert.ok(roadRouteMatchesStops(route,coords,180));
    const approximate=structuredClone(coords);approximate[ids.indexOf(1946)]=[49.894206,21.940075];
    assert.equal(roadRouteMatchesStops(route,approximate,180),false,'old approximate Sołonka point rejected this complete route');
    assert.deepEqual(await officialBusRoute('pks',raw.trip_id,[...ids].reverse(),[...coords].reverse()),[]);
    assert.deepEqual(await officialBusRoute('pks',raw.trip_id,ids.slice(1),coords.slice(1)),[]);
    assert.ok((await officialBusRoute('pks','new-251-course',ids,coords)).length>1000);
  }finally{global.fetch=oldFetch;}
});
