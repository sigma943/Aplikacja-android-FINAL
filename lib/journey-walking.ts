import type {Stop} from '@/Panel/src/types';
import {stopDistance} from './journey-planner';
import {decodePolyline,roadDistance,validRoadPoint} from './bus-road-geometry';
import {roadRouteWithFallback} from './transport/road-route-fallback';
export type WalkingRoute={points:Array<[number,number]>;meters:number;minutes:number};
const cache=new Map<string,Promise<WalkingRoute>>();
function checked(points:Array<[number,number]>,distance:number,from:Stop,to:Stop):WalkingRoute {
 const length=points.slice(1).reduce((sum,p,i)=>sum+roadDistance(points[i],p),0);
 if(points.length<2||!points.every(validRoadPoint)||!Number.isFinite(distance)||distance<0||
  stopDistance(from,{lat:points[0][0],lon:points[0][1]} as Stop)>30||stopDistance(to,{lat:points.at(-1)![0],lon:points.at(-1)![1]} as Stop)>30||
  Math.abs(distance-length)>Math.max(30,length*.35))throw Error('Brak kompletnej trasy pieszej.');
 return {points,meters:Math.ceil(distance),minutes:Math.max(1,Math.ceil(distance/70))};
}

/** Foot profile: roads, pavements and footpaths, never a driving route. */
export function journeyWalkingRoute(from:Stop,to:Stop):Promise<WalkingRoute>{
 const key=[from.lat,from.lon,to.lat,to.lon].join(':');
 if(!cache.has(key))cache.set(key,(async()=>{
  if(!Number.isFinite(stopDistance(from,to)))throw Error('Brak współrzędnych dojścia.');
  const coords=`${from.lon},${from.lat};${to.lon},${to.lat}`;
  return roadRouteWithFallback(async()=>{
   const response=await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson&steps=false`,{signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw Error('Nie można wyznaczyć dojścia.');
   const data=await response.json(),route=data.routes?.[0];
   if(data.code!=='Ok')throw Error('Brak trasy pieszej.');
   return checked((route?.geometry?.coordinates||[]).map(([lon,lat]:number[])=>[lat,lon]),route?.distance,from,to);
  },async()=>{
   const query={locations:[{lat:from.lat,lon:from.lon,radius:30},{lat:to.lat,lon:to.lon,radius:30}],costing:'pedestrian',directions_options:{units:'kilometers'}};
   const response=await fetch('https://valhalla1.openstreetmap.de/route?json='+encodeURIComponent(JSON.stringify(query)),{signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw Error('Nie można wyznaczyć zapasowego dojścia.');
   const data=await response.json(),legs=data.trip?.legs;
   if(!Array.isArray(legs)||legs.length!==1)throw Error('Brak ciągłej trasy pieszej.');
   const points=legs.flatMap((leg:{shape?:string})=>leg.shape?decodePolyline(leg.shape):[]);
   return checked(points,Number(data.trip?.summary?.length)*1000,from,to);
  },800);
 })().catch(error=>{cache.delete(key);throw error;}));
 if(cache.size>80)cache.delete(cache.keys().next().value!);
 return cache.get(key)!;
}
