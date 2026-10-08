import {warsawDateIso,warsawTimeMs} from '../transit-time';
import type {ApiStatisticsDay} from '../api-statistics';

export type StatisticsDevice = {id:string;installationId?:string;firstLogin?:string;lastSeenAt?:unknown;deviceInfo?:string;status?:string;verified?:boolean;role?:string};
export type StatisticsRange = 1|7|30|90;
export function statisticsTime(value:unknown):number|null {
  try {
    if(value && typeof value==='object' && 'toDate' in value && typeof value.toDate==='function')return statisticsTime(value.toDate());
    if(value && typeof value==='object' && 'seconds' in value && typeof value.seconds==='number')return statisticsTime(value.seconds*1000);
    if(typeof value==='string' && /^\d{4}-\d\d-\d\d$/.test(value))return statisticsTime(warsawTimeMs(value,'00:00'));
    const ms=value instanceof Date?value.getTime():typeof value==='number'?value:typeof value==='string' && /^\d{4}-\d\d-\d\dT/.test(value)?Date.parse(value):NaN;
    return Number.isFinite(ms)&&ms>0?ms:null;
  }catch{return null;}
}
export function statisticsDays(range:StatisticsRange,now=Date.now()):string[] {
  return Array.from({length:range},(_,index)=>warsawDateIso(index-range+1,new Date(now)));
}
export function uniqueStatisticsDevices(devices:StatisticsDevice[]):StatisticsDevice[] {
  const unique=new Map<string,StatisticsDevice>();
  for(const device of devices){
    const key=device.installationId?.trim()||device.id;
    const previous=unique.get(key);
    if(!previous){unique.set(key,device);continue;}
    const first=[statisticsTime(previous.firstLogin),statisticsTime(device.firstLogin)].filter((ms):ms is number=>ms!==null);
    const recent=(statisticsTime(device.lastSeenAt)||0)>(statisticsTime(previous.lastSeenAt)||0)?device:previous;
    unique.set(key,{...recent,firstLogin:first.length?new Date(Math.min(...first)).toISOString():recent.firstLogin});
  }
  return [...unique.values()];
}
export function deviceStatistics(devices:StatisticsDevice[],range:StatisticsRange,now=Date.now()) {
  const unique=uniqueStatisticsDevices(devices),days=statisticsDays(range,now),validDays=new Set(days);
  const previousDays=new Set(Array.from({length:range},(_,index)=>warsawDateIso(index-range*2+1,new Date(now))));
  const series=days.map(date=>({date,value:0}));const byDate=new Map(series.map(day=>[day.date,day]));
  let active=0,previousNew=0,unknownFirst=0;
  const platforms={Android:0,iOS:0,'Komputer / przeglądarka':0,'Nieznany system':0};
  for(const device of unique){
    const first=statisticsTime(device.firstLogin),seen=statisticsTime(device.lastSeenAt);
    if(first && first<=now){const date=warsawDateIso(0,new Date(first));const day=byDate.get(date);if(day)day.value++;if(previousDays.has(date))previousNew++;}else unknownFirst++;
    if(seen && seen<=now && validDays.has(warsawDateIso(0,new Date(seen))) && device.status!=='banned')active++;
    const info=device.deviceInfo||'';
    if(/android/i.test(info))platforms.Android++;
    else if(/iphone|ipad|\bios\b/i.test(info))platforms.iOS++;
    else if(/windows|macintosh|mac os|linux|chrome|firefox|safari/i.test(info))platforms['Komputer / przeglądarka']++;
    else platforms['Nieznany system']++;
  }
  return {total:unique.length,newDevices:series.reduce((sum,day)=>sum+day.value,0),active,previousNew,unknownFirst,series,platforms,
    verified:unique.filter(device=>device.verified===true).length,banned:unique.filter(device=>device.status==='banned').length};
}
export function apiStatistics(days:ApiStatisticsDay[],range:StatisticsRange,startedAt:number|null,now=Date.now()) {
  const selected=statisticsDays(range,now),records=new Map(days.map(day=>[day.date,day]));
  const firstDate=startedAt?warsawDateIso(0,new Date(startedAt)):null;
  const providers={pks:{requests:0,errors:0,latencyMs:0},mpk_rzeszow:{requests:0,errors:0,latencyMs:0},marcel:{requests:0,errors:0,latencyMs:0}};
  const series=selected.map(date=>{
    const record=records.get(date);let requests=0,errors=0;
    for(const name of Object.keys(providers) as Array<keyof typeof providers>){const bucket=record?.providers[name];if(!bucket)continue;
      providers[name].requests+=bucket.requests;providers[name].errors+=bucket.errors;providers[name].latencyMs+=bucket.latencyMs;
      requests+=bucket.requests;errors+=bucket.errors;
    }
    return {date,value:firstDate&&date>=firstDate?requests:null,errors:firstDate&&date>=firstDate?errors:null};
  });
  const requests=Object.values(providers).reduce((sum,p)=>sum+p.requests,0),errors=Object.values(providers).reduce((sum,p)=>sum+p.errors,0);
  const latency=Object.values(providers).reduce((sum,p)=>sum+p.latencyMs,0);
  return {series,providers,requests,errors,successRate:requests?(requests-errors)*100/requests:null,averageMs:requests?Math.round(latency/requests):null};
}
