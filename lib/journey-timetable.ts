import type {Stop} from '@/Panel/src/types';
import {stopDistance,type Journey,type JourneyLeg,type JourneyOptions} from './journey-planner';
import {isRzeszowStation,matchesJourneyPlace} from './journey-places';
import {warsawTimeMs} from './transit-time';

export type TimetableFeed={version:number;provider:string;validFrom:string;validUntil:string;stops:Record<string,{name:string;lat:number;lon:number}>;
 calendars:Record<string,{start:string;end:string;days:string}>;exceptions:Record<string,Record<string,number>>;
 patterns:Array<Array<[string,number,number,number,number]>>;trips:Array<[string,string,string,number,number]>};
export type Connection={from:Stop;to:Stop;departure:number;arrival:number;course:string;line:string;provider:string;pickup?:boolean;dropoff?:boolean};
const carrier=(id:string)=>({id,name:id==='pks'?'PKS Rzeszów':id==='mpk'?'MPK Rzeszów':'Marcel',colorClass:''});
export function serviceRuns(feed:TimetableFeed,id:string,date:string){
 const day=date.replaceAll('-',''),exception=feed.exceptions[day]?.[id];if(exception)return exception===1;
 const c=feed.calendars[id],weekday=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
 return Boolean(c&&c.start<=day&&c.end>=day&&c.days[weekday]==='1');
}
export function feedConnections(feed:TimetableFeed,catalog:Stop[],date:string,options:JourneyOptions):Connection[]{
 const provider=feed.provider,namespace=provider==='mpk'?'mpk_rzeszow':provider;
 const exact=new Map<string,Stop>();for(const stop of catalog)for(const id of String(stop.providerStopIds?.[namespace]||'').split(',').filter(Boolean)){
  // PKS technical IDs differ from GTFS. Only explicitly stored GTFS IDs are exact.
  if(provider!=='pks')exact.set(id.trim(),stop);
 }
 const mapped=new Map<string,Stop>();
 for(const [id,point] of Object.entries(feed.stops)){
  if(isRzeszowStation(point)){mapped.set(id,{...point,id:`journey:${provider}:${id}`,name:point.name.replace(/(D\.?A\.?)\s+(\d+)$/i,'$1 st. $2'),type:'bus',carriers:[carrier(provider)],lines:[],isFavorite:false,sourceProviderIds:[namespace],providerStopIds:{[namespace]:id}});continue;}
  const known=exact.get(id);if(known){mapped.set(id,known);continue;}
  const candidates=catalog.filter(s=>s.sourceProviderIds?.includes(namespace)||s.carriers.some(c=>c.id===provider))
   .map(stop=>({stop,distance:stopDistance(stop,point as Stop)})).filter(x=>x.distance<45).sort((a,b)=>a.distance-b.distance);
  const closest=candidates[0];
  const match=closest&&(!candidates[1]||candidates[1].distance-closest.distance>5)?closest.stop:undefined;
  mapped.set(id,match||{...point,id:`journey:${provider}:${id}`,type:'bus',carriers:[carrier(provider)],lines:[],isFavorite:false,sourceProviderIds:[namespace],providerStopIds:{[namespace]:id}});
 }
 const earliest=options.arriveBy?options.at-6*3600_000:options.at,latest=options.arriveBy?options.at:options.at+6*3600_000;
 const connections:Connection[]=[];
 for(const delta of [-1,0,1]){
  const day=new Date(date+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+delta);const serviceDate=day.toISOString().slice(0,10);
  const clockCache=new Map<number,number>();
  const clock=(seconds:number)=>{if(!clockCache.has(seconds))clockCache.set(seconds,warsawTimeMs(serviceDate,`${Math.floor(seconds/3600)}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`));return clockCache.get(seconds)!;};
  for(const [id,line,service,start,patternId] of feed.trips){
   if(!serviceRuns(feed,service,serviceDate))continue;const pattern=feed.patterns[patternId];if(!pattern)continue;
   if(clock(start+pattern.at(-1)![1])<earliest||clock(start+pattern[0][2])>latest)continue;
   for(let i=1;i<pattern.length;i++){
    const a=pattern[i-1],b=pattern[i],from=mapped.get(a[0]),to=mapped.get(b[0]),departure=clock(start+a[2]),arrival=clock(start+b[1]);
    if(!from||!to||!Number.isFinite(departure)||arrival<departure||departure<earliest||arrival>latest)continue;
    connections.push({from,to,departure,arrival,course:`${provider}:${id}:${serviceDate}`,line,provider,pickup:a[3]!==1,dropoff:b[4]!==1});
   }
  }
 }
 return connections;
}
type Label={stop:Stop;time:number;legs:JourneyLeg[];rides:number;walking:number};
/** Chronological connection scan. Staying on one bus never consumes a transfer. */
export function scanJourneys(from:Stop,to:Stop,connections:Connection[],o:JourneyOptions):Journey[]{
 const earliest=o.arriveBy?o.at-6*3600_000:o.at,latest=o.arriveBy?o.at:o.at+6*3600_000;
 const stops=[...new Map([from,to,...connections.flatMap(c=>[c.from,c.to])].map(s=>[s.id,s])).values()];
 const buckets=new Map<string,Stop[]>(),cell=(s:Stop)=>[Math.floor((s.lat||0)*100),Math.floor((s.lon||0)*100)];
 for(const stop of stops){if(!Number.isFinite(stop.lat)||!Number.isFinite(stop.lon))continue;const key=cell(stop).join(':');const list=buckets.get(key)||[];list.push(stop);buckets.set(key,list);}
 const neighbors=new Map<string,Array<{stop:Stop;meters:number;minutes:number}>>();
 const near=(stop:Stop)=>{
  if(neighbors.has(stop.id))return neighbors.get(stop.id)!;const result:Array<{stop:Stop;meters:number;minutes:number}>=[];
  if(o.walkMeters>0&&Number.isFinite(stop.lat)&&Number.isFinite(stop.lon)){
   const [y,x]=cell(stop),radius=Math.ceil(o.walkMeters/600);
   for(let a=-radius;a<=radius;a++)for(let b=-radius;b<=radius;b++)for(const target of buckets.get(`${y+a}:${x+b}`)||[]){
    if(target.id===stop.id)continue;const meters=Math.ceil(stopDistance(stop,target)*1.35);if(meters<=o.walkMeters)result.push({stop:target,meters,minutes:Math.ceil(meters/70)});
   }
  }
  neighbors.set(stop.id,result);return result;
 };
 const labels=new Map<string,Label[]>(),onboard=new Map<string,Label[]>(),answers:Journey[]=[];
 const departure=(l:Label)=>l.legs[0]?.departure??earliest;
 const add=(label:Label)=>{
  if(matchesJourneyPlace(to,label.stop)&&label.rides){const legs=label.legs,id=legs.map(l=>`${l.course}:${l.from.id}:${l.to.id}:${l.departure}`).join('|');answers.push({id,legs,departure:departure(label),arrival:label.time,walking:label.walking,transfers:label.rides-1});}
  const key=label.stop.id,list=labels.get(key)||[];
  if(list.some(l=>l.time<=label.time&&l.walking<=label.walking&&l.rides<=label.rides&&(!o.arriveBy||departure(l)>=departure(label))))return;
  const next=list.filter(l=>!(label.time<=l.time&&label.walking<=l.walking&&label.rides<=l.rides&&(!o.arriveBy||departure(label)>=departure(l))));next.push(label);
  labels.set(key,next);
 };
 const walk=(label:Label)=>{for(const {stop,meters,minutes} of near(label.stop)){
  if(label.walking+meters>o.walkMeters||label.time+minutes*60000>latest)continue;
  const leg:JourneyLeg={from:label.stop,to:stop,departure:label.time,arrival:label.time+minutes*60000,walking:meters,course:'walk',provider:'walk',line:'Pieszo'};
  add({...label,stop,time:leg.arrival,legs:[...label.legs,leg],walking:label.walking+meters});
 }};
 const origins=stops.filter(s=>matchesJourneyPlace(from,s)&&s.id!==from.id);
 for(const origin of origins.length?origins:[from]){const initial:Label={stop:origin,time:earliest,legs:[],rides:0,walking:0};add(initial);walk(initial);}
 for(const c of [...connections].sort((a,b)=>a.departure-b.departure||a.arrival-b.arrival)){
  if(c.departure<earliest||c.arrival>latest||!o.providers.includes(c.provider))continue;
  const continuing=(onboard.get(c.course)||[]).filter(l=>l.stop.id===c.from.id&&l.time<=c.departure);
  const boarding=c.pickup===false?[]:(labels.get(c.from.id)||[]).filter(l=>l.rides<=o.maxTransfers&&l.time+(l.rides?o.transferMinutes*60000:0)<=c.departure&&l.legs.at(-1)?.course!==c.course);
  const next:Label[]=[];
  for(const label of [...continuing,...boarding]){
   const same=continuing.includes(label);let path=label.legs;
   if(!label.rides&&path.length){const old=path[0];path=[{...old,departure:c.departure-(old.arrival-old.departure),arrival:c.departure}];}
   const ride:JourneyLeg=same?{...path.at(-1)!,to:c.to,arrival:c.arrival}:{from:c.from,to:c.to,departure:c.departure,arrival:c.arrival,line:c.line,provider:c.provider,course:c.course};
   const result:Label={stop:c.to,time:c.arrival,legs:same?[...path.slice(0,-1),ride]:[...path,ride],rides:label.rides+(same?0:1),walking:label.walking};
   if(next.some(n=>n.rides<=result.rides&&n.walking<=result.walking&&(!o.arriveBy||departure(n)>=departure(result))))continue;
   next.push(result);if(c.dropoff!==false){add(result);walk(result);}
  }
  onboard.set(c.course,next);
 }
 const score=(j:Journey)=>o.sort==='transfers'?j.transfers*86400_000+(o.arriveBy?-j.departure:j.arrival):o.sort==='walking'?j.walking*86400_000+(o.arriveBy?-j.departure:j.arrival):o.arriveBy?-j.departure:j.arrival;
 const seen=new Set<string>();return answers.sort((a,b)=>score(a)-score(b)||a.transfers-b.transfers).filter(j=>{const key=j.legs.filter(l=>l.walking===undefined).map(l=>l.course+':'+l.from.id+':'+l.to.id).join('|');if(seen.has(key))return false;seen.add(key);return true;}).slice(0,12);
}
