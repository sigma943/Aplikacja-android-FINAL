import type {Stop} from '@/Panel/src/types';
import {rememberHorizonLocation} from './horizon-location';

export const STATION_ID='journey:rzeszow-da';
export const LOCATION_ID='journey:my-location';
export const POINT_PREFIX='journey:point:';
export const isJourneyCoordinate=(stop:Stop)=>stop.id===LOCATION_ID||stop.id.startsWith(POINT_PREFIX);
export function journeyMapPoint(lat:number,lon:number):Stop{
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('Nieprawidłowy punkt na mapie.');
 return {id:POINT_PREFIX+lat.toFixed(6)+':'+lon.toFixed(6),name:'Punkt na mapie',type:'bus',carriers:[],lines:[],isFavorite:false,lat,lon};
}
export const isRzeszowStation=(stop:Pick<Stop,'name'>)=>/^rzesz[oó]w[\s,]+d\s*\.?\s*a\s*\.?(?:\s|$)/i.test(stop.name.trim());
export const matchesJourneyPlace=(place:Stop,stop:Stop)=>place.id===stop.id||(place.id===STATION_ID&&isRzeszowStation(stop));

/** Only the planner picker is grouped. Timetables retain physical platforms. */
export function journeyPickerStops(catalog:Stop[]):Stop[]{
 const platforms=catalog.filter(isRzeszowStation);
 if(!platforms.length)return catalog;
 const station:Stop={...platforms[0],id:STATION_ID,name:'Rzeszów D.A.',code:undefined,isFavorite:false,
  lines:[...new Set(platforms.flatMap(s=>s.lines))],carriers:[...new Map(platforms.flatMap(s=>s.carriers).map(c=>[c.id,c])).values()],
  lat:platforms.reduce((n,s)=>n+(s.lat||0),0)/platforms.length,lon:platforms.reduce((n,s)=>n+(s.lon||0),0)/platforms.length};
 return [...catalog.filter(s=>!isRzeszowStation(s)),station];
}

export function currentJourneyLocation():Promise<Stop>{
 return new Promise((resolve,reject)=>{
  if(!navigator.geolocation){reject(Error('Lokalizacja jest niedostępna na tym urządzeniu. Wybierz przystanek z listy.'));return;}
  navigator.geolocation.getCurrentPosition(p=>{rememberHorizonLocation(p.coords.latitude,p.coords.longitude);resolve({id:LOCATION_ID,name:'Twoja lokalizacja',type:'bus',carriers:[],lines:[],isFavorite:false,lat:p.coords.latitude,lon:p.coords.longitude});},
   e=>reject(Error(e.code===1?'Zezwól aplikacji na dostęp do lokalizacji lub wybierz przystanek z listy.':'Nie udało się ustalić lokalizacji. Spróbuj ponownie lub wybierz przystanek.')),
   {enableHighAccuracy:true,timeout:12000,maximumAge:30000});
 });
}
