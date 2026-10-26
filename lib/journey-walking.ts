import {requestJson} from './transport/http';
import {withRequestDeadline} from './request-deadline';
import type {Stop} from '@/Panel/src/types';
import {stopDistance} from './journey-planner';
import {decodePolyline,roadDistance,validRoadPoint} from './bus-road-geometry';
export type WalkingRoute={points:Array<[number,number]>;meters:number;minutes:number};
let active=0;const waiting:Array<()=>void>=[];
async function slot<T>(run:()=>Promise<T>):Promise<T>{if(active>=3)await new Promise<void>(resolve=>waiting.push(resolve));else active++;try{return await run();}finally{const next=waiting.shift();if(next)next();else active--;}}
const cache=new Map<string,Promise<WalkingRoute>>();
function checked(points:Array<[number,number]>,distance:number,from:Stop,to:Stop):WalkingRoute {
 if(points.length<2||!points.every(validRoadPoint))throw Error('Nieprawidłowa geometria piesza.');
 const length=points.slice(1).reduce((sum,p,i)=>sum+roadDistance(points[i],p),0);
 if(points.length<2||!points.every(validRoadPoint)||!Number.isFinite(distance)||distance<0||
  stopDistance(from,{lat:points[0][0],lon:points[0][1]} as Stop)>8||stopDistance(to,{lat:points.at(-1)![0],lon:points.at(-1)![1]} as Stop)>8||
  Math.abs(distance-length)>Math.max(30,length*.35))throw Error('Brak kompletnej trasy pieszej.');
 return {points,meters:Math.ceil(distance),minutes:Math.max(1,Math.ceil(distance/70))};
}

/** Compare independently routed pedestrian paths; response speed must not select a detour. */
export function journeyWalkingRoute(from:Stop,to:Stop):Promise<WalkingRoute>{
 const key=[from.lat,from.lon,to.lat,to.lon].join(':');
 if(!cache.has(key))cache.set(key,slot(async()=>{
  if(!Number.isFinite(stopDistance(from,to)))throw Error('Brak współrzędnych dojścia.');
  const coords=`${from.lon},${from.lat};${to.lon},${to.lat}`;
  const osrm=async()=>{
   const data=await withRequestDeadline(signal=>requestJson<any>(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson&steps=false&alternatives=true`,{signal}),undefined,8000);
   if(data.code!=='Ok')throw Error('Brak trasy pieszej.');
   const routes:WalkingRoute[]=[];
   for(const route of data.routes||[]){try{routes.push(checked((route.geometry?.coordinates||[]).map(([lon,lat]:number[])=>[lat,lon]),route.distance,from,to));}catch{}}
   if(!routes.length)throw Error('Brak poprawnej trasy pieszej.');
   return routes.sort((a,b)=>a.meters-b.meters)[0];
  };
  const valhalla=async()=>{
   const query={locations:[{lat:from.lat,lon:from.lon,radius:30},{lat:to.lat,lon:to.lon,radius:30}],costing:'pedestrian',costing_options:{pedestrian:{type:'foot',shortest:true}},directions_options:{units:'kilometers'}};
   const data=await withRequestDeadline(signal=>requestJson<any>('https://valhalla1.openstreetmap.de/route?json='+encodeURIComponent(JSON.stringify(query)),{signal}),undefined,8000),legs=data.trip?.legs;
   if(!Array.isArray(legs)||legs.length!==1)throw Error('Brak ciągłej trasy pieszej.');
   const points=legs.flatMap((leg:{shape?:string})=>leg.shape?decodePolyline(leg.shape):[]);
   return checked(points,Number(data.trip?.summary?.length)*1000,from,to);
  };
  const results=await Promise.allSettled([valhalla(),osrm()]);
  const routes=results.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
  if(!routes.length)throw Error('Nie można wyznaczyć trasy pieszej.');
  return routes.sort((a,b)=>a.meters-b.meters)[0];
 }).catch(error=>{cache.delete(key);throw error;}));
 if(cache.size>80)cache.delete(cache.keys().next().value!);
 return cache.get(key)!;
}
