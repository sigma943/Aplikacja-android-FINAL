const {test}=require('node:test');const assert=require('node:assert/strict');const loadTs=require('./load-ts.cjs');
const {widgetDepartures}=loadTs('lib/stop-widget.ts',{'@capacitor/core':{Capacitor:{getPlatform:()=> 'web'},registerPlugin:()=>({})}});
const now=Date.parse('2026-10-07T12:00:10Z');
const row=(id,line,offset,extra={})=>({id,line,direction:'Rzeszów',time:'14:10',status:'unknown',carrier:{id:'pks'},plannedAtMs:now+offset,...extra});
test('widget keeps chosen lines, corrected ordering, and discards past departures',()=>{
 const departures=[row('past','108',-60000),row('late','108',60000,{realAtMs:now+240000}),row('first','108',120000),row('other','40',180000)];
 assert.deepEqual(widgetDepartures(departures,[],['108'],now).map(d=>d.id),['first','late']);
 assert.equal(widgetDepartures(departures,[],null,now).length,3);
 assert.equal(widgetDepartures(departures,[],[],now).length,0);
});
test('widget and stop board apply known PKS delay once and keep delayed buses whose planned time has passed',()=>{
 const d=row('trip','108',-60000,{courseId:'42'});const vehicle={id:'117',provider:'pks',journeyId:42,routeShortName:'108',delay:180,status:'active',dataAgeSec:5,lastSignalTime:new Date(now).toISOString()};
 const result=widgetDepartures([d],[vehicle],null,now);assert.equal(result.length,1);assert.equal(result[0].realAtMs,now+120000);assert.equal(result[0].delayMins,3);
});
test('widget preserves MPK minute precision and caps cached rows',()=>{
 const mpk=row('mpk','40',-1000,{carrier:{id:'mpk'},realtimeSource:'stop-board',boardTimePrecisionMs:60000});
 assert.equal(widgetDepartures([mpk],[],null,now).length,1);
 assert.equal(widgetDepartures(Array.from({length:25},(_,i)=>row(String(i),'108',(i+1)*60000)),[],null,now).length,16);
});
