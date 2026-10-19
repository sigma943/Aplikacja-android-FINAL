const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {journeyDepartureLabel}=load('lib/journey-label.ts');
const {buildStopsCatalog}=load('lib/stops-catalog.ts',{'@/lib/pks-client':{}});
const {formatPksStops}=load('lib/providers/pks-stops.ts');
const {visibleMapStops}=load('lib/map-stop-markers.ts');
const {rzeszowTerminalPlatform}=load('lib/stop-label.ts');
test('a terminal departure on foot has no assigned platform; bus departures and later boarding keep it',()=>{
 const from={id:'3723',name:'Rzeszów D.A. st. 2',code:'2'};
 const leg={from,walking:185};
 assert.equal(journeyDepartureLabel(leg),'Rzeszów D.A.');
 assert.equal(journeyDepartureLabel({...leg,walking:0}),'Rzeszów D.A.');
 assert.equal(journeyDepartureLabel({...leg,walking:undefined}),'Rzeszów D.A. st. 2');
 assert.equal(journeyDepartureLabel(leg,1),'Rzeszów D.A. st. 2');
 assert.equal(journeyDepartureLabel({from:{name:'Rzeszów Lisa-Kuli 03'},walking:30}),'Rzeszów Lisa-Kuli 03');
 assert.equal(from.name,'Rzeszów D.A. st. 2');
});
test('the real PKS snapshot retains all terminal platforms in both list and map, even when the endpoint omits them',()=>{
 const snapshot=require('../public/data/pks-stop-points.json');
 const terminal=Object.entries(snapshot.stops).filter(([,s])=>s.areaId==='1937');
 const items=terminal.map(([id,s])=>({stop_point_id:id,stop_area_name:s.n,name:s.n,stop_area_id:s.areaId,stop_point_code:s.code,location:s}));
 const raw=Object.entries(formatPksStops({items},snapshot)).map(([id,s])=>({...s,id,name:s.n}));
 const before=JSON.stringify(raw);
 const list=buildStopsCatalog(raw,[],[],'terminal-completeness');
 const map=buildStopsCatalog(raw,[],[],'terminal-completeness',true);
 const codes=stops=>stops.map(s=>rzeszowTerminalPlatform(s.name,s.code)).sort((a,b)=>Number(a)-Number(b));
 assert.deepEqual(codes(list),['0','1','2','3','4','5','6','7','8','9','10']);
 assert.deepEqual(codes(map),codes(list));
 assert.equal(new Set(list.map(s=>s.id)).size,11);
 assert.equal(list.find(s=>s.code==='4').providerStopIds.pks,'3720');
 for(const code of ['7','10'])assert.equal(list.find(s=>s.code===code).providerStopIds.pks,undefined);
 assert.equal(visibleMapStops(map,[22.002,50.041,22.005,50.043],18).length,11);
 assert.equal(JSON.stringify(raw),before);
 const again=buildStopsCatalog(list,[],[],'terminal-already-present');
 assert.equal(again.length,11);
});
test('surveyed platforms query the exact terminal timetable without sending a local ID to the live board API',async()=>{
 const requests=[],day=load('lib/transit-time.ts').warsawDateIso();
 const client=load('lib/providers/pks-departures.ts',{'../transport/http':{requestEinfoJson:async path=>{
  requests.push(path);
  assert.equal(path,'stop-point-timetable/1937?day='+day);
  return {items:[{line_name:'test',journeys:[{stop_point_code:'10',time:'12:00',journey_id:'ten'},{stop_point_code:'7',time:'12:00',journey_id:'seven'}]}]};
 }}});
 const ten=await client.fetchDeparturesClient('terminal:rzeszow-da:10','1937','10',day);
 assert.deepEqual(ten.journeys.map(j=>j.journey_id),['ten']);
 assert.equal(ten.warning,undefined);
 const seven=await client.fetchDeparturesClient('terminal:rzeszow-da:7','1937','7',day);
 assert.deepEqual(seven.journeys.map(j=>j.journey_id),['seven']);
 assert.equal(requests.length,1,'terminal platforms reuse the area timetable');
});
