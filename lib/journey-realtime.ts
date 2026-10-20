import type {Vehicle} from './transport/vehicle';
import type {Connection} from './journey-timetable';
import {warsawDateIso} from './transit-time';
import {tripUpdateCourse,type JourneyTripUpdate,type JourneyStopUpdate} from './journey-model';
import {validRoadPoint} from './bus-road-geometry';
import {stopDistance} from './journey-planner';

/** Supplemental explicit trip updates are optional: lack of an observation is
 * never interpreted as cancellation. A conflicting update is ignored. */
export function applyJourneyTripUpdates(connections:Connection[],updates:JourneyTripUpdate[],now=Date.now()):Connection[]{
 if(!updates.length)return connections;
 const indexed=new Map<string,JourneyTripUpdate[]>();
 for(const update of updates){
  if(!update.provider||!update.tripId||!/^\d{4}-\d{2}-\d{2}$/.test(update.serviceDate)||!Number.isFinite(update.observedAt)||now-update.observedAt>120000||update.observedAt>now+5000)continue;
  const key=tripUpdateCourse(update),previous=indexed.get(key)||[],latest=previous[0]?.observedAt??-Infinity;
  if(update.observedAt<latest)continue;
  const list=update.observedAt>latest?[]:previous;
  if(!list.some(old=>JSON.stringify(old)===JSON.stringify(update)))list.push(update);indexed.set(key,list);
 }
 if(!indexed.size)return connections;
 const occurrences=new Map<string,Map<string,number>>(),courses=new Map<string,Connection[]>();
 for(const c of connections)if(indexed.has(c.course)){const list=courses.get(c.course)||[];list.push(c);courses.set(c.course,list);}
 for(const [course,rows] of courses){
  const counts=new Map<string,number>(),ordered=[...rows].sort((a,b)=>(a.fromSequence!==undefined&&b.fromSequence!==undefined?a.fromSequence-b.fromSequence:a.departure-b.departure));
  const add=(id:string|undefined)=>{if(id!==undefined)counts.set(id,(counts.get(id)||0)+1);};
  for(const c of ordered)add(c.sourceFromStopId);add(ordered.at(-1)?.sourceToStopId);occurrences.set(course,counts);
 }
 const shifted=(value:number|undefined,delay:number|undefined,scheduled:number,current:number)=>Number.isFinite(value)&&Math.abs(value!-scheduled)<=10800000?value!:Number.isFinite(delay)&&Math.abs(delay!)<=10800?scheduled+delay!*1000:current;
 return connections.flatMap(c=>{
  const matches=indexed.get(c.course)?.filter(u=>u.provider===c.provider&&(!u.line||u.line===c.line));
  if(matches?.length!==1)return [c];const update=matches[0];
  if(update.status==='canceled')return [];
  const match=(source:string|undefined,sequence:number|undefined)=>{
   const rows=(update.stops||[]).filter(s=>(s.sequence!==undefined||s.stopId!==undefined)&&(s.sequence===undefined||s.sequence===sequence)&&(s.stopId===undefined||s.stopId===source)&&(s.sequence!==undefined||!source||(occurrences.get(c.course)?.get(source)||0)<=1));
   return rows.length===1?rows[0]:undefined;
  };
  const a=match(c.sourceFromStopId,c.fromSequence),b=match(c.sourceToStopId,c.toSequence);
  const scheduledDeparture=c.scheduledDeparture??c.departure,scheduledArrival=c.scheduledArrival??c.arrival;
  const departure=shifted(a?.departure,a?.delaySeconds??update.delaySeconds,scheduledDeparture,c.departure);
  const arrival=shifted(b?.arrival,b?.delaySeconds??update.delaySeconds,scheduledArrival,c.arrival);
  // Inconsistent predictions must not turn into a negative-time connection.
  if(arrival<departure)return [c];
  const platform=(s:JourneyStopUpdate|undefined,original:Connection['from'])=>{
   const p=s?.assignedStop;
   // Moving a call is explicit, not a nearest-name or nearest-platform guess.
   return p&&p.id&&validRoadPoint([p.lat!,p.lon!])&&stopDistance(original,p)<=500?p:original;
  };
  return [{...c,from:platform(a,c.from),to:platform(b,c.to),pickup:a?.skipped?false:c.pickup,dropoff:b?.skipped?false:c.dropoff,departure,arrival,scheduledDeparture,scheduledArrival,delaySeconds:Math.round((departure-scheduledDeparture)/1000)}];
 });
}

/** Match the full course identity, carrier and service day; never the line alone. */
export function applyJourneyDelays(connections:Connection[],vehicles:Vehicle[],now=Date.now()):Connection[]{
 const updates=new Map<string,Vehicle[]>();
 for(const vehicle of vehicles){
  const observed=vehicle.positionObservedAtMs??Date.parse(vehicle.lastSignalTime||'');
  const age=Number.isFinite(observed)?(now-observed)/1000:vehicle.dataAgeSec;
  if(!Number.isFinite(age)||age!<0||age!>120||vehicle.isHistorical||vehicle.status!=='active'||!Number.isFinite(vehicle.delay)||Math.abs(vehicle.delay!)>10800)continue;
  // SIP/myBus identifiers are not GTFS trip identifiers.
  if(vehicle.scheduleSource==='mybus'||String(vehicle.journeyId||'').startsWith('mybus:'))continue;
  const provider=vehicle.provider==='mpk_rzeszow'?'mpk':vehicle.provider||'pks';
  const id=provider==='marcel'?vehicle.journeyId??vehicle.tripId:vehicle.tripId;
  if(id===undefined||id===null||String(id)==='')continue;
  const date=warsawDateIso(0,new Date(now));
  const key=`${provider}:${id}:${date}`,list=updates.get(key)||[];list.push(vehicle);updates.set(key,list);
 }
 return connections.map(connection=>{
  const matches=updates.get(connection.course);
  if(matches?.length!==1)return connection;
  const vehicle=matches[0];
  if(String(vehicle.routeShortName||vehicle.routeId||'').trim()!==connection.line.trim())return connection;
  // A currently active bus cannot describe a different occurrence of a reused ID.
  if(connection.arrival<now-3*3600000||connection.departure>now+6*3600000)return connection;
  const delaySeconds=Math.round(vehicle.delay!),shift=delaySeconds*1000;
  return {...connection,scheduledDeparture:connection.departure,scheduledArrival:connection.arrival,departure:connection.departure+shift,arrival:connection.arrival+shift,delaySeconds};
 });
}
