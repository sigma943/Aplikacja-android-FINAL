import {Capacitor,registerPlugin} from '@capacitor/core';
import {parseJourneyCoordinates} from './journey-coordinates';
import {coordinatesFromGoogleMapsLink,googleMapsLink,resolveGoogleMapsLink} from './google-maps-link';
import {withRequestDeadline} from './request-deadline';
import {journeyMapPoint} from './journey-places';
const nativeMaps=registerPlugin<{get:(options:{url:string})=>Promise<{status:number;headers:Record<string,string>;text:string}>}>('GoogleMapsHttp');

export async function resolveJourneyInput(value:string,signal:AbortSignal){
 signal.throwIfAborted();
 const direct=parseJourneyCoordinates(value)||coordinatesFromGoogleMapsLink(value);if(direct)return direct;
 if(!googleMapsLink(value))throw Error('Wklej poprawne współrzędne lub link Google Maps.');
 return withRequestDeadline(async active=>{
  if(Capacitor.isNativePlatform())return resolveGoogleMapsLink(value,async url=>{
   return nativeMaps.get({url});
  },active);
  const response=await fetch('/api/maps-link?'+new URLSearchParams({url:value}),{signal:active,cache:'no-store'});
  const data=await response.json().catch(()=>{throw Error('Nie udało się odczytać krótkiego linku. Wklej pełny link z punktem lub współrzędne.');});if(!response.ok)throw Error(typeof data.error==='string'?data.error:'Nie udało się odczytać linku.');
  if(typeof data.lat!=='number'||typeof data.lon!=='number')throw Error('Link nie zwrócił współrzędnych.');
  return journeyMapPoint(data.lat,data.lon);
 },signal,20000);
}
