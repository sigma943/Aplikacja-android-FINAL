const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const fixture=require('./fixtures/pks-terminal-mixed-api-groups.json');
const {processTimetable,fetchDeparturesClient}=load('lib/providers/pks-departures.ts',{'../transport/http':{requestEinfoJson:async path=>{
 if(path.startsWith('stop-point-timetable/'))return fixture;
 return {journeys:[
  {journey_id:23274,line_name:'210',route_description:'Czudec, Dwór',timetable_time:'2026-10-20T06:10:00+02:00',deviation:120},
  {journey_id:23221,line_name:'251',route_description:'Straszydle',timetable_time:'2026-10-20T05:30:00+02:00',deviation:60},
  {journey_id:21800,line_name:'215',route_description:'Kamień',timetable_time:'2026-10-20T20:15:00+02:00',deviation:180},
 ]};
}}});
const {pksPhysicalPlatform,pksTerminalLines}=load('lib/pks-terminal-timetable.ts');
const rows=code=>processTimetable(fixture,fixture.date,code,'1937');
test('real API group 1 splits into physical bays 4 and 2, never physical bay 1',()=>{
 const before=JSON.stringify(fixture);
 assert.ok(rows('4').some(r=>r.journey_id===23274&&r.line_name==='210'));
 assert.ok(rows('2').some(r=>r.journey_id===23221&&r.line_name==='251'));
 assert.ok(!rows('4').some(r=>r.line_name==='251'));
 assert.equal(rows('1').length,0);
 assert.equal(JSON.stringify(fixture),before,'raw API identities remain unchanged');
});
test('only the reviewed Kamien 20:15 weekday course moves from group 0 to bay 10',()=>{
 const ten=rows('10');assert.equal(ten.length,1);assert.equal(ten[0].journey_id,21800);
 assert.ok(!rows('0').some(r=>r.journey_id===21800));
 assert.ok(rows('0').some(r=>r.line_name==='215'),'other MKS courses must remain in group 0');
 assert.equal(rows('7').length,0,'no invented departures for bay 7');
});
test('a reused course, another terminal or already corrected API data is not reassigned',()=>{
 const course=fixture.items.find(i=>i.line_name==='210').journeys[0];
 assert.equal(pksPhysicalPlatform('1937','210','Czudec, Dwór',course),'4');
 for(const changed of [{time:'06:11'},{journey_id:999999},{legends:['+']},{stop_point_code:'2'}])
  assert.equal(pksPhysicalPlatform('1937','210','Czudec, Dwór',{...course,...changed}),String(changed.stop_point_code??course.stop_point_code));
 assert.equal(pksPhysicalPlatform('999','210','Czudec, Dwór',course),'1');
 assert.equal(pksPhysicalPlatform('1937','211','Czudec, Dwór',course),'1');
 assert.equal(pksPhysicalPlatform('1937','210','Inny kierunek',course),'1');
});
test('line badges follow physical bay assignments rather than API group 1',()=>{
 assert.ok(pksTerminalLines('1937','4').includes('210'));
 assert.ok(!pksTerminalLines('1937','4').includes('251'));
 assert.deepEqual(pksTerminalLines('1937','10'),['215']);
 assert.deepEqual(pksTerminalLines('1937','1'),[]);
 assert.equal(pksTerminalLines('999','4'),null);
});
test('live boards cannot put another physical bay back into a timetable',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-20T05:00:00+02:00')});
 const four=await fetchDeparturesClient('3720','1937','4',fixture.date);
 assert.ok(four.journeys.some(r=>r.journey_id===23274&&r.deviation===120));
 assert.ok(!four.journeys.some(r=>r.journey_id===23221||r.journey_id===21800));
 const one=await fetchDeparturesClient('3731','1937','1',fixture.date);
 assert.equal(one.journeys.length,0);
 const ten=await fetchDeparturesClient('terminal:rzeszow-da:10','1937','10',fixture.date);
 assert.equal(ten.journeys.length,1);assert.equal(ten.journeys[0].deviation,180);
});
