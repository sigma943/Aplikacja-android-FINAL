import type {Stop} from '@/Panel/src/types';
import type {Connection} from './journey-timetable';

export type NetworkConnection={connection:Connection;from:number;to:number;course:string};
export type JourneyNetwork={stops:Stop[];stopIndex:Map<string,number>;connections:NetworkConnection[];rejected:number};
const prepared=new WeakMap<Connection[],JourneyNetwork>();

/** Provider IDs are opaque. Even equal raw trip IDs from two carriers never
 * describe the same vehicle. Calendar expansion happens before this boundary. */
export function journeyCourseKey(provider:string,course:string){return JSON.stringify([provider,course]);}

/** One immutable, indexed, chronological representation for all adapters.
 * Invalid edges are excluded explicitly; input objects are never rewritten. */
export function prepareJourneyNetwork(connections:Connection[]):JourneyNetwork{
 const cached=prepared.get(connections);if(cached)return cached;
 const stops:Stop[]=[],stopIndex=new Map<string,number>(),edges:NetworkConnection[]=[];
 let rejected=0;
 const index=(stop:Stop)=>{let i=stopIndex.get(stop.id);if(i===undefined){i=stops.length;stopIndex.set(stop.id,i);stops.push(stop);}return i;};
 const seen=new Set<string>();
 for(const c of connections){
  if(!c.from?.id||!c.to?.id||!c.provider||!c.course||!Number.isFinite(c.departure)||!Number.isFinite(c.arrival)||c.arrival<c.departure){rejected++;continue;}
  const key=JSON.stringify([c.provider,c.course,c.from.id,c.to.id,c.departure,c.arrival,c.pickup,c.dropoff]);
  if(seen.has(key))continue;seen.add(key);
  edges.push({connection:c,from:index(c.from),to:index(c.to),course:journeyCourseKey(c.provider,c.course)});
 }
 edges.sort((a,b)=>a.connection.departure-b.connection.departure||a.connection.arrival-b.connection.arrival);
 const network={stops,stopIndex,connections:edges,rejected};prepared.set(connections,network);return network;
}
