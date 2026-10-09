type Point=[number,number];
export function validRoadPoint(point: unknown): point is Point {
  return Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180;
}
export function roadDistance(a: Point, b: Point) {
  return Math.hypot((a[0]-b[0])*111320, (a[1]-b[1])*111320*Math.cos((a[0]+b[0])*Math.PI/360));
}
function segmentProjection(point: Point, start: Point, end: Point) {
  const longitudeScale = Math.cos(point[0]*Math.PI/180);
  const dx=(end[1]-start[1])*longitudeScale, dy=end[0]-start[0];
  const fraction=Math.max(0, Math.min(1, ((point[1]-start[1])*longitudeScale*dx+(point[0]-start[0])*dy)/(dx*dx+dy*dy || 1)));
  return {fraction, distance: roadDistance(point, [start[0]+dy*fraction, start[1]+(end[1]-start[1])*fraction])};
}
/** Check coordinates, endpoints and the ordered stops, including return legs. */
export function roadRouteMatchesStops(route: Point[], stops: Point[], tolerance=120) {
  if (route.length < 2 || !route.every(validRoadPoint) || !stops.every(validRoadPoint)) return false;
  if (!stops.length) return true;
  if (roadDistance(route[0],stops[0])>tolerance || roadDistance(route.at(-1)!,stops.at(-1)!)>tolerance) return false;
  let cursor=0;
  for (const stop of stops) {
    let found=false;
    for (let index=Math.floor(cursor);index<route.length-1;index++) {
      const projection=segmentProjection(stop,route[index],route[index+1]);
      if (index+projection.fraction+1e-8>=cursor && projection.distance<=tolerance) {
        cursor=index+projection.fraction;found=true;break;
      }
    }
    if (!found) return false;
  }
  return true;
}

/** Preserve road corners instead of dropping every Nth coordinate on long routes. */
export function simplifyRoadRoute(route: Point[], tolerance=2): Point[] {
  if (route.length<3) return route;
  const keep=new Set([0,route.length-1]);
  const stack: Array<[number,number]>=[[0,route.length-1]];
  while(stack.length) {
    const [start,end]=stack.pop()!;let farthest=tolerance,index=-1;
    for(let i=start+1;i<end;i++) {
      const distance=segmentProjection(route[i],route[start],route[end]).distance;
      if(distance>farthest){farthest=distance;index=i;}
    }
    if(index>=0){keep.add(index);stack.push([start,index],[index,end]);}
  }
  return [...keep].sort((a,b)=>a-b).map(i=>route[i]);
}
export function decodePolyline(shape:string,precision=6):Point[] {
  const points:Point[]=[];let index=0,lat=0,lon=0;
  function delta() {
    let result=0,shift=0,byte:number;
    do {if(index>=shape.length||shift>30)throw new Error('Invalid road polyline');byte=shape.charCodeAt(index++)-63;result|=(byte&31)<<shift;shift+=5;}while(byte>=32);
    return result&1 ? ~(result>>1) : result>>1;
  }
  while(index<shape.length){lat+=delta();lon+=delta();points.push([lat/10**precision,lon/10**precision]);}
  return points;
}
/** Overlapping chunks preserve every stop and the order of circular routes. */
// Public Valhalla accepts at most 10 locations per request, including endpoints.
export function routeChunks(points:Point[],size=10):Point[][] {
  if (!Number.isInteger(size) || size < 2 || size > 10) throw new Error('Road routing supports 2–10 locations per chunk');
  const chunks:Point[][]=[];
  for(let start=0;start<points.length-1;start+=size-1)chunks.push(points.slice(start,start+size));
  return chunks;
}
export function joinRouteChunks(chunks:Point[][]):Point[] {
  const result:Point[]=[];
  for(const chunk of chunks) {
    if(chunk.length<2 || !chunk.every(validRoadPoint))throw new Error('Incomplete road route');
    const end=result.at(-1);
    if(end && roadDistance(end,chunk[0])>80)throw new Error('Disconnected road route chunks');
    for(const point of chunk){const last=result.at(-1);if(!last||last[0]!==point[0]||last[1]!==point[1])result.push(point);}
  }
  return result;
}

/** Remove tiny self-returning routing artifacts at a junction, keeping stop visits. */
export function cleanRoadJunctionLoops(route:Point[],stops:Point[]):Point[] {
  const result:Point[]=[];
  for(let routeIndex=0;routeIndex<route.length;routeIndex++){
    const point=route[routeIndex];
    result.push(point);
    const end=result.length-1;
    let length=0;
    for(let start=end-1;start>=Math.max(0,end-120);start--){
      length+=roadDistance(result[start],result[start+1]);
      if(length>100)break;
      if(end-start<3||roadDistance(result[start],point)>4)continue;
      const loop=result.slice(start,end+1);
      if(loop.some(p=>roadDistance(p,point)>30))continue;
      // A bay, terminus or return leg is real when a stop lies on the excursion.
      if(stops.some(stop=>loop.some(p=>roadDistance(p,stop)<35)))continue;
      const candidate=[...result.slice(0,start+1),...route.slice(routeIndex+1)];
      if(!roadRouteMatchesStops(candidate,stops,180))continue;
      result.splice(start+1,end-start);
      break;
    }
  }
  return result;
}

/** Nearby candidates for interior pins; shared endpoints must snap consistently. */
export function roadRoutingLocations(stops:Point[],stopWaypoints:boolean,boundaries={start:true,end:true}) {
  return stops.map(([lat,lon],index)=>({lat,lon,type:index===0||index===stops.length-1?'break':stopWaypoints?'via':'through',
    ...(stopWaypoints?{radius:index===0||index===stops.length-1?35:150,rank_candidates:false}:{})}));
}
/** Only request an alternative for a short out-and-back/closed junction excursion. */
export function hasLocalRoadExcursion(route:Point[]) {
  for(let end=2;end<route.length;end++) {
    let length=0;
    for(let start=end-1;start>=Math.max(0,end-160);start--) {
      length+=roadDistance(route[start],route[start+1]);if(length>900)break;
      if(end-start<2||length<30||roadDistance(route[start],route[end])>12)continue;
      if(route.slice(start,end+1).every(point=>roadDistance(point,route[start])<=150))return true;
    }
  }
  return false;
}
/** Prefer an actual road corridor only if every stop is still passed in order. */
export function preferRoadCorridor(route:Point[],candidate:Point[],stops:Point[]) {
  // Repeated stops describe a deliberate return leg; a shortcut must not erase it.
  if(stops.some((stop,index)=>stops.slice(0,Math.max(0,index-1)).some(previous=>roadDistance(stop,previous)<10)))return route;
  if(!roadRouteMatchesStops(candidate,stops,150))return route;
  const length=(points:Point[])=>points.slice(1).reduce((total,point,index)=>total+roadDistance(points[index],point),0);
  const oldLength=length(route),newLength=length(candidate);
  return oldLength-newLength>=30&&newLength<oldLength*.95?candidate:route;
}
