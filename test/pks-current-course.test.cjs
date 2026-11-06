const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {createPksSnapshotSelection}=load('lib/pks-snapshot-selection.ts');
const {warsawDateIso,warsawClock}=load('lib/transit-time.ts');
const now=Date.parse('2026-10-30T13:52:00Z');
function raw(at=now,future=false){
 return {vehicle_id:117,trip_id:future?'outbound-pattern':'inbound-pattern',
  journey:{journey_id:future?200:100,departure_time:warsawClock(at+(future?92:-40)*60_000),vehicle_journey_date:warsawDateIso(0,new Date(at)),line:{line_name:'108'},
   route:{description:future?'Gwoźnica Górna':'Rzeszów D.A.',stop_points:future?[3,2,1]:[1,2,3]}},
  position:{lat:49.9,long:21.9,position_date:new Date(at).toISOString(),speed:45,last_stop_point_number:future?0:1},
  next_stop_points:[{stop_point_id:2,planned_departure_time:new Date(at+10*60_000).toISOString()},{stop_point_id:3,planned_departure_time:new Date(at+30*60_000).toISOString()}]};
}
test('PKS 117: prefer fresh confirmed inbound course over a prematurely assigned outbound course',()=>{
 const select=createPksSnapshotSelection(),current=raw(),future=raw(now,true);
 select.remember('direct',[current],1,now);select.remember('panel',[future],1,now);
 assert.equal(select.select([future],now)[0],current);
 assert.equal(select.select([current],now)[0],current);
});
test('an actual future course, stale alternatives and uncertain progress are never guessed into an active trip',()=>{
 const future=raw(now,true);
 const variants=[raw(now-121_000),{...raw(),position:{...raw().position,last_stop_point_number:3}},
  {...raw(),position:{...raw().position,last_stop_point_number:undefined}},
  {...raw(),position:{...raw().position,lat:50.2}},
  {...raw(),next_stop_points:[]},
  {...raw(),journey:{...raw().journey,route:{...raw().journey.route,is_technical:true}}},
  {...raw(),next_stop_points:[{planned_departure_time:new Date(now-10*60_000).toISOString()}]}];
 for(const other of variants){const select=createPksSnapshotSelection();select.remember('direct',[other],1,now);assert.equal(select.select([future],now)[0],future);}
 const select=createPksSnapshotSelection();assert.equal(select.select([future],now)[0],future);
 select.remember('direct',[raw()],1,now-31_000);assert.equal(select.select([future],now)[0],future,'expired completed snapshots cannot pick a journey');
});
test('source comparison uses vehicle identity, fresh GPS and response version, not a hardcoded destination',()=>{
 const select=createPksSnapshotSelection(),current=raw(),future=raw(now,true);
 current.vehicle_id=987;current.journey.line.line_name='310';current.journey.route.description='Inny kierunek';future.vehicle_id=987;
 select.remember('direct',[current],2,now);select.remember('direct',[future],1,now+1);
 assert.equal(select.select([future],now)[0],current,'a late response cannot overwrite a newer response');
 assert.equal(select.select([{...future,vehicle_id:117}],now)[0].vehicle_id,117);
});
test('late slower PKS response fixes the next poll without delaying fastest-source loading or extra HTTP requests',async()=>{
 let completeDirect,requests=0;const current=raw(Date.now()),future=raw(Date.now(),true);
 const client=load('lib/pks-client.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}},
  './transport/http':{isNative:()=>false,requestJson:url=>{requests++;return String(url).includes('get_vehicles')?new Promise(resolve=>{completeDirect=resolve;}):Promise.resolve({items:[future]});}},
 },'\nexport {fetchPksVehiclesSnapshot};');
 const initial=await client.fetchPksVehiclesSnapshot();assert.equal(initial[0],future);assert.equal(requests,2);
 completeDirect([current]);await new Promise(resolve=>setImmediate(resolve));
 const next=await client.fetchPksVehiclesSnapshot();assert.equal(next[0],current);assert.equal(requests,4);
 completeDirect([current]);
});

