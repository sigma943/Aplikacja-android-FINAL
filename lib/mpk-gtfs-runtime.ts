import {createGtfsRuntime} from './gtfs-runtime';
import {MPK_GTFS_URL,pksGtfsCovers} from './pks-gtfs';
import {warsawDateIso} from './transit-time';
import {isMpkPassengerLine} from './mpk-passenger-lines';
import type {MpkRzeszowStop} from './transport/types';
const runtime=createGtfsRuntime({provider:'mpk',url:MPK_GTFS_URL,proxy:'/api/mpk/gtfs',event:'pks-live:mpk-gtfs-updated'});
export const loadMpkGtfs=runtime.load,refreshMpkGtfs=runtime.refresh,peekMpkGtfs=runtime.peek,mpkGtfsUpdateStatus=runtime.status;
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
