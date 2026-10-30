import {transitTimestamp} from './bus-operating-state';
import {warsawDateIso,warsawTimeMs} from './transit-time';
import {readBusCoordinates} from './bus-coordinates';
import {distanceMeters} from './transport/vehicle-speed';

const id=(v:any)=>String(v?.vehicle_id??v?.id??'');
const signal=(v:any)=>transitTimestamp(v?.position?.position_date??v?.position?.timestamp??v?.lastUpdate??v?.updatedAt);
const start=(v:any)=>v?.journey?.departure_time?warsawTimeMs(v.journey.vehicle_journey_date||warsawDateIso(0,new Date(signal(v))),v.journey.departure_time):NaN;
const location=(v:any)=>readBusCoordinates(v?.position?.lat,v?.position?.long??v?.position?.lon);
function underway(v:any,at:number){
 const sequence=Number(v?.position?.last_stop_point_number);
 const path=v?.journey?.route?.stop_points,links=v?.journey?.route?.route_links;
 const count=Array.isArray(path)&&path.length>1?path.length:Array.isArray(links)?links.length+1:0;
 if(!Number.isInteger(sequence)||count<2||!Number.isFinite(start(v))||start(v)>at+15_000||sequence<1||sequence>=count||v?.journey?.route?.is_technical)return false;
 return Array.isArray(v.next_stop_points)&&v.next_stop_points.some((s:any)=>{
  const time=transitTimestamp(s.real_departure_time??s.real??s.planned_departure_time??s.planned);
  return Number.isFinite(time)&&time>=at-120_000;
 });
}
/** Both HTTP requests already run. Retain their latest completed snapshots so
 * the fastest source cannot replace a proven current journey with a future one.
 * No extra requests or wait for the slower source are introduced. */
export function createPksSnapshotSelection(){
 const snapshots=new Map<string,{version:number;at:number;rows:any[]}>();
 return {
  remember(source:string,rows:any[],version:number,now:number){
   if(Array.isArray(rows)&&rows.length&&(snapshots.get(source)?.version??-1)<=version)snapshots.set(source,{version,at:now,rows});
  },
  select(primary:any[],now:number){
   const alternatives=new Map<string,any[]>();
   for(const snapshot of snapshots.values()){
    if(now-snapshot.at>30_000)continue;
    for(const v of snapshot.rows){const key=id(v);if(key)alternatives.set(key,[...(alternatives.get(key)||[]),v]);}
   }
   return primary.map(v=>{
    const at=signal(v),p=location(v);
    if(!p||!Number.isFinite(at)||now-at>120_000||at>now+5000||!(start(v)>at+120_000))return v;
    const current=(alternatives.get(id(v))||[]).filter(other=>{
     const otherAt=signal(other),q=location(other),difference=Math.abs(at-otherAt);
     return q&&Number.isFinite(otherAt)&&now-otherAt<=120_000&&otherAt<=now+5000&&difference<=30_000&&
      distanceMeters([p.lat,p.lon],[q.lat,q.lon])<=Math.min(1200,150+difference/1000*140/3.6)&&underway(other,otherAt);
    }).sort((a,b)=>signal(b)-signal(a));
    return current[0]||v;
   });
  },
 };
}
