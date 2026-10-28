const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {googleMapsLink,coordinatesFromGoogleMapsLink,pointFromMapsPreview,resolveGoogleMapsLink}=load('lib/google-maps-link.ts');
const short='https://maps.app.goo.gl/WQrwmxa35S1vurqb6',fid='0x473cfb0024e51293:0x8b38bfc9aded7933';
const long='https://www.google.com/maps/place/Fontanna+Multimedialna/data=!4m2!3m1!1s'+fid;
const preview=()=>{const place=[];place[9]=[null,null,50.0333987,22.0025521];place[10]=fid;place[11]='Multimedia Fountain Rzeszow';return ")]}'\n"+JSON.stringify([null,null,null,null,[[999,-119,44]],null,place]);};
test('full Google Maps links resolve coordinates locally and prefer the place over the camera',()=>{
 for(const url of ['https://maps.google.com/?q=50.03,22.002','https://www.google.com/maps/search/?api=1&query=50.03%2C22.002','https://www.google.com/maps/@50.03,22.002,16z']){
  const point=coordinatesFromGoogleMapsLink(url);assert.equal(point.lat,50.03);assert.equal(point.lon,22.002);
 }
 assert.equal(coordinatesFromGoogleMapsLink('https://www.google.com/maps/place/Test/@49,21,15z/data=!3d50.03!4d22.002').lat,50.03);
 assert.equal(coordinatesFromGoogleMapsLink(long.replace('/data=','/@49,21,15z/data=')),null,'never substitute the camera for a named place');
 assert.equal(coordinatesFromGoogleMapsLink('https://www.google.com/maps/?q=91,22'),null);
 for(const url of ['https://google.com.evil.test/maps','http://maps.app.goo.gl/test','https://user:pass@www.google.com/maps','https://www.google.com:444/maps','https://127.0.0.1/maps','https://www.google.com/accounts'])assert.equal(googleMapsLink(url),null,url);
});
test('shared fountain resolves only its selected place record, never viewport or suggested places',async()=>{
 const calls=[],signal=new AbortController().signal;
 const point=await resolveGoogleMapsLink(short,async url=>{
  calls.push(url);
  if(url===short)return {status:302,headers:{Location:long},text:''};
  if(url===long)return {status:200,headers:{},text:'<link href="/maps/preview/place?pb=!1s'+fid+'&amp;hl=en">'};
  return {status:200,headers:{},text:preview()};
 },signal);
 assert.equal(calls.length,3);assert.equal(point.lat,50.0333987);assert.equal(point.lon,22.0025521);
 assert.equal(pointFromMapsPreview(preview(),'0x1:0x2'),null,'stale or unrelated place cannot move the pin');
 assert.equal(pointFromMapsPreview(preview(),'10031979042895132979').lat,point.lat);
 assert.equal(pointFromMapsPreview(')]}\n[]',fid),null);
});
test('redirects cannot escape Google Maps, loop indefinitely or publish after cancellation',async()=>{
 const signal=new AbortController().signal;let calls=0;
 await assert.rejects(resolveGoogleMapsLink(short,async()=>{calls++;return {status:302,headers:{location:'http://127.0.0.1/private'},text:''};},signal),/przekierowanie/);assert.equal(calls,1);
 calls=0;await assert.rejects(resolveGoogleMapsLink(short,async()=>{calls++;return {status:302,headers:{location:short},text:''};},signal),/wiele przekierowań/);assert.equal(calls,6);
 const controller=new AbortController();await assert.rejects(resolveGoogleMapsLink(short,async()=>{controller.abort();return {status:200,headers:{},text:preview()};},controller.signal),e=>e.name==='AbortError');
 await assert.rejects(resolveGoogleMapsLink(short,async()=>({status:200,headers:{},text:'generic map or consent page'}),signal),/jednoznacznych/);
});
test('native reader uses explicit redirects; ordinary coordinates never access the network',async()=>{
 const calls=[];
 const {resolveJourneyInput}=load('lib/resolve-journey-input.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>true},CapacitorHttp:{get:async options=>{
  calls.push(options);return options.url===short?{status:302,headers:{location:'https://www.google.com/maps?q=50.03,22.002'},data:''}:{status:200,headers:{},data:''};
 }}}});
 const signal=new AbortController().signal;
 assert.equal((await resolveJourneyInput('50.03,22.002',signal)).lat,50.03);assert.equal(calls.length,0);
 const point=await resolveJourneyInput(short,signal);assert.equal(point.lat,50.03);assert.ok(calls.every(c=>c.disableRedirects===true));
});
