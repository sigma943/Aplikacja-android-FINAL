import type {Departure,Stop} from '@/Panel/src/types';
import {fetchMarcelRoutesClient,fetchMarcelCoursesClient,fetchMarcelPublicCourseStopsClient,fetchMarcelLivePositionsClient,estimateMarcelCourseDelay} from '../pks-client';
import {warsawTimeMs} from '../transit-time';
import {splitCsvValues,mergeCsvValues,stopPreciseNameKey,marcelCourseStopIndexKey,marcelCourseStopMatchKey,departureFromMarcelCourseStop} from '@/components/stops-panel/stop-domain';

/** Prioritize useful departures; preserve successful courses when another request fails. */
export async function loadMarcelStopDepartures(stop:Stop,date:string,today:boolean,partial?:(data:{departures:Departure[];warning?:string})=>void){
  const routeIds=splitCsvValues(stop.providerStopIds?.marcelRouteIds);
  const matchKeys=splitCsvValues(mergeCsvValues(stop.providerStopIds?.marcelMatchKeys,stop.providerStopIds?.marcelMatchKey));
  const names=new Set(matchKeys.length?matchKeys:[stopPreciseNameKey(stop.name)]);
  const cities=new Set(splitCsvValues(stop.providerStopIds?.marcelCityMatchKeys));
  const positions= today ? fetchMarcelLivePositionsClient().catch(()=>[]) : Promise.resolve([]);
  const routes=routeIds.length?routeIds:(await fetchMarcelRoutesClient()).map(route=>String(route.idTr));
  const rows:Departure[]=[];let failed=0,successful=0;
  const courses=await Promise.allSettled(routes.map(route=>fetchMarcelCoursesClient(route,date)));
  const ordered=[...new Map(courses.flatMap(result=>{if(result.status==='rejected'){failed++;return [];}return result.value;}).map(course=>[String(course.idKu),course])).values()];
  const now=today?Date.now():warsawTimeMs(date,'00:00');
  const priority=(course:typeof ordered[number])=>{
    const time=warsawTimeMs(date,course.godz||course.godzPr||'');
    if(!Number.isFinite(time))return Number.MAX_SAFE_INTEGER;
    // A course already underway can still reach this stop; do not discard it.
    return time>=now-3*3600_000?Math.abs(time-now):24*3600_000+Math.abs(time-now);
  };
  ordered.sort((a,b)=>priority(a)-priority(b));
  await Promise.all(ordered.map(course=>fetchMarcelPublicCourseStopsClient(course.idKu).then(async points=>{
    successful++;
    const matchesForCourse: Array<{rowIndex:number;pointIndex:number}> = [];
    points.forEach((point,index)=>{
      if(index>=points.length-1)return;
      const matches=cities.size?cities.has(marcelCourseStopIndexKey(point)):names.has(marcelCourseStopMatchKey(point));
      const row=matches?departureFromMarcelCourseStop(course,point,date,index):null;
      if(row){matchesForCourse.push({rowIndex:rows.length,pointIndex:index});rows.push(row);}
    });
    if(matchesForCourse.length)partial?.({departures:[...rows]});
    const live = await positions;
    const delay = estimateMarcelCourseDelay(course.idKu,points,date,live);
    if (delay !== undefined && matchesForCourse.length) {
      const observedAtMs = live.find(position => position.tripId === String(course.idKu))?.observedAtMs;
      for (const {rowIndex,pointIndex} of matchesForCourse) {
        // Keep confirmed operator predictions ahead of a GPS estimate.
        if (rows[rowIndex].realtimeSource) continue;
        rows[rowIndex] = { ...departureFromMarcelCourseStop(course,points[pointIndex],date,pointIndex,delay)!, realtimeObservedAtMs: observedAtMs };
      }
      partial?.({departures:[...rows]});
    }
  }).catch(()=>{failed++;})));
  if(failed&&!successful)throw new Error('Marcel: nie udało się pobrać rozkładu.');
  return {departures:rows,warning:failed?'Marcel: pokazano dostępne odjazdy; część kursów jest niedostępna.':undefined};
}
