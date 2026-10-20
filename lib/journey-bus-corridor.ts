import {roadDistance} from './bus-road-geometry';
import type {Point} from './journey-route-geometry';
function vector(a:Point,b:Point){return [(b[1]-a[1])*Math.cos((a[0]+b[0])*Math.PI/360),b[0]-a[0]];}
function alignment(a:number[],b:number[]){return (a[0]*b[0]+a[1]*b[1])/(Math.hypot(...a)*Math.hypot(...b)||1);}
/** Display-only removal of short stop-pin spurs. Require the same straight road
 * before and after the pin; never simplify junctions, real return legs or bends. */
export function journeyBusCorridor(route:Point[],pins:Point[],pinTolerance=2):Point[]{
 const buckets=new Map<string,Point[]>(),key=(a:number,b:number)=>a+':'+b;
 for(const p of pins){const k=key(Math.floor(p[0]*1e4),Math.floor(p[1]*1e4));buckets.set(k,[...(buckets.get(k)||[]),p]);}
 const nearPin=(p:Point)=>{const a=Math.floor(p[0]*1e4),b=Math.floor(p[1]*1e4);for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)if(buckets.get(key(a+x,b+y))?.some(pin=>roadDistance(pin,p)<=pinTolerance))return true;return false;};
 const result=route.slice();
 for(let i=2;i<result.length-2;i++){
  if(!nearPin(result[i]))continue;
  for(let count=1;count<=3&&i+count+1<result.length;count++){
   const a=result[i-1],b=result[i+count],axis=vector(a,b),span=roadDistance(a,b);
   if(span<2||span>40||alignment(vector(result[i-2],a),axis)<.96||alignment(axis,vector(b,result[i+count+1]))<.96)continue;
   const middle=result.slice(i,i+count);
   if(!middle.some(nearPin))continue;
   let length=0,previous=a,maxOffset=0,turn=false;
   for(const p of [...middle,b]){length+=roadDistance(previous,p);previous=p;}
   if(length>100||length-span<4)continue;
   for(let j=0;j<middle.length;j++){
    const p=middle[j],v=vector(a,p),fraction=(v[0]*axis[0]+v[1]*axis[1])/(axis[0]*axis[0]+axis[1]*axis[1]);
    if(fraction<-.25||fraction>1.25){maxOffset=Infinity;break;}
    const projection:Point=[a[0]+(b[0]-a[0])*fraction,a[1]+(b[1]-a[1])*fraction];
    maxOffset=Math.max(maxOffset,roadDistance(p,projection));
    if(alignment(vector(j?middle[j-1]:a,p),vector(p,middle[j+1]||b))<-.2)turn=true;
   }
   if(!turn||maxOffset<3||maxOffset>25)continue;
   result.splice(i,count);i=Math.max(1,i-2);break;
  }
 }
 return result;
}
