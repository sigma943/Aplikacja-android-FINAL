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
