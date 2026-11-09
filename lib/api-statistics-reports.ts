import type {ApiStatisticsBucket,ApiStatisticsDay,ApiStatisticsSnapshot} from './api-statistics';
import {readApiStatistics} from './api-statistics';
import {warsawDateIso} from './transit-time';

export const API_REPORT_PROVIDERS=['pks','mpk_rzeszow','marcel'] as const;
export type ApiStatisticsReport={stream:string;date:string;installationId:string;uid:string;startedAt:number;providers:Record<typeof API_REPORT_PROVIDERS[number],ApiStatisticsBucket>};
export type GlobalApiStatistics={version:1;startedAt:number|null;days:ApiStatisticsDay[];contributors:Record<string,number>;loading:boolean;error:string|null};
export const EMPTY_GLOBAL_API:GlobalApiStatistics={version:1,startedAt:null,days:[],contributors:{},loading:true,error:null};

/** Same persisted history keeps its identity across UID changes and repeated uploads. */
export async function apiStatisticsStreamId(installationId:string,startedAt:number){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`pks-api-v1:${installationId}:${startedAt}`));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function apiStatisticsReports(history:ApiStatisticsSnapshot,stream:string,installationId:string,uid:string,now=Date.now()):ApiStatisticsReport[]{
  const valid=readApiStatistics(history,now);
  if(!valid.startedAt||!installationId||!uid||!/^[a-f0-9]{64}$/.test(stream))return [];
  return valid.days.filter(day=>API_REPORT_PROVIDERS.some(provider=>(day.providers[provider]?.requests||0)>0)).map(day=>({
    stream,date:day.date,installationId,uid,startedAt:valid.startedAt!,
    providers:Object.fromEntries(API_REPORT_PROVIDERS.map(provider=>[provider,day.providers[provider]||{requests:0,errors:0,latencyMs:0}])) as ApiStatisticsReport['providers'],
  }));
}

/** Cumulative snapshots replace themselves; neither retries nor reinstalls sum twice. */
export function aggregateApiStatisticsReports(reports:unknown[],now=Date.now()):GlobalApiStatistics {
  const days=new Map<string,ApiStatisticsDay>(),devices=new Map<string,Set<string>>(),seen=new Set<string>();
  let startedAt:number|null=null;
  for(const raw of reports){
    const report=raw as ApiStatisticsReport;
    if(!report||typeof report.stream!=='string'||!/^[a-f0-9]{64}$/.test(report.stream)||typeof report.installationId!=='string'||!report.installationId)continue;
    const key=`${report.stream}_${report.date}`;if(seen.has(key))continue;
    const parsed=readApiStatistics({version:1,startedAt:report.startedAt,days:[{date:report.date,providers:report.providers}]},now);
    const day=parsed.days[0];if(!day||!parsed.startedAt)continue;
    seen.add(key);startedAt=startedAt===null?parsed.startedAt:Math.min(startedAt,parsed.startedAt);
    const combined=days.get(day.date)||{date:day.date,providers:{}};
    let requests=0;
    for(const provider of API_REPORT_PROVIDERS){
      const bucket=day.providers[provider];if(!bucket)continue;
      const current=combined.providers[provider]||{requests:0,errors:0,latencyMs:0};
      combined.providers[provider]={requests:current.requests+bucket.requests,errors:current.errors+bucket.errors,latencyMs:current.latencyMs+bucket.latencyMs};
      requests+=bucket.requests;
    }
    days.set(day.date,combined);
    if(requests){const set=devices.get(day.date)||new Set<string>();set.add(report.installationId);devices.set(day.date,set);}
  }
  return {version:1,startedAt,days:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)),contributors:Object.fromEntries([...devices].map(([date,set])=>[date,set.size])),loading:false,error:null};
}

export function apiReportFingerprint(report:ApiStatisticsReport){return JSON.stringify([report.startedAt,report.providers]);}
export function readApiReportAcknowledgements(value:unknown,now=Date.now()):Map<string,string>{
  if(!value||typeof value!=='object'||Array.isArray(value))return new Map();
  const cutoff=warsawDateIso(-89,new Date(now));
  return new Map(Object.entries(value).filter(([key,value])=>/^[a-f0-9]{64}_\d{4}-\d\d-\d\d$/.test(key)&&key.slice(-10)>=cutoff&&typeof value==='string'&&value.length<2000).slice(-360) as [string,string][]);
}

/** Stops between writes on hide/offline; an already started write may finish. */
export async function uploadApiStatisticsReports(reports:ApiStatisticsReport[],sent:Map<string,string>,available:()=>boolean,write:(id:string,report:ApiStatisticsReport)=>Promise<unknown>){
  let writes=0;
  let failure:unknown;
  // Current counters must not wait behind a failed historical report.
  for(const report of [...reports].sort((a,b)=>b.date.localeCompare(a.date))){
    if(!available())break;
    const id=`${report.stream}_${report.date}`,fingerprint=apiReportFingerprint(report);
    if(sent.get(id)===fingerprint)continue;
    try {
      await write(id,report);
      sent.set(id,fingerprint);writes++;
    } catch(error) { failure??=error; }
  }
  if(failure)throw failure;
  return writes;
}
