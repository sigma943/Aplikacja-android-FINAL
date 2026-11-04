import {gunzipSync,strFromU8} from 'fflate';
import type {TimetableFeed} from './journey-timetable';
import {normalizeJourneyFeed} from './journey-feed-validation';
import {loadPksGtfs} from './pks-gtfs-runtime';
import {loadMpkGtfs} from './mpk-gtfs-runtime';
const feeds=new Map<string,Promise<TimetableFeed>>();
/** Load packaged assets in the WebView, before handing data to a worker.
 * Android's virtual localhost is not reliably available to worker fetches.
 */
export function loadJourneyFeed(provider:string):Promise<TimetableFeed>{
 if((provider==='pks'||provider==='mpk')&&typeof window!=='undefined')return (provider==='pks'?loadPksGtfs():loadMpkGtfs()).then(feed=>{if(!feed)throw Error('Brak poprawnego rozkładu');return feed;});
 if(!feeds.has(provider))feeds.set(provider,(async()=>{
  let lastError:unknown;
  for(const suffix of ['.json','.json.gz']){
   try{
    const response=await fetch(`/data/journeys/${provider}${suffix}`,{cache:'force-cache',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error(`Plik rozkładu: HTTP ${response.status}`);
    const bytes=new Uint8Array(await response.arrayBuffer());
    return normalizeJourneyFeed(JSON.parse(strFromU8(bytes[0]===31&&bytes[1]===139?gunzipSync(bytes):bytes)),provider);
   }catch(error){lastError=error;}
  }
  throw lastError;
 })().catch(error=>{feeds.delete(provider);throw error;}));
 return feeds.get(provider)!;
}
