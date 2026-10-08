import {warsawDateIso} from './transit-time';
import type {DiagnosticProvider,TransportMeasurement} from './transport-diagnostics';

export type ApiStatisticsBucket={requests:number;errors:number;latencyMs:number};
export type ApiStatisticsDay={date:string;providers:Partial<Record<DiagnosticProvider,ApiStatisticsBucket>>};
export type ApiStatisticsSnapshot={version:1;startedAt:number|null;days:ApiStatisticsDay[]};
const KEY='pks-live:api-statistics:v1';
const listeners=new Set<()=>void>();
const empty:ApiStatisticsSnapshot={version:1,startedAt:null,days:[]};
let snapshot:ApiStatisticsSnapshot=empty,loaded=false,dirty=false,saveTimer:ReturnType<typeof setTimeout>|undefined;
const providers=['pks','mpk_rzeszow','marcel'] as const;
export function readApiStatistics(value:unknown,now=Date.now()):ApiStatisticsSnapshot {
  const raw=value as ApiStatisticsSnapshot|null;
  if(!raw||raw.version!==1||!Array.isArray(raw.days)||!Number.isFinite(raw.startedAt)||raw.startedAt!<=0||raw.startedAt!>now)return {...empty,days:[]};
  const cutoff=warsawDateIso(-89,new Date(now)),today=warsawDateIso(0,new Date(now));
  const days=new Map<string,ApiStatisticsDay>();
  for(const day of raw.days.slice(-180)){
    if(!day||typeof day.date!=='string'||!/^\d{4}-\d\d-\d\d$/.test(day.date)||day.date<cutoff||day.date>today||!day.providers)continue;
    const buckets:ApiStatisticsDay['providers']={};
    for(const provider of providers){const b=day.providers[provider];if(!b)continue;
      if(Number.isSafeInteger(b.requests)&&b.requests>=0&&Number.isSafeInteger(b.errors)&&b.errors>=0&&b.errors<=b.requests&&Number.isFinite(b.latencyMs)&&b.latencyMs>=0)buckets[provider]={requests:b.requests,errors:b.errors,latencyMs:b.latencyMs};
    }
    days.set(day.date,{date:day.date,providers:buckets});
  }
  return {version:1,startedAt:raw.startedAt,days:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date))};
}
function load(){
  if(loaded||typeof window==='undefined')return;
  loaded=true;
  try{snapshot=readApiStatistics(JSON.parse(window.localStorage.getItem(KEY)||'null'));}catch{snapshot={...empty,days:[]};}
}
export function getApiStatistics(){load();return snapshot;}
export const getServerApiStatistics=()=>empty;
export const subscribeApiStatistics=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export function saveApiStatistics(){
  if(saveTimer)clearTimeout(saveTimer);saveTimer=undefined;
  if(!dirty||!loaded||!snapshot.startedAt||typeof window==='undefined')return;
  try{window.localStorage.setItem(KEY,JSON.stringify(snapshot));dirty=false;}catch{ /* Counters remain available in memory. */ }
}
/** Observe completed requests only; no polling, network calls, URLs or individual events. */
export function collectApiMeasurement(measurement:TransportMeasurement){
  if(measurement.scope!=='request'||typeof window==='undefined'||(window as Window & {NativeWidget?:unknown}).NativeWidget)return;
  load();const now=Date.now(),date=warsawDateIso(0,new Date(now));
  const days=snapshot.days.filter(day=>day.date>=warsawDateIso(-89,new Date(now))).map(day=>({...day,providers:{...day.providers}}));
  let day=days.find(day=>day.date===date);
  if(!day){day={date,providers:{}};days.push(day);}
  const bucket=day.providers[measurement.provider]||{requests:0,errors:0,latencyMs:0};
  day.providers[measurement.provider]={requests:bucket.requests+1,errors:bucket.errors+(measurement.failed?1:0),latencyMs:bucket.latencyMs+Math.max(0,Math.min(measurement.latencyMs,120_000))};
  snapshot={version:1,startedAt:snapshot.startedAt||now,days};dirty=true;
  listeners.forEach(listener=>{try{listener();}catch{/* Observers must not interrupt collection. */}});
  if(!saveTimer)saveTimer=setTimeout(saveApiStatistics,30_000);
}
