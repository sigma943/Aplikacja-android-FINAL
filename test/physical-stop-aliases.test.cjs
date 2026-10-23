const {test}=require('node:test');const assert=require('node:assert/strict');const load=require('./load-ts.cjs');
const {buildStopsCatalog}=load('lib/stops-catalog.ts',{'@/lib/pks-client':{}});
const pksAsset=require('../public/data/pks-stop-points.json').stops,mpkAsset=require('../public/data/bus-routes/mpk_rzeszow.json').stops;
test('merged aliases preserve old favorites and can be toggled off without touching other stops',()=>{
  const {stopIdentityIds,toggleStopFavoriteIds}=load('lib/stop-identity.ts');
  const aliases=stopIdentityIds({id:'11462',providerStopIds:{pks:'11462',mpk_rzeszow:'186'}});
  assert.deepEqual(aliases,['11462','mpk_rzeszow:186']);
  assert.deepEqual(toggleStopFavoriteIds(['mpk_rzeszow:186','other'],'11462',aliases),['other']);
  assert.deepEqual(toggleStopFavoriteIds(['other'],'11462',aliases),['other','11462']);
});
test('map selection resolves provider aliases without numeric ID collisions or a second pin',()=>{
  const {canonicalMapStopId}=load('lib/map-stop-markers.ts');
  const stops=[{id:'11462',providerStopIds:{pks:'11462',mpk_rzeszow:'186'}},{id:'186',providerStopIds:{pks:'186'}}];
  assert.equal(canonicalMapStopId(stops,'186','mpk_rzeszow'),'11462');
  assert.equal(canonicalMapStopId(stops,'mpk_rzeszow:186'),'11462');
  assert.equal(canonicalMapStopId(stops,'186','pks'),'186');
  assert.equal(canonicalMapStopId(stops,'missing','mpk_rzeszow'),'missing');
});
test('Marcel course selection resolves only one exact catalog locality/platform key',()=>{
  const {canonicalMapStopId}=load('lib/map-stop-markers.ts');
  const stops=[{id:'city-03',providerStopIds:{pks:'100',marcel:'stable-03',marcelCityMatchKeys:'rzeszow|podkarpacka matuszczaka 03'}},
    {id:'city-04',providerStopIds:{marcel:'stable-04',marcelCityMatchKeys:'rzeszow|podkarpacka matuszczaka 04'}},
    {id:'other-city',providerStopIds:{marcelCityMatchKeys:'krosno|podkarpacka matuszczaka 03'}}];
  const point={n:'Rzeszów - (15) Podkarpacka / Matuszczaka 03 (+)',lat:50.0168,lon:21.9754};
  assert.equal(canonicalMapStopId(stops,'100','marcel',point),'city-03');
  assert.equal(canonicalMapStopId(stops,'marcel:100',undefined,point),'city-03');
  assert.equal(canonicalMapStopId(stops,'100','pks',point),'city-03');
  assert.equal(canonicalMapStopId(stops,'stable-04','marcel',point),'city-04','explicit catalog ID wins');
  assert.equal(canonicalMapStopId(stops,'100','marcel',{...point,n:'Rzeszów - Podkarpacka / Matuszczaka 05'}),'marcel:100');
  assert.equal(canonicalMapStopId([...stops,{...stops[0],id:'ambiguous'}],'100','marcel',point),'marcel:100');
  assert.equal(canonicalMapStopId(stops,'100','marcel'),'marcel:100');
  assert.equal(canonicalMapStopId(stops,'100','mpk_rzeszow',point),'100');
});
test('actual Lisa-Kuli Moniuszki PKS 04 and MPK 02 share one identity and keep departure IDs',()=>{
  const pks=['11461','11462'].map(id=>({id,name:pksAsset[id].n+' '+pksAsset[id].code,...pksAsset[id],lines:['223']}));
  const mpk=['118','186'].map(id=>({id,...mpkAsset[id],lines:['8']}));
  for(const reversed of [false,true]){
    const inputPks=reversed?[...pks].reverse():pks,inputMpk=reversed?[...mpk].reverse():mpk;
    const key='lisa-kuli-alias-'+reversed;
    const list=buildStopsCatalog(inputPks,inputMpk,[],key),map=buildStopsCatalog(inputPks,inputMpk,[],key,true);
    assert.equal(list.length,3);assert.deepEqual(map.map(s=>s.providerStopIds),list.map(s=>s.providerStopIds));
    const shared=map.find(s=>s.providerStopIds.pks==='11462');
    assert.equal(shared.providerStopIds.mpk_rzeszow,'186');assert.equal(shared.code,'04');
    assert.deepEqual(shared.lines,['8','223']);assert.equal(shared.pksStopPoints[0].id,'11462');
    assert.equal(shared.lat,mpkAsset['186'].lat);assert.equal(shared.lon,mpkAsset['186'].lon);
    assert.equal(map.find(s=>s.providerStopIds.pks==='11461').providerStopIds.mpk_rzeszow,undefined);
  }
});
test('different operator codes require mutual unique neighbours and never collapse opposite platforms',()=>{
  const pks=[{id:'p1',name:'Rzeszów Testowa / Zielona 04',lat:50.04,lon:22,lines:[]},
    {id:'p2',name:'Rzeszów Testowa / Zielona 03',lat:50.04007,lon:22,lines:[]}];
  const mpk=[{id:'m1',name:'Testowa / Zielona 02',lat:50.04002,lon:22,lines:[]}];
  assert.equal(buildStopsCatalog(pks,mpk,[],'close-opposite-aliases').length,3);
  assert.equal(buildStopsCatalog(pks.slice(0,1),mpk,[],'unique-aliases').length,1);
  assert.equal(buildStopsCatalog(pks.slice(0,1),[{...mpk[0],lat:50.0403}],[],'distant-aliases').length,2);
  assert.equal(buildStopsCatalog(pks.slice(0,1),[{...mpk[0],lat:undefined,lon:undefined}],[],'no-gps-aliases').length,2);
});
test('station stands, different landmarks and numbered street names cannot override platform codes',()=>{
  const pairs=[['Boguchwała D.A. 01','Boguchwała D.A. 02'],['Rzeszów Testowa / Zielona 04','Testowa / Polna 02'],
    ['Rzeszów 3 Maja / Rynek 04','5 Maja / Rynek 02']];
  for(const [a,b] of pairs)assert.equal(buildStopsCatalog([{id:'p',name:a,lat:50.04,lon:22,lines:[]}],
    [{id:'m',name:b,lat:50.04001,lon:22,lines:[]}],[],'protected-alias-'+a).length,2);
});

