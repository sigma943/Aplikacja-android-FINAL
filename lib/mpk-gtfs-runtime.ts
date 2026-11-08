import {createGtfsRuntime} from './gtfs-runtime';
import {MPK_GTFS_URL,pksGtfsCovers,pksGtfsServiceRuns,type PksGtfsFeed} from './pks-gtfs';
import {warsawDateIso} from './transit-time';
import {isMpkPassengerLine} from './mpk-passenger-lines';
import type {MpkRzeszowScheduleEntry,MpkRzeszowStop} from './transport/types';
const runtime=createGtfsRuntime({provider:'mpk',url:MPK_GTFS_URL,proxy:'/api/mpk/gtfs',event:'pks-live:mpk-gtfs-updated'});
export const loadMpkGtfs=runtime.load,refreshMpkGtfs=runtime.refresh,peekMpkGtfs=runtime.peek,mpkGtfsUpdateStatus=runtime.status;

/** undefined means the snapshot cannot answer for this stop/day. An empty
 * array is a valid timetable and must not revive a service on a holiday. */
export function mpkGtfsStopSchedule(feed:PksGtfsFeed,stopId:string,date:string):MpkRzeszowScheduleEntry[]|undefined{
 if(!pksGtfsCovers(feed,date)||!Object.hasOwn(feed.stops,stopId))return;
 const patterns=new Map<number,{offsets:number[];destination:string}>();
 for(const [index,pattern] of feed.patterns.entries()){
  if(!pattern.length)continue;
  const offsets=pattern.filter((call,index)=>index<pattern.length-1&&call[0]===stopId&&call[3]!==1).map(call=>call[2]);
  if(offsets.length)patterns.set(index,{offsets,destination:pattern[pattern.length-1][0]});
 }
 const active=new Map<string,boolean>();
 const scheduled:Array<{seconds:number;entry:MpkRzeszowScheduleEntry}>=[];
 for(const [trip,line,service,start,patternId] of feed.trips){
  const pattern=patterns.get(patternId);
  if(!pattern||!isMpkPassengerLine(line))continue;
  if(!active.has(service))active.set(service,pksGtfsServiceRuns(feed,service,date));
  if(!active.get(service))continue;
  const destination=feed.stops[pattern.destination]?.name;
  for(const offset of pattern.offsets){
   const seconds=start+offset;
   const departure_time=[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(value=>String(value).padStart(2,'0')).join(':');
   scheduled.push({seconds,entry:{line,trip_id:trip,trip_headsign:feed.headsigns?.[trip]||destination,departure_time}});
  }
 }
 return scheduled.sort((a,b)=>a.seconds-b.seconds).map(row=>row.entry);
}

let indexedFeed:ReturnType<typeof runtime.peek>=null,lines:Record<string,string[]>={};
export async function withMpkGtfsStops(stops:MpkRzeszowStop[]):Promise<MpkRzeszowStop[]>{
 const feed=await loadMpkGtfs();if(!feed||!pksGtfsCovers(feed,warsawDateIso()))return stops;
 if(indexedFeed!==feed){
  const sets:Record<string,Set<string>>={};
  for(const trip of feed.trips)if(isMpkPassengerLine(trip[1]))for(const call of feed.patterns[trip[4]])if(call[3]!==1)(sets[call[0]]??=new Set()).add(trip[1]);
  lines=Object.fromEntries(Object.entries(sets).map(([id,set])=>[id,[...set].sort((a,b)=>a.localeCompare(b,'pl',{numeric:true}))]));indexedFeed=feed;
 }
 const managed=new Set(feed.managedLines||feed.trips.map(t=>t[1])),result=new Map(stops.map(stop=>[String(stop.stop_id),stop]));
 for(const [id,point] of Object.entries(feed.stops)){
  const known=result.get(id),current=lines[id]||[];
  if(!known&&!current.length)continue;
  const remaining=String(known?.lines||'').split(',').map(s=>s.trim()).filter(s=>isMpkPassengerLine(s)&&!managed.has(s));
  result.set(id,{...known,stop_id:id,stop_name:known?.stop_name||point.name,stop_lat:known?.stop_lat??point.lat,stop_lon:known?.stop_lon??point.lon,lines:[...new Set([...remaining,...current])].join(',')});
 }
 // Remove stale managed labels even if a platform disappeared from the feed.
 for(const [id,point] of result)if(!feed.stops[id])result.set(id,{...point,lines:String(point.lines||'').split(',').filter(line=>!managed.has(line.trim())).join(',')});
 return [...result.values()];
}
