import type {Stop} from '@/Panel/src/types';
import {journeyWindow,stopDistance,type Journey,type JourneyLeg,type JourneyOptions} from './journey-planner';
import {isRzeszowStation,matchesJourneyPlace} from './journey-places';
import {warsawTimeMs} from './transit-time';
import {pksTerminalStop} from './pks-terminal-identity';

export type TimetableFeed={version:number;provider:string;validFrom:string;validUntil:string;stops:Record<string,{name:string;lat:number;lon:number}>;
 calendars:Record<string,{start:string;end:string;days:string}>;exceptions:Record<string,Record<string,number>>;
 patterns:Array<Array<[string,number,number,number,number]>>;trips:Array<[string,string,string,number,number]>};
export type Connection={from:Stop;to:Stop;departure:number;arrival:number;course:string;line:string;provider:string;pickup?:boolean;dropoff?:boolean;delaySeconds?:number;scheduledDeparture?:number;scheduledArrival?:number};
const carrier=(id:string)=>({id,name:id==='pks'?'PKS Rzeszów':id==='mpk'?'MPK Rzeszów':'Marcel',colorClass:''});
export function serviceRuns(feed:TimetableFeed,id:string,date:string){
 const day=date.replaceAll('-',''),exception=feed.exceptions[day]?.[id];if(exception)return exception===1;
 const c=feed.calendars[id],weekday=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
 return Boolean(c&&c.start<=day&&c.end>=day&&c.days[weekday]==='1');
}
export function feedConnections(feed:TimetableFeed,catalog:Stop[],date:string,options:JourneyOptions,delayWindow=0):Connection[]{
 const provider=feed.provider,namespace=provider==='mpk'?'mpk_rzeszow':provider;
 const exact=new Map<string,Stop>();for(const stop of catalog)for(const id of String(stop.providerStopIds?.[namespace]||'').split(',').filter(Boolean)){
  // PKS technical IDs differ from GTFS. Only explicitly stored GTFS IDs are exact.
  if(provider!=='pks')exact.set(id.trim(),stop);
 }
 const nameKey=(name:string,code='')=>{const value=name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').replace(/[^a-z0-9]/g,'');const suffix=code.toLowerCase().replace(/[^a-z0-9]/g,'');return suffix&&!value.endsWith(suffix)?value+suffix:value;};
 const providerStops=catalog.filter(s=>s.sourceProviderIds?.includes(namespace)||s.carriers.some(c=>c.id===provider));
 const named=new Map<string,Stop[]>();for(const stop of providerStops){const key=nameKey(stop.name,stop.code),list=named.get(key)||[];list.push(stop);named.set(key,list);}
 const mapped=new Map<string,Stop>();
 for(const [id,point] of Object.entries(feed.stops)){
  const terminal=provider==='pks'?pksTerminalStop(id,point,catalog):null;
  if(terminal){mapped.set(id,terminal);continue;}
  if(isRzeszowStation(point)){mapped.set(id,{...point,id:`journey:${provider}:${id}`,name:point.name.replace(/(D\.?A\.?)\s+(\d+)$/i,'$1 st. $2'),type:'bus',carriers:[carrier(provider)],lines:[],isFavorite:false,sourceProviderIds:[namespace],providerStopIds:{[namespace]:id}});continue;}
  const known=exact.get(id);if(known){mapped.set(id,known);continue;}
  const names=named.get(nameKey(point.name))||[];
  const sameName=names.length===1&&stopDistance(names[0],point as Stop)<250?names[0]:undefined;
  if(sameName){mapped.set(id,{...sameName,lat:point.lat,lon:point.lon});continue;}
  const candidates=providerStops
   .map(stop=>({stop,distance:stopDistance(stop,point as Stop)})).filter(x=>x.distance<45).sort((a,b)=>a.distance-b.distance);
  const closest=candidates[0];
  const match=closest&&(!candidates[1]||candidates[1].distance-closest.distance>5)?closest.stop:undefined;
  mapped.set(id,match||{...point,id:`journey:${provider}:${id}`,type:'bus',carriers:[carrier(provider)],lines:[],isFavorite:false,sourceProviderIds:[namespace],providerStopIds:{[namespace]:id}});
 }
 const window=journeyWindow(options),earliest=window.earliest-delayWindow,latest=window.latest+delayWindow;
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
 if(from.id===to.id)return [];
 const {earliest,latest}=journeyWindow(o);
 const stops=[...new Map([from,to,...connections.flatMap(c=>[c.from,c.to])].map(s=>[s.id,s])).values()];
 const buckets=new Map<string,Stop[]>(),cell=(s:Stop)=>[Math.floor((s.lat||0)*100),Math.floor((s.lon||0)*100)];
 for(const stop of stops){if(!Number.isFinite(stop.lat)||!Number.isFinite(stop.lon))continue;const key=cell(stop).join(':');const list=buckets.get(key)||[];list.push(stop);buckets.set(key,list);}
 const neighbors=new Map<string,Array<{stop:Stop;meters:number;minutes:number}>>();
 const near=(stop:Stop)=>{
  if(neighbors.has(stop.id))return neighbors.get(stop.id)!;const result:Array<{stop:Stop;meters:number;minutes:number}>=[];
  if(o.walkMeters>0&&Number.isFinite(stop.lat)&&Number.isFinite(stop.lon)){
   const [y,x]=cell(stop),radius=Math.ceil(o.walkMeters/600);
   for(let a=-radius;a<=radius;a++)for(let b=-radius;b<=radius;b++)for(const target of buckets.get(`${y+a}:${x+b}`)||[]){
    if(target.id===stop.id)continue;const meters=Math.ceil(stopDistance(stop,target)*1.35);if(meters<=o.walkMeters)result.push({stop:target,meters,minutes:Math.max(1,Math.ceil(meters/70))});
   }
  }
  neighbors.set(stop.id,result);return result;
 };
 const labels=new Map<string,Label[]>(),onboard=new Map<string,Label[]>(),answers:Journey[]=[];
 let revision=0;const answerIds=new Set<string>();
 const departure=(l:Label)=>l.legs[0]?.departure??earliest;
 const add=(label:Label)=>{
  if(matchesJourneyPlace(to,label.stop)&&label.legs.length){
   const shift=o.arriveBy&&!label.rides?latest-label.time:0;
   const legs=shift?label.legs.map(leg=>({...leg,departure:leg.departure+shift,arrival:leg.arrival+shift})):label.legs;
   const id=legs.map(l=>`${l.course}:${l.from.id}:${l.to.id}:${l.departure}`).join('|');
   if(!answerIds.has(id)){answerIds.add(id);answers.push({id,legs,departure:legs[0].departure,arrival:label.time+shift,walking:label.walking,transfers:Math.max(0,label.rides-1)});}
   return;
  }
  const key=label.stop.id,list=labels.get(key)||[];
  if(list.some(l=>l.time<=label.time&&l.walking<=label.walking&&l.rides<=label.rides&&(!o.arriveBy||departure(l)>=departure(label))))return;
  const next=list.filter(l=>!(label.time<=l.time&&label.walking<=l.walking&&label.rides<=l.rides&&(!o.arriveBy||departure(label)>=departure(l))));next.push(label);
  labels.set(key,next);revision++;
 };
 const walk=(label:Label)=>{for(const {stop,meters,minutes} of near(label.stop)){
  if(label.walking+meters>o.walkMeters||label.time+minutes*60000>latest)continue;
  const leg:JourneyLeg={from:label.stop,to:stop,departure:label.time,arrival:label.time+minutes*60000,walking:meters,course:'walk',provider:'walk',line:'Pieszo'};
  add({...label,stop,time:leg.arrival,legs:[...label.legs,leg],walking:label.walking+meters});
 }};
 const origins=stops.filter(s=>matchesJourneyPlace(from,s)&&s.id!==from.id);
 for(const origin of origins.length?origins:[from]){const initial:Label={stop:origin,time:earliest,legs:[],rides:0,walking:0};add(initial);walk(initial);}
 const process=(c:Connection)=>{
  if(c.departure<earliest||c.arrival>latest||!o.providers.includes(c.provider))return;
  const continuing=(onboard.get(c.course)||[]).filter(l=>l.stop.id===c.from.id&&l.time<=c.departure);
  const boarding=c.pickup===false?[]:(labels.get(c.from.id)||[]).filter(l=>l.rides<=o.maxTransfers&&l.time+(l.rides?o.transferMinutes*60000:0)<=c.departure&&l.legs.at(-1)?.course!==c.course);
  const next:Label[]=[];
  for(const label of [...continuing,...boarding]){
   const same=continuing.includes(label);let path=label.legs;
   if(!label.rides&&path.length){const shift=c.departure-path.at(-1)!.arrival;path=path.map(leg=>({...leg,departure:leg.departure+shift,arrival:leg.arrival+shift}));}
   const startCall={stop:c.from,arrival:c.departure,departure:c.departure,scheduledArrival:c.scheduledDeparture,scheduledDeparture:c.scheduledDeparture};
   const endCall={stop:c.to,arrival:c.arrival,departure:c.arrival,scheduledArrival:c.scheduledArrival,scheduledDeparture:c.scheduledArrival};
   const calls=same?[...(path.at(-1)!.stops||[]).slice(0,-1),{...path.at(-1)!.stops!.at(-1)!,departure:c.departure,scheduledDeparture:c.scheduledDeparture},endCall]:[startCall,endCall];
   const ride:JourneyLeg=same?{...path.at(-1)!,to:c.to,arrival:c.arrival,scheduledArrival:c.scheduledArrival,stops:calls}:{from:c.from,to:c.to,departure:c.departure,arrival:c.arrival,line:c.line,provider:c.provider,course:c.course,stops:calls,delaySeconds:c.delaySeconds,scheduledDeparture:c.scheduledDeparture,scheduledArrival:c.scheduledArrival};
   const result:Label={stop:c.to,time:c.arrival,legs:same?[...path.slice(0,-1),ride]:[...path,ride],rides:label.rides+(same?0:1),walking:label.walking};
   if(next.some(n=>n.rides<=result.rides&&n.walking<=result.walking&&(!o.arriveBy||departure(n)>=departure(result))))continue;
   next.push(result);if(c.dropoff!==false){add(result);walk(result);}
  }
  if(c.arrival===c.departure){
   // Keep the incoming onboard position while resolving this instantaneous
   // cluster; a no-dropoff stop may have no corresponding platform label.
   let cluster=onboard.get(c.course)||[];
   const dominates=(a:Label,b:Label)=>a.stop.id===b.stop.id&&a.time<=b.time&&a.rides<=b.rides&&a.walking<=b.walking&&(!o.arriveBy||departure(a)>=departure(b));
   for(const label of next){if(cluster.some(old=>dominates(old,label)))continue;cluster=cluster.filter(old=>!dominates(label,old));cluster.push(label);revision++;}
   onboard.set(c.course,cluster);
  }else onboard.set(c.course,next);
 };
 const ordered=[...connections].sort((a,b)=>a.departure-b.departure||a.arrival-b.arrival);
 for(let first=0;first<ordered.length;){
  let end=first+1;while(end<ordered.length&&ordered[end].departure===ordered[first].departure)end++;
  let zeroEnd=first;while(zeroEnd<end&&ordered[zeroEnd].arrival===ordered[first].departure)zeroEnd++;
  // Resolve all instantaneous connections at this clock time before advancing.
  // This also handles GTFS minute rounding and simultaneous carrier departures.
  if(zeroEnd>first){let previous;do{previous=revision;for(let i=first;i<zeroEnd;i++)process(ordered[i]);}while(revision!==previous);}
  for(let i=zeroEnd;i<end;i++)process(ordered[i]);first=end;
 }
 const score=(j:Journey)=>o.sort==='transfers'?j.transfers*86400_000+(o.arriveBy?-j.departure:j.arrival):o.sort==='walking'?j.walking*86400_000+(o.arriveBy?-j.departure:j.arrival):o.arriveBy?-j.departure:j.arrival;
 // Keep later departures, but remove worse detours for the very same boarding.
 const firstRide=(j:Journey)=>j.legs.find(l=>l.walking===undefined);
 const boardingKey=(j:Journey)=>{const ride=firstRide(j);return ride?JSON.stringify([ride.course,ride.from.id,ride.departure]):'walking';};
 const groups=new Map<string,Journey[]>();for(const journey of answers){const key=boardingKey(journey),list=groups.get(key)||[];list.push(journey);groups.set(key,list);}
 const useful=answers.filter(candidate=>!(groups.get(boardingKey(candidate))||[]).some(better=>{
  if(better===candidate||better.arrival>candidate.arrival||better.transfers>candidate.transfers)return false;
  const walkingOkay=better.walking<=candidate.walking||(o.sort!=='walking'&&better.walking<=Math.max(100,candidate.walking)&&candidate.arrival-better.arrival>=5*60000);
  return walkingOkay&&(better.arrival<candidate.arrival||better.transfers<candidate.transfers||better.walking<candidate.walking);
 }));
 const seen=new Set<string>();return useful.sort((a,b)=>score(a)-score(b)||a.transfers-b.transfers).filter(j=>{const key=j.legs.filter(l=>l.walking===undefined).map(l=>l.course+':'+l.from.id+':'+l.to.id).join('|')||'walk:'+from.id+':'+to.id;if(seen.has(key))return false;seen.add(key);return true;}).slice(0,o.day?undefined:12);
}
