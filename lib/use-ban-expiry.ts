'use client';
import {useEffect} from 'react';
import {db} from './firebase';
import {banExpiryTime} from './ban-expiry';
import {expireDeviceBan} from './expire-device-ban';
import {isAppVisible,observeAppActivity} from './app-activity';

type Candidate={id:string;status?:string;banDetails?:{expiresAt?:unknown}|null};
/** One deadline timer, paused in the background; no recurring reads for active devices. */
export function useBanExpiry(devices:Candidate[],actorId:string|undefined){
 const deadlines=JSON.stringify(actorId?devices.flatMap(d=>{const at=banExpiryTime(d);return at===null?[]:[[d.id,at]];}):[]);
 useEffect(()=>{
  if(!actorId)return;
  const candidates=JSON.parse(deadlines) as [string,number][];
  if(!candidates.length)return;
  let disposed=false,running=false,timer:ReturnType<typeof setTimeout>|undefined;
  const clear=()=>{if(timer!==undefined)clearTimeout(timer);timer=undefined;};
  const check=async()=>{
   clear();if(disposed||running||!isAppVisible()||!navigator.onLine)return;
   const now=Date.now(),due=candidates.filter(([,at])=>at<=now);
   if(due.length){
    running=true;
    await Promise.allSettled(due.map(([id])=>expireDeviceBan(db,id,actorId)));
    running=false;
   }
   if(disposed||!isAppVisible()||!navigator.onLine)return;
   // Snapshots normally remove expired candidates. Bound retries for offline/server errors.
   const delay=Math.min(...candidates.map(([,at])=>at<=Date.now()?60000:at-Date.now()+25));
   timer=setTimeout(check,Math.min(2147483647,Math.max(25,delay)));
  };
  const resume=()=>{void check();};
  const stop=observeAppActivity(active=>{if(active)resume();else clear();});
  window.addEventListener('online',resume);resume();
  return()=>{disposed=true;clear();stop();window.removeEventListener('online',resume);};
 },[deadlines,actorId]);
}
