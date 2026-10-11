import {buildStopsCatalog} from './stops-catalog';
import {createCatalogWorker} from './stops-catalog-worker-factory';
import {MERGED_STOPS_RUNTIME_CACHE, MERGED_STOPS_RUNTIME_CACHE_LIMIT} from '@/components/stops-panel/stop-domain';
import type {Stop} from '@/Panel/src/types';
import type {CatalogSnapshot} from './stops-catalog-cache';

export type CatalogWorkerRequest = {id:number; key:string; pks:CatalogSnapshot['pks']; mpk:CatalogSnapshot['mpk']; marcel:CatalogSnapshot['marcel']};
export type CatalogWorkerResult = {id:number; list:Stop[]; physical:Stop[]};
type Pending = {request:CatalogWorkerRequest; resolve:(result:CatalogWorkerResult)=>void; timer:ReturnType<typeof setTimeout>};
let worker: Worker | undefined;
let unavailable = false;
let sequence = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
const pending = new Map<number, Pending>();
const inFlight = new Map<string, Promise<CatalogWorkerResult>>();

function remember(key:string, result:CatalogWorkerResult) {
  MERGED_STOPS_RUNTIME_CACHE.set('list:'+key,result.list);
  MERGED_STOPS_RUNTIME_CACHE.set('physical:'+key,result.physical);
  while (MERGED_STOPS_RUNTIME_CACHE.size > MERGED_STOPS_RUNTIME_CACHE_LIMIT) {
    MERGED_STOPS_RUNTIME_CACHE.delete(MERGED_STOPS_RUNTIME_CACHE.keys().next().value!);
  }
}
function fallback(request:CatalogWorkerRequest):CatalogWorkerResult {
  return {id:request.id,
    list:buildStopsCatalog(request.pks,request.mpk,request.marcel,request.key),
    physical:buildStopsCatalog(request.pks,request.mpk,request.marcel,request.key,true)};
}
function stopWorker() {
  clearTimeout(idleTimer);
  worker?.terminate(); worker=undefined;
}
function failWorker() {
  unavailable=true;
  stopWorker();
  const jobs=[...pending.values()];pending.clear();
  for(const job of jobs) {
    clearTimeout(job.timer);
    job.resolve(fallback(job.request));
  }
}
function getWorker() {
  if(worker)return worker;
  worker=createCatalogWorker();
  worker.onmessage=({data}:MessageEvent<CatalogWorkerResult|{id:number;error:true}>)=>{
    const job=pending.get(data.id);
    if(!job)return;
    if('error' in data || !Array.isArray(data.list) || !Array.isArray(data.physical)) {failWorker();return;}
    pending.delete(data.id);clearTimeout(job.timer);
    remember(job.request.key,data);
    job.resolve(data);
    if(!pending.size)idleTimer=setTimeout(stopWorker,30000);
  };
  worker.onerror=event=>{event.preventDefault();failWorker();};
  worker.onmessageerror=()=>failWorker();
  return worker;
}

/** No matching rules change: only cold computations move off the UI thread. */
export function buildStopsCatalogAsync(pks:CatalogSnapshot['pks'],mpk:CatalogSnapshot['mpk'],marcel:CatalogSnapshot['marcel'],key:string,physical=false):Promise<Stop[]> {
  const cached=MERGED_STOPS_RUNTIME_CACHE.get((physical?'physical:':'list:')+key);
  if(cached)return Promise.resolve(cached);
  if(unavailable || typeof Worker==='undefined')return Promise.resolve(buildStopsCatalog(pks,mpk,marcel,key,physical));
  clearTimeout(idleTimer);
  let result=inFlight.get(key);
  if(!result) {
    const request:CatalogWorkerRequest={id:++sequence,key,pks,mpk,marcel};
    result=new Promise<CatalogWorkerResult>(resolve=>{
      const timer=setTimeout(failWorker,15000);
      pending.set(request.id,{request,resolve,timer});
      try {getWorker().postMessage(request);} catch {failWorker();}
    });
    inFlight.set(key,result);
    void result.then(()=>inFlight.delete(key));
  }
  return result.then(value=>physical?value.physical:value.list);
}
