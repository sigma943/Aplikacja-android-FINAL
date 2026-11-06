import type {TimetableFeed} from './journey-timetable';
import {pksGtfsServiceRuns} from './pks-gtfs';

export const TIMETABLE_CONFIRMATION_MS=15*60_000;
export type PendingTimetableUpdate={signature:string;firstSeenAt:number};
export type TimetableUpdateDecision={accept:boolean;reason:'initial'|'additions'|'confirming'|'confirmed'|'large-drop';pending?:PendingTimetableUpdate};

/** Compare passenger services, not provider trip IDs (which can be renumbered).
 * Calendar additions never look like withdrawals. Expired services need no confirmation. */
function courses(feed:TimetableFeed,dates:string[]){
 const result=new Map<string,Set<string>>();
 const calendar=new Map<string,Set<string>>(),patterns=new Map<number,string>();
 for(const [,line,service,start,patternId] of feed.trips){
  if(!calendar.has(service))calendar.set(service,new Set(dates.filter(date=>pksGtfsServiceRuns(feed,service,date))));
  const days=calendar.get(service)!;if(!days.size)continue;
  if(!patterns.has(patternId))patterns.set(patternId,JSON.stringify(feed.patterns[patternId]?.map(call=>[
   (feed.stops[call[0]]?.name||'').toLocaleLowerCase('pl').replace(/\s+/g,' ').trim(),call[1],call[2],call[3],call[4],
  ])));
  const key=JSON.stringify([line,start,patterns.get(patternId)]),active=result.get(key);
  if(!active)result.set(key,days);else if(active!==days)result.set(key,new Set([...active,...days]));
 }
 return result;
}
export function assessTimetableUpdate(previous:TimetableFeed|null,next:TimetableFeed,pending:PendingTimetableUpdate|undefined,now:number,today:string):TimetableUpdateDecision{
 if(!previous)return {accept:true,reason:'initial'};
 const dates:string[]=[];
 for(let offset=0;offset<366;offset++){const day=new Date(today+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+offset);const iso=day.toISOString().slice(0,10);if(iso.replaceAll('-','')>previous.validUntil)break;dates.push(iso);}
 const old=courses(previous,dates),fresh=courses(next,dates);
 const missing:Array<[string,string[]]>=[];
 for(const [key,days] of old){const absent=[...days].filter(day=>!fresh.get(key)?.has(day));if(absent.length)missing.push([key,absent]);}
 if(!missing.length)return {accept:true,reason:'additions'};
 // A persistently truncated upstream response must never become authoritative.
 const loss=old.size-fresh.size;
 if(loss>=20&&fresh.size<old.size*.7)return {accept:false,reason:'large-drop'};
 let a=2166136261,b=5381;
 for(const entry of missing.sort(([a],[b])=>a.localeCompare(b)))for(const character of JSON.stringify(entry)){const code=character.charCodeAt(0);a=Math.imul(a^code,16777619);b=Math.imul(b,33)^code;}
 const signature=missing.length+':'+(a>>>0).toString(16)+':'+(b>>>0).toString(16);
 if(pending?.signature===signature&&now-pending.firstSeenAt>=TIMETABLE_CONFIRMATION_MS)return {accept:true,reason:'confirmed'};
 return {accept:false,reason:'confirming',pending:pending?.signature===signature?pending:{signature,firstSeenAt:now}};
}
