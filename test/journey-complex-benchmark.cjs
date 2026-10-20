// Real local PKS + MPK feeds, full day, largest selectable walking budget.
// Run in a child so a synchronous regression cannot prevent its timeout firing.
const assert=require('node:assert/strict'),fs=require('node:fs'),z=require('node:zlib'),load=require('./load-ts.cjs');
const {feedConnections,scanJourneys}=load('lib/journey-timetable.ts'),{warsawTimeMs}=load('lib/transit-time.ts');
const date='2026-10-20',feed=JSON.parse(z.gunzipSync(fs.readFileSync('public/data/journeys/pks.json.gz'))),mpk=JSON.parse(z.gunzipSync(fs.readFileSync('public/data/journeys/mpk.json.gz')));
const stop=id=>({...feed.stops[id],id:'journey:pks:'+id,type:'bus',carriers:[],lines:[],isFavorite:false});
const from={...stop('10'),id:'journey:point:regression'},to=stop('1789');
const options={at:warsawTimeMs(date,'12:00'),day:date,arriveBy:false,maxTransfers:2,walkMeters:2000,transferMinutes:10,providers:['pks','mpk','marcel'],sort:'fastest'};
const connections=[...feedConnections(feed,[],date,options),...feedConnections(mpk,[],date,options)];
for(const maxTransfers of [2,-1]){
 let ticks=0;const start=performance.now();const results=scanJourneys(from,to,connections,{...options,maxTransfers},()=>ticks++);
 assert.ok(results.length>1);assert.ok(ticks>10,'long calculations report progress to the worker watchdog');
 for(const journey of results){let walk=0;for(const leg of journey.legs){walk=leg.walking===undefined?0:walk+leg.walking;assert.ok(walk<=2000);}if(maxTransfers>=0)assert.ok(journey.transfers<=maxTransfers);}
 console.log(JSON.stringify({maxTransfers,connections:connections.length,results:results.length,milliseconds:Math.round(performance.now()-start),progress:ticks}));
}