test('Marcel courses match surveyed PKS platforms before the Marcel catalog is available, with original IDs and data preserved',()=>{
  const {canonicalMapStopId,marcelMapStopPoint}=load('lib/map-stop-markers.ts');
  const pks=Object.entries(pksAsset).map(([id,s])=>({...s,id,name:s.n+' '+(s.code||''),lines:[]}));
  const map=buildStopsCatalog(pks,[],[],'marcel-course-with-pks-only',true);
  const before=JSON.stringify(map);
  const course=require('./fixtures/marcel-jaslo-rzeszow-1181798.json').course;
  const expected={'36':'9026','37':'1374','38':'1366','39':'1142','40':'6155','41':'1035','42':'5810','44':'3908','45':'4765','46':'4698'};
  for(const [id,pksId] of Object.entries(expected)){
    const raw=course.find(s=>String(s.kol)===id);
    const point={n:raw.nazMi+' - '+raw.nazPr,lat:raw.szGps,lon:raw.dlGps};
    assert.equal(canonicalMapStopId(map,id,'marcel',point),pksId,point.n);
    const displayed=marcelMapStopPoint(map,id,point);
    const {platformPosition}=load('lib/stop-platform-position.ts');
    assert.deepEqual([displayed.lat,displayed.lon],Object.values(platformPosition(map.find(s=>s.id===pksId))));
    assert.equal(displayed.n,point.n);
    assert.deepEqual(point,{n:raw.nazMi+' - '+raw.nazPr,lat:raw.szGps,lon:raw.dlGps},'API data are not rewritten');
  }
  assert.equal(JSON.stringify(map),before,'catalog positions, aliases and provider grouping are unchanged');
});

