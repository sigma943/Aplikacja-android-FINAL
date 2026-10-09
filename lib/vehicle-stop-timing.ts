import type {Departure} from '@/Panel/src/types';
import type {Vehicle,StopSchedule} from '@/components/BusMap';
import {transitTimestamp} from './bus-operating-state';
import {warsawClock,warsawDateIso} from './transit-time';
import {busDelayMinutes} from './bus-punctuality';
import {marcelDepartureFromVehicle} from './marcel-stop-punctuality';

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
