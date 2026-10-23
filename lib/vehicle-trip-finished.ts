import type {Vehicle} from './transport/vehicle';
import {transitTimestamp} from './bus-operating-state';
import {roadDistance} from './bus-road-geometry';

/** A future timetable belongs to the next course; do not hide its stop list. */
export function vehicleTripFinished(vehicle:Vehicle|null,now:number){
 if(!vehicle||vehicle.type==='train'||vehicle.provider==='pkp_intercity'||(vehicle.speed??0)>3)return false;
 const calls=vehicle.schedule||[],future=calls.some(s=>transitTimestamp(s.real||s.planned)>now+15000);
 if(future||Number(vehicle.nextTripStartAtMs)>now)return false;
 if(vehicle.status==='break')return true;
 const route=vehicle.routeStops?.length?vehicle.routeStops:calls,last=route.at(-1);
 if(!last)return false;
 const end=transitTimestamp(last.real||last.planned);
 const passed=last.isPast||Number.isFinite(end)&&end<=now;
 const atEnd=Number.isFinite(last.lat)&&Number.isFinite(last.lon)&&roadDistance([vehicle.lat,vehicle.lon],[last.lat!,last.lon!])<=150;
 return Boolean(passed&&(atEnd||String(vehicle.lastStopId)===String(last.id)));
}