function actualMerge(){
 const fs=require('node:fs'),ts=require('typescript');
 const source=ts.createSourceFile('page.tsx',fs.readFileSync('app/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let expression;
 function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='mergeVehicleDetails')expression=node.initializer.getText(source);ts.forEachChild(node,visit);}visit(source);
 assert.ok(expression);const display=load('lib/home/vehicle-display.ts'),operating=load('lib/bus-operating-state.ts');
 return new Function('useCallback','sameVehicleCourse','latestPksRemainingSchedule','busOperatingState',ts.transpile(`const merge=${expression};`,{target:ts.ScriptTarget.ES2022})+';return merge;')
  (fn=>fn,display.sameVehicleCourse,display.latestPksRemainingSchedule,operating.busOperatingState);
}
test('actual Home merge never imports a cached future countdown into a live active PKS course',()=>{
 const at=Date.now(),merge=actualMerge();
 const base={id:'117',provider:'pks',tripId:'pattern',journeyId:100,direction:'Rzeszów D.A.',status:'active',speed:45,lat:49.9,lon:21.9,
  lastSignalTime:new Date(at).toISOString(),routeStops:[{id:1,lat:49.8,lon:21.8,planned:new Date(at-600_000).toISOString()},{id:2,lat:50.04,lon:22,planned:new Date(at+600_000).toISOString()}]};
 const details={...base,status:'break',nextTripStartAtMs:at+92*60_000,nextTripFirstStopId:1};
 const result=merge(base,details);assert.equal(result.status,'active');assert.equal(result.direction,'Rzeszów D.A.');assert.equal(result.nextTripStartAtMs,undefined);
 const changed={...details,journeyId:200,direction:'Gwoźnica Górna'};
 assert.equal(merge(base,changed),base,'matching trip pattern is insufficient when journey/direction changed');
});
test('PKS detail cache distinguishes both trip and journey identities and direction',()=>{
 const {vehicleRouteDetailsCacheKey:key,sameVehicleCourse}=load('lib/home/vehicle-display.ts');
 const v={id:'117',provider:'pks',journeyId:100,tripId:'pattern',direction:'Rzeszów D.A.'};
 for(const next of [{...v,tripId:'other'},{...v,journeyId:200},{...v,direction:'Gwoźnica Górna'}])assert.notEqual(key(v,'pks',false),key(next,'pks',false));
 const today={...v,lastSignalTime:'2026-10-30T13:52:00Z',routeStops:[],schedule:[{planned:'2026-10-30T13:00:00Z'}]},tomorrow={...today,lastSignalTime:'2026-10-31T13:52:00Z',schedule:[{planned:'2026-10-31T13:00:00Z'}]};
 assert.notEqual(key(today,'pks',false),key(tomorrow,'pks',false));assert.equal(sameVehicleCourse(today,tomorrow),false);
});
test('an uncontradicted future PKS course retains its real countdown, including deadheading',()=>{
 const {busOperatingState}=load('lib/bus-operating-state.ts');
 for(const speed of [0,16,60]){
  const result=busOperatingState({lat:49.9,lon:21.9,speed,nowMs:now,firstDepartureMs:now+92*60_000,firstStopId:1,stops:[]});
  assert.equal(result.status,'break');assert.equal(result.nextTripStartAtMs,now+92*60_000);
 }
});

test('actual bus panel labels a confirmed future assignment as the next course, not current direction',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const Panel=load('components/BusDetailsPanel.tsx').default;
 const props={preview:true,busDrag:{height:200,syncHeight:()=>{}},busHeaderRef:{current:null},isBusPanelExpanded:false,setIsBusPanelExpanded:()=>{},
  transparentUI:true,isDark:false,mapDetailPanel:'',mapDetailContent:'',mapDetailCard:'',mapDetailDivider:'',mapDetailLine:'',selectedBusHeaderStyle:{},
  selectedVehicleIsTrain:false,selectedBusStatusLabel:'Przerwa',selectedBusGpsSignalClock:'14:51',breakCountdownLabel:'92:37',selectedBusIsWaitingForDeparture:true,
  selectedBusScheduleLoading:false,selectedBusDisplayedStops:[],selectedStopId:null,selectedVehicleColor:'#14b8a6',textSub:'',textMain:'',themeColor:'#14b8a6',openVehicleRouteStop:()=>{},formatScheduleStopName:n=>n};
 const vehicle={id:'117',provider:'pks',direction:'Gwoźnica Górna',status:'break',nextTripStartAtMs:Date.now()+92*60_000};
 const render=v=>renderToStaticMarkup(React.createElement(Panel,{...props,selectedBus:v}));
 assert.match(render(vehicle),/Następny kurs:/);
 assert.match(render({...vehicle,direction:'Rzeszów D.A.',status:'active',nextTripStartAtMs:undefined}),/Kierunek:/);
});
