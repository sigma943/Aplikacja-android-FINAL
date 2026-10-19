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
     // aapt unpacks *.gz assets and strips the suffix inside the APK.
     // Try the packaged JSON name first; the web source keeps gzip files.
     for(const suffix of ['.json','.json.gz']){
      const response=await fetch(`/data/journeys/${provider}${suffix}`,{cache:'force-cache',signal:requestSignal});
      if(!response.ok)continue;
      const data=new Uint8Array(await response.arrayBuffer());
      // A SPA fallback can return index.html with status 200 for a missing file.
      const first=data.find(byte=>byte!==32&&byte!==10&&byte!==13&&byte!==9);
      if(first===123||(data[0]===31&&data[1]===139))return data;
     }
     throw Error('Brak pliku rozkładu w aplikacji.');
    },signal);
    if(!bytes.length)throw Error('Pusty rozkład');cached.set(provider,bytes);
   }
   return [provider,bytes] as const;
  }catch{signal.throwIfAborted();return [provider,null] as const;}
 }));
 signal.throwIfAborted();return Object.fromEntries(entries);
}
