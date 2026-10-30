import type {StopSchedule} from './transport/vehicle';
import {readBusCoordinates} from './bus-coordinates';
import {distanceMeters} from './transport/vehicle-speed';
import {projectJourneyStops,type Point} from './journey-route-geometry';

export type BusRouteProgress={route:Point[];metres:number[];stops:Point[];stopMetres:number[]};
function projection(p:Point,a:Point,b:Point){
 const scale=Math.cos(p[0]*Math.PI/180),x=(b[1]-a[1])*scale,y=b[0]-a[0];
 const length=x*x+y*y;
 const fraction=length?Math.max(0,Math.min(1,((p[1]-a[1])*scale*x+(p[0]-a[0])*y)/length)):0;
 const projected:Point=[a[0]+(b[0]-a[0])*fraction,a[1]+(b[1]-a[1])*fraction];
 return {fraction,distance:distanceMeters(p,projected)};
}
/** Use supplied geometry only. Straight stop-to-stop chords can cut corners and
 * falsely put a stop behind a bus that is still approaching on the road. */
export function prepareBusRouteProgress(route:Point[],stops:StopSchedule[]):BusRouteProgress|undefined{
 if(route.length<2||stops.length<2||!route.every(p=>readBusCoordinates(p?.[0],p?.[1])))return;
 const points:Point[]=[];
 for(const stop of stops){const p=readBusCoordinates(stop.lat,stop.lon);if(!p)return;points.push([p.lat,p.lon]);}
 const mapped=projectJourneyStops(route,points,80);
 if(mapped.length!==stops.length)return;
 const metres=[0];
 for(let i=1;i<route.length;i++)metres.push(metres[i-1]+distanceMeters(route[i-1],route[i]));
 const stopMetres=mapped.map(p=>{
  const i=Math.min(route.length-2,Math.floor(p.position));
  return metres[i]+(metres[i+1]-metres[i])*(p.position-i);
 });
 if(stopMetres.at(-1)!-stopMetres[0]<100)return;
 return {route,metres,stops:points,stopMetres};
}

/** Ambiguous intersections/parallel return legs give no evidence. The most
 * conservative nearby projection plus a 100 m margin protects upcoming stops. */
export function routeConfirmedPassedStop(model:BusRouteProgress,position:Point,alreadyPassed:number){
 const candidates:Array<{distance:number;metres:number}>=[];
 for(let i=0;i<model.route.length-1;i++){
  const p=projection(position,model.route[i],model.route[i+1]);
  if(p.distance<=60)candidates.push({distance:p.distance,metres:model.metres[i]+(model.metres[i+1]-model.metres[i])*p.fraction});
 }
 if(!candidates.length)return -1;
 const closest=candidates.reduce((best,p)=>Math.min(best,p.distance),Infinity);
 let start=Infinity,end=-Infinity;
 for(const p of candidates)if(p.distance<=closest+20){start=Math.min(start,p.metres);end=Math.max(end,p.metres);}
 if(end-start>120)return -1;
 let passed=-1;
 for(let i=alreadyPassed+1;i<model.stopMetres.length;i++){
  if(model.stopMetres[i]+100>start)break;
  if(distanceMeters(position,model.stops[i])>=100)passed=i;
 }
 return passed;
}
