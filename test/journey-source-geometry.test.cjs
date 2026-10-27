const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),load=require('./load-ts.cjs');
test('timetable aliases retain original route coordinates independently of display platforms',()=>{
 const {feedConnections}=load('lib/journey-timetable.ts');
 const source={name:'Przystanek Testowy 01',lat:50.04,lon:22};
 const alias={...source,id:'catalog',lat:50.042,carriers:[{id:'pks'}],lines:[],isFavorite:false,type:'bus'};
 const feed={provider:'pks',stops:{a:source,b:{name:'Drugi 02',lat:50.04,lon:22.005}},calendars:{s:{start:'20260101',end:'20261231',days:'1111111'}},exceptions:{},patterns:[[['a',0,0,0,0],['b',600,600,0,0]]],trips:[['test','207','s',36000,0]]};
 const result=feedConnections(feed,[alias],'2026-10-26',{at:Date.parse('2026-10-26T09:00:00+01:00'),day:'2026-10-26',arriveBy:false});
 assert.ok(result.length);const edge=result[0];assert.equal(edge.from.id,'catalog');assert.notEqual(edge.from.lat,source.lat);assert.deepEqual(edge.sourceFromPoint,[source.lat,source.lon]);
});
test('PKS 207 D.A. 8 to Warszawska ZS. Samoch. 04 renders the bundled road offline',async()=>{
 const feed=require('../public/data/journeys/pks.json'),trip=feed.trips.find(t=>t[0]==='9401'),pattern=feed.patterns[trip[4]];
 const ids=pattern.slice(0,pattern.findIndex(c=>c[0]==='523')+1).map(c=>c[0]);let roadRequests=0;
 const fetchBefore=global.fetch;global.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync('public'+url))});
 try{
 const {journeyLegPath}=load('lib/journey-leg-path.ts',{'./transport/road-routing':{fetchRoadRouteForStops:async()=>{roadRequests++;throw Error('network offline');}}});
 const stops=ids.map(id=>({stop:{...feed.stops[id],id},routePoint:[feed.stops[id].lat,feed.stops[id].lon]}));
 // Deliberately move the display platform away from the source road.
 stops.at(-1).stop={...stops.at(-1).stop,lat:stops.at(-1).stop.lat+.002};
 const path=await journeyLegPath({provider:'pks',course:'pks:9401:2026-10-26',line:'207',from:stops[0].stop,to:stops.at(-1).stop,stops});
 assert.ok(path.length>100);assert.equal(roadRequests,0);assert.ok(path.every(p=>p.every(Number.isFinite)));
 }finally{global.fetch=fetchBefore;}
});
