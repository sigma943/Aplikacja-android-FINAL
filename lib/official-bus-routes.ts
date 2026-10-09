import {withRequestDeadline} from './request-deadline';
import {roadRouteMatchesStops,roadDistance} from './bus-road-geometry';

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
async function loadShape(provider:string,shape:string) {
  if (!/^[\w.+-]+$/.test(shape)) return [];
  const key=provider+':'+shape;
  if(!shapes.has(key))shapes.set(key,json<Array<[number,number]>>(`/data/bus-routes/${provider}/${shape}.json`).catch(error=>{shapes.delete(key);throw error;}));
  return shapes.get(key)!;
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
  // PKS live stop IDs and GTFS stop IDs belong to different namespaces. An
  // exact trip can still be checked against its complete, ordered live stops.
  // Never accept a trip prefix, a partial route, or geometry in reverse order.
  const completeCoordinates=!!pattern && !!stopCoordinates &&
    stopCoordinates.length===expected.length && pattern.length===expected.length;
  const tripMatches=!expected.length || (pattern && pattern.join('-')===expected.join('-')) || completeCoordinates;
  let shape=(tripMatches ? index.tripShapes[trip] : '')||index.stopShapes[expected.join('-')];
  // Live course IDs change independently of GTFS, whose internal stop IDs
  // also differ from PKS IDs. Validate actual geometry, not ID prefixes or
  // approximate interior GTFS pins (which can be hundreds of metres away).
  if (!shape && !pattern && stopCoordinates?.length === expected.length && expected.length >= 2) {
    const candidates = new Set<string>();
    const patternShapes = new Map<number, Set<string>>();
    for (const [id, patternId] of Object.entries(index.tripPatterns)) {
      const candidate = index.tripShapes[id];
      if (!candidate) continue;
      if (!patternShapes.has(patternId)) patternShapes.set(patternId, new Set());
      patternShapes.get(patternId)!.add(candidate);
    }
    index.patterns.forEach((ids, patternId) => {
      if (ids.length !== stopCoordinates.length) return;
      const first = index.stops[ids[0]], last = index.stops[ids.at(-1)!];
      if (!first || !last || roadDistance([first.lat, first.lon], stopCoordinates[0]) > 180 ||
          roadDistance([last.lat, last.lon], stopCoordinates.at(-1)!) > 180) return;
      for (const candidate of patternShapes.get(patternId) || []) candidates.add(candidate);
      const candidate = index.stopShapes[ids.join('-')];
      if (candidate) candidates.add(candidate);
    });
    // Avoid an unbounded asset scan for an underspecified city-centre pattern.
    if (candidates.size > 24) return [];
    const matches = await Promise.all([...candidates].map(async candidate => {
      const points = await loadShape(provider, candidate).catch(() => []);
      return roadRouteMatchesStops(points, stopCoordinates, 180) ? points : null;
    }));
    const complete = matches.filter((points): points is Array<[number, number]> => points !== null);
    return complete.length === 1 ? complete[0] : [];
  }
  if(!shape || !/^[\w.+-]+$/.test(shape))return [];
  const points=await loadShape(provider, shape);
  const stops=stopCoordinates || expected.flatMap(id=>index.stops[id] ? [[index.stops[id].lat,index.stops[id].lon] as [number,number]] : []);
  return roadRouteMatchesStops(points,stops,180) ? points : [];
}