test('Marcel fallback never borrows a numeric PKS ID, opposite direction, ambiguous platform, another locality or station stand',()=>{
  const {canonicalMapStopId,marcelMapStopPoint}=load('lib/map-stop-markers.ts');
  const base={id:'pks-01',name:'Babica DPS 01',code:'01',lat:49.934,lon:21.86,type:'bus',providerStopIds:{pks:'100'}};
  const point={n:'Babica - Dom Pomocy Społecznej 01 (+)',lat:49.93401,lon:21.86};
  assert.equal(canonicalMapStopId([base],'36','marcel',point),'pks-01');
  const ambiguous={...base,id:'pks-02',name:'Babica DPS 02',code:'02',lat:49.93406};
  assert.equal(canonicalMapStopId([base,ambiguous],'36','marcel',point),'marcel:36');
  assert.equal(canonicalMapStopId([base],'36','marcel',{...point,lat:49.935}),'marcel:36');
  assert.equal(canonicalMapStopId([base],'36','marcel',{...point,n:'Boguchwała - Dom Pomocy Społecznej 01'}),'marcel:36');
  assert.equal(canonicalMapStopId([base],'36','marcel',{...point,n:'Babica - Szkoła 01'}),'marcel:36');
  const collision={...base,id:'36',name:'Inny przystanek 36',code:'36'};
  assert.equal(canonicalMapStopId([collision],'36','marcel',point),'marcel:36');
  assert.equal(marcelMapStopPoint([collision],'36',point),point);
  assert.equal(canonicalMapStopId([{...base,name:'Babica D.A. 01'}],'36','marcel',{...point,n:'Babica - D.A. 01'}),'marcel:36');
  assert.equal(canonicalMapStopId([{...base,name:'Babica 45',code:'45'}],'36','marcel',{...point,n:'Babica - 53'}),'marcel:36');
  assert.equal(canonicalMapStopId([base],'36','marcel',{...point,lat:NaN}),'marcel:36');
});
test('Lisa-Kuli Jagiellonska 118 and Mochnackiego 440 stay separate on list, map and in line 35',()=>{
 const ids=['118','186','440','187','50'];
 const mpk=ids.map(id=>({id,...mpkAsset[id],lines:['35']})),pks=['11461','11462'].map(id=>({...pksAsset[id],id,name:pksAsset[id].n+' '+pksAsset[id].code,lines:[]}));
 for(const physical of [false,true]){
  const list=buildStopsCatalog(pks,mpk,[],'separate-lisa-platforms',physical),find=id=>list.find(s=>String(s.providerStopIds?.mpk_rzeszow).split(',').includes(id));
  const jag=find('118'),moch=find('440');assert.notEqual(jag.id,moch.id);assert.equal(jag.providerStopIds.mpk_rzeszow,'118');assert.equal(moch.providerStopIds.mpk_rzeszow,'440');
  assert.match(jag.name,/Jagiellońska/);assert.match(moch.name,/Mochnackiego/);
  assert.equal(jag.lat,mpkAsset['118'].lat);assert.equal(moch.lon,mpkAsset['440'].lon);
  const feed=JSON.parse(require('node:zlib').gunzipSync(require('node:fs').readFileSync('public/data/journeys/mpk.json.gz'))),{feedConnections}=load('lib/journey-timetable.ts');
  const connections=feedConnections(feed,list,'2026-10-20',{at:0,arriveBy:false,maxTransfers:1,walkMeters:500,transferMinutes:5,providers:['mpk'],sort:'fastest',day:'2026-10-20'});
  const leg=connections.find(c=>c.line==='35'&&c.from.providerStopIds?.mpk_rzeszow==='440');assert.ok(leg);assert.match(leg.from.name,/Mochnackiego/);assert.notEqual(leg.from.id,jag.id);
 }
});
