const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const core=load('lib/place-search.ts',{'./transport/http':{requestJson:async()=>({features:[]})}});
test('pasted WGS84 coordinates accept standard and Polish separators without geocoding',()=>{
 for(const value of ['50.03897, 22.00282','50.03897 22.00282','50.03897;22.00282','50,03897; 22,00282','50,03897 22,00282','\n50.03897,\n22.00282\n']){
  const stop=core.parsePlaceCoordinates(value);assert.equal(stop.lat,50.03897,value);assert.equal(stop.lon,22.00282);assert.match(stop.id,/^journey:point:/);
 }
 assert.equal(core.parsePlaceCoordinates('-33.86, 151.2').lat,-33.86);
 for(const value of ['91, 22','50, 181','50.0','NaN, 22','Pro-Familia Rzeszów','50,,22','50 22 3'])assert.equal(core.parsePlaceCoordinates(value),null,value);
 assert.equal(core.looksLikePlaceCoordinates('91, 22'),true);assert.equal(core.looksLikePlaceCoordinates('3 Maja Rzeszów'),false);
});
const feature=(name,coordinates=[22.001,50.04])=>({geometry:{type:'Point',coordinates},properties:{name,street:'Witolda',housenumber:'6B',city:'Rzeszów',country:'Polska'}});
test('Photon GeoJSON uses longitude first, preserves POI names and deduplicates results',()=>{
 const results=core.photonPlaces({features:[feature('Pro-Familia'),feature('Pro-Familia'),feature('Broken',[22,91]),null,feature('Another',[22.1,50.1])]});
 assert.equal(results.length,2);assert.equal(results[0].stop.lat,50.04);assert.equal(results[0].stop.lon,22.001);assert.equal(results[0].stop.name,'Pro-Familia');assert.match(results[0].address,/Witolda 6B, Rzeszów/);assert.match(results[0].stop.id,/^journey:point:/);
 assert.throws(()=>core.photonPlaces({error:'bad'}));
 assert.deepEqual(core.photonPlaces({features:[feature('',[22,50])]}).map(r=>r.stop.name),['Witolda 6B']);
});
test('search sends encoded text and local bias, caches results and does not cache failures',async()=>{
 let calls=[];const {searchPlaces}=load('lib/place-search.ts',{'./transport/http':{requestJson:async(url)=>{calls.push(url);return {features:[feature('Pro-Familia')]};}}});
 const signal=new AbortController().signal;
 const first=await searchPlaces(' Pro-Familia Rzeszów ',[50.04,22],signal),again=await searchPlaces('Pro-Familia Rzeszów',[50.04,22],signal);
 assert.equal(calls.length,1);assert.deepEqual(first,again);const u=new URL(calls[0]);assert.equal(u.origin,'https://photon.komoot.io');assert.equal(u.searchParams.get('q'),'Pro-Familia Rzeszów');assert.equal(u.searchParams.get('lat'),'50.04');
 const aborted=new AbortController();aborted.abort();await assert.rejects(searchPlaces('other',[50,22],aborted.signal),e=>e.name==='AbortError');assert.equal(calls.length,1);
 const failing=load('lib/place-search.ts',{'./transport/http':{requestJson:async()=>{throw Error('offline');}}});
 await assert.rejects(failing.searchPlaces('offline',[50,22],signal),/offline/);
});
