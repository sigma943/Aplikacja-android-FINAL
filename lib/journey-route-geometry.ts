import {roadDistance,validRoadPoint} from './bus-road-geometry';
export type Point=[number,number];
type Projection={point:Point;position:number;distance:number};
function project(point:Point,a:Point,b:Point,index:number):Projection {
 const scale=Math.cos(point[0]*Math.PI/180),x=(b[1]-a[1])*scale,y=b[0]-a[0];
 const t=Math.max(0,Math.min(1,((point[1]-a[1])*scale*x+(point[0]-a[0])*y)/(x*x+y*y||1)));
 const p:Point=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
 return {point:p,position:index+t,distance:roadDistance(point,p)};
}
/** Match the complete ordered stop sequence to segments, including return legs. */
export function projectJourneyStops(route:Point[],stops:Point[],tolerance=150):Projection[]{
 if(route.length<2||!route.every(validRoadPoint)||!stops.length||!stops.every(validRoadPoint))return [];
 let states:Array<{cost:number;points:Projection[]}>=[];
 for(const [stopIndex,stop] of stops.entries()){
  const candidates=route.slice(1).map((p,i)=>project(stop,route[i],p,i)).filter(p=>p.distance<=tolerance)
   .sort((a,b)=>a.distance-b.distance||a.position-b.position);
  // Keep distinct positions on circular routes instead of selecting the first
  // close vertex and accidentally dropping the outward/return portion.
  const distinct:Projection[]=[];
  for(const p of candidates){if(!distinct.some(old=>Math.abs(old.position-p.position)<.01))distinct.push(p);if(distinct.length===24)break;}
  const next:Array<{cost:number;points:Projection[]}>=[];
  for(const p of distinct){
   if(!stopIndex){next.push({cost:p.distance*p.distance,points:[p]});continue;}
   const previous=states.filter(s=>p.position+1e-8>=s.points.at(-1)!.position).sort((a,b)=>a.cost-b.cost)[0];
   if(previous)next.push({cost:previous.cost+p.distance*p.distance,points:[...previous.points,p]});
  }
  if(!next.length)return [];
  states=next.sort((a,b)=>a.cost-b.cost||a.points.at(-1)!.position-b.points.at(-1)!.position);
 }
 return states[0]?.points||[];
}
function pointAt(route:Point[],position:number):Point {
 const index=Math.min(route.length-2,Math.floor(position)),t=position-index;
 return [route[index][0]+(route[index+1][0]-route[index][0])*t,route[index][1]+(route[index+1][1]-route[index][1])*t];
}
export function sliceJourneyRoute(route:Point[],stops:Point[],padding=0):Point[]{
 const projections=projectJourneyStops(route,stops);if(projections.length!==stops.length)return [];
 let start=projections[0].position,end=projections.at(-1)!.position;
 if(end<=start)return [];
 let remaining=padding;
 while(start>0&&remaining>0){const previous=Math.max(0,Math.ceil(start)-1),distance=roadDistance(pointAt(route,start),pointAt(route,previous));if(distance>remaining){start-=remaining/distance*(start-previous);break;}remaining-=distance;start=previous;}
 remaining=padding;
 while(end<route.length-1&&remaining>0){const next=Math.min(route.length-1,Math.floor(end)+1),distance=roadDistance(pointAt(route,end),pointAt(route,next));if(distance>remaining){end+=remaining/distance*(next-end);break;}remaining-=distance;end=next;}
 return [pointAt(route,start),...route.slice(Math.floor(start)+1,Math.ceil(end)),pointAt(route,end)].filter((p,i,all)=>!i||roadDistance(p,all[i-1])>.05);
}
/** Route through the corridor and all stops; raw stop pins are interior hints,
 * never the endpoints that force a bus into a parking bay or side street. */
export function journeyRoadAnchors(corridor:Point[],stops:Point[]):Point[]{
 const projected=projectJourneyStops(corridor,stops);if(projected.length!==stops.length)return [];
 const anchors=projected.map((p,i)=>({position:p.position,point:stops[i]}));
 let length=0;
 for(let i=1;i<corridor.length-1;i++){length+=roadDistance(corridor[i-1],corridor[i]);if(length>=300){anchors.push({position:i,point:corridor[i]});length=0;}}
 return [corridor[0],...anchors.sort((a,b)=>a.position-b.position).map(p=>p.point),corridor.at(-1)!].filter((p,i,all)=>!i||roadDistance(p,all[i-1])>3);
}
