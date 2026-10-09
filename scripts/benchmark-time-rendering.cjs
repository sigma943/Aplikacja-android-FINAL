// Run against another checkout with: node scripts/benchmark-time-rendering.cjs /path/to/checkout
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const load=require(path.join(root,'test/load-ts.cjs'));
const {warsawDateIso}=load('lib/transit-time.ts');
const {timedVehicleStops}=load('lib/vehicle-stop-timing.ts');
const {mapStopDepartureRows}=load('lib/map-stop-departures.ts');
const now=Date.parse('2026-10-09T10:00:00Z');
const dates=Array.from({length:2000},(_,i)=>new Date(now+i*60000));
const stops=Array.from({length:120},(_,i)=>({id:i,planned:new Date(now+(i+1)*60000).toISOString()}));
const vehicle={id:'1',provider:'pks',status:'active',delay:60,routeStops:stops};
const rows=stops.map((stop,i)=>({id:String(i),line:'108',direction:'Rzeszów',time:'12:00',
  carrier:{id:'mpk'},plannedAtMs:Date.parse(stop.planned)}));
const workloads={
  '2000 Warsaw calendar conversions':()=>dates.forEach(date=>warsawDateIso(0,date)),
  '100 preparations of a 120-stop route':()=>{for(let i=0;i<100;i++)timedVehicleStops(vehicle);},
  '60 map clock ticks with 120 departures':()=>{for(let tick=0;tick<60;tick++)mapStopDepartureRows(rows,[],now+tick*1000);},
};
for(const [name,run] of Object.entries(workloads)) {
  run();const samples=[];
  for(let trial=0;trial<5;trial++){const start=performance.now();run();samples.push(performance.now()-start);}
  samples.sort((a,b)=>a-b);
  console.log(JSON.stringify({workload:name,medianMs:Number(samples[2].toFixed(2))}));
}
