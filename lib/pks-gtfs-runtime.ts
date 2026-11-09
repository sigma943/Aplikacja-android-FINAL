import {createGtfsRuntime} from './gtfs-runtime';
import {PKS_GTFS_URL,indexPksGtfs,pksGtfsCovers,pksGtfsTerminalStopIds,type PksGtfsFeed} from './pks-gtfs';
import {warsawDateIso} from './transit-time';
import bundledStops from '@/public/data/pks-stop-points.json';
import bundledLines from '@/public/data/pks-stop-lines.json';
import type {StopsMap} from './transport/types';
const runtime=createGtfsRuntime({provider:'pks',url:PKS_GTFS_URL,proxy:'/api/pks/gtfs',event:'pks-live:gtfs-updated'});
export const loadPksGtfs=runtime.load,refreshPksGtfs=runtime.refresh,peekPksGtfs=runtime.peek,pksGtfsUpdateStatus=runtime.status;
let index:ReturnType<typeof indexPksGtfs>|null=null,indexFeed:PksGtfsFeed|null=null,base:StopsMap=bundledStops.stops;
let linesIndex:ReturnType<typeof indexPksGtfs>|null=null,linesResult:Record<string,string[]>|null=null;
export function pksGtfsIndex(stops?:StopsMap){
 if(stops&&stops!==base){base=stops;index=null;}
 const feed=runtime.peek();
 if(!feed||!pksGtfsCovers(feed,warsawDateIso()))return null;
 if(!index||indexFeed!==feed){index=indexPksGtfs(feed,base);indexFeed=feed;}
 return index;
}
export async function withPksGtfsStops(stops:StopsMap){await loadPksGtfs();return pksGtfsIndex(stops)?.stops??stops;}
export function pksGtfsTerminalLines(areaId?:string,code?:string):string[]|null{
 const feed=runtime.peek(),indexed=pksGtfsIndex();if(!feed||!indexed)return null;
 const ids=pksGtfsTerminalStopIds(feed,areaId,code);if(ids===null)return null;
 const selected=new Set(ids),lines=new Set<string>();
 for(const [key,stops] of Object.entries(indexed.byStop))if(stops.some(id=>selected.has(id)))(indexed.lines[key]||[]).forEach(line=>lines.add(line));
 return [...lines].sort((a,b)=>a.localeCompare(b,'pl',{numeric:true}));
}
export function pksGtfsLines(){
 const indexed=pksGtfsIndex(),feed=runtime.peek();if(!indexed||!feed)return null;
 if(linesIndex===indexed&&linesResult)return linesResult;
 const managed=new Set(feed.managedLines||feed.trips.map(t=>t[1]));
 const result:Record<string,string[]>={};
 for(const key of Object.keys(indexed.stops))result[key]=[...new Set([
  ...((bundledLines.lines as Record<string,string[]>)[key]||[]).filter(line=>!managed.has(line)),
  ...(indexed.lines[key]||[]),
 ])].sort((a,b)=>a.localeCompare(b,'pl',{numeric:true}));
 linesIndex=indexed;linesResult=result;return result;
}
