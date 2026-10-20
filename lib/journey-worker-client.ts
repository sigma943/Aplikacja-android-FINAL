import type {TimetableSearch} from './journey-schedules';
import {withRequestDeadline} from './request-deadline';
import type {Journey} from './journey-planner';
import {refineJourneyFootpaths} from './journey-footpath-refinement';
type Result={journeys:Journey[];warnings:string[];limited:boolean};
export async function runTimetableSearch(input:TimetableSearch,signal:AbortSignal,progress:(n:number,total:number)=>void):Promise<Result>{
 signal.throwIfAborted();
 const {prepareTimetableSearch}=await import('./journey-schedules');
 input=await withRequestDeadline(()=>prepareTimetableSearch(input,progress),signal,26000);
 signal.throwIfAborted();
 let worker:Worker|undefined,initialized=false,unavailable=typeof Worker==='undefined';
 const scan=async(request:TimetableSearch):Promise<Result>=>{
  signal.throwIfAborted();
  const direct=async()=>{const {executeTimetableSearch}=await import('./journey-schedules');const result=await executeTimetableSearch(request,progress);signal.throwIfAborted();return result;};
  if(unavailable)return direct();
  if(!worker){try{worker=new Worker(new URL('./journey.worker.ts',import.meta.url));}catch{unavailable=true;return direct();}}
  const active=worker;
  return new Promise((resolve,reject)=>{
   let finished=false;
   const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
   const finish=(error?:Error,result?:Result)=>{if(finished)return;finished=true;cleanup();if(error)reject(error);else resolve(result!);};
   const abort=()=>finish(new DOMException('Anulowano','AbortError'));
   const stalled=()=>finish(new Error('Wyznaczanie trasy nie odpowiada. Spróbuj ponownie.'));
   let timer=setTimeout(stalled,30000);
   signal.addEventListener('abort',abort,{once:true});
   const fallback=()=>{if(finished)return;finished=true;cleanup();active.terminate();worker=undefined;unavailable=true;direct().then(resolve,reject);};
   active.onerror=fallback;
   active.onmessage=({data})=>{if(finished)return;if(data.progress){clearTimeout(timer);timer=setTimeout(stalled,30000);progress(data.progress[0],data.progress[1]);return;}if(data.error)finish(new Error(data.error));else finish(undefined,data.result);};
   try{active.postMessage(initialized?{graph:request.graph}:{input:request});initialized=true;}catch{fallback();}
  });
 };
 try{return await refineJourneyFootpaths(input,scan,signal);}finally{worker?.terminate();}
}
