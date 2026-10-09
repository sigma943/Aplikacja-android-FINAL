const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),load=require('./load-ts.cjs');
const now=Date.parse('2026-10-09T02:52:00Z');
const waiting={nb:'770',nr:'   ',op:' ',nnr:'51   ',nop:'Bardowskiego p. Dworzec Lokalny',x:'22.02432',y:'50.11553',px:'22.02432',py:'50.11553',s:'6',o:'2119',is:'2119',nk:'3293',ik:'0',feedSource:'mybus'};
for(const root of ['lib','functions/src/transport']){
 const backend=root!=='lib';
 function mapper(){
  if(!backend){const api=load('lib/providers/mpk-vehicles.ts');return (raw,details,stops)=>api.mapMpkDirectVehicle(raw,new Map(details?[[raw.nb,details]]:[]),now,false,stops);}
  const api=load(root+'/mpk-rzeszow-provider.ts',{},'\nexport {toTransportVehicle};');
  return (raw,details,stops)=>api.toTransportVehicle(raw,now,false,{},details,stops);
 }
 test(`${root}: waiting for over 30 minutes stays on map with exact model and next departure`,()=>{
  const vehicle=mapper()(waiting);
  assert.ok(vehicle);assert.equal(vehicle.status,'break');assert.equal(vehicle.nextTripStartAtMs,now+2119_000);
  assert.equal(vehicle.model,'Solaris Urbino 18 IV (2018)');assert.equal(vehicle.direction,waiting.nop);
  assert.equal(backend?vehicle.line:vehicle.routeShortName,'51');assert.equal(vehicle.dataAgeSec,0);
  assert.deepEqual(vehicle.schedule,[],'next course ID must not become a fake next stop');
  const adapted=backend?load('lib/transport/vehicle-adapter.ts').mapTransportVehicleToClient(vehicle):vehicle;
  assert.equal(adapted.nextTripStartAtMs,vehicle.nextTripStartAtMs);assert.equal(adapted.model,vehicle.model);
 });
 test(`${root}: a break uses the next course, not the previous line or cached brigade`,()=>{
  const map=mapper(),raw={...waiting,nr:'14',op:'Old destination',ik:'1000',kwi:'51/1'};
  const vehicle=map(raw);
  assert.equal(backend?vehicle.line:vehicle.routeShortName,'51');assert.equal(vehicle.direction,waiting.nop);
  assert.equal(vehicle.tripId,'3293');assert.equal(vehicle.journeyId,'mybus:3293');
  const departed=map({...raw,s:'1',nr:'51',op:waiting.nop,ik:'3293',is:'0',o:'0'});
  assert.equal(departed.journeyId,vehicle.journeyId);assert.equal(departed.nextTripStartAtMs,undefined);
  const following=map({...raw,nk:'3294'});assert.notEqual(following.journeyId,vehicle.journeyId);
 });
 test(`${root}: a vehicle positioning for its next course retains countdown`,()=>{
  const vehicle=mapper()({...waiting,s:'7',px:'22.02400',py:'50.11500'});
  assert.ok(vehicle.speed>0);assert.equal(vehicle.status,'break');assert.equal(vehicle.nextTripStartAtMs,now+2119_000);
 });
 test(`${root}: departure countdown remains visible in the last seconds`,()=>{
  const vehicle=mapper()({...waiting,is:'10',o:'10'});
  assert.equal(vehicle.status,'break');assert.equal(vehicle.nextTripStartAtMs,now+10_000);
 });
 test(`${root}: active trip clears countdown and uses driving delay`,()=>{
  const map=mapper();map(waiting);
  const vehicle=map({...waiting,s:'1',nr:'51',op:'Bardowskiego',o:'-90',is:'0',ik:'3293'});
  assert.equal(vehicle.status,'active');assert.equal(vehicle.nextTripStartAtMs,undefined);
  assert.equal(backend?vehicle.delaySeconds:vehicle.delay,90);
 });
 test(`${root}: live first-departure estimate works without compact countdown, but later stops do not create breaks`,()=>{
  const map=mapper(),first={id:579,name:'Jasionka - Port Lotniczy',lat:50.11553,lon:22.02432,planned:null,real:new Date(now+600_000).toISOString(),isPast:false};
  const vehicle=map({...waiting,o:'',is:''},null,{schedule:[first],routeStops:[first],routePath:[579]});
  assert.equal(vehicle.nextTripStartAtMs,now+600_000);assert.equal(vehicle.nextTripFirstStopId,579);
  const later=map({...waiting,o:'',is:''},null,{schedule:[first],routeStops:[{...first,isPast:true},first],routePath:[579,579]});
  assert.equal(later.nextTripStartAtMs,undefined);
  const active=map({...waiting,s:'2',nr:'51',o:'600',is:'0'},null,{schedule:[first],routeStops:[{...first,lat:50.10}],routePath:[579]});
  assert.notEqual(active.status,'break');assert.equal(active.nextTripStartAtMs,undefined);
 });
 test(`${root}: exact fleet models and primary detail metadata take precedence`,()=>{
  const {mpkFleetModel}=load(root+'/mpk-fleet-models.ts');
  assert.equal(mpkFleetModel('00118'),'Mercedes-Benz eSprinter / Mercus City (2026)');
  assert.equal(mpkFleetModel(119),'Mercedes-Benz eSprinter / Mercus City (2026)');
  assert.equal(mpkFleetModel('99999'),undefined);assert.equal(mpkFleetModel('__proto__'),undefined);
  const vehicle=mapper()(waiting,{bus:'Model from healthy primary'});assert.equal(vehicle.model,'Model from healthy primary');
  assert.equal(mapper()(waiting,{bus:'   '}).model,mpkFleetModel(770));
 });
 test(`${root}: explicit GPS timestamps and original feed ageing remain intact`,()=>{
  const {mpkSignalTime,mpkMybusDepartureTime}=load(root+'/mpk-vehicle-feed.ts');
  assert.equal(mpkSignalTime({...waiting,timestamp:String(now/1000-60)},now),now-60_000);
  assert.equal(mpkSignalTime({...waiting,feedSource:'primary',is:'60'},now),now-60_000);
  assert.equal(mpkMybusDepartureTime({...waiting,feedSource:'primary'},now),undefined);
  assert.equal(mpkMybusDepartureTime({...waiting,nk:'0'},now),undefined);
  assert.equal(mpkMybusDepartureTime({...waiting,is:'NaN'},now),undefined);
  assert.equal(mpkMybusDepartureTime({...waiting,is:'9999999',o:'9999999'},now),undefined);
 });
}
const board=fs.readFileSync('test/fixtures/mpk-mybus-51-waiting.xml','utf8'),shape=fs.readFileSync('test/fixtures/mpk-mybus-51-route.xml','utf8');
for(const backend of [false,true])test(`${backend?'backend':'direct app'}: full waiting-course details recover model, departure, upcoming stops and route`,async()=>{
 const xml='<VL><V '+Object.entries(waiting).filter(([key])=>key!=='feedSource').map(([k,v])=>`${k}="${v}"`).join(' ')+'/></VL>',calls=[];
 const response=url=>{calls.push(url);if(url.includes('GetVehicles?'))return xml;if(url.includes('GetVehicleTimeTable?'))return board;if(url.includes('GetRouteVariantWithTransitPoints?'))return shape;if(url.includes('api.php?type=mpk'))return '{}';if(url.includes('vehicles_proxy'))throw Error('404');if(url.includes('get_trip_stops'))throw Error('SIP next course is not a GTFS trip');return '[]';};
 const previous=global.fetch;
 try{
  let vehicle;
  if(backend){
   global.fetch=async url=>({ok:true,status:200,text:async()=>response(url)});
   const api=load('functions/src/transport/mpk-rzeszow-provider.ts',{'./cache':{getCachedValue:async(key,{loader})=>({value:await loader()})}});
   vehicle=load('lib/transport/vehicle-adapter.ts').mapTransportVehicleToClient(await api.mpkRzeszowProvider.getVehicleDetails('mpk_rzeszow_770'));
  }else{
   const api=load('lib/providers/mpk-vehicles.ts',{'../transport/http':{requestJson:async url=>JSON.parse(response(url)),requestText:async url=>response(url)}});
   vehicle=await api.fetchMpkRzeszowVehicleDetailsDirect('mpk_rzeszow_770',false);
  }
  assert.equal(vehicle.model,'Solaris Urbino 18 IV (2018)');assert.equal(vehicle.status,'break');assert.ok(vehicle.nextTripStartAtMs>Date.now()+2000_000);
  assert.equal(vehicle.schedule[0].name,'Jasionka - Port Lotniczy');assert.equal(vehicle.schedule[0].lat,50.11551);
  assert.equal(vehicle.routeStops.length,22);assert.ok(vehicle.routeGeometry.length>100);
  assert.ok(calls.some(url=>url.includes('cRoute=51&cRouteVariant=0')));assert.ok(!calls.some(url=>url.includes('get_trip_stops')));
 }finally{global.fetch=previous;}
});
