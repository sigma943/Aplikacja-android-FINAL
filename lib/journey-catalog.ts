import type {Stop} from '@/Panel/src/types';
import {readStopsCatalogCache} from './stops-catalog-cache';
import {buildStopsCatalogAsync} from './stops-catalog-async';
import {pksLinesForStop,sortedLines,stopCollectionSignature,getMarcelStopsIndex} from '@/components/stops-panel/stop-domain';
import {warsawDateIso} from './transit-time';
import pksLines from '@/public/data/pks-stop-lines.json';
import {formatPksStops} from './providers/pks-stops';
type Raw={id:string;name:string;lat?:number;lon?:number;areaId?:string;code?:string};
async function json(path:string){const r=await fetch(path,{cache:'force-cache',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Nie udało się wczytać przystanków.');return r.json();}
export async function loadJourneyCatalog(input:Raw[],includeMarcel=false):Promise<Stop[]>{
 const cached=await readStopsCatalogCache();
 const [pks,mpk]=await Promise.all([
  input.length?input:cached?.pks?.length?cached.pks:json('/data/pks-stop-points.json').then(snapshot=>{
   const items=Object.entries(snapshot.stops).map(([id,s])=>{const p=s as {n:string;lat?:number;lon?:number;areaId?:string;code?:string};return {stop_point_id:id,name:p.n,stop_area_name:p.n,stop_area_id:p.areaId,stop_point_code:p.code,location:{lat:p.lat,lon:p.lon}};});
   return Object.entries(formatPksStops({items},snapshot)).map(([id,s])=>({...s,id,name:s.n}));
  }),
  cached?.mpk?.length?cached.mpk:json('/data/mpk-stop-points.json').then(snapshot=>snapshot.stops.map((s:Record<string,unknown>)=>({id:String(s.stop_id),name:String(s.stop_name),lat:Number(s.stop_lat),lon:Number(s.stop_lon),lines:String(s.lines||'').split(',').filter(Boolean)}))),
 ]);
 const marcel=includeMarcel?await getMarcelStopsIndex(warsawDateIso()).catch(()=>cached?.marcel||[]):cached?.marcel||[];
 const key='journeys:v2:'+stopCollectionSignature(pks)+':'+stopCollectionSignature(mpk)+':'+stopCollectionSignature(marcel);
 const list=await buildStopsCatalogAsync(pks,mpk,marcel,key),mpkLines=new Map<string,string[]>(mpk.map((s:{id:string;lines:string[]})=>[s.id,s.lines]));
 return list.filter(s=>s.type==='bus').map(stop=>{
  const lineProviders:Record<string,string[]>={};
  const add=(line:string,provider:string)=>{lineProviders[line]=[...new Set([...(lineProviders[line]||[]),provider])];};
  const pksStopLines=pksLinesForStop(stop,cached?.lines||pksLines.lines);pksStopLines.forEach(line=>add(line,'pks'));
  for(const id of String(stop.providerStopIds?.mpk_rzeszow||'').split(','))mpkLines.get(id)?.forEach(line=>add(line,'mpk'));
  if(stop.sourceProviderIds?.includes('marcel'))add('M','marcel');
  return {...stop,lines:sortedLines(Object.keys(lineProviders)),lineProviders,providerStopIds:{...stop.providerStopIds,pksLines:pksStopLines.join(',')}};
 });
}
