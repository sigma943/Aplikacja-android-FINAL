import type {Departure,Stop} from '@/Panel/src/types';
import type {Vehicle,StopSchedule} from '@/components/BusMap';
import {transitTimestamp} from './bus-operating-state';
import {warsawClock,warsawDateIso} from './transit-time';
import {busDelayMinutes} from './bus-punctuality';
import {marcelDepartureFromVehicle} from './marcel-stop-punctuality';
import {upcomingVehicleStops,orderedVehicleStops} from './vehicle-upcoming-stops';
import {remainingGpsBusStops} from './bus-stop-passage';
import {rzeszowTerminalPlatform} from './stop-label';

function vehicleStopTiming(vehicle:Vehicle,stop:StopSchedule) {
  const planned=transitTimestamp(stop.planned), explicit=transitTimestamp(stop.real);
  const knownDelay=vehicle.status!=='break'&&vehicle.status!=='inactive'&&Number.isFinite(vehicle.delay)&&Math.abs(vehicle.delay!)<=18_000;
  const real=Number.isFinite(planned)&&knownDelay&&vehicle.provider==='pks'
    ? planned+vehicle.delay!*1000
    : Number.isFinite(explicit)?explicit:Number.isFinite(planned)&&knownDelay?planned+vehicle.delay!*1000:planned;
  const live=Number.isFinite(explicit)||knownDelay;
  return {planned,real,live};
}

/** PKS's current deviation is shared by its stop board and vehicle timetable. */
export function vehicleStopDeparture(vehicle:Vehicle,stop:StopSchedule):Departure {
  const {planned,real,live}=vehicleStopTiming(vehicle,stop);
  const delayMins=Number.isFinite(real)&&Number.isFinite(planned)?busDelayMinutes((real-planned)/1000):0;
  return {id:String(stop.id),stopId:String(stop.id),courseId:String(vehicle.journeyId??vehicle.tripId??''),line:vehicle.routeShortName||'',direction:vehicle.direction||'',
    carrier:{id:vehicle.provider==='mpk_rzeszow'?'mpk':vehicle.provider||'pks',name:vehicle.operatorName||'PKS',colorClass:''},
    time:Number.isFinite(real)?warsawClock(real):'--:--',status:delayMins?'delayed':'on_time',delayMins,
    plannedAtMs:Number.isFinite(planned)?planned:undefined,realAtMs:Number.isFinite(real)?real:undefined,realtimeSource:live?'vehicle-feed':undefined};
}

export function departureFromLiveVehicle(departure:Departure,vehicles:Vehicle[],now=Date.now()):Departure {
  if(departure.carrier?.id==='marcel')return marcelDepartureFromVehicle(departure,vehicles);
  if(departure.carrier?.id!=='pks'||departure.plannedAtMs==null)return departure;
  const candidates=vehicles.filter(vehicle=>{
    if(vehicle.provider!=='pks'||vehicle.isHistorical||!Number.isFinite(vehicle.delay)||Math.abs(vehicle.delay!)>18_000||
      (vehicle.dataAgeSec??0)>120||(vehicle.status&&vehicle.status!=='active')||vehicle.routeShortName!==departure.line||
      vehicle.journeyUpdate?.status==='canceled')return false;
    const signal=transitTimestamp(vehicle.lastSignalTime);
    if(Number.isFinite(signal)&&(signal>now+5000||now-signal>120_000))return false;
    if(departure.stopId&&vehicle.journeyUpdate?.stops?.some(update=>update.stopId===departure.stopId&&update.skipped))return false;
    if(warsawDateIso(0,new Date(departure.plannedAtMs!))!==warsawDateIso(0,new Date(Number.isFinite(signal)?signal:now)))return false;
    if(departure.courseId)return [vehicle.journeyId,vehicle.tripId].some(id=>String(id??'')===departure.courseId);
    if(departure.vehicleId&&![vehicle.id,vehicle.vehicleNumber].some(id=>String(id??'')===departure.vehicleId))return false;
    return (vehicle.routeStops?.length?vehicle.routeStops:vehicle.schedule||[]).some(stop=>
      (!departure.stopId||String(stop.id)===departure.stopId)&&transitTimestamp(stop.planned)===departure.plannedAtMs);
  });
  if(candidates.length!==1)return departure;
  const vehicle=candidates[0];
  const realAtMs=departure.plannedAtMs+vehicle.delay!*1000,delayMins=busDelayMinutes(vehicle.delay!);
  return {...departure,realAtMs,time:warsawClock(realAtMs),delayMins,status:delayMins?'delayed':'on_time',realtimeSource:'vehicle-feed',
    realtimeObservedAtMs:transitTimestamp(vehicle.lastSignalTime)};
}

export function timedVehicleStops(vehicle:Vehicle):StopSchedule[] {
  return (vehicle.routeStops?.length?vehicle.routeStops:vehicle.schedule||[]).map(stop=>{
    const {real}=vehicleStopTiming(vehicle,stop);
    return {...stop,real:Number.isFinite(real)?new Date(real).toISOString():stop.real};
  });
}

