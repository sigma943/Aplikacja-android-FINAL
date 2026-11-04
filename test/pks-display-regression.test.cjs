const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{gunzipSync}=require('node:zlib'),load=require('./load-ts.cjs');
const date='2026-11-04',feed=JSON.parse(gunzipSync(fs.readFileSync('public/data/journeys/pks.json.gz')));
const gtfs=load('lib/pks-gtfs.ts'),clock=load('lib/transit-time.ts');
const labels={'203':'Siedliska','210':'Czudec, Dwór','228':'Nosówka, pętla','232':'Wola Zgłobieńska, pętla','288':'Pstrągowa'};
test('known PKS course names stay short, including offline, without renaming new or ambiguous courses',()=>{
 const oldStorage=global.localStorage,values=new Map();global.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 try{
  const source=gtfs.pksGtfsDepartures(feed,gtfs.pksGtfsTerminalStopIds(feed,'1937','4'),date);
  const legacy=source.filter(row=>labels[row.line_name]).map(row=>({...row,journey_id:'einfo:'+row.trip_id,route_description:labels[row.line_name],deviation:3}));
  const before=JSON.stringify(source),api=load('lib/pks-direction-labels.ts'),rows=api.mergePksDirectionLabels(source,legacy);
  for(const line of ['203','210','232','288']){assert.ok(rows.some(r=>r.line_name===line));assert.ok(rows.filter(r=>r.line_name===line).every(r=>r.route_description===labels[line]));}
  assert.equal(JSON.stringify(source),before);assert.ok(rows.every(r=>r.journey_id.startsWith('einfo:')));assert.ok(rows.every(r=>r.deviation===3));
  const offline=load('lib/pks-direction-labels.ts').mergePksDirectionLabels(source,[]);assert.deepEqual(offline.map(r=>r.route_description),rows.map(r=>r.route_description));
  const fresh={...source[0],line_name:'109',trip_id:'new',journey_id:'gtfs:new',route_description:'Nowa miejscowość p. Nową trasą'};
  assert.equal(api.mergePksDirectionLabels([fresh],legacy)[0].route_description,fresh.route_description);
  const ambiguous=[{...fresh,trip_id:'a'},{...fresh,trip_id:'b'}];assert.ok(api.mergePksDirectionLabels(ambiguous,[{...fresh,route_description:'Uncertain'}]).every(r=>r.route_description===fresh.route_description));
 }finally{if(oldStorage===undefined)delete global.localStorage;else global.localStorage=oldStorage;}
});
test('real terminal catalog has one card per physical bay and bay 4 badges match its departures',()=>{
 const factory={createGtfsRuntime:()=>({load:async()=>feed,peek:()=>feed,refresh:async()=>feed,status:()=>''})};
 const overrides={'./gtfs-runtime':factory,'./transit-time':{...clock,warsawDateIso:()=>date}};
 const runtime=load('lib/pks-gtfs-runtime.ts',overrides),index=runtime.pksGtfsIndex();
 const items=Object.entries(index.stops).map(([id,s])=>({stop_point_id:id,stop_area_name:s.n,stop_area_id:s.areaId,stop_point_code:s.code,location:s}));
 const points=load('lib/providers/pks-stops.ts').formatPksStops({items},{stops:index.stops});
 const catalogue=load('lib/stops-catalog.ts',overrides).buildStopsCatalog(Object.entries(points).map(([id,s])=>({...s,id,name:s.n})),[],[],'real-pks-display-regression');
 const platform=load('lib/stop-label.ts').rzeszowTerminalPlatform;
 const terminal=catalogue.filter(s=>s.areaId==='1937');
 assert.deepEqual(terminal.map(s=>Number(platform(s.name,s.code))),[0,1,2,3,4,5,6,7,8,9,10]);
 const color=load('lib/map-stop-markers.ts').mapStopColor;
 for(const stop of terminal)assert.equal(color(stop),'#14b8a6');
 for(const name of ['Rzeszów D.A. 4','Rzeszów D.A. 10'])assert.equal(color({name}),'#14b8a6');
 const lineFor=load('components/stops-panel/stop-domain.ts',{'@/lib/pks-gtfs-runtime':runtime}).pksLinesForStop;
 for(const code of ['1','4','7','10']){
  const matches=catalogue.filter(s=>platform(s.name,s.code)===code);assert.equal(matches.length,1,'one physical platform '+code);assert.equal(matches[0].areaId,'1937');
  const badges=lineFor(matches[0],runtime.pksGtfsLines());
  if(code==='4'){
   assert.equal(matches[0].id,'3720','retain the original platform identity and favourites');
   const departures=gtfs.pksGtfsDepartures(feed,gtfs.pksGtfsTerminalStopIds(feed,'1937',code),date);
   assert.ok(departures.length);assert.ok(badges.length);assert.ok(departures.every(r=>badges.includes(r.line_name)));
   assert.ok(['203','210','228','232','288'].every(line=>badges.includes(line)));
  }else {assert.deepEqual(badges,[],'arrival-only or unassigned bay has no passenger line badges');assert.equal(matches[0].timetableNotice,'Brak potwierdzonych odjazdów dla tego stanowiska w dostępnych danych.');}
 }
});
