import {warsawTimeMs} from './transit-time';
import type {Departure,Stop} from '@/Panel/src/types';
export type JourneyCall={stop:Stop;arrival:number;departure:number;scheduledArrival?:number;scheduledDeparture?:number};
export type JourneyLeg={from:Stop;to:Stop;departure:number;arrival:number;line:string;provider:string;course:string;walking?:number;path?:Array<[number,number]>;stops?:JourneyCall[];delaySeconds?:number;scheduledDeparture?:number;scheduledArrival?:number};
export type Journey={id:string;legs:JourneyLeg[];departure:number;arrival:number;walking:number;transfers:number};
export type JourneyOptions={at:number;arriveBy:boolean;maxTransfers:number;walkMeters:number;transferMinutes:number;providers:string[];sort:'fastest'|'transfers'|'walking';day?:string};
export function journeyWindow(o:JourneyOptions){
 return {earliest:o.arriveBy?(o.day?warsawTimeMs(o.day,'00:00'):o.at-6*3600_000):o.at,
  latest:o.arriveBy?o.at:(o.day?warsawTimeMs(o.day,'24:00')-1:o.at+6*3600_000)};
}
export function stopDistance(a:Stop,b:Stop){
 if(!Number.isFinite(a.lat)||!Number.isFinite(a.lon)||!Number.isFinite(b.lat)||!Number.isFinite(b.lon))return Infinity;
 const r=Math.PI/180,x=(b.lat!-a.lat!)*r,y=(b.lon!-a.lon!)*r;
 return 6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(x/2)**2+Math.cos(a.lat!*r)*Math.cos(b.lat!*r)*Math.sin(y/2)**2)));
}
export function departureCourse(d:Departure){
 // A line or destination alone never proves that two departures belong to one bus.
 const id=d.courseId;
 return id&&d.carrier?.id?`${d.carrier.id}:${id}`:'';
}
export function buildJourneyLegs(boards:Array<{stop:Stop;departures:Departure[]}>,providers:string[]):JourneyLeg[]{
 const courses=new Map<string,Array<{stop:Stop;row:Departure;time:number}>>();
 for(const board of boards)for(const row of board.departures){
  const key=departureCourse(row),time=row.plannedAtMs;
  if(!key||!providers.includes(row.carrier?.id||'')||!Number.isFinite(time))continue;
  const list=courses.get(key)||[];
  if(!list.some(x=>x.stop.id===board.stop.id&&x.time===time))list.push({stop:board.stop,row,time:time!});
  courses.set(key,list);
 }
 const legs:JourneyLeg[]=[];
 for(const [course,rows] of courses){
  rows.sort((a,b)=>a.time-b.time);
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
   const a=rows[i],b=rows[j];
   if(a.stop.id===b.stop.id||b.time<=a.time||b.time-a.time>6*3600_000||a.row.line!==b.row.line)continue;
   legs.push({from:a.stop,to:b.stop,departure:a.time,arrival:b.time,line:a.row.line,provider:a.row.carrier!.id,course});
  }
 }
 return legs;
}
export function findJourneys(from:Stop,to:Stop,legs:JourneyLeg[],o:JourneyOptions):Journey[]{
 const outgoing=new Map<string,JourneyLeg[]>();
 for(const leg of legs){const list=outgoing.get(leg.from.id)||[];list.push(leg);outgoing.set(leg.from.id,list);}
 for(const list of outgoing.values())list.sort((a,b)=>o.arriveBy?b.departure-a.departure:a.arrival-b.arrival);
 const stops=[...new Map(legs.flatMap(l=>[[l.from.id,l.from] as const,[l.to.id,l.to] as const])).values()];
 const {earliest,latest}=journeyWindow(o);
 const found:Journey[]=[],seen=new Set<string>();
 let visited=0;
 const neighbors=new Map<string,Stop[]>();
 function walkLeg(a:Stop,b:Stop,time:number):JourneyLeg|undefined{
  if(a.id===b.id)return;
  // Straight-line distances are inflated; walking is an estimate, not a routed footpath.
  const meters=Math.ceil(stopDistance(a,b)*1.35);
  if(meters>o.walkMeters||!Number.isFinite(meters))return;
  return {from:a,to:b,departure:time,arrival:time+Math.ceil(meters/70)*60_000,line:'Pieszo',provider:'walk',course:'walk',walking:meters};
 }
 function search(current:Stop,time:number,path:JourneyLeg[],rides:number,walked:number){
  if(++visited>30000||found.length>300)return;
  if(current.id===to.id&&rides){
   const departure=path[0].departure,arrival=path.at(-1)!.arrival,id=path.map(l=>`${l.course}:${l.from.id}:${l.to.id}:${l.departure}`).join('|');
   if(arrival<=latest&&!seen.has(id)){seen.add(id);found.push({id,legs:path,departure,arrival,walking:walked,transfers:rides-1});}return;
  }
  if(rides>0&&current.id!==to.id){const end=walkLeg(current,to,time);if(end)search(to,end.arrival,[...path,end],rides,walked+end.walking!);}
  if(rides>=o.maxTransfers+1)return;
  if(!neighbors.has(current.id))neighbors.set(current.id,stops.filter(s=>s.id!==current.id&&stopDistance(current,s)*1.35<=o.walkMeters));
  const points=[current,...neighbors.get(current.id)!];
  for(const point of points){
   const walking=walkLeg(current,point,time);
   if(point.id!==current.id&&!walking)continue;
   const ready=(walking?.arrival??time)+(rides?o.transferMinutes*60000:0);
   for(const leg of outgoing.get(point.id)||[]){
    if(leg.departure<ready||leg.arrival>latest||path.some(p=>p.course===leg.course||p.from.id===leg.to.id))continue;
    const prefix=walking?[...path,walking]:path;
    // Start walking just in time for boarding, not at the beginning of the six-hour window.
    const initial=rides===0&&walking?{...walking,departure:leg.departure-(walking.arrival-walking.departure),arrival:leg.departure}:undefined;
    search(leg.to,leg.arrival,[...(initial?[initial]:prefix),leg],rides+1,walked+(walking?.walking||0));
   }
  }
 }
 search(from,earliest,[],0,0);
 const score=(j:Journey)=>o.sort==='transfers'?j.transfers*86400_000+j.arrival:o.sort==='walking'?j.walking*86400_000+j.arrival:o.arriveBy?-j.departure:j.arrival;
 return found.sort((a,b)=>score(a)-score(b)||a.transfers-b.transfers).filter((j,i,all)=>!all.slice(0,i).some(k=>k.departure===j.departure&&k.arrival===j.arrival&&k.transfers===j.transfers)).slice(0,o.day?undefined:12);
}
