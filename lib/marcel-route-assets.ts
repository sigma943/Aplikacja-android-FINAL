import {roadRouteMatchesStops,validRoadPoint} from './bus-road-geometry';
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
    return roadRouteMatchesStops(route,points,150)?route:[];
  }catch{return [];}
}
