type Point=[number,number];
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
    if(chunk.length<2)throw new Error('Incomplete road route');
    for(const point of chunk){const last=result.at(-1);if(!last||last[0]!==point[0]||last[1]!==point[1])result.push(point);}
  }
  return result;
}
