import {sliceJourneyRoute} from './journey-route-geometry';
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
export async function officialBusRoute(provider:string,tripId:unknown,stopIds:Array<number|string>,stopCoordinates?:Array<[number,number]>,options?:{completePattern?:boolean;coordinateStopIds?:Array<number|string>}) {
  if(provider!=='pks'&&provider!=='mpk_rzeszow')return [];
  const index=await routeIndex(provider);
  const trip=String(tripId||'');
  const expected=stopIds.map(String).filter((id,i,all)=>i===0||id!==all[i-1]);
  const pattern=index.patterns[index.tripPatterns[trip]];
  // PKS live stop IDs and GTFS stop IDs belong to different namespaces. An
  // exact trip can still be checked against its complete, ordered live stops.
  // Never accept a trip prefix, a partial route, or geometry in reverse order.
  // GTFS and live data can list a different number of stops for the same
  // course (PKS 314 / 4253: 41 versus 42). The complete live stop sequence
  // must match the actual geometry; equal metadata counts prove nothing.
  const completeCoordinates=!!stopCoordinates && expected.length>=2 &&
    stopCoordinates.length===expected.length;
  // A full live course may contain stops with no published GPS coordinates.
  // Keep their place in the pattern, and validate the exact operator shape
  // against the known pins instead of treating those pins as a partial trip.
  // Explicit IDs prove the coordinate subset is ordered and includes both
  // endpoints; a bare, truncated coordinate list is still rejected.
  const coordinateIds=options?.coordinateStopIds?.map(String)||[];
  let coordinateCursor=0;
  for(const id of expected)if(id===coordinateIds[coordinateCursor])coordinateCursor++;
  const anchoredPattern=!!options?.completePattern && !!pattern && !!stopCoordinates &&
    coordinateIds.length===stopCoordinates.length && coordinateIds.length>=Math.max(2,Math.ceil(expected.length*.7)) &&
    coordinateCursor===coordinateIds.length && coordinateIds[0]===expected[0] &&
    coordinateIds.at(-1)===expected.at(-1);
  const tripMatches=!expected.length || (pattern && pattern.join('-')===expected.join('-')) || completeCoordinates || anchoredPattern;
  const shape=(tripMatches ? index.tripShapes[trip] : '')||index.stopShapes[expected.join('-')];
  // Live course IDs change independently of GTFS, whose internal stop IDs
  // also differ from PKS IDs. Validate actual geometry, not ID prefixes or
  // approximate interior GTFS pins (which can be hundreds of metres away).
  const findByCoordinates = async (): Promise<Array<[number,number]>> => {
    if (!stopCoordinates || stopCoordinates.length !== expected.length || expected.length < 2) return [];
    const candidates = new Set<string>();
    const patternShapes = new Map<number, Set<string>>();
    for (const [id, patternId] of Object.entries(index.tripPatterns)) {
      const candidate = index.tripShapes[id];
      if (!candidate) continue;
      if (!patternShapes.has(patternId)) patternShapes.set(patternId, new Set());
      patternShapes.get(patternId)!.add(candidate);
    }
    index.patterns.forEach((ids, patternId) => {
      if (ids.length < 2) return;
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
  };
  if(!shape || !/^[\w.+-]+$/.test(shape))return findByCoordinates();
  const points=await loadShape(provider, shape);
  const stops=stopCoordinates || expected.flatMap(id=>index.stops[id] ? [[index.stops[id].lat,index.stops[id].lon] as [number,number]] : []);
  if (roadRouteMatchesStops(points,stops,180)) return points;
  // A complete live course can start later on its bundled GTFS shape. For
  // example, PKS 202 / trip 9078 starts ~685 m after shape 370's first point.
  // Remove only the unused prefix of this exact trip; never move stop pins,
  // invent a connector or relax route validation. Changed complete live patterns
  // are explicitly authorized below; ordinary partial stop lists stay rejected.
  if (completeCoordinates && pattern?.length===expected.length && shape===index.tripShapes[trip] && roadDistance(points[0],stops[0])<=1000) {
    let nearest=0;
    for(let i=1;i<points.length-1;i++)if(roadDistance(points[i],stops[0])<roadDistance(points[nearest],stops[0]))nearest=i;
    const trimmed=points.slice(nearest);
    if(roadRouteMatchesStops(trimmed,stops,180))return trimmed;
  }
  // Only the caller with a full live route can authorize a changed stop count;
  // an arbitrary partial list must never masquerade as the complete course.
  if (options?.completePattern && completeCoordinates && shape === index.tripShapes[trip]) {
    const trimmed=sliceJourneyRoute(points,stops,0,180);
    if (roadRouteMatchesStops(trimmed,stops,180)) return trimmed;
  }
  // A known course with incompatible stops must not borrow the opposite
  // direction's shape merely because its coordinates happen to fit. The
  // caller can route this changed live course instead. Coordinate discovery
  // is reserved for course IDs absent from this timetable snapshot.
  if (index.tripShapes[trip]) return [];
  return findByCoordinates();
}

/** Platform pins embedded in shapes can belong to other courses on the same road. */
export async function officialBusStopPoints(provider:string):Promise<Array<[number,number]>> {
 const index=await routeIndex(provider);
 return Object.values(index.stops).map(stop=>[stop.lat,stop.lon]);
}

/** Recover missing PKS GPS pins by unique platform identity, never by proximity.
 * Live names abbreviate the GTFS names; existing coordinates stay untouched. */
function platformIdentity(name:string){
 const words=name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l')
  .replace(/\bd\.?\s*a\.?\b/g,'dworzec autobusowy').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/);
 const aliases:Record<string,string>={krol:'krolewska',debniansk:'debnianskie',nadl:'nadlesnictwo',cment:'cmentarz',osr:'osrodek',zdr:'zdrowia',szp:'szpital',mlp:'malopolski'};
 const tokens=words.filter(w=>!['ul','ulica','al','aleja','aleje','st','stanowisko'].includes(w)).map(w=>/^\d+$/.test(w)?String(Number(w)):aliases[w]||w);
 // A locality without a platform number must not resolve to an arbitrary side.
 return tokens.length>=2&&/^\d+$/.test(tokens.at(-1)!)?tokens.join(' '):'';
}
export async function completeOfficialBusStopCoordinates<T extends {name:string;lat?:number;lon?:number}>(provider:string,stops:T[]):Promise<T[]>{
 if(provider!=='pks'||!stops.some(s=>!Number.isFinite(s.lat)||!Number.isFinite(s.lon)))return stops;
 const index=await routeIndex(provider),byName=new Map<string,Array<{lat:number;lon:number}>>();
 for(const point of Object.values(index.stops)){
  const key=platformIdentity(point.name);if(!key||!Number.isFinite(point.lat)||!Number.isFinite(point.lon))continue;
  const matches=byName.get(key)||[];matches.push(point);byName.set(key,matches);
 }
 let changed=false;
 const completed=stops.map(stop=>{
  if(Number.isFinite(stop.lat)&&Number.isFinite(stop.lon))return stop;
  const matches=byName.get(platformIdentity(stop.name));
  if(!matches?.length||matches.some(p=>roadDistance([p.lat,p.lon],[matches[0].lat,matches[0].lon])>5))return stop;
  changed=true;return {...stop,lat:matches[0].lat,lon:matches[0].lon};
 });
 return changed?completed:stops;
}
