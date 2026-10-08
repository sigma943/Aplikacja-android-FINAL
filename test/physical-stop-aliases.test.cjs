const {test}=require('node:test');const assert=require('node:assert/strict');const load=require('./load-ts.cjs');
const {buildStopsCatalog}=load('lib/stops-catalog.ts',{'@/lib/pks-client':{}});
const pksAsset=require('../public/data/pks-stop-points.json').stops,mpkAsset=require('../public/data/bus-routes/mpk_rzeszow.json').stops;
test('map selection resolves provider aliases without numeric ID collisions or a second pin',()=>{
  const {canonicalMapStopId}=load('lib/map-stop-markers.ts');
  const stops=[{id:'11462',providerStopIds:{pks:'11462',mpk_rzeszow:'186'}},{id:'186',providerStopIds:{pks:'186'}}];
  assert.equal(canonicalMapStopId(stops,'186','mpk_rzeszow'),'11462');
  assert.equal(canonicalMapStopId(stops,'mpk_rzeszow:186'),'11462');
  assert.equal(canonicalMapStopId(stops,'186','pks'),'186');
  assert.equal(canonicalMapStopId(stops,'missing','mpk_rzeszow'),'missing');
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
