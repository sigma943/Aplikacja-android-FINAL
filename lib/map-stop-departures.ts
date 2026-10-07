import type {Departure} from '@/Panel/src/types';
import type {Vehicle} from '@/components/BusMap';
import type {MapStopDeparture} from '@/components/MapStopSheet';
import {departureFromLiveVehicle} from './vehicle-stop-timing';
import {departureCountdown,departureIsPast} from './departure-display';
import {warsawDateIso} from './transit-time';
export function mapStopDepartureRows(rows:Departure[],vehicles:Vehicle[],now:number):MapStopDeparture[]{
  const unique=new Map<string,Departure>();
  rows.forEach(row=>unique.set(`${row.carrier?.id}:${row.id}`,departureFromLiveVehicle(row,vehicles)));
  return [...unique.values()].filter(row=>{
    const time=row.realAtMs??row.plannedAtMs;
    return Number.isFinite(time)&&!departureIsPast(row,now,time!)&&!/(zjazd|zajezd|technicz|serwis|warsztat|deadhead)/i.test(`${row.line} ${row.direction}`);
  }).sort((a,b)=>(a.realAtMs??a.plannedAtMs??0)-(b.realAtMs??b.plannedAtMs??0)).slice(0,40).map(row=>{
    const time=row.realAtMs??row.plannedAtMs!;
    const today=warsawDateIso(0,new Date(time))===warsawDateIso(0,new Date(now));
    return {id:`${row.carrier?.id}:${row.id}`,line:row.line,direction:row.direction,
      color:row.carrier?.id==='mpk'?'#ff7a00':row.carrier?.id==='marcel'?'#68c44a':'#14b8a6',
      time:today?departureCountdown(row,now):row.time,
      day:today?'':new Date(time).toLocaleDateString('pl-PL',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/Warsaw'}),delayMinutes:row.delayMins??0};
  });
}
