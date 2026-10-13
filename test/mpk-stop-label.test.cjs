const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {mpkCatalogDisplayName,mpkVehicleDisplayName}=load('lib/mpk-stop-label.ts');
const {displayStopLabel}=load('lib/stop-label.ts');
test('MPK labels use exact official city stop IDs without changing original data, aliases or other carrier vehicle names',()=>{
 const stop={name:'Rzeszów, Podkarpacka Kolonia 05',providerStopIds:{pks:'5320',mpk_rzeszow:'295',mpk_rzeszowNames:'Rzeszów Podkarpacka / Wetlińska 05 nż'}};const before=structuredClone(stop);
 assert.equal(mpkCatalogDisplayName(stop),'Rzeszów Podkarpacka / Wetlińska 05 nż');assert.equal(mpkVehicleDisplayName('mpk_rzeszow',{id:295,name:stop.name}),'Podkarpacka / Wetlińska 05 nż');
 for(const provider of ['pks','marcel','pkp_intercity',undefined])assert.equal(displayStopLabel(mpkVehicleDisplayName(provider,{id:295,name:stop.name})),stop.name);
 assert.deepEqual(stop,before);assert.equal(mpkCatalogDisplayName({...stop,providerStopIds:{pks:'5320'}}),stop.name);
});
test('outside Rzeszów and ambiguous combined platforms preserve their original labels',()=>{
 const catalog=load('lib/mpk-mybus-stop-catalogue.ts').mybusStopCatalogue;const foreign=Object.values(catalog).find(v=>/^Tyczyn/.test(v[1]));assert.ok(foreign);
 const stop={name:'Oryginalny przystanek poza miastem',providerStopIds:{mpk_rzeszow:String(foreign[0]),mpk_rzeszowNames:'Nowa nazwa'}};
 assert.equal(mpkCatalogDisplayName(stop),stop.name);assert.equal(mpkVehicleDisplayName('mpk_rzeszow',{id:foreign[0],name:stop.name}),stop.name);
 assert.equal(mpkCatalogDisplayName({name:'Rzeszów grupa',providerStopIds:{mpk_rzeszow:'295,214',mpk_rzeszowNames:'Rzeszów Podkarpacka / Wetlińska 05 nż | Rzeszów Podkarpacka / Wetlińska 06 nż'}}),'Rzeszów grupa');
});

test('live MPK API name takes priority over the offline API catalogue, only for MPK city stops',()=>{
 const current=new Map([['295','Podkarpacka / Wetlińska 05 nż – API'],['999999','Poza miastem']]);
 assert.equal(mpkVehicleDisplayName('mpk_rzeszow',{id:295,name:'Dawna nazwa'},current),'Podkarpacka / Wetlińska 05 nż – API');
 assert.equal(mpkVehicleDisplayName('pks',{id:295,name:'Nazwa PKS'},current),'Nazwa PKS');
 assert.equal(mpkVehicleDisplayName('mpk_rzeszow',{id:999999,name:'Oryginalna nazwa'},current),'Oryginalna nazwa');
});
