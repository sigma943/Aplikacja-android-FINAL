const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {journeyStops,intermediateStopLabel}=load('lib/journey-stops.ts');
const {scanJourneys}=load('lib/journey-timetable.ts');
const stop=(id,lat)=>({id,name:'Przystanek '+id,lat,lon:22,type:'bus',lines:[],carriers:[],isFavorite:false});
const a=stop('a',50),b=stop('b',50.01),c=stop('c',50.02),d=stop('d',50.03);
const leg=(from,to,departure,arrival)=>({from,to,departure,arrival,line:'301',course:'pks:1',provider:'pks'});
test('real itinerary retains named intermediate stops after same-bus compression',()=>{
 const result=scanJourneys(a,d,[leg(a,b,1000,2000),leg(b,c,2000,3000),leg(c,d,3000,4000)],{at:0,maxTransfers:0,walkMeters:0,transferMinutes:5,providers:['pks'],sort:'fastest'});
 assert.deepEqual(result[0].legs[0].stops,[a,b,c,d]);
 assert.deepEqual(journeyStops(result[0]),[a,b,c,d]);assert.equal(intermediateStopLabel(2),'+2 przystanki');
});
test('a transfer counts its shared stop once and preserves later returns',()=>{
 const first={...leg(a,b,0,1),stops:[a,b]},second={...leg(b,d,1,3),stops:[b,c,a,d]};
 assert.deepEqual(journeyStops({legs:[first,second]}),[a,b,c,a,d]);
 assert.equal(intermediateStopLabel(1),'+1 przystanek');assert.equal(intermediateStopLabel(12),'+12 przystanków');assert.equal(intermediateStopLabel(22),'+22 przystanki');
});
