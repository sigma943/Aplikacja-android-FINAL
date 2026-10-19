import type {Vehicle} from './transport/vehicle';
import type {Connection} from './journey-timetable';
import {warsawDateIso} from './transit-time';

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
