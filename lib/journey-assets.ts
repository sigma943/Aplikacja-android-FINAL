import {withRequestDeadline} from './request-deadline';
export type TimetableAssets=Record<string,Uint8Array|null>;
const cached=new Map<string,Uint8Array>();
/** Android's local HTTPS origin is virtual. Load assets through the window's
 * WebView handler; dedicated Worker fetches may bypass it. Parse in the Worker. */
export async function loadTimetableAssets(providers:string[],signal:AbortSignal):Promise<TimetableAssets>{
 const entries=await Promise.all([...new Set(providers.filter(p=>p==='pks'||p==='mpk'))].map(async provider=>{
  try{
   signal.throwIfAborted();let bytes=cached.get(provider);
   if(!bytes){
    bytes=await withRequestDeadline(async requestSignal=>{
     const response=await fetch(`/data/journeys/${provider}.json.gz`,{cache:'force-cache',signal:requestSignal});
     if(!response.ok)throw Error('Brak rozkładu');return new Uint8Array(await response.arrayBuffer());
    },signal);
    if(!bytes.length)throw Error('Pusty rozkład');cached.set(provider,bytes);
   }
   return [provider,bytes] as const;
  }catch{signal.throwIfAborted();return [provider,null] as const;}
 }));
 signal.throwIfAborted();return Object.fromEntries(entries);
}
