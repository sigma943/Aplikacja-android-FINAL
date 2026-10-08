import {readBusCoordinates} from '../bus-coordinates';

import {decodePolyline, routeChunks, joinRouteChunks, roadRouteMatchesStops, roadRoutingLocations, hasLocalRoadExcursion, preferRoadCorridor} from '../bus-road-geometry';

import {withRequestDeadline} from '../request-deadline';

import {type ShapePoint} from '../transport/types';
import {requestJson} from '../transport/http';

const roadRouteCache = new Map<string, ShapePoint[]>();

const roadRoutePending = new Map<string, Promise<ShapePoint[]>>();

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
    const fetchSecondary = async (index: number) => {
      if (secondary[index]) return secondary[index];
      const chunk = chunks[index];
      const coordinates=chunk.map(([lat,lon])=>lon+','+lat).join(';');
      const data=await requestJson<{code?:string;routes?:Array<{geometry?:{coordinates?:Array<[number,number]>}}>}>(
        'https://router.project-osrm.org/route/v1/driving/'+coordinates+'?overview=full&geometries=geojson&alternatives=false&steps=false&continue_straight=false');
      const route: ShapePoint[] = (data.routes?.[0]?.geometry?.coordinates||[]).map(([lon,lat])=>[lat,lon]);
      if (!roadRouteMatchesStops(route,chunk,150)) throw new Error('Incomplete secondary road route');
      secondary[index] = route;
      return route;
    };
    let cursor=0;
    await Promise.all(Array.from({length:Math.min(3,chunks.length)},async()=> {
      while(cursor<chunks.length) {
        const index=cursor++,chunk=chunks[index];
        const boundaries={start:index===0,end:index===chunks.length-1};
        let route: ShapePoint[]=[];
        try {
          // Stop coordinates can sit in a bay or side road. A through point
          // forbids turning there and can force a loop around nearby streets.
          const query={locations:roadRoutingLocations(chunk,Boolean(options?.stopWaypoints),boundaries),costing:'bus',directions_options:{units:'kilometers'}};
          const data=await withRequestDeadline(signal => requestJson<{trip?:{legs?:Array<{shape?:string}>}}>('https://valhalla1.openstreetmap.de/route?json='+encodeURIComponent(JSON.stringify(query)),{signal}), undefined, 8000);
          route=joinRouteChunks((data.trip?.legs||[]).map(leg=>leg.shape?decodePolyline(leg.shape):[]));
          if (!roadRouteMatchesStops(route,chunk,150)) route=[];
        }catch {}
        if(route.length<2) {
          route = await fetchSecondary(index);
        }
        if(options?.stopWaypoints&&chunk.length>2&&hasLocalRoadExcursion(route)) {
          try {
            const query={locations:roadRoutingLocations([chunk[0],chunk.at(-1)!],true,boundaries),costing:'bus',directions_options:{units:'kilometers'}};
            const data=await withRequestDeadline(signal=>requestJson<{trip?:{legs?:Array<{shape?:string}>}}>('https://valhalla1.openstreetmap.de/route?json='+encodeURIComponent(JSON.stringify(query)),{signal}),undefined,4000);
            const candidate=joinRouteChunks((data.trip?.legs||[]).map(leg=>leg.shape?decodePolyline(leg.shape):[]));
            route=preferRoadCorridor(route,candidate,chunk);
          }catch { /* Keep the complete original road route if no safe alternative exists. */ }
        }
        if(!roadRouteMatchesStops(route,chunk,150))throw new Error('Incomplete road route: missing or unordered stops');
        results[index]=route;
      }
    }));
    try {
      const route = joinRouteChunks(results);
      if (!roadRouteMatchesStops(route,points,150)) throw new Error('Incomplete joined road route');
      return route;
    } catch {
      // Routers may snap a shared stop onto different roads or opposite ends of
      // its search radius. Never bridge that gap with a straight line. Rebuild
      // the whole pattern with one router, reusing already validated responses.
      cursor = 0;
      await Promise.all(Array.from({length:Math.min(3,chunks.length)},async()=> {
        while(cursor<chunks.length) {
          const index=cursor++;
          results[index]=await fetchSecondary(index);
        }
      }));
      const route = joinRouteChunks(results);
      if (!roadRouteMatchesStops(route,points,150)) throw new Error('Incomplete joined road route');
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
