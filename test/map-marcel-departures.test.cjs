const {test}=require('node:test');const assert=require('node:assert/strict');const load=require('./load-ts.cjs');
const snapshot=require('../public/data/pks-stop-points.json').stops;
const north=require('./fixtures/marcel-jaslo-rzeszow-1181798.json').course.find(s=>s.kol===40);

test('opening the already selected Lutoryz 89N loads both PKS and Marcel departures and excludes opposite 76N',async()=>{
  const date='2026-10-07';
  const opposite={nazMi:'Lutoryż',nazPr:'Babia Góra 76N',szGps:snapshot['6154'].lat,dlGps:snapshot['6154'].lon,godz:'14:15'};
  const terminal={nazMi:'Rzeszów',nazPr:'Dworzec 01',szGps:50.04,dlGps:22,godz:'14:35'};
  const api={fetchMarcelRoutesClient:async()=>[{idTr:18},{idTr:3}],fetchMarcelCoursesClient:async route=>[{idKu:String(route)==='18'?1:2,nazTr:String(route)==='18'?'Jasło-Rzeszów':'Rzeszów-Jasło'}],
    fetchMarcelPublicCourseStopsClient:async id=>[id===1?{...north,godz:'14:05'}:opposite,terminal],fetchMarcelLivePositionsClient:async()=>[],estimateMarcelCourseDelay:()=>undefined,
    fetchDeparturesClient:async()=>({journeys:[{line_name:'108',route_description:'Rzeszów D.A.',timetable_time:'2026-10-07T12:00:00Z'}]}),fetchMpkRzeszowDeparturesClient:async()=>[]};
  const domain=load('components/stops-panel/stop-domain.ts',{'@/lib/pks-client':api});
  const {buildStopsCatalog}=load('lib/stops-catalog.ts',{'@/lib/pks-client':api});
  const {refreshMapStopSource}=load('lib/map-stop-source.ts');
  const {stopRequestKey}=load('lib/stop-timetable-store.ts');
  const pks=['6155','6154'].map(id=>({...snapshot[id],id,name:snapshot[id].n+' '+snapshot[id].code,lines:['108']}));
  const before=buildStopsCatalog(pks,[],[],'lutoryz-no-marcel',true);
  const selected=before.find(s=>s.id==='6155');const original=structuredClone(selected);
  const courseSelection={...selected,id:'40',name:north.nazMi+' - '+north.nazPr,lat:north.szGps,lon:north.dlGps,sourceProviderIds:['marcel'],providerStopIds:{marcelCityMatchKeys:domain.marcelCourseStopIndexKey(north)},pksStopPoints:undefined};
  const pending=refreshMapStopSource(courseSelection,before);
  assert.ok(pending.sourceProviderIds.includes('marcel'),'a known live Marcel source is preserved while its catalog loads');
  assert.equal(pending.pksStopPoints[0].id,'6155');
  const indexed=await domain.getMarcelStopsIndex(date);
  const catalog=buildStopsCatalog(pks,[],indexed,'lutoryz-with-marcel',true);
  const enriched=refreshMapStopSource(selected,catalog);
  assert.deepEqual(enriched.sourceProviderIds,['pks','marcel']);
  assert.equal(enriched.providerStopIds.marcelRouteIds,'18');
  assert.notEqual(stopRequestKey(enriched),stopRequestKey(selected),'an open panel reloads when its departure sources arrive');
  assert.deepEqual([enriched.id,enriched.name,enriched.lat,enriched.lon],[selected.id,selected.name,selected.lat,selected.lon]);
  assert.deepEqual(selected,original,'selected marker data are not mutated');
  const loader=load('lib/stop-departures.ts',{'@/lib/pks-client':api,'../pks-client':api,
    '@/components/stops-panel/stop-domain':{...domain,selectedDateIso:()=>date}}).loadStopDepartures;
  const first=await loader(selected);assert.deepEqual(first.departures.map(row=>row.line),['108']);
  const result=await loader(enriched);
  assert.ok(result.departures.some(row=>row.line==='108'));
  const marcel=result.departures.filter(row=>row.carrier?.id==='marcel');
  assert.equal(marcel.length,1,JSON.stringify({result,refs:enriched.providerStopIds}));assert.equal(marcel[0].direction,'Rzeszów');assert.equal(marcel[0].courseId,'1');
  const rows=load('lib/map-stop-departures.ts').mapStopDepartureRows(result.departures,[],Date.parse('2026-10-07T11:45:20Z'));
  assert.ok(rows.some(row=>row.line==='M'&&row.color==='#68c44a'));
  assert.ok(rows.some(row=>row.line==='108'));
});

test('map catalogue discovery is lazy, publishes partial aliases and ignores updates after closing',async()=>{
  const original=global.window;const tasks=[],displayed=[];let effect,partial,finish,calls=0;
  global.window={setTimeout:fn=>{tasks.push(fn);return tasks.length;},clearTimeout(){},addEventListener(){},removeEventListener(){}};
  const ref={current:[]};
  const hook=load('lib/use-map-stops.ts',{
    react:{useState:()=>[[],value=>displayed.push(value)],useRef:()=>ref,useEffect:fn=>{effect=fn;}},
    './stops-catalog-async':{buildStopsCatalogAsync:async(p,m,r)=>[{id:'6155',providers:r.map(s=>s.id)}]},
    './stops-catalog-cache':{readStopsCatalogCache:async()=>null,peekStopsCatalogCache:()=>null},
    './pks-client':{fetchMpkRzeszowStopsClient:async()=>[]},
    '@/components/stops-panel/stop-domain':{stopCollectionSignature:rows=>JSON.stringify(rows),ensureMpkCityPrefix:name=>name,selectedDateIso:()=> '2026-10-07',
      getMarcelStopsIndex:(date,options)=>{calls++;partial=options.onPartial;return new Promise(resolve=>finish=resolve);}},
  });
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  try{
    hook.useMapStops(true,[{id:'6155',name:'Lutoryż 89N'}]);let cleanup=effect();await tick();
    assert.equal(calls,0,'showing map icons alone must not download the Marcel timetable catalog');cleanup();
    hook.useMapStops(true,[{id:'6155',name:'Lutoryż 89N'}],true);cleanup=effect();await tick();assert.equal(calls,1);
    partial([{id:'marcel-89n'}]);tasks.at(-1)();await tick();assert.deepEqual(displayed.at(-1)[0].providers,['marcel-89n']);
    const taskCount=tasks.length;cleanup();partial([{id:'late'}]);finish([{id:'late'}]);await tick();assert.equal(tasks.length,taskCount);
  }finally{global.window=original;}
});
