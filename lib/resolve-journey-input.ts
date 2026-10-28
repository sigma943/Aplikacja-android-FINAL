import {Capacitor,CapacitorHttp} from '@capacitor/core';
import {parseJourneyCoordinates} from './journey-coordinates';
import {coordinatesFromGoogleMapsLink,googleMapsLink,resolveGoogleMapsLink,GOOGLE_MAPS_HEADERS} from './google-maps-link';
import {withRequestDeadline} from './request-deadline';
import {journeyMapPoint} from './journey-places';

export async function resolveJourneyInput(value:string,signal:AbortSignal){
 signal.throwIfAborted();
 const direct=parseJourneyCoordinates(value)||coordinatesFromGoogleMapsLink(value);if(direct)return direct;
 if(!googleMapsLink(value))throw Error('Wklej poprawne współrzędne lub link Google Maps.');
 return withRequestDeadline(async active=>{
  if(Capacitor.isNativePlatform())return resolveGoogleMapsLink(value,async url=>{
   const response=await CapacitorHttp.get({url,responseType:'text',disableRedirects:true,connectTimeout:5000,readTimeout:7000,headers:GOOGLE_MAPS_HEADERS});
   return {status:response.status,headers:response.headers,text:typeof response.data==='string'?response.data:JSON.stringify(response.data)};
  },active);
  const response=await fetch('/api/maps-link?'+new URLSearchParams({url:value}),{signal:active,cache:'no-store'});
  const data=await response.json().catch(()=>{throw Error('Nie udało się odczytać krótkiego linku. Wklej pełny link z punktem lub współrzędne.');});if(!response.ok)throw Error(typeof data.error==='string'?data.error:'Nie udało się odczytać linku.');
  if(typeof data.lat!=='number'||typeof data.lon!=='number')throw Error('Link nie zwrócił współrzędnych.');
  return journeyMapPoint(data.lat,data.lon);
 },signal,20000);
}
