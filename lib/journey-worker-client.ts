import type {TimetableSearch} from './journey-schedules';
import {withRequestDeadline} from './request-deadline';
import type {Journey} from './journey-planner';
type Result={journeys:Journey[];warnings:string[];limited:boolean};
export async function runTimetableSearch(input:TimetableSearch,signal:AbortSignal,progress:(n:number,total:number)=>void):Promise<Result>{
 signal.throwIfAborted();
 const {prepareTimetableSearch}=await import('./journey-schedules');
 input=await withRequestDeadline(()=>prepareTimetableSearch(input,progress),signal,26000);
 signal.throwIfAborted();
 const direct=async()=>{const {executeTimetableSearch}=await import('./journey-schedules');const result=await executeTimetableSearch(input,progress);signal.throwIfAborted();return result;};
 if(typeof Worker==='undefined')return direct();
 let worker:Worker;
 try{worker=new Worker(new URL('./journey.worker.ts',import.meta.url));}catch{return direct();}
 return new Promise((resolve,reject)=>{
  let finished=false;
  const finish=(error?:Error,result?:Result)=>{if(finished)return;finished=true;clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate();if(error)reject(error);else resolve(result!);};
  const abort=()=>finish(new DOMException('Anulowano','AbortError'));
  const stalled=()=>finish(new Error('Wyznaczanie trasy nie odpowiada. Spróbuj ponownie.'));
  let timer=setTimeout(stalled,30000); // Watch inactivity, not total time of a progressing complex search.
  signal.addEventListener('abort',abort,{once:true});
  worker.onerror=()=>{if(finished)return;finished=true;clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate();direct().then(resolve,reject);};
  worker.onmessage=({data})=>{if(data.progress){clearTimeout(timer);timer=setTimeout(stalled,30000);progress(data.progress[0],data.progress[1]);return;}if(data.error)finish(new Error(data.error));else finish(undefined,data.result);};
  worker.postMessage(input);
 });
}
