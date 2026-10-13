import {roadDistance} from './bus-road-geometry';
type Point=[number,number];
// This four-point kink is repeated in the bundled PKS shapes at the
// Grottgera/Grunwaldzka junction. Its two middle pins jump west of the
// continuous north/south corridor; keep the existing corridor endpoints.
const kink:Point[]=[[50.041788,22.002516],[50.041946,22.002446],[50.041991,22.002377],[50.042018,22.002521]];

/** Match only the recorded PKS artifact, in either travel direction. */
export function correctPksStationJunction(route:Point[],provider?:string):Point[]{
  if(provider!=='pks')return route;
  const result:Point[]=[];
  let changed=false;
  for(let index=0;index<route.length;index++){
    const span=route.slice(index,index+4);
    const matches=span.length===4&&[kink,[...kink].reverse()].some(pattern=>pattern.every((point,i)=>roadDistance(point,span[i])<3));
    if(matches){result.push(span[0],span[3]);index+=3;changed=true;}
    else result.push(route[index]);
  }
  return changed?result:route;
}
