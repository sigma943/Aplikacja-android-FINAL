import { warsawTimeMs, warsawClock } from './transit-time';

type TimedStop = {id?: string|number; lat?:number;lon?:number;planned?:string|null;real?:string|null};
export type BusOperatingInput = {
  lat:number;lon:number;speed?:number;nowMs:number;
  stops:TimedStop[];
  firstDepartureMs?:number;
  firstStopId?:string|number;
  atFirstStop?:boolean;
  atLastStop?:boolean;
  reportedBreak?:boolean;
};
export function transitTimestamp(value: unknown): number {
  const raw=String(value||'').trim();
  const match=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(raw);
  return match ? warsawTimeMs(match[1],match[2]) : Date.parse(raw);
}
function near(input:BusOperatingInput,stop?:TimedStop) {
  if(!stop || !Number.isFinite(stop.lat)||!Number.isFinite(stop.lon))return false;
  const dy=(input.lat-stop.lat!)*111320;
  const dx=(input.lon-stop.lon!)*111320*Math.cos(input.lat*Math.PI/180);
  return Math.hypot(dx,dy)<=150;
}
/** A later intermediate stop is never evidence of a break between trips. */
export function busOperatingState(input:BusOperatingInput) {
  const first=input.stops[0],last=input.stops.at(-1);
  const firstMs=input.firstDepartureMs ?? transitTimestamp(first?.planned);
  const stopped=(input.speed??0)<=3;
  const atFirst=input.atFirstStop===true||near(input,first);
  const atLast=input.atLastStop===true||near(input,last);
  const waiting=Number.isFinite(firstMs)&&firstMs>input.nowMs+(input.reportedBreak?0:15000);
  const lastMs=transitTimestamp(last?.real||last?.planned);
  const ended=Number.isFinite(lastMs)&&lastMs<=input.nowMs+60000;
  if(waiting && ((stopped&&atFirst)||input.reportedBreak))return {
    status:'break' as const,
    statusText:`Przerwa do ${warsawClock(firstMs)}`,
    nextTripStartAtMs:firstMs,
    nextTripFirstStopId:input.firstStopId??first?.id,
  };
  if(stopped && (input.reportedBreak || (atLast&&ended) || (input.atLastStop && !waiting)))return {status:'break' as const,statusText:'Przerwa'};
  return {status:'active' as const,statusText:'W trasie'};
}
