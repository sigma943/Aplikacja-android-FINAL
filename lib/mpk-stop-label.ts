import {mybusStopCatalogue} from './mpk-mybus-stop-catalogue';
import city from './mpk-rzeszow-city-stop-ids.json';
import {displayStopCatalogLabel} from './stop-label';
import type {Stop} from '@/Panel/src/types';
const names=new Map<string,string>();
const ambiguous=new Set<string>();
for(const entry of Object.values(mybusStopCatalogue)){
 const id=String(entry[0]);
 if(names.has(id)&&names.get(id)!==entry[1])ambiguous.add(id);
 else names.set(id,entry[1]);
}
const cityIds=new Set(city.ids.map(String));
/** Use the catalog's first MPK label, preserving the identity and code used by PKS. */
function mpkCatalogName(stop:Pick<Stop,'providerStopIds'>):string|undefined {
 const ids=String(stop.providerStopIds?.mpk_rzeszow||'').split(',').map(id=>id.trim()).filter(Boolean);
 if(!ids.length)return undefined;
 const live=stop.providerStopIds?.mpk_rzeszowNames?.split(' | ').map(name=>name.trim()).find(Boolean);
 if(live)return live;
 if(!ids.every(id=>cityIds.has(id)))return undefined;
 const values=[...new Set(ids.map(id=>ambiguous.has(id)?undefined:names.get(id)).filter(Boolean))];
 return values.length===1?'Rzeszów '+values[0]!.replace(/^Rzesz[oó]w\s*,?\s+/i,''):undefined;
}
export function stopCatalogDisplayLabel(stop:Pick<Stop,'name'|'code'|'providerStopIds'>):string {
 return mpkCatalogName(stop)??displayStopCatalogLabel(stop.name,stop.code);
}
/** Other carriers keep their original labels, including the vehicle's own names. */
export function mpkVehicleDisplayName(provider:string|undefined,stop:{id?:unknown;name?:string},apiNames?:ReadonlyMap<string,string>):string {
 const original=stop.name||'';
 if(provider!=='mpk_rzeszow'||!cityIds.has(String(stop.id)))return original;
 const id=String(stop.id);
 return apiNames?.get(id)||(ambiguous.has(id)?original:names.get(id)||original);
}
