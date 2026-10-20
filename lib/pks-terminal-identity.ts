import type {Stop} from '@/Panel/src/types';
import {rzeszowTerminalPlatform} from './stop-label';
import pksPoints from '@/public/data/pks-stop-points.json';
const points:Record<string,{areaId:string;code:string;lat?:number;lon?:number}>=pksPoints.stops;

/** Keep the physical GTFS platform. EINFO's timetable code is a separate
 * technical grouping and is corrected per course in pks-terminal-timetable. */
export function pksTerminalStop(id:string,point:{name:string;lat:number;lon:number},catalog:Stop[]):Stop|null {
 const code=rzeszowTerminalPlatform(point.name);
 if(code===null)return null;
 const platform=code;
 const known=catalog.filter(s=>s.areaId==='1937'&&rzeszowTerminalPlatform(s.name,s.code)===platform);
 if(known.length===1)return known[0];
 const raw=Object.entries(points).find(([,s])=>s.areaId==='1937'&&String(Number(s.code))===platform);
 const localId=raw?.[0]||'terminal:rzeszow-da:'+platform;
 return {id:localId,name:'Rzeszów D.A. st. '+platform,code:platform,areaId:'1937',
  lat:raw?.[1].lat??point.lat,lon:raw?.[1].lon??point.lon,type:'bus',isFavorite:false,
  carriers:[{id:'pks',name:'PKS Rzeszów',colorClass:''}],lines:[],sourceProviderIds:['pks'],
  providerStopIds:raw?{pks:localId}:{},pksStopPoints:[{id:localId,areaId:'1937',code:platform}]};
}
