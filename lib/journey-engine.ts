import type {Stop} from '@/Panel/src/types';
import type {Connection} from './journey-timetable';
import {prepareJourneyNetwork,type NetworkConnection} from './journey-network';
import {journeyWindow,type Journey,type JourneyLeg,type JourneyOptions} from './journey-planner';
import {matchesJourneyPlace} from './journey-places';
import {rankJourneyAlternatives} from './journey-ranking';
import {journeyWalkMetric,type JourneySearchGraph} from './journey-footpath-network';

type Walk={from:Stop;to:Stop;meters:number;minutes:number;quality:'estimated'|'verified';points?:Array<[number,number]>;checkedAt?:number};
type State={stop:number;time:number;rides:number;walking:number;walkRun:number;departure:number;parent?:State;edge?:NetworkConnection|Walk};
const isRide=(edge:NetworkConnection|Walk):edge is NetworkConnection=>'connection' in edge;

/** Indexed multi-criteria connection scan. Search states only retain predecessor
 * pointers; legs, call lists and geometry are materialized for answers, once. */
export function scanJourneyNetwork(from:Stop,to:Stop,connections:Connection[],o:JourneyOptions,onProgress:()=>void,graph?:JourneySearchGraph):Journey[]{
 if(from.id===to.id)return [];
 const {earliest,latest}=journeyWindow(o),network=prepareJourneyNetwork(connections);
 const stops=[...network.stops],index=new Map(network.stopIndex);
 for(const stop of [from,to])if(!index.has(stop.id)){index.set(stop.id,stops.length);stops.push(stop);}
 const destinations=new Set(stops.flatMap((stop,i)=>matchesJourneyPlace(to,stop)?[i]:[]));
 const buckets=new Map<string,number[]>(),cell=(s:Stop)=>[Math.floor((s.lat||0)*100),Math.floor((s.lon||0)*100)];
 for(let i=0;i<stops.length;i++){
  const s=stops[i];if(!Number.isFinite(s.lat)||!Number.isFinite(s.lon))continue;
  const key=cell(s).join(':'),list=buckets.get(key)||[];list.push(i);buckets.set(key,list);
 }
 const neighbors=new Map<number,Array<{target:number;metric:NonNullable<ReturnType<typeof journeyWalkMetric>>}>>();
 const near=(source:number)=>{
  const cached=neighbors.get(source);if(cached)return cached;
  const result:Array<{target:number;metric:NonNullable<ReturnType<typeof journeyWalkMetric>>}>=[],s=stops[source];
  if(o.walkMeters>0&&Number.isFinite(s.lat)&&Number.isFinite(s.lon)){
   const [y,x]=cell(s),radius=Math.ceil(o.walkMeters/600);
   for(let a=-radius;a<=radius;a++)for(let b=-radius;b<=radius;b++)for(const target of buckets.get(`${y+a}:${x+b}`)||[]){
    if(source===target)continue;const metric=journeyWalkMetric(s,stops[target],o.walkMeters,graph);
    if(metric)result.push({target,metric});
   }
  }
  neighbors.set(source,result);return result;
 };
 const maxTransfers=o.maxTransfers<0?Infinity:o.maxTransfers,labels:Array<State[]>=stops.map(()=>[]),onboard=new Map<string,State[]>();
 const answers:State[]=[];let revision=0;
 const dominates=(a:State,b:State)=>a.time<=b.time&&a.walking<=b.walking&&a.rides<=b.rides&&a.departure>=b.departure&&a.walkRun<=b.walkRun;
 const add=(s:State)=>{
  if(destinations.has(s.stop)&&s.edge){answers.push(s);return false;}
  if(s.rides>maxTransfers)return false;
  const list=labels[s.stop];if(list.some(old=>dominates(old,s)))return false;
  labels[s.stop]=list.filter(old=>!dominates(s,old));labels[s.stop].push(s);revision++;return true;
 };
 const walk=(s:State)=>{
  if(destinations.has(s.stop))return;
  for(const foot of near(s.stop)){
   const footMetric=foot.metric;
   if((s.rides>maxTransfers&&!destinations.has(foot.target))||s.walkRun+footMetric.meters>o.walkMeters||s.time+footMetric.minutes*60000>latest)continue;
   add({stop:foot.target,time:s.time+footMetric.minutes*60000,rides:s.rides,walking:s.walking+footMetric.meters,walkRun:s.walkRun+footMetric.meters,departure:s.departure,parent:s,edge:{from:stops[s.stop],to:stops[foot.target],...footMetric}});
  }
 };
 const origins=stops.flatMap((s,i)=>matchesJourneyPlace(from,s)&&s.id!==from.id?[i]:[]);
 for(const stop of origins.length?origins:[index.get(from.id)!]){const initial={stop,time:earliest,rides:0,walking:0,walkRun:0,departure:earliest};add(initial);walk(initial);}
 const readyAt=(s:State)=>s.time+(s.rides?o.transferMinutes*60000:0);
 const settlePlatform=(stop:number,time:number)=>{
  const ready:State[]=[],future:State[]=[];
  for(const s of labels[stop]){
   if(readyAt(s)>time){future.push(s);continue;}
   // Every candidate here is already ready for this and all future departures.
   // Earlier arrival no longer buys anything; compare the remaining objectives.
   const better=(a:State,b:State)=>a.rides<=b.rides&&a.walking<=b.walking&&a.walkRun<=b.walkRun&&a.departure>=b.departure;
   if(ready.some(old=>better(old,s)))continue;
   for(let i=ready.length-1;i>=0;i--)if(better(s,ready[i]))ready.splice(i,1);
   ready.push(s);
  }
  labels[stop]=[...future,...ready];return ready;
 };
 const process=(edge:NetworkConnection)=>{
  const c=edge.connection;if(c.departure<earliest||c.arrival>latest||!o.providers.includes(c.provider))return;
  const continuing=(onboard.get(edge.course)||[]).filter(s=>s.stop===edge.from&&s.time<=c.departure);
  const boarding=c.pickup===false?[]:settlePlatform(edge.from,c.departure).filter(s=>s.rides<=maxTransfers);
  const next:State[]=[];
  for(const parent of [...continuing,...boarding]){
   const same=continuing.includes(parent),rides=parent.rides+(same?0:1);
   const s:State={stop:edge.to,time:c.arrival,rides,walking:parent.walking,walkRun:0,departure:parent.rides?parent.departure:c.departure-(parent.time-earliest),parent,edge};
   if(next.some(n=>n.rides<=s.rides&&n.walking<=s.walking&&n.departure>=s.departure))continue;
   if(c.dropoff===false||!destinations.has(s.stop))next.push(s);
   if(c.dropoff!==false){const accepted=add(s);if(accepted||rides>maxTransfers)walk(s);}
  }
  if(c.arrival===c.departure){
   let cluster=onboard.get(edge.course)||[];
   for(const s of next){if(cluster.some(old=>old.stop===s.stop&&dominates(old,s)))continue;cluster=cluster.filter(old=>old.stop!==s.stop||!dominates(s,old));cluster.push(s);revision++;}
   onboard.set(edge.course,cluster);
  }else onboard.set(edge.course,next);
 };
 const ordered=network.connections;
 let reported=0;
 for(let first=0;first<ordered.length;){
  if(first>=reported){onProgress();reported=first+1024;}
  let end=first+1;while(end<ordered.length&&ordered[end].connection.departure===ordered[first].connection.departure)end++;
  let zeroEnd=first;while(zeroEnd<end&&ordered[zeroEnd].connection.arrival===ordered[first].connection.departure)zeroEnd++;
  if(zeroEnd>first){let previous;do{previous=revision;for(let i=first;i<zeroEnd;i++)process(ordered[i]);}while(revision!==previous);}
  for(let i=zeroEnd;i<end;i++)process(ordered[i]);first=end;
 }
 const journeys:Journey[]=[],seen=new Set<string>();
 for(const answer of answers){
  const edges:Array<NetworkConnection|Walk>=[];for(let s:State|undefined=answer;s?.edge;s=s.parent)edges.push(s.edge);edges.reverse();
  const legs:JourneyLeg[]=[];
  // Access starts just in time for the first boarding; pure walking can be
  // shifted to the requested arrival deadline without touching any bus times.
  let time=answer.rides?answer.departure:o.arriveBy?latest-(answer.time-earliest):earliest;
  for(const edge of edges){
   if(!isRide(edge)){legs.push({from:edge.from,to:edge.to,departure:time,arrival:time+edge.minutes*60000,walking:edge.meters,walkingQuality:edge.quality,walkingCheckedAt:edge.checkedAt,path:edge.points,course:'walk',provider:'walk',line:'Pieszo'});time+=edge.minutes*60000;continue;}
   const c=edge.connection,last=legs.at(-1);
   const call={stop:c.to,arrival:c.arrival,departure:c.arrival,scheduledArrival:c.scheduledArrival,scheduledDeparture:c.scheduledArrival,...(c.dropoff===false?{dropoff:false}:{})};
   if(last&&last.walking===undefined&&last.course===c.course&&last.provider===c.provider){
    const previous=last.stops!.at(-1)!;previous.departure=c.departure;previous.scheduledDeparture=c.scheduledDeparture;if(c.pickup===false)previous.pickup=false;
    last.to=c.to;last.arrival=c.arrival;last.scheduledArrival=c.scheduledArrival;last.stops!.push(call);
   }else legs.push({from:c.from,to:c.to,departure:c.departure,arrival:c.arrival,line:c.line,course:c.course,provider:c.provider,delaySeconds:c.delaySeconds,scheduledDeparture:c.scheduledDeparture,scheduledArrival:c.scheduledArrival,stops:[{stop:c.from,arrival:c.departure,departure:c.departure,scheduledArrival:c.scheduledDeparture,scheduledDeparture:c.scheduledDeparture},call]});
   time=c.arrival;
  }
  if(!legs.length)continue;
  const id=JSON.stringify(legs.map(l=>[l.provider,l.course,l.from.id,l.to.id,l.departure]));if(seen.has(id))continue;seen.add(id);
  journeys.push({id,legs,departure:legs[0].departure,arrival:legs.at(-1)!.arrival,walking:answer.walking,transfers:Math.max(0,answer.rides-1)});
 }
 return rankJourneyAlternatives(journeys,from,to,o,graph);
}
