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
