import type {Journey} from './journey-planner';
import type {Stop} from '@/Panel/src/types';
export type JourneyPointRole='stop'|'transfer'|'start'|'end';
export const journeyPointPriority:Record<JourneyPointRole,number>={stop:0,transfer:1,start:2,end:3};
/** Only boundaries between distinct rides are transfers, including the walk between platforms. */
export function journeyPointRole(journey:Journey,stop:Stop):JourneyPointRole {
 if(stop.id===journey.legs[0]?.from.id)return 'start';
 if(stop.id===journey.legs.at(-1)?.to.id)return 'end';
 const rides=journey.legs.filter(leg=>leg.walking===undefined);
 for(let i=1;i<rides.length;i++)if(stop.id===rides[i-1].to.id||stop.id===rides[i].from.id)return 'transfer';
 return 'stop';
}
export function journeyPointSize(zoom:number,role:JourneyPointRole){
 if(role==='stop')return zoom<12?1.4:zoom<14?1.8:zoom<16?2.5:3.3;
 return role==='transfer'?(zoom<14?10:14):(zoom<14?12:16);
}

/** Place the pedestrian halfway along the route, not at its middle vertex. */
export function journeyPathMidpoint(path:Array<[number,number]>):[number,number]|null {
 if(!path.length)return null;
 const lengths=path.slice(1).map((p,i)=>Math.hypot(p[0]-path[i][0],(p[1]-path[i][1])*Math.cos((p[0]+path[i][0])*Math.PI/360)));
 let remaining=lengths.reduce((sum,length)=>sum+length,0)/2;
 for(let i=0;i<lengths.length;i++){
  const length=lengths[i];
  if(length>0&&remaining<=length){const ratio=remaining/length;return [path[i][0]+(path[i+1][0]-path[i][0])*ratio,path[i][1]+(path[i+1][1]-path[i][1])*ratio];}
  remaining-=length;
 }
 return [...path[0]];
}
