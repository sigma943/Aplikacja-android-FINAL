import {Capacitor,CapacitorHttp} from '@capacitor/core';
import {gunzipSync,strFromU8} from 'fflate';
import {parsePksGtfs,pksGtfsCovers,type PksGtfsFeed} from './pks-gtfs';
import {normalizeJourneyFeed} from './journey-feed-validation';
import {warsawDateIso} from './transit-time';
import {isAppVisible,observeAppActivity} from './app-activity';
import {assessTimetableUpdate,TIMETABLE_CONFIRMATION_MS,type PendingTimetableUpdate} from './timetable-update-guard';

type Saved={feed:PksGtfsFeed;checkedAt:number;etag?:string;modified?:string;pendingUpdate?:PendingTimetableUpdate};
export function createGtfsRuntime(config:{provider:string;url:string;proxy:string;event:string}){
const TTL=TIMETABLE_CONFIRMATION_MS;
let updateStatus='idle';
let saved:Saved|null=null,loading:Promise<PksGtfsFeed|null>|null=null,pending:Promise<PksGtfsFeed|null>|null=null,retryAfter=0;
let watching=false;

/** Commit one complete validated snapshot. Failed writes leave the old snapshot intact. */
function storage(action:(store:IDBObjectStore)=>IDBRequest,write=false):Promise<Saved|null>{
 if(typeof indexedDB==='undefined')return Promise.resolve(null);
 return new Promise(resolve=>{
  let db:IDBDatabase|undefined,done=false;
  const finish=(value:Saved|null)=>{if(done)return;done=true;clearTimeout(timer);db?.close();resolve(value);};
  const timer=setTimeout(()=>finish(null),1500);
  try{const open=indexedDB.open('pks-live-gtfs',1);open.onupgradeneeded=()=>open.result.createObjectStore('feeds');open.onerror=open.onblocked=()=>finish(null);open.onsuccess=()=>{
   db=open.result;if(done){db.close();return;}db.onversionchange=()=>db?.close();
   try{const tx=db.transaction('feeds',write?'readwrite':'readonly'),request=action(tx.objectStore('feeds'));let value:Saved|null=null;request.onsuccess=()=>{value=request.result??null;};tx.oncomplete=()=>finish(value);tx.onerror=tx.onabort=()=>finish(null);}catch{finish(null);}
  };}catch{finish(null);}
 });
}
function validate(feed:PksGtfsFeed):PksGtfsFeed{return {...feed,...normalizeJourneyFeed(feed,config.provider)};}
function publish(){if(typeof window!=='undefined')window.dispatchEvent(new Event(config.event));}
function watch(){
 if(watching||typeof window==='undefined')return;watching=true;
 const onResume=()=>{if(isAppVisible())void refresh();};
 observeAppActivity(active=>{if(active)onResume();});window.addEventListener('online',()=>{if(isAppVisible())void refresh(true);});
 window.setInterval(onResume,TTL);
}
function peek(){return saved?.feed??null;}
async function load():Promise<PksGtfsFeed|null>{
 watch();
 if(!saved){
  if(!loading)loading=(async()=>{
   const cached=await storage(store=>store.get(config.provider));
   if(cached&&!saved){try{saved={...cached,feed:validate(cached.feed)};}catch{/* keep the packaged fallback */}}
   if(!saved){
    for(const suffix of ['.json','.json.gz']){try{
     const response=await fetch('/data/journeys/'+config.provider+suffix,{cache:'force-cache',signal:AbortSignal.timeout(12000)});
     if(!response.ok)continue;const bytes=new Uint8Array(await response.arrayBuffer());
     const feed=validate(JSON.parse(strFromU8(bytes[0]===31&&bytes[1]===139?gunzipSync(bytes):bytes)));
     if(!saved)saved={feed,checkedAt:0};break;
    }catch{/* try the other packaged representation */}}
   }
   return saved?.feed??null;
  })().finally(()=>{loading=null;});
  await loading;
 }
 // First paint uses the last good snapshot; downloading never hides the list.
 void refresh();return saved?.feed??null;
}
async function refresh(force=false):Promise<PksGtfsFeed|null>{
 if(loading)await loading;
 if(pending)return pending;
 if(!isAppVisible()||(!force&&(Date.now()<retryAfter||saved&&Date.now()-saved.checkedAt<TTL)))return saved?.feed??null;
 pending=(async()=>{
  try{
   const headers:Record<string,string>={Accept:'application/zip'};
   if(saved?.etag)headers['If-None-Match']=saved.etag;
   if(saved?.modified)headers['If-Modified-Since']=saved.modified;
   let status:number,bytes:Uint8Array,responseHeaders:Record<string,string>;
   if(Capacitor.isNativePlatform()){
    const response=await CapacitorHttp.request({url:config.url,method:'GET',headers,responseType:'arraybuffer',connectTimeout:12000,readTimeout:20000});
    status=response.status;responseHeaders=response.headers||{};
    if(status!==200&&status!==304)throw Error('GTFS HTTP '+status);
    bytes=status===304?new Uint8Array():typeof response.data==='string'?Uint8Array.from(atob(response.data),c=>c.charCodeAt(0)):new Uint8Array(response.data);
   }else{
    const response=await fetch(config.proxy,{headers,cache:'no-store',signal:AbortSignal.timeout(25000)});
    status=response.status;responseHeaders=Object.fromEntries(response.headers.entries());
    if(status!==200&&status!==304)throw Error('GTFS HTTP '+status);
    bytes=new Uint8Array(await response.arrayBuffer());
   }
   if(status===304){if(!saved)throw Error('Brak zapisanej wersji GTFS');saved={...saved,checkedAt:Date.now(),pendingUpdate:undefined};updateStatus='unchanged';}
   else{
    const feed=parsePksGtfs(bytes,config.provider,config.url);
    if(!pksGtfsCovers(feed,warsawDateIso()))throw Error('Rozkład nie obejmuje dzisiejszej daty');
    feed.managedLines=[...new Set([...(saved?.feed.managedLines||saved?.feed.trips.map(t=>t[1])||[]),...(feed.managedLines||[])])];
    const header=(name:string)=>Object.entries(responseHeaders).find(([key])=>key.toLowerCase()===name)?.[1];
    const decision=assessTimetableUpdate(saved?.feed??null,feed,saved?.pendingUpdate,Date.now(),warsawDateIso());
    updateStatus=decision.reason;
    if(!decision.accept&&saved){
     // Keep validators of the accepted version: the candidate must be downloaded again.
     saved={...saved,checkedAt:Date.now(),pendingUpdate:decision.pending};
    }else{
     const changed=saved?.feed.revision!==feed.revision;
     saved={feed,checkedAt:Date.now(),etag:header('etag'),modified:header('last-modified')};
     if(changed)publish();
    }
   }
   await storage(store=>store.put(saved!,config.provider),true);retryAfter=0;
  }catch{retryAfter=Date.now()+60_000;updateStatus='error';if(saved?.pendingUpdate){saved={...saved,pendingUpdate:undefined};await storage(store=>store.put(saved!,config.provider),true);}}
  return saved?.feed??null;
 })().finally(()=>{pending=null;});
 return pending;
}

return {load,refresh,peek,status:()=>updateStatus};
}
