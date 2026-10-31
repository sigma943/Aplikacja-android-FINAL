import type {Vehicle,StopSchedule} from './transport/vehicle';
import {readBusCoordinates} from './bus-coordinates';
import {transitTimestamp} from './bus-operating-state';
import {distanceMeters} from './transport/vehicle-speed';
import {prepareBusRouteProgress,routeConfirmedPassedStop,type BusRouteProgress} from './bus-route-progress';

type Point = [number,number];
type Visit = {index:number;point:Point;nextDistance?:number};
type Progress = {course:string;passed:number;signal:number;point?:Point;visit?:Visit;reliable?:boolean;route?:Point[];routeKey?:string;stopPointsKey?:string;model?:BusRouteProgress;modelSignal?:number};
const point = (value:{lat?:number;lon?:number}):Point|undefined => {
  const position=readBusCoordinates(value.lat,value.lon);
  return position ? [position.lat,position.lon] : undefined;
};

/** A clock/ETA is never passage evidence. Use an unambiguous supplied route or
 * observe a stop visit; stale, ambiguous or jumping GPS keeps the stop visible. */
export function createBusStopPassageTracker() {
  const progress=new Map<string,Progress>();
  return (vehicle:Vehicle,stops:StopSchedule[],nowMs:number):StopSchedule[] => {
    const key=`${vehicle.provider}:${vehicle.id}`;
    const course=JSON.stringify([vehicle.tripId,vehicle.journeyId,stops.map(stop=>[stop.id,stop.planned])]);
    let state=progress.get(key);
    if(!state||state.course!==course) {
      state={course,passed:-1,signal:-Infinity};
      if(progress.size>=256)progress.delete(progress.keys().next().value!);
      progress.set(key,state);
    }
    // myBus flags come from the provider's remaining sequence. Marcel's flags
    // are derived from ETAs and must not be mistaken for confirmed passage.
    if(vehicle.provider==='mpk_rzeszow'&&vehicle.scheduleSource==='mybus') {
      stops.forEach((stop,index)=>{if(stop.isPast)state!.passed=Math.max(state!.passed,index);});
    }
    if(vehicle.lastStopId!=null) {
      const index=stops.findIndex(stop=>String(stop.id)===String(vehicle.lastStopId));
      state.passed=Math.max(state.passed,index);
    }
    const position=point(vehicle),signal=vehicle.positionObservedAtMs??transitTimestamp(vehicle.lastSignalTime);
    const fresh=Number.isFinite(signal)&&nowMs-signal<=120_000&&signal<=nowMs+5_000&&
      (vehicle.dataAgeSec??0)<=120&&!vehicle.isHistorical&&vehicle.positionQuality!=='estimated'&&(!vehicle.status||vehicle.status==='active');
    if(!fresh||!position){state.visit=undefined;state.reliable=false;}
    else if(signal>state.signal) {
      const elapsed=(signal-state.signal)/1000;
      const jump=state.point&&distanceMeters(position,state.point)/elapsed>140/3.6;
      state.reliable=!jump;
      if(jump||elapsed>120)state.visit=undefined;
      if(!jump) {
        const visit=state.visit;
        if(visit&&visit.index>state.passed) {
          const stopPoint=point(stops[visit.index]);
          const nextPoint=stops[visit.index+1]&&point(stops[visit.index+1]);
          const movingOn=!nextPoint||(visit.nextDistance!=null&&distanceMeters(position,nextPoint)<visit.nextDistance-40);
          if(stopPoint&&distanceMeters(position,stopPoint)>=100&&distanceMeters(position,visit.point)>=60&&movingOn) {
            state.passed=visit.index;
            state.visit=undefined;
          }
        }
        const near=stops.flatMap((stop,index)=>{
          const p=point(stop);
          return index>state!.passed&&p&&distanceMeters(position,p)<=60 ? [index] : [];
        });
        // Repeated/co-located stops on a loop cannot identify a visit alone.
        if(near.length===1) {
          const index=near[0],nextPoint=stops[index+1]&&point(stops[index+1]);
          state.visit={index,point:position,nextDistance:nextPoint?distanceMeters(position,nextPoint):undefined};
        }
      }
      state.signal=signal;
      state.point=position;
    }
    // Map geometry may arrive after the panel has consumed this same GPS fix.
    // Retain its course-scoped model for the panel, but never bypass jump checks.
    if(fresh&&position&&state.reliable&&signal===state.signal&&state.point&&distanceMeters(position,state.point)<1){
      const stopPointsKey=JSON.stringify(stops.map(stop=>[stop.lat,stop.lon]));
      if(state.stopPointsKey!==stopPointsKey){state.model=undefined;state.routeKey=undefined;state.modelSignal=undefined;}
      if(vehicle.routeGeometry?.length&&(!state.routeKey||state.route!==vehicle.routeGeometry||state.stopPointsKey!==stopPointsKey)){
        const routeKey=JSON.stringify([vehicle.routeGeometry,stopPointsKey]);
        if(state.routeKey!==routeKey){state.model=prepareBusRouteProgress(vehicle.routeGeometry,stops);state.routeKey=routeKey;state.modelSignal=undefined;}
        state.route=vehicle.routeGeometry;
      }
      state.stopPointsKey=stopPointsKey;
      if(state.model&&state.modelSignal!==signal){
        state.passed=Math.max(state.passed,routeConfirmedPassedStop(state.model,position,state.passed));
        state.modelSignal=signal;
      }
    }
    return stops.slice(state.passed+1).map(stop=>({...stop,isPast:false}));
  };
}

export const remainingGpsBusStops=createBusStopPassageTracker();
