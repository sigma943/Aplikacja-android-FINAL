import type {Stop} from '@/Panel/src/types';
import {canonicalMapStopId} from './map-stop-markers';

/** Refresh departure references after the shared catalog loads. Keep the selected
 * label, map coordinate, favorite and event ID; only its provider sources change.
 */
export function refreshMapStopSource(source:Stop,stops:Stop[]):Stop {
  const marcelOnly=source.sourceProviderIds?.length===1&&source.sourceProviderIds[0]==='marcel';
  const id=marcelOnly?canonicalMapStopId(stops,source.id,'marcel',{
    n:source.name,lat:source.lat!,lon:source.lon!,code:source.code,
  }):source.id;
  const latest=stops.find(stop=>stop.id===id);
  if(!latest)return source;
  return {...source,carriers:[...new Map([...latest.carriers,...source.carriers].map(carrier=>[carrier.id,carrier])).values()],
    lines:[...new Set([...latest.lines,...source.lines])],sourceProviderIds:[...new Set([...(latest.sourceProviderIds||[]),...(source.sourceProviderIds||[])])],
    providerStopIds:{...source.providerStopIds,...latest.providerStopIds},pksStopPoints:latest.pksStopPoints||source.pksStopPoints};
}
