import type {MpkRzeszowScheduleEntry as Entry} from './transport/types';
import {warsawDateIso,warsawTimeMs} from './transit-time';
const attributes=(text:string):Record<string,string>=>Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2].replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&')]));
export type MybusDeparture={id:string;line:string;direction:string;vehicle?:string;atMs:number;realtime:boolean;atStop:boolean};
/** `t` is the predicted clock, `vr` the countdown, and m=3 is only a schedule. */
export function parseMybusDepartures(xml:string,stopId:string,now:number):MybusDeparture[]{
 const root=/<Departures\b([^>]*)>/i.exec(xml),header=root?attributes(root[1]):{};
 if(!root||header.i!==stopId)throw Error('Invalid myBus stop board or mismatched SIP stop');
 return [...xml.matchAll(/<D\b([^>]*?)\/>/g)].flatMap(match=>{
  const row=attributes(match[1]),seconds=Number(row.t),relative=Number(row.vr),line=row.r?.trim();
  if(!line||!row.d?.trim()||!row.t||!Number.isFinite(seconds)||seconds<0||seconds>172800||!row.vr||!Number.isFinite(relative)||Math.abs(relative)>172800||!['1','2','3'].includes(row.m))return [];
  const clock=`${Math.floor(seconds/3600)}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  // Resolve midnight/service-day rollover from the source countdown, retaining second precision.
  const atMs=[-1,0,1].map(offset=>warsawTimeMs(warsawDateIso(offset,new Date(now)),clock)).sort((a,b)=>Math.abs(a-(now+relative*1000))-Math.abs(b-(now+relative*1000)))[0];
  if(!Number.isFinite(atMs))return [];
  return [{id:row.iks||`${row.i}:${row.ip}:${seconds}`,line,direction:row.d.trim(),vehicle:Number(row.n)>0?row.n:undefined,atMs,realtime:['1','2'].includes(row.m),atStop:row.m==='1'}];
 });
}
const directionKey=(value:unknown)=>String(value||'').toLowerCase().replace(/ł/g,'l').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/^rzeszow[ ,]*/,'').replace(/[^a-z0-9]/g,'');
/** Never equate SIP course IDs with GTFS IDs or apply a bus delay to every course of a line. */
export function mergeMybusDepartures(entries:Entry[],board:MybusDeparture[],date:string,observedAt:number):Entry[]{
 const result=[...entries],used=new Set<number>();
 for(const departure of board){
  const candidates=entries.flatMap((entry,index)=>{
   if(used.has(index)||entry.line.trim()!==departure.line||directionKey(entry.trip_headsign)!==directionKey(departure.direction))return [];
   const planned=warsawTimeMs(date,entry.departure_time),distance=Math.abs(departure.atMs-planned);
   // A narrow, unique association can add a delay; ambiguous forecasts remain live-only.
   return Number.isFinite(planned)&&distance<=(departure.realtime?10*60_000:59_999)?[{index,distance}]:[];
  }).sort((a,b)=>a.distance-b.distance);
  const best=candidates[0],unique=candidates.length===1;
  const index=unique?best.index:undefined;
  if(index!==undefined){
   const other=board.filter(row=>row!==departure&&row.line===departure.line&&directionKey(row.direction)===directionKey(departure.direction)&&Math.abs(row.atMs-warsawTimeMs(date,entries[index].departure_time))<=best.distance+120_000);
   if(other.length) {if(departure.realtime)result.push(liveOnly(departure,observedAt));continue;}
   used.add(index);
   if(departure.realtime&&!entries[index].real_departure_time&&!entries[index].real_departure_at_ms){
    result[index]={...entries[index],...prediction(departure,observedAt)};
   }
  }else if(departure.realtime)result.push(liveOnly(departure,observedAt));
 }
 return result;
}
function prediction(row:MybusDeparture,observedAt:number){return {real_departure_at_ms:row.atMs,realtime_source:'stop-board' as const,vehicle:row.vehicle,board_observed_at_ms:observedAt,board_at_stop:row.atStop,board_is_past:false,board_time_precision_ms:0};}
function liveOnly(row:MybusDeparture,observedAt:number):Entry{return {line:row.line,trip_headsign:row.direction,departure_time:'',block_id:`mybus:${row.id}`,...prediction(row,observedAt)};}
