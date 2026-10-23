import type {Stop} from '@/Panel/src/types';
import {journeyWindow,stopDistance,type Journey,type JourneyLeg,type JourneyOptions} from './journey-planner';
import {isRzeszowStation,matchesJourneyPlace} from './journey-places';
import {warsawTimeMs} from './transit-time';
import {scanJourneyNetwork} from './journey-engine';
import type {JourneySearchGraph} from './journey-footpath-network';
import {sameRouteStopName} from './reconcile-route-stops';
import {pksTerminalStop} from './pks-terminal-identity';

export type TimetableFeed={version:number;provider:string;validFrom:string;validUntil:string;stops:Record<string,{name:string;lat:number;lon:number}>;
 calendars:Record<string,{start:string;end:string;days:string}>;exceptions:Record<string,Record<string,number>>;
 patterns:Array<Array<[string,number,number,number,number,number?]>>;trips:Array<[string,string,string,number,number]>;diagnostics?:string[]};
import type {Connection} from './journey-model';
export type {Connection} from './journey-model';
const carrier=(id:string)=>({id,name:id==='pks'?'PKS Rzeszów':id==='mpk'?'MPK Rzeszów':'Marcel',colorClass:''});
export function serviceRuns(feed:TimetableFeed,id:string,date:string){
 const day=date.replaceAll('-',''),exception=feed.exceptions[day]?.[id];if(exception)return exception===1;
 const c=feed.calendars[id],weekday=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
 return Boolean(c&&typeof c.days==='string'&&c.start<=day&&c.end>=day&&c.days[weekday]==='1');
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
  if(sameName){mapped.set(id,sameName);continue;}
  const candidates=providerStops
   .map(stop=>({stop,distance:stopDistance(stop,point as Stop)})).filter(x=>x.distance<45&&sameRouteStopName(point.name,[x.stop.name,x.stop.code].filter(Boolean).join(' '))).sort((a,b)=>a.distance-b.distance);
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
    connections.push({from,to,departure,arrival,course:`${provider}:${id}:${serviceDate}`,line,provider,pickup:a[3]!==1,dropoff:b[4]!==1,sourceFromStopId:a[0],sourceToStopId:b[0],fromSequence:a[5],toSequence:b[5]});
   }
  }
 }
 return connections;
}
/** Public deterministic search contract; all carriers use one normalized network. */
export function scanJourneys(from:Stop,to:Stop,connections:Connection[],o:JourneyOptions,onProgress:()=>void=()=>{},graph?:JourneySearchGraph):Journey[]{
 return scanJourneyNetwork(from,to,connections,o,onProgress,graph);
}
