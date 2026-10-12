import {mybusStopCatalogue} from './mpk-mybus-stop-catalogue';
import city from './mpk-rzeszow-city-stop-ids.json';
import type {Stop} from '@/Panel/src/types';
const names=new Map<string,string>();
const ambiguous=new Set<string>();
for(const entry of Object.values(mybusStopCatalogue)){
 const id=String(entry[0]);
 if(names.has(id)&&names.get(id)!==entry[1])ambiguous.add(id);
 else names.set(id,entry[1]);
}
const cityIds=new Set(city.ids.map(String));
/** Presentation only. Exact provider IDs; no proximity, renaming or regrouping. */
export function mpkCatalogDisplayName(stop:Pick<Stop,'name'|'providerStopIds'>):string {
 const ids=String(stop.providerStopIds?.mpk_rzeszow||'').split(',').filter(Boolean);
 if(!ids.length||!ids.every(id=>cityIds.has(id.trim())))return stop.name;
 const live=String(stop.providerStopIds?.mpk_rzeszowNames||'').split(' | ').filter(Boolean);
 const values=live.length?live:ids.map(id=>ambiguous.has(id)?'':names.get(id.trim())||'');
 const unique=[...new Set(values.filter(Boolean))];
 return unique.length===1?unique[0].replace(/^Rzesz[oó]w\s*,?\s+/i,''):stop.name;
}
/** Other carriers keep their original labels, including the vehicle's own names. */
export function mpkVehicleDisplayName(provider:string|undefined,stop:{id?:unknown;name?:string},apiNames?:ReadonlyMap<string,string>):string {
 const original=stop.name||'';
 if(provider!=='mpk_rzeszow'||!cityIds.has(String(stop.id)))return original;
 const id=String(stop.id);
 return apiNames?.get(id)||(ambiguous.has(id)?original:names.get(id)||original);
}
