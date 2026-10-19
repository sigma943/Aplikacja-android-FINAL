import {findJourneys,type JourneyOptions,type JourneyLeg,type Journey} from './journey-planner';
import type {Stop} from '@/Panel/src/types';
export function runJourneySearch(from:Stop,to:Stop,legs:JourneyLeg[],options:JourneyOptions,signal:AbortSignal):Promise<Journey[]>{
 if(signal.aborted)return Promise.reject(new DOMException('Anulowano','AbortError'));
 if(typeof Worker==='undefined')return Promise.resolve(findJourneys(from,to,legs,options));
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./journey.worker.ts',import.meta.url));
  let finished=false;
  const finish=(error?:Error,value?:Journey[])=>{if(finished)return;finished=true;clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate();if(error)reject(error);else resolve(value||[]);};
  const abort=()=>finish(new DOMException('Anulowano','AbortError'));
  const timer=setTimeout(()=>finish(new Error('Wyszukiwanie trwa zbyt długo. Zmień preferencje.')),15000);
  signal.addEventListener('abort',abort,{once:true});
  worker.onerror=()=>finish(new Error('Nie udało się obliczyć połączeń.'));
  worker.onmessage=event=>event.data.error?finish(new Error('Nie udało się obliczyć połączeń.')):finish(undefined,event.data.journeys);
  worker.postMessage({from,to,legs,options});
 });
}
