import type {JourneyLeg} from './journey-planner';
import {officialBusRoute,officialBusStopPoints} from './official-bus-routes';
import {bundledMarcelJourneyRoute,bundledMarcelStopPoints} from './marcel-route-assets';
import {fetchRoadRouteForStops} from './transport/road-routing';
import {journeyBusCorridor} from './journey-bus-corridor';
import {journeyWalkingRoute} from './journey-walking';
import {correctPksStationJunction} from './pks-station-junction';
import {correctMarcelNiebylecRoute} from './marcel-niebylec-route';
import {validRoadPoint,roadRouteMatchesStops} from './bus-road-geometry';
import {sliceJourneyRoute,type Point} from './journey-route-geometry';

export function journeyLegStops(leg:JourneyLeg){return leg.stops?.length?leg.stops.map(c=>c.stop):[leg.from,leg.to];}
const pending=new Map<string,Promise<Point[]>>();
export function journeyLegPath(leg:JourneyLeg):Promise<Point[]>{
 const stops=journeyLegStops(leg),coords:Point[]=stops.map(s=>[s.lat!,s.lon!]);
 if(coords.length<2||!coords.every(validRoadPoint))return Promise.reject(Error('Brak współrzędnych odcinka.'));
 if(leg.path?.length&&roadRouteMatchesStops(leg.path,coords,35))return Promise.resolve(leg.walking!==undefined?leg.path:journeyBusCorridor(leg.path,coords,8));
 if(leg.walking!==undefined)return journeyWalkingRoute(leg.from,leg.to).then(r=>r.points);
 const key=JSON.stringify([leg.provider,leg.course,coords]);
 if(!pending.has(key))pending.set(key,(async()=>{
  const full=leg.provider==='marcel' ? await bundledMarcelJourneyRoute(coords,true) : await officialBusRoute(leg.provider==='mpk'?'mpk_rzeszow':leg.provider,leg.course.split(':')[1],[]).catch(()=>[] as Point[]);
  const pins=leg.provider==='mpk'?await officialBusStopPoints('mpk_rzeszow').catch(()=>[])||[]:leg.provider==='marcel'?await bundledMarcelStopPoints()||[]:[];
  const corrected=correctPksStationJunction(correctMarcelNiebylecRoute(full,leg.provider),leg.provider);
  const official=leg.provider==='mpk'||leg.provider==='marcel'?journeyBusCorridor(corrected,[...pins,...coords],leg.provider==='marcel'?8:2):corrected;
  // Stop dots are projected separately by JourneyMap. Never rebuild a known
  // course through stop pins or synthetic corridor waypoints.
  const local=sliceJourneyRoute(official,coords);
  if(local.length>1&&roadRouteMatchesStops(local,coords,150))return local;
  try{
   const road=await fetchRoadRouteForStops(coords,'journey-road:v3:'+key,{stopWaypoints:true});
   const clipped=sliceJourneyRoute(journeyBusCorridor(road,[...pins,...coords],8),coords);
   if(clipped.length>1&&roadRouteMatchesStops(clipped,coords,150))return clipped;
  }catch{ /* Leave unavailable geometry missing; never connect stops by chords. */ }
  throw Error('Brak potwierdzonego przebiegu trasy autobusowej.');
 })().catch(error=>{pending.delete(key);throw error;}));
 if(pending.size>80)pending.delete(pending.keys().next().value!);
 return pending.get(key)!;
}
