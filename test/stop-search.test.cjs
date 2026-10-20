const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {normalizeStopSearch,createStopSearchIndex,searchStops}=load('lib/stop-search.ts');
const stop=(id,name,provider='pks',extra={})=>({id,name,type:'bus',carriers:[{id:provider,name:provider,colorClass:''}],lines:[],isFavorite:false,...extra});
const stops=[stop('journey:rzeszow-da','Rzeszów D.A.'),stop('b82','Babica 82'),stop('b28','Babica 28'),stop('kol','Babica Kolonia'),stop('lancut','Łańcut Rynek'),stop('sw','Świlcza PKP 03','mpk'),stop('gl','Głowienka 04','marcel'),stop('pkp','Rzeszów Dworzec Główny PKP 01','mpk'),stop('dyn','Dynów D.A.'),stop('dep','Błażowa Zajezdnia PKS'),stop('park1','Park Miejski'),stop('park2','Park Technologiczny'),stop('park3','Za Parkiem')];
const index=createStopSearchIndex(stops),ids=(q,options)=>searchStops(index,q,options).map(s=>s.id);

test('case, Polish letters, punctuation, whitespace and dotted/spaced abbreviations normalize only search text',()=>{
 for(const q of ['RZESZOW','rzeszów','rZeSzÓw'])assert.deepEqual(ids(q),ids('rzeszow'));
 for(const q of ['Rzeszów D.A.','rzeszow da','RZESZOW D A','rzeszow d.a',' Rzeszów,  D. A. '])assert.equal(ids(q)[0],'journey:rzeszow-da');
 assert.equal(normalizeStopSearch('ĄĆĘŁŃÓŚŹŻ 82-28/03'),'acelnoszz 82 28 03');
 assert.equal(normalizeStopSearch('A. Mickiewicza, P.K.S. S.K.R. D. A. 82'),'a mickiewicza pks skr da 82');
 assert.equal(normalizeStopSearch('S K R P K P'),'skr pkp');
 for(const [q,id] of [['lancut','lancut'],['swilcza','sw'],['glowienka','gl']])assert.ok(ids(q).includes(id));
});
test('official prefixes, infixes, incomplete tokens and word order work without autoselection',()=>{
 assert.deepEqual(ids('bab').filter(id=>id.startsWith('b')||id==='kol'),['b82','b28','kol']);
 assert.equal(ids('babica kol')[0],'kol');
 assert.ok(ids('lisa kuli').length===0);
 const lisa=stop('lisa','Rzeszów, Lisa-Kuli / Jagiellońska 01');
 assert.equal(searchStops(createStopSearchIndex([lisa]),'kuli lisa')[0],lisa);
 for(const q of ['rzesz da','dworzec autobusowy rzeszow'])assert.equal(ids(q)[0],'journey:rzeszow-da');
 for(const q of ['rzeszow dworzec','dworzec rzeszow']){assert.ok(ids(q).includes('journey:rzeszow-da'));assert.ok(ids(q).includes('pkp'),'an unspecified station must not hide the railway option');}
 assert.ok(ids('park').includes('park3'),'infix matches remain available');
});
test('small typos and transpositions are accepted below every complete literal match',()=>{
 for(const [q,id] of [['rzeszuw','journey:rzeszow-da'],['babca kolonia','kol'],['babica kolonja','kol'],['lancot','lancut'],['rzeszwo','journey:rzeszow-da']])assert.ok(ids(q).includes(id),q);
 const exact=stop('exact','Babca Kolonia'),fuzzy=stops.find(s=>s.id==='kol');
 assert.equal(searchStops(createStopSearchIndex([fuzzy,exact]),'babca kolonia')[0],exact);
 assert.deepEqual(ids('bx'),[],'no fuzzy search for two letters');
 assert.deepEqual(ids('zzzzzzzzz'),[],'a bounded-distance sentinel must never become a valid long prefix typo');
 assert.deepEqual(ids('babica nieistnieje'),[],'one common matched word cannot replace all meaningful query tokens');
});
test('numeric platforms are exact, including leading zeros, with no digit transposition',()=>{
 assert.equal(ids('babica 82')[0],'b82');assert.ok(!ids('babica 82').includes('b28'));
 assert.deepEqual(ids('babica 28'),['b28']);assert.deepEqual(ids('babica 83'),[]);
 const items=[stop('a','Babica 28','pks',{code:'82'}),stop('b','Babica 82'),stop('c','Babica 02')],idx=createStopSearchIndex(items);
 assert.equal(searchStops(idx,'babica 82')[0].id,'b');assert.equal(searchStops(idx,'babica 2')[0].id,'c');
 const terminal=stop('3731','Rzeszów D.A. st. 1','pks',{code:'1'}),two=stop('3723','Rzeszów D.A. st. 2','pks',{code:'2'}),tidx=createStopSearchIndex([terminal,two]);
 for(const q of ['rzeszow da 2','dworzec pks 02','rzeszow stanowisko2'])assert.deepEqual(searchStops(tidx,q).map(s=>s.id),['3723']);
});
test('configured aliases use qualified identities, preserve all ambiguous results, and never rename a stop',()=>{
 const before=JSON.stringify(stops);
 for(const q of ['dworzec autobusowy','dworzec pks']){assert.equal(ids(q)[0],'journey:rzeszow-da');assert.ok(ids(q).includes('dyn'));assert.ok(!ids(q).includes('dep'));}
 assert.ok(ids('dworzec kolejowy rzeszow').includes('pkp'));assert.ok(!ids('dworzec autobusowy krosno').includes('journey:rzeszow-da'));
 const physical=stop('3731','Rzeszów D.A. st. 1'),other=stop('3731','Niepowiązany przystanek','mpk');
 assert.deepEqual(searchStops(createStopSearchIndex([other,physical]),'dworzec autobusowy'),[physical]);
 const merged=stop('canonical','Dworzec zachowany w katalogu','pks',{providerStopIds:{pks:'3731'}});
 assert.equal(searchStops(createStopSearchIndex([merged]),'dworzec pks')[0],merged);
 assert.equal(JSON.stringify(stops),before);assert.equal(searchStops(index,'dworzec autobusowy')[0],stops[0]);
 assert.deepEqual(searchStops(createStopSearchIndex([other],{'missing-id':['nieistniejący alias']}),'nieistniejacy alias'),[]);
});
test('rank tiers keep exact official names before aliases, prefix and fuzzy matches',()=>{
 const exact=stop('exact','Dworzec autobusowy'),alias=stops[0],prefix=stop('prefix','Dworzec autobusowy Krosno'),partial=stop('partial','Nowy dworzec autobusowy');
 assert.deepEqual(searchStops(createStopSearchIndex([partial,prefix,alias,exact]),'dworzec autobusowy').map(s=>s.id),['exact','journey:rzeszow-da','prefix','partial']);
 const all=searchStops(index,'park');assert.equal(all.length,3);assert.equal(all[0].id,'park1');
});
test('identical names and different providers/IDs are never merged by search',()=>{
 const items=['pks','mpk','marcel'].map((p,i)=>stop(p+':'+i,'Centrum 02',p));
 const idx=createStopSearchIndex(items);assert.deepEqual(searchStops(idx,'centrum'),items);
 for(const carrier of ['pks','mpk','marcel'])assert.equal(searchStops(idx,'CENTRUM',{carrier})[0],items.find(s=>s.carriers[0].id===carrier));
 assert.deepEqual(searchStops(idx,'centrum',{carrier:'unknown'}),[]);
 const mixed=stop('mixed','Centrum 04','pks',{sourceProviderIds:['pks','mpk_rzeszow','marcel']});
 for(const carrier of ['pks','mpk','marcel'])assert.equal(searchStops(createStopSearchIndex([mixed]),'centrum',{carrier})[0],mixed);
});
test('empty input preserves existing order and filters, and location is optional and subordinate to text',()=>{
 assert.deepEqual(searchStops(index,''),stops);assert.deepEqual(searchStops(index,'   ...  '),stops);
 assert.deepEqual(searchStops(index,'',{favoritesOnly:true}),[]);
 const far=stop('far','Centrum','pks',{lat:49,lon:21}),near=stop('near','Nowe Centrum','pks',{lat:50,lon:22}),idx=createStopSearchIndex([near,far]);
 assert.equal(searchStops(idx,'centrum',{location:{lat:50,lon:22}})[0],far);
 assert.equal(searchStops(idx,'centrum',{location:null})[0],far);
 const a=stop('a','Park','pks',{lat:49,lon:21}),b=stop('b','Park','mpk',{lat:50,lon:22});
 assert.deepEqual(searchStops(createStopSearchIndex([a,b]),'park'),[a,b]);
 assert.deepEqual(searchStops(createStopSearchIndex([a,b]),'park',{location:{lat:50,lon:22}}),[b,a]);
});
test('a new catalog revision rebuilds names, codes and aliases without stale results',()=>{
 const old=stop('same','Stara nazwa'),idx=createStopSearchIndex([old]);assert.equal(searchStops(idx,'stara')[0],old);
 const next=stop('same','Nowa nazwa','marcel',{code:'82'}),updated=createStopSearchIndex([next],{'same':['Nowy alias']});
 assert.deepEqual(searchStops(updated,'stara'),[]);assert.equal(searchStops(updated,'nowy alias')[0],next);assert.equal(searchStops(updated,'nowa 82')[0],next);
 assert.equal(searchStops(idx,'stara')[0],old);assert.equal(searchStops(updated,'nowa',{carrier:'pks'}).length,0);
});
test('real PKS/MPK catalog and existing grouped picker retain original references and official labels',()=>{
 const {formatPksStops}=load('lib/providers/pks-stops.ts'),{buildStopsCatalog}=load('lib/stops-catalog.ts',{'@/lib/pks-client':{}}),{journeyPickerStops}=load('lib/journey-places.ts');
 const snapshot=require('../public/data/pks-stop-points.json'),mpk=require('../public/data/mpk-stop-points.json');
 const items=Object.entries(snapshot.stops).map(([id,s])=>({stop_point_id:id,name:s.n,stop_area_name:s.n,stop_area_id:s.areaId,stop_point_code:s.code,location:s}));
 const raw=Object.entries(formatPksStops({items},snapshot)).map(([id,s])=>({...s,id,name:s.n}));
 const catalog=buildStopsCatalog(raw,mpk.stops.map(s=>({id:String(s.stop_id),name:s.stop_name,lat:Number(s.stop_lat),lon:Number(s.stop_lon),lines:String(s.lines).split(',')})),[],'smart-search-real');
 const before=JSON.stringify(catalog),idx=createStopSearchIndex(catalog),babica=searchStops(idx,'babica'),expected=catalog.filter(s=>normalizeStopSearch(s.name).includes('babica'));
 for(const s of expected)assert.ok(babica.includes(s));
 assert.ok(searchStops(idx,'babica 82').some(s=>s.id==='1367'));
 assert.ok(searchStops(idx,'babca kolonia').some(s=>s.id==='1373'||s.id==='1374'));
 assert.ok(searchStops(idx,'dworzec autobusowy').some(s=>s.id==='3731'));
 const picker=journeyPickerStops(catalog),result=searchStops(createStopSearchIndex(picker),'dworzec autobusowy rzeszow')[0];
 assert.equal(result,picker.find(s=>s.id==='journey:rzeszow-da'));assert.equal(result.name,'Rzeszów D.A.');assert.equal(JSON.stringify(catalog),before);
});

test('typing reuses prepared names and keeps a bounded per-index token cache',()=>{
 let reads=0;const item=stop('counter','Babica Kolonia');Object.defineProperty(item,'name',{get(){reads++;return 'Babica Kolonia';}});
 const idx=createStopSearchIndex([item]),afterBuild=reads;
 for(const q of ['bab','babica','babca','kolonia','babica kol'])searchStops(idx,q);
 assert.equal(reads,afterBuild,'no stop name normalization during key presses');
 for(let i=0;i<120;i++)searchStops(idx,'missing'+i);
 assert.ok(idx.tokenCache.size<=80);
});
