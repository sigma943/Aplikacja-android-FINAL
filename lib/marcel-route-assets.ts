import {roadRouteMatchesStops,validRoadPoint,removeRedundantRoadCycles} from './bus-road-geometry';
import {journeyBusCorridor} from './journey-bus-corridor';
import {correctMarcelNiebylecRoute} from './marcel-niebylec-route';
import {sliceJourneyRoute} from './journey-route-geometry';
import {withRequestDeadline} from './request-deadline';
type Point=[number,number];
type AssetIndex={version:number;patterns:Record<string,string>};
let index:Promise<AssetIndex>|null=null;
const shapes=new Map<string,Promise<Point[]>>();
/** Course IDs change daily; require the complete ordered coordinate pattern. */
export function marcelRoutePattern(points:Point[]){
  return points.length>=2&&points.every(validRoadPoint)?points.map(p=>p.map(n=>n.toFixed(6)).join(',')).join('|'):'';
}
async function json<T>(path:string):Promise<T>{
  return withRequestDeadline(async signal=>{
    const response=await fetch(path,{signal,cache:'force-cache'});
    if(!response.ok)throw Error('Marcel route asset unavailable');
    return response.json();
  });
}
/** Prevalidated road geometry, rather than an official carrier/GTFS shape. */
export async function bundledMarcelRoute(points:Point[]):Promise<Point[]>{
  const key=marcelRoutePattern(points);if(!key)return [];
  try{
    if(!index)index=json<AssetIndex>('/data/marcel-routes/index.json').catch(error=>{index=null;throw error;});
    const catalog=await index;
    if(catalog.version!==1)return [];
    const shape=catalog.patterns?.[key];if(!shape||!/^[a-z0-9-]+$/.test(shape))return [];
    if(!shapes.has(shape))shapes.set(shape,json<Point[]>(`/data/marcel-routes/${shape}.json`).catch(error=>{shapes.delete(shape);throw error;}));
    const route=await shapes.get(shape)!;
    return roadRouteMatchesStops(route,points,150)?removeRedundantRoadCycles(route,points):[];
  }catch{return [];}
}

/** A journey may use a contiguous part of a packaged course. Match every real
 * stop in order, and accept multiple courses only when their clipped roads agree. */
export async function bundledMarcelJourneyRoute(points:Point[],displayCorridor=false):Promise<Point[]>{
 const prepare=(route:Point[],pins:Point[])=>displayCorridor?journeyBusCorridor(correctMarcelNiebylecRoute(route,'marcel'),pins,8):route;
 const exact=await bundledMarcelRoute(points);if(exact.length)return prepare(exact,points);
 const key=marcelRoutePattern(points);if(!key)return [];
 try{
  const catalog=await index;if(!catalog||catalog.version!==1)return [];
  const requested=key.split('|'),matches:Point[][]=[];
  for(const pattern of Object.keys(catalog.patterns)){
   const stops=pattern.split('|');
   if(!stops.some((_,start)=>requested.every((stop,i)=>stops[start+i]===stop)))continue;
   const pins=stops.map(stop=>stop.split(',').map(Number) as Point);
   const full=await bundledMarcelRoute(pins);
   const clipped=sliceJourneyRoute(prepare(full,pins),points);
   if(clipped.length>1)matches.push(clipped);
  }
  if(!matches.length)return [];
  const geometry=JSON.stringify(matches[0]);
  return matches.every(route=>JSON.stringify(route)===geometry)?matches[0]:[];
 }catch{return [];}
}

export async function bundledMarcelStopPoints():Promise<Point[]>{
 try{const catalog=await index;return catalog?Object.keys(catalog.patterns).flatMap(key=>key.split('|').map(p=>p.split(',').map(Number) as Point)):[];}catch{return [];}
}
