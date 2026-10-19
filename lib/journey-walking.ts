import type {Stop} from '@/Panel/src/types';
import {stopDistance} from './journey-planner';
export type WalkingRoute={points:Array<[number,number]>;meters:number;minutes:number};
const cache=new Map<string,Promise<WalkingRoute>>();

/** Foot profile: roads, pavements and footpaths, never a driving route. */
export function journeyWalkingRoute(from:Stop,to:Stop):Promise<WalkingRoute>{
 const key=[from.lat,from.lon,to.lat,to.lon].join(':');
 if(!cache.has(key))cache.set(key,(async()=>{
  if(!Number.isFinite(stopDistance(from,to)))throw Error('Brak współrzędnych dojścia.');
  const coords=`${from.lon},${from.lat};${to.lon},${to.lat}`;
  const response=await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson&steps=false`,{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Nie można wyznaczyć dojścia.');
  const data=await response.json(),route=data.routes?.[0];
  const points:Array<[number,number]>=(route?.geometry?.coordinates||[]).map(([lon,lat]:number[])=>[lat,lon]);
  if(data.code!=='Ok'||points.length<2||points.some(p=>!p.every(Number.isFinite))||!Number.isFinite(route.distance)||route.distance<0||
   stopDistance(from,{lat:points[0][0],lon:points[0][1]} as Stop)>100||stopDistance(to,{lat:points.at(-1)![0],lon:points.at(-1)![1]} as Stop)>100)throw Error('Brak kompletnej trasy pieszej.');
  return {points,meters:Math.ceil(route.distance),minutes:Math.max(1,Math.ceil(route.distance/70))};
 })().catch(error=>{cache.delete(key);throw error;}));
 if(cache.size>80)cache.delete(cache.keys().next().value!);
 return cache.get(key)!;
}
