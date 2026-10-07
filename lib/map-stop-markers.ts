import type {Stop} from '@/Panel/src/types';
export const MAP_STOPS_MIN_ZOOM=16;
export function mapStopColor(stop:Pick<Stop,'name'>){
  const name=stop.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return /^rzeszow(?:\b|\s|,)/.test(name)?'#ff7a00':'#14b8a6';
}
export function visibleMapStops(stops:Stop[],bbox:[number,number,number,number],zoom:number,selected?:string|null){
  if(zoom<MAP_STOPS_MIN_ZOOM)return [];
  const [west,south,east,north]=bbox;
  return stops.filter(stop=>stop.type!=='train'&&Number.isFinite(stop.lat)&&Number.isFinite(stop.lon)&&stop.lat!>=south&&stop.lat!<=north&&stop.lon!>=west&&stop.lon!<=east)
    .sort((a,b)=>a.id===selected?-1:b.id===selected?1:Math.hypot(a.lat!-(south+north)/2,a.lon!-(west+east)/2)-Math.hypot(b.lat!-(south+north)/2,b.lon!-(west+east)/2)).slice(0,300);
}
export function mapStopIconHtml(color:string,selected:boolean){
  return `<span class="map-stop-ring${selected?' is-selected':''}" style="--stop-color:${color}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M8 3v8M16 3v8M7 19v2M17 19v2"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/></svg></span>`;
}
