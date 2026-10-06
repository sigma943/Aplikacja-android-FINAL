import {withRequestDeadline} from './request-deadline';
import {roadRouteMatchesStops} from './bus-road-geometry';

type Index={tripShapes:Record<string,string>;stopShapes:Record<string,string>;patterns:string[][];tripPatterns:Record<string,number>;stops:Record<string,{name:string;lat:number;lon:number}>};
const indexes=new Map<string,Promise<Index>>();
const shapes=new Map<string,Promise<Array<[number,number]>>>();
async function json<T>(path:string):Promise<T> {
  return withRequestDeadline(async signal=> {
    const response=await fetch(path,{signal,cache:'force-cache'});
    if(!response.ok)throw new Error(`Route asset HTTP ${response.status}`);
    return response.json() as Promise<T>;
  });
}
async function routeIndex(provider:string) {
  if(!indexes.has(provider))indexes.set(provider,json<Index>(`/data/bus-routes/${provider}.json`).catch(error=>{indexes.delete(provider);throw error;}));
  return indexes.get(provider)!;
}
export async function officialBusStops(provider:string,tripId:unknown) {
  const index=await routeIndex(provider);
  const pattern=index.patterns[index.tripPatterns[String(tripId)]];
  return pattern?.map(id=>index.stops[id])||[];
}
export async function officialBusRoute(provider:string,tripId:unknown,stopIds:Array<number|string>,stopCoordinates?:Array<[number,number]>) {
  if(provider!=='pks'&&provider!=='mpk_rzeszow')return [];
  const index=await routeIndex(provider);
  const trip=String(tripId||'');
  const expected=stopIds.map(String).filter((id,i,all)=>i===0||id!==all[i-1]);
  const pattern=index.patterns[index.tripPatterns[trip]];
  const tripMatches=!expected.length || (pattern && pattern.join('-')===expected.join('-'));
  const shape=(tripMatches ? index.tripShapes[trip] : '')||index.stopShapes[expected.join('-')];
  if(!shape || !/^[\w.+-]+$/.test(shape))return [];
  const key=provider+':'+shape;
  if(!shapes.has(key))shapes.set(key,json<Array<[number,number]>>(`/data/bus-routes/${provider}/${shape}.json`).catch(error=>{shapes.delete(key);throw error;}));
  const points=await shapes.get(key)!;
  const stops=stopCoordinates || expected.flatMap(id=>index.stops[id] ? [[index.stops[id].lat,index.stops[id].lon] as [number,number]] : []);
  return roadRouteMatchesStops(points,stops,180) ? points : [];
}
