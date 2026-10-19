import type {Stop} from '@/Panel/src/types';
import {stopDistance} from './journey-planner';
import {requestJson} from './transport/http';
import {withRequestDeadline} from './request-deadline';
import {decodePolyline} from './bus-road-geometry';
export type WalkingRoute={points:Array<[number,number]>;meters:number;minutes:number};
const cache=new Map<string,Promise<WalkingRoute>>();
function completeRoute(from:Stop,to:Stop,points:Array<[number,number]>,distance:number):WalkingRoute{
 if(points.length<2||points.some(p=>!p.every(Number.isFinite))||!Number.isFinite(distance)||distance<0||
  stopDistance(from,{lat:points[0][0],lon:points[0][1]} as Stop)>100||stopDistance(to,{lat:points.at(-1)![0],lon:points.at(-1)![1]} as Stop)>100)throw Error('Brak kompletnej trasy pieszej.');
 return {points,meters:Math.ceil(distance),minutes:Math.max(1,Math.ceil(distance/70))};
}
/** Both routers use pedestrian profiles. Android uses native HTTP, avoiding WebView CORS.
 * Failure stays explicit: never substitute an endpoint-to-endpoint straight line. */
export function journeyWalkingRoute(from:Stop,to:Stop):Promise<WalkingRoute>{
 const key=[from.lat,from.lon,to.lat,to.lon].join(':');
 if(!cache.has(key))cache.set(key,(async()=>{
  if(!Number.isFinite(stopDistance(from,to)))throw Error('Brak współrzędnych dojścia.');
  try{
   const coords=`${from.lon},${from.lat};${to.lon},${to.lat}`;
   const data=await withRequestDeadline(signal=>requestJson<{code?:string;routes?:Array<{distance:number;geometry?:{coordinates:Array<[number,number]>}}>}>(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson&steps=false`,{signal}),undefined,10000);
   const route=data.routes?.[0];if(data.code!=='Ok'||!route)throw Error('Brak trasy pieszej.');
   return completeRoute(from,to,(route.geometry?.coordinates||[]).map(([lon,lat])=>[lat,lon]),route.distance);
  }catch{
   const query={locations:[{lat:from.lat,lon:from.lon},{lat:to.lat,lon:to.lon}],costing:'pedestrian',units:'kilometers'};
   const data=await withRequestDeadline(signal=>requestJson<{trip?:{status:number;legs?:Array<{shape:string}>;summary?:{length:number}}}>('https://valhalla1.openstreetmap.de/route?json='+encodeURIComponent(JSON.stringify(query)),{signal}),undefined,10000);
   if(data.trip?.status!==0)throw Error('Nie można wyznaczyć dojścia.');
   return completeRoute(from,to,(data.trip.legs||[]).flatMap(leg=>decodePolyline(leg.shape)),(data.trip.summary?.length??NaN)*1000);
  }
 })().catch(error=>{cache.delete(key);throw error;}));
 if(cache.size>80)cache.delete(cache.keys().next().value!);
 return cache.get(key)!;
}
