'use client';
import {useEffect} from 'react';
import {loadStopDepartures} from '@/lib/stop-departures';
import {fetchVehiclesClient,type TransportProviderId} from '@/lib/pks-client';
import {widgetDepartures,type StopWidgetConfig} from '@/lib/stop-widget';
// Isolated, locally packaged data runner used by Android's widget refresh job.
export default function WidgetData(){useEffect(()=>{
  const bridge=(window as any).NativeWidget;if(!bridge)return;
  const original=window.fetch.bind(window);
  let next=0;const waiting=new Map<number,{resolve:(r:Response)=>void;reject:(e:Error)=>void}>();
  (window as any).widgetHttpResult=(id:number,status:number,body:string)=>{const p=waiting.get(id);if(!p)return;waiting.delete(id);status?p.resolve(new Response(body,{status})):p.reject(new Error('Brak połączenia'));};
  window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);if(url.origin===location.origin)return original(input,init);if(init?.signal?.aborted)throw new DOMException('Aborted','AbortError');return new Promise<Response>((resolve,reject)=>{const id=++next;waiting.set(id,{resolve,reject});bridge.http(id,url.href);init?.signal?.addEventListener('abort',()=>{waiting.delete(id);reject(new DOMException('Aborted','AbortError'));},{once:true});});}) as typeof fetch;
  const config:StopWidgetConfig=JSON.parse(bridge.config());
  const providers=(config.stop.sourceProviderIds||['pks']).map(p=>p==='mpk'?'mpk_rzeszow':p).filter(p=>['pks','mpk_rzeszow','marcel'].includes(p)) as TransportProviderId[];
  void Promise.all([loadStopDepartures(config.stop),fetchVehiclesClient(false,providers).catch(()=>[])]).then(([data,vehicles])=>{if(data.warnings.length&&!data.departures.length)throw new Error(data.warnings.join(', '));bridge.complete(JSON.stringify(widgetDepartures(data.departures,vehicles,config.lines)),data.warnings.join(' • '));}).catch(()=>bridge.failed());
  return()=>{window.fetch=original;};
},[]);return null;}
