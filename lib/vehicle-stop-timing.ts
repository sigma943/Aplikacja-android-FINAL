import type {Departure,Stop} from '@/Panel/src/types';
import type {Vehicle,StopSchedule} from '@/components/BusMap';
import {transitTimestamp} from './bus-operating-state';
import {warsawClock,warsawDateIso} from './transit-time';
import {busDelayMinutes} from './bus-punctuality';
import {marcelDepartureFromVehicle} from './marcel-stop-punctuality';
import {upcomingVehicleStops,orderedVehicleStops} from './vehicle-upcoming-stops';
import {remainingGpsBusStops} from './bus-stop-passage';

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

export function departureFromLiveVehicle(departure:Departure,vehicles:Vehicle[]):Departure {
  if(departure.carrier?.id==='marcel')return marcelDepartureFromVehicle(departure,vehicles);
  if(departure.carrier?.id!=='pks'||departure.plannedAtMs==null)return departure;
  const candidates=vehicles.filter(vehicle=>{
    if(vehicle.provider!=='pks'||vehicle.isHistorical||!Number.isFinite(vehicle.delay)||Math.abs(vehicle.delay!)>18_000||
      (vehicle.dataAgeSec??0)>120||(vehicle.status&&vehicle.status!=='active')||vehicle.routeShortName!==departure.line)return false;
    const signal=transitTimestamp(vehicle.lastSignalTime);
    if(warsawDateIso(0,new Date(departure.plannedAtMs!))!==warsawDateIso(0,new Date(Number.isFinite(signal)?signal:Date.now())))return false;
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

/** Use only explicitly reported upcoming PKS calls when a board has no row. */
export function stopDeparturesWithLiveVehicles(rows:Departure[],vehicles:Vehicle[],stop?:Stop,now=Date.now()):Departure[]{
  const departures=rows.map(row=>departureFromLiveVehicle(row,vehicles));
  if(!stop)return departures;
  const ids=new Set((stop.pksStopPoints||[]).map(point=>point.id));
  for(const id of (stop.providerStopIds?.pks||'').split(','))if(id.trim())ids.add(id.trim());
  if(!ids.size)return departures;
  const added=new Set<string>();
  for(const vehicle of vehicles){
    const observed=transitTimestamp(vehicle.lastSignalTime);
    if(vehicle.provider!=='pks'||vehicle.status!=='active'||vehicle.isHistorical||!vehicle.routeShortName||
      vehicle.routeShortName==='?'||vehicle.journeyUpdate?.status==='canceled'||!Number.isFinite(observed)||
      observed>now+5000||now-observed>120_000)continue;
    for(const call of vehicle.liveNextStops||[]){
      const stopId=String(call.id);
      if(call.isPast||!ids.has(stopId)||vehicle.journeyUpdate?.stops?.some(update=>update.stopId===stopId&&update.skipped))continue;
      const row=vehicleStopDeparture(vehicle,call),time=row.realAtMs??row.plannedAtMs;
      if(time==null||time<now||time>now+3*3600_000)continue;
      const alreadyListed=rows.some(existing=>{
        if(existing.carrier?.id!=='pks'||existing.line!==row.line)return false;
        const planned=existing.plannedAtMs??existing.realAtMs,expected=row.plannedAtMs??time;
        return planned!=null&&Math.abs(planned-expected)<=60_000;
      });
      const id=`live:${vehicle.id}:${row.plannedAtMs??time}`;
      if(alreadyListed||added.has(id))continue;
      added.add(id);
      departures.push({...row,id,vehicleId:vehicle.id,
        carrier:{id:'pks',name:'PKS Rzeszów',colorClass:''},type:'departure',realtimeSource:'vehicle-feed',realtimeObservedAtMs:observed});
    }
  }
  return departures;
}
