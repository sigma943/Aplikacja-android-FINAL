const {test}=require('node:test');const assert=require('node:assert/strict');const loadTs=require('./load-ts.cjs');
const {vehicleStopDeparture,departureFromLiveVehicle,timedVehicleStops}=loadTs('lib/vehicle-stop-timing.ts');
const {departureCountdown}=loadTs('lib/departure-display.ts');
const {upcomingVehicleStops}=loadTs('lib/vehicle-upcoming-stops.ts');
const now=Date.parse('2026-10-07T11:45:20Z'),planned=now+10*60000;
const vehicle={id:'117',provider:'pks',journeyId:42,routeShortName:'108',direction:'Gwoźnica',status:'active',dataAgeSec:5,lastSignalTime:new Date(now).toISOString()};
const stop={id:2083,name:'Baryczka',planned:new Date(planned).toISOString(),real:new Date(planned+60_000).toISOString()};
for(const delay of [-180,0,180])test(`PKS stop board, map stop sheet and vehicle timetable agree for ${delay}s`,()=>{
  const bus={...vehicle,delay,routeStops:[stop]};
  const row={id:'course42',courseId:'42',stopId:'2083',line:'108',carrier:{id:'pks'},plannedAtMs:planned,realAtMs:planned+60_000,realtimeSource:'stop-board'};
  const board=departureFromLiveVehicle(row,[bus]);const panel=vehicleStopDeparture(bus,stop);
  assert.equal(board.realAtMs,panel.realAtMs);
  assert.equal(board.delayMins,panel.delayMins);
  assert.equal(departureCountdown(board,now),departureCountdown(panel,now));
  assert.equal(board.realAtMs,planned+delay*1000,'a known deviation is applied exactly once');
});
test('PKS live correction never borrows another course or stale/inactive bus',()=>{
  const row={id:'42',courseId:'42',stopId:'2083',line:'108',carrier:{id:'pks'},plannedAtMs:planned};
  for(const change of [{journeyId:43},{dataAgeSec:121},{status:'break'},{routeShortName:'288'}])
    assert.equal(departureFromLiveVehicle(row,[{...vehicle,delay:60,...change}]),row);
  const tomorrow={...row,plannedAtMs:planned+24*3600_000};
  assert.equal(departureFromLiveVehicle(tomorrow,[{...vehicle,delay:180,lastSignalTime:new Date(now).toISOString()}]),tomorrow);
  const withoutCourse={...row,courseId:undefined};
  assert.equal(departureFromLiveVehicle(withoutCourse,[{...vehicle,delay:60,routeStops:[{...stop,id:999}]}]),withoutCourse);
});
test('delayed stops stay upcoming until their corrected time; early stops disappear after departure',()=>{
  const passedPlan={...stop,planned:new Date(now-60_000).toISOString(),real:null};
  const late={...vehicle,delay:180,routeStops:[passedPlan]};
  assert.equal(upcomingVehicleStops(timedVehicleStops(late),now).length,1);
  const early={...vehicle,delay:-180,routeStops:[{...stop,planned:new Date(now+60_000).toISOString(),real:null}]};
  assert.equal(upcomingVehicleStops(timedVehicleStops(early),now).length,0);
});
const {mapStopColor,visibleMapStops,mapStopIconHtml}=loadTs('lib/map-stop-markers.ts');
test('city and rural stop colours, zoom threshold, viewport and selection are deterministic',()=>{
  const city={id:'city',type:'bus',name:'Rzeszów, Przemysłowa',lat:50,lon:22};
  const rural={id:'rural',type:'bus',name:'Baryczka 69',lat:50.001,lon:22.001};
  assert.equal(mapStopColor(city),'#ff7a00');assert.equal(mapStopColor(rural),'#14b8a6');
  for(const name of ['Rzeszów D.A. st. 5','Rzeszów D.A. stanowisko 1','Rzeszów, Dworzec Autobusowy 02','Rzeszów Dworzec PKS 03'])assert.equal(mapStopColor({name}),'#14b8a6');
  assert.equal(mapStopColor({name:'Rzeszów, Dworzec Główny PKP 01'}),'#ff7a00');
  assert.deepEqual(visibleMapStops([city,rural],[21.9,49.9,22.1,50.1],15),[]);
  assert.equal(visibleMapStops([city,rural,{...rural,id:'far',lat:49}], [21.9,49.9,22.1,50.1],16,'rural')[0].id,'rural');
  assert.match(mapStopIconHtml('#ff7a00',true),/is-selected/);
  assert.match(mapStopIconHtml('#ff7a00',false),/fill="currentColor"/);
});
const {cleanRoadJunctionLoops,roadRouteMatchesStops}=loadTs('lib/bus-road-geometry.ts');
test('small junction loop is removed while real stop excursions and longer road loops survive',()=>{
  const start=[50,22],join=[50,22.002],a=[50.0001,22.002],b=[50.0001,22.0021],end=[50,22.004];
  const route=[start,join,a,b,join,end];
  assert.deepEqual(cleanRoadJunctionLoops(route,[start,end]),[start,join,end]);
  const withStop=cleanRoadJunctionLoops(route,[start,a,end]);
  assert.deepEqual(withStop,route);assert.ok(roadRouteMatchesStops(withStop,[start,a,end]));
  const large=[start,join,[50.001,22.002],[50.001,22.003],join,end];
  assert.deepEqual(cleanRoadJunctionLoops(large,[start,end]),large);
});
