// Compare against the actual pre-optimization implementation, not copied formulas.
const assert=require('node:assert/strict');
const path=require('node:path');
const beforeRoot=process.env.PERF_BASELINE_ROOT;
if(!beforeRoot)throw new Error('PERF_BASELINE_ROOT must point to the pre-optimization checkout');
function implementation(load) {
  const cache=new Map(),overrides={'@/lib/pks-client':{}};
  const domain=load('components/stops-panel/stop-domain.ts',overrides,'\nexport {normalizeStopName,repairTextEncoding};\n',cache);
  return {domain,catalog:load('lib/stops-catalog.ts',overrides,'',cache),markers:load('lib/map-stop-markers.ts',overrides,'',cache),positions:load('lib/stop-platform-position.ts',overrides,'',cache)};
}
const before=implementation(require(path.resolve(beforeRoot,'test/load-ts.cjs'))),after=implementation(require('./load-ts.cjs'));
const pks=Object.entries(require('../public/data/pks-stop-points.json').stops).map(([id,s])=>({...s,id,name:s.n+' '+s.code,lines:[]}));
const mpk=Object.entries(require('../public/data/bus-routes/mpk_rzeszow.json').stops).map(([id,s])=>({...s,id,lines:[]}));
const marcel=require('./fixtures/babica-dps-providers.json').marcel.map((s,i)=>({id:'marcel-fixture-'+i,name:s.nazMi+' - '+s.nazPr,matchName:s.nazPr,matchKey:before.domain.marcelCourseStopMatchKey(s),cityMatchKey:before.domain.marcelCourseStopIndexKey(s),lat:s.szGps,lon:s.dlGps,routeIds:[String(i)]}));
(async()=>{
  const original=global.fetch;
  try {global.fetch=async()=>({ok:true,json:async()=>require('../public/data/stop-platforms.json')});await Promise.all([before.positions.loadStopPlatforms(),after.positions.loadStopPlatforms()]);} finally {global.fetch=original;}
  const texts=[undefined,null,false,true,0,NaN,123,'','   ','Rzeszów D.A. st. 5','Gwoźnica Górna, Szkoła 19','Gwoźnica Górna, Szkoła 20','Jasionka, Stawy 2','Lisa-Kuli/Mochnackiego 03','RzeszĂłw Ĺ› Ĺ‚ Ä…','ul. al. dw. os. Łódź',...pks.map(s=>s.name),...mpk.map(s=>s.name),...marcel.map(s=>s.name)];
  for(let pass=0;pass<2;pass++)for(const text of texts)for(const name of ['repairTextEncoding','normalizeStopName'])assert.equal(after.domain[name](text),before.domain[name](text),name+' '+text);
  for(let i=0;i<9000;i++)after.domain.normalizeStopName('Cache eviction '+i);
  for(const text of texts)assert.equal(after.domain.normalizeStopName(text),before.domain.normalizeStopName(text));
  const sample={id:'test',name:'Rzeszów',lat:50,lon:22,lines:['108'],routeIds:['1'],sourceProviderIds:['pks']};
  for(const change of [{},{name:'Rzeszów D.A. st. 5'},{code:'03'},{areaId:'123'},{apiLat:50.01,apiLon:22.01},{lat:NaN,lon:null},{matchName:'Gwoźnica',matchKey:'19'},{lines:['108','312']},{routeIds:['1','2']},{sourceProviderIds:['pks','marcel']}]){
    Object.assign(sample,change);const values=[...pks,sample,null,undefined,0,''];
    assert.equal(after.domain.stopCollectionSignature(values),before.domain.stopCollectionSignature(values));
  }
  const mutable=structuredClone(pks);mutable[0].name='Changed name';mutable[0].lon+=.001;
  const datasets=[[pks,mpk,marcel],[pks.toReversed(),mpk.toReversed(),marcel.toReversed()],[mutable,mpk,marcel]];
  let compared=0;
  for(let i=0;i<datasets.length;i++){
    const inputs=datasets[i],key=inputs.map(after.domain.stopCollectionSignature).join('|');
    for(const physical of [false,true]){
      const old=before.catalog.buildStopsCatalog(...inputs,key,physical),current=after.catalog.buildStopsCatalog(...inputs,key,physical);
      assert.deepEqual(current,old,'complete catalog, aliases, order and coordinates: '+i+'/'+physical);
      assert.strictEqual(after.catalog.buildStopsCatalog(...inputs,key,physical),current,'cached catalog is reused');
      if(physical){
        for(const bbox of [[21.99,50.03,22.01,50.05],[21.8,49.8,22.2,50.2],[21.99,49.82,22.01,49.85]])for(const zoom of [15,16,19])assert.deepEqual(after.markers.visibleMapStops(current,bbox,zoom),before.markers.visibleMapStops(old,bbox,zoom));
        for(const stop of current)assert.deepEqual(after.positions.platformPosition(stop),before.positions.platformPosition(stop));
      }
      compared+=current.length;
    }
  }
  console.log(JSON.stringify({equivalent:true,pks:pks.length,mpk:mpk.length,marcel:marcel.length,comparedCatalogEntries:compared,checks:'full records, order, aliases, coordinates, visible markers, cache invalidation, text and signatures'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
