import {readBusCoordinates} from './bus-coordinates';
import type {Stop} from '@/Panel/src/types';
export const MAP_STOPS_MIN_ZOOM=16;
export function canonicalMapStopId(stops:Stop[],id?:string|null,provider?:string){
  if(!id)return id;
  const namespace=/^(pks|mpk_rzeszow|marcel):(.+)$/.exec(id);
  const source=namespace?.[1]||provider||'pks',rawId=namespace?.[2]||id;
  if(!namespace&&(!provider||provider==='pks')&&stops.some(s=>s.id===id))return id;
  const matches=stops.filter(s=>String(s.providerStopIds?.[source]||'').split(',').map(v=>v.trim()).includes(rawId));
  return matches.length===1?matches[0].id:id;
}
export function mapStopColor(stop:Pick<Stop,'name'>){
  const name=stop.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/^rzeszow\b/.test(name)&&(/\bd\s*\.?\s*a\s*\.?\s*(?:st\b|stanow|$)/.test(name)||/\b(?:dworzec|dworz\.)\s*(?:autobusowy|pks)\b/.test(name)))return '#14b8a6';
  return /^rzeszow(?:\b|\s|,)/.test(name)?'#ff7a00':'#14b8a6';
}
export function visibleMapStops(stops:Stop[],bbox:[number,number,number,number],zoom:number,selected?:string|null){
  if(zoom<MAP_STOPS_MIN_ZOOM)return [];
  const [west,south,east,north]=bbox;
  return stops.filter(stop=>stop.type!=='train'&&readBusCoordinates(stop.lat,stop.lon)&&stop.lat!>=south&&stop.lat!<=north&&stop.lon!>=west&&stop.lon!<=east)
    .sort((a,b)=>a.id===selected?-1:b.id===selected?1:Math.hypot(a.lat!-(south+north)/2,a.lon!-(west+east)/2)-Math.hypot(b.lat!-(south+north)/2,b.lon!-(west+east)/2)).slice(0,300);
}
export function mapStopIconHtml(color:string,selected:boolean){
  return `<span class="map-stop-ring${selected?' is-selected':''}" style="--stop-color:${color}"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M7 2h10a4 4 0 0 1 4 4v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a4 4 0 0 1 4-4Zm3 1.5a.75.75 0 0 0 0 1.5h4a.75.75 0 0 0 0-1.5h-4ZM6.5 6A1.5 1.5 0 0 0 5 7.5v5A1.5 1.5 0 0 0 6.5 14h11a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 17.5 6h-11ZM8 17.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Zm11 0a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z"/><path d="M5 19h4v2.5a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 5 21.5V19Zm10 0h4v2.5a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 0 1-1.5-1.5V19Z"/></svg></span>`;
}
