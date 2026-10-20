import type {Stop} from '@/Panel/src/types';

/** All adapters emit the same physical calls, permissions and service identity.
 * Source stop IDs remain separate from catalog IDs used by the interface. */
export type Connection={from:Stop;to:Stop;departure:number;arrival:number;course:string;line:string;provider:string;pickup?:boolean;dropoff?:boolean;delaySeconds?:number;scheduledDeparture?:number;scheduledArrival?:number;sourceRoute?:Array<[number,number]>;sourceFromPoint?:[number,number];sourceToPoint?:[number,number];sourceFromStopId?:string;sourceToStopId?:string;fromSequence?:number;toSequence?:number};
export type JourneyStopUpdate={stopId?:string;sequence?:number;arrival?:number;departure?:number;delaySeconds?:number;skipped?:boolean;assignedStop?:Stop};
export type JourneyTripUpdate={provider:string;tripId:string;serviceDate:string;observedAt:number;line?:string;status?:'scheduled'|'canceled';delaySeconds?:number;stops?:JourneyStopUpdate[]};

export function tripUpdateCourse(update:JourneyTripUpdate){return `${update.provider}:${update.tripId}:${update.serviceDate}`;}
