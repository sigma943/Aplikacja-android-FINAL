import {journeyBusCorridor} from '../journey-bus-corridor';
import {roadDistance} from '../bus-road-geometry';
import type {Point} from '../journey-route-geometry';
const vector=(a:Point,b:Point)=>[(b[1]-a[1])*Math.cos((a[0]+b[0])*Math.PI/360),b[0]-a[0]];
const alignment=(a:number[],b:number[])=>(a[0]*b[0]+a[1]*b[1])/(Math.hypot(...a)*Math.hypot(...b)||1);
/** Only MPK map paint; raw geometry and all other carriers remain untouched. */
export function mpkRouteForPaint(route:Point[],provider:string|undefined,pins:Point[]):Point[]{
 if(provider!=='mpk_rzeszow'||route.length<5||!pins.length)return route;
 const result=journeyBusCorridor(route,pins);
 const buckets=new Map<string,Point[]>(),key=(a:number,b:number)=>a+':'+b;
 for(const pin of pins){const k=key(Math.floor(pin[0]*1e4),Math.floor(pin[1]*1e4));const bucket=buckets.get(k)||[];bucket.push(pin);buckets.set(k,bucket);}
 const isPin=(p:Point)=>{const a=Math.floor(p[0]*1e4),b=Math.floor(p[1]*1e4);for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)if(buckets.get(key(a+x,b+y))?.some(pin=>roadDistance(p,pin)<=.5))return true;return false;};
 // GTFS also inserts shallow metre-scale teeth. Their vertices coincide with
 // platform pins, bracketed by two nearby road anchors on the same straight
 // corridor. The shared coarse filter deliberately retains these small teeth.
 for(let i=2;i<result.length-2;i++){
  const p=result[i];if(!isPin(p))continue;
  const a=result[i-1],b=result[i+1],axis=vector(a,b),span=roadDistance(a,b);
  if(span<1||span>24||isPin(a)||isPin(b))continue;
  if(alignment(vector(result[i-2],a),axis)<.985||alignment(axis,vector(b,result[i+2]))<.985)continue;
  const v=vector(a,p),fraction=(v[0]*axis[0]+v[1]*axis[1])/(axis[0]*axis[0]+axis[1]*axis[1]);
  if(fraction<-.05||fraction>1.05)continue;
  const projection:Point=[a[0]+(b[0]-a[0])*fraction,a[1]+(b[1]-a[1])*fraction],offset=roadDistance(p,projection);
  if(offset<.6||offset>12||roadDistance(a,p)>25||roadDistance(p,b)>25)continue;
  result.splice(i,1);i=Math.max(1,i-2);
 }
 return result;
}