/** PKS next_stop_points is the remaining sequence at the last GPS update.
 * Timetable/predicted times are estimates, not confirmation of a stop passage. */
export function upcomingTimedVehicleStops(vehicle:Vehicle,nowMs:number,routeGeometry?:[number,number][]):StopSchedule[] {
  if(vehicle.provider==='pks') {
    if(vehicle.schedule?.length) {
      return upcomingVehicleStops(timedVehicleStops({...vehicle,routeStops:undefined}),undefined);
    }
    return upcomingVehicleStops(timedVehicleStops(vehicle),undefined,vehicle.lastStopId);
  }
  if(vehicle.provider==='mpk_rzeszow'||vehicle.provider==='marcel') {
    return remainingGpsBusStops(routeGeometry?.length?{...vehicle,routeGeometry}:vehicle,orderedVehicleStops(timedVehicleStops(vehicle)),nowMs);
  }
  return upcomingVehicleStops(timedVehicleStops(vehicle),nowMs,vehicle.lastStopId);
}

/** Join the remaining calls by physical platform and timetable time when the
 * published GTFS trip and the live vehicle use different course IDs. */
export function stopDeparturesWithLiveVehicles(rows:Departure[],vehicles:Vehicle[],stop?:Stop,now=Date.now()):Departure[]{
  const applyVehicleDelay=(row:Departure)=>departureFromLiveVehicle(row,vehicles,now);
  if(!stop)return rows.map(applyVehicleDelay);
  const ids=new Set((stop.pksStopPoints||[]).map(point=>point.id));
  for(const id of (stop.providerStopIds?.pks||'').split(','))if(id.trim())ids.add(id.trim());
  if(!ids.size)return rows.map(applyVehicleDelay);
  const terminal=stop.areaId==='1937'||stop.pksStopPoints?.some(point=>point.areaId==='1937')||rzeszowTerminalPlatform(stop.name,stop.code)!==null;
  const calls=new Map<string,{row:Departure;courseIds:string[];boardingKnown:boolean}>();
  for(const vehicle of vehicles){
    const observed=transitTimestamp(vehicle.lastSignalTime);
    if(vehicle.provider!=='pks'||vehicle.status!=='active'||vehicle.isHistorical||!vehicle.routeShortName||
      vehicle.routeShortName==='?'||vehicle.journeyUpdate?.status==='canceled'||!Number.isFinite(observed)||
      observed>now+5000||now-observed>120_000)continue;
    for(const call of vehicle.liveNextStops??vehicle.schedule??[]){
      const stopId=String(call.id);
      if(call.isPast||call.timeType==='arrival'||!ids.has(stopId)||vehicle.journeyUpdate?.stops?.some(update=>update.stopId===stopId&&update.skipped))continue;
      const row=vehicleStopDeparture(vehicle,call),time=row.realAtMs??row.plannedAtMs;
      if(time==null)continue;
      const id=`live:${vehicle.id}:${row.plannedAtMs??time}`;
      calls.set(id,{row:{...row,id,vehicleId:vehicle.id,
        carrier:{id:'pks',name:'PKS Rzeszów',colorClass:''},type:'departure',realtimeObservedAtMs:observed},
        courseIds:[vehicle.journeyId,vehicle.tripId].filter(id=>id!=null).map(String),boardingKnown:call.timeType==='departure'});
    }
  }
  const candidates=[...calls.values()];
  const matches=rows.map(row=>{
    if(row.carrier?.id!=='pks'||row.plannedAtMs==null)return [];
    return candidates.filter(call=>{
      if(call.row.line!==row.line||call.row.plannedAtMs!==row.plannedAtMs||row.vehicleId&&row.vehicleId!==call.row.vehicleId)return false;
      if(row.courseId&&call.courseIds.includes(row.courseId))return true;
      return (!terminal||call.boardingKnown)&&(!row.courseId||row.courseId.startsWith('gtfs:'));
    });
  });
  const listed=new Map<string,number>();
  for(const match of matches)for(const call of match)listed.set(call.row.id,(listed.get(call.row.id)??0)+1);
  const departures=rows.map((row,index)=>{
    const [call]=matches[index];
    if(matches[index].length!==1||listed.get(call.row.id)!==1||!call.row.realtimeSource)return applyVehicleDelay(row);
    const {realAtMs,time,delayMins,status,realtimeSource,realtimeObservedAtMs}=call.row;
    return {...row,realAtMs,time,delayMins,status,realtimeSource,realtimeObservedAtMs};
  });
  // At Rzeszów D.A. the live feed uses a technical arrival point for many
  // terminating courses. Only the physical platform timetable can add rows.
  if(!terminal)for(const {row} of candidates){
    const time=row.realAtMs??row.plannedAtMs!;
    if(!listed.has(row.id)&&time>=now&&time<=now+3*3600_000)departures.push(row);
  }
  return departures;
}
