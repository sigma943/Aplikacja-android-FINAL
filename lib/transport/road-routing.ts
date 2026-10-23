import {readBusCoordinates} from '../bus-coordinates';

import {decodePolyline, routeChunks, joinRouteChunks, routedRoadRouteMatchesStops, roadRoutingLocations, hasLocalRoadExcursion, preferRoadCorridor} from '../bus-road-geometry';

import {withRequestDeadline} from '../request-deadline';
import {roadRouteWithFallback} from './road-route-fallback';

import {type ShapePoint} from '../transport/types';
import {requestJson} from '../transport/http';

const roadRouteCache = new Map<string, ShapePoint[]>();

const roadRoutePending = new Map<string, Promise<ShapePoint[]>>();

// Keep completed chunks when another part of a long route needs a retry.
const roadChunkCache = new Map<string, ShapePoint[]>();

async function fetchRoadRouteForStops(coords: ShapePoint[],cacheKey: string,options?: {strictShortSegments?:boolean;signal?:AbortSignal;stopWaypoints?:boolean;onResolved?:(points:ShapePoint[])=>void}) {
  const points=coords.filter(([lat,lon])=>readBusCoordinates(lat,lon));
  if(points.length<2)return [];
  if(roadRouteCache.has(cacheKey)) {
    const route = roadRouteCache.get(cacheKey)!; options?.onResolved?.(route); return route;
  }
  let promise = roadRoutePending.get(cacheKey);
  if (!promise) {
  promise=(async()=> {
    const chunks=routeChunks(points);
    const results: ShapePoint[][]=new Array(chunks.length);
    const secondary: ShapePoint[][] = new Array(chunks.length);
    const fetchCompleteSecondary = async () => {
      const coordinates=points.map(([lat,lon])=>lon+','+lat).join(';');
      const data=await withRequestDeadline(signal=>requestJson<{routes?:Array<{geometry?:{coordinates?:Array<[number,number]>}}>}>(
        'https://router.project-osrm.org/route/v1/driving/'+coordinates+'?overview=full&geometries=geojson&alternatives=false&steps=false&continue_straight=false',{signal}),undefined,12000);
      const route:ShapePoint[]=(data.routes?.[0]?.geometry?.coordinates||[]).map(([lon,lat])=>[lat,lon]);
      if(!routedRoadRouteMatchesStops(route,points))throw Error('Incomplete complete-course road route');
      return route;
    };
    const fetchSecondary = async (index: number) => {
      if (secondary[index]) return secondary[index];
      const chunk = chunks[index];
      const coordinates=chunk.map(([lat,lon])=>lon+','+lat).join(';');
      const data=await withRequestDeadline(signal => requestJson<{code?:string;routes?:Array<{geometry?:{coordinates?:Array<[number,number]>}}>}>(
        'https://router.project-osrm.org/route/v1/driving/'+coordinates+'?overview=full&geometries=geojson&alternatives=false&steps=false&continue_straight=false', {signal}), undefined, 8000);
      const route: ShapePoint[] = (data.routes?.[0]?.geometry?.coordinates||[]).map(([lon,lat])=>[lat,lon]);
      if (!routedRoadRouteMatchesStops(route,chunk)) throw new Error('Incomplete secondary road route');
      secondary[index] = route;
      return route;
    };
    let cursor=0;
    try {
    await Promise.all(Array.from({length:Math.min(3,chunks.length)},async()=> {
      while(cursor<chunks.length) {
        const index=cursor++,chunk=chunks[index];
        const boundaries={start:index===0,end:index===chunks.length-1};
        const chunkKey=JSON.stringify([Boolean(options?.stopWaypoints),chunk]);
        const cachedChunk=roadChunkCache.get(chunkKey);
        if(cachedChunk){results[index]=cachedChunk;continue;}
        let route = await roadRouteWithFallback(async () => {
          // Stop coordinates can sit in a bay or side road. A through point
          // forbids turning there and can force a loop around nearby streets.
          const query={locations:roadRoutingLocations(chunk,Boolean(options?.stopWaypoints),boundaries),costing:'bus',directions_options:{units:'kilometers'}};
          const data=await withRequestDeadline(signal => requestJson<{trip?:{legs?:Array<{shape?:string}>}}>('https://valhalla1.openstreetmap.de/route?json='+encodeURIComponent(JSON.stringify(query)),{signal}), undefined, 8000);
          const primary=joinRouteChunks((data.trip?.legs||[]).map(leg=>leg.shape?decodePolyline(leg.shape):[]));
          if (!routedRoadRouteMatchesStops(primary,chunk)) throw new Error('Incomplete primary road route');
          return primary;
        }, () => fetchSecondary(index), 1000, 8000);
        if(options?.stopWaypoints&&chunk.length>2&&hasLocalRoadExcursion(route)) {
          try {
            const query={locations:roadRoutingLocations([chunk[0],chunk.at(-1)!],true,boundaries),costing:'bus',directions_options:{units:'kilometers'}};
            const data=await withRequestDeadline(signal=>requestJson<{trip?:{legs?:Array<{shape?:string}>}}>('https://valhalla1.openstreetmap.de/route?json='+encodeURIComponent(JSON.stringify(query)),{signal}),undefined,4000);
            const candidate=joinRouteChunks((data.trip?.legs||[]).map(leg=>leg.shape?decodePolyline(leg.shape):[]));
            route=preferRoadCorridor(route,candidate,chunk);
          }catch { /* Keep the complete original road route if no safe alternative exists. */ }
        }
        if(!routedRoadRouteMatchesStops(route,chunk))throw new Error('Incomplete road route: missing or unordered stops');
        roadChunkCache.set(chunkKey,route);
        if(roadChunkCache.size>500)roadChunkCache.delete(roadChunkCache.keys().next().value!);
        results[index]=route;
      }
    }));
    }catch(error){
      if(chunks.length>1&&points.length<=100){try{return await fetchCompleteSecondary();}catch{/* Retain the original diagnostic on failed recovery. */}}
      throw error;
    }
    try {
      const route = joinRouteChunks(results);
      if (!routedRoadRouteMatchesStops(route,points)) throw new Error('Incomplete joined road route');
      return route;
    } catch {
      // Routers may snap a shared stop onto different roads or opposite ends of
      // its search radius. Never bridge that gap with a straight line. Rebuild
      // the whole pattern with one router, reusing already validated responses.
      if(points.length<=100){try{return await fetchCompleteSecondary();}catch{/* Retry consistently routed chunks below. */}}
      cursor = 0;
      await Promise.all(Array.from({length:Math.min(3,chunks.length)},async()=> {
        while(cursor<chunks.length) {
          const index=cursor++;
          results[index]=await fetchSecondary(index);
        }
      }));
      const route = joinRouteChunks(results);
      if (!routedRoadRouteMatchesStops(route,points)) throw new Error('Incomplete joined road route');
      return route;
    }
  })();
  // The geometry belongs to the stop pattern, not the selected marker. Let the
  // bounded request finish/cache even if the user closes the panel meanwhile.
  promise = promise.then(route => {
    roadRouteCache.set(cacheKey,route);
    if(roadRouteCache.size>100)roadRouteCache.delete(roadRouteCache.keys().next().value!);
    return route;
  }).finally(() => roadRoutePending.delete(cacheKey));
  roadRoutePending.set(cacheKey,promise);
  }
  const resolved = promise.then(route => { options?.onResolved?.(route); return route; });
  return withRequestDeadline(() => resolved, options?.signal, 60_000);
}

export {roadRouteCache};
export {roadRoutePending};
export {fetchRoadRouteForStops};
