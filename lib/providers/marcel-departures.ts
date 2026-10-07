import type {Departure,Stop} from '@/Panel/src/types';
import {fetchMarcelRoutesClient,fetchMarcelCoursesClient,fetchMarcelPublicCourseStopsClient,fetchMarcelLivePositionsClient,estimateMarcelCourseDelay} from '../pks-client';
import {limitTimetableRequest} from '../stop-timetable-store';
import {warsawTimeMs} from '../transit-time';
import {splitCsvValues,mergeCsvValues,stopPreciseNameKey,marcelCourseStopIndexKey,marcelCourseStopMatchKey,departureFromMarcelCourseStop} from '@/components/stops-panel/stop-domain';

/** Prioritize useful departures; preserve successful courses when another request fails. */
export async function loadMarcelStopDepartures(stop:Stop,date:string,today:boolean,partial?:(data:{departures:Departure[];warning?:string})=>void){
  const routeIds=splitCsvValues(stop.providerStopIds?.marcelRouteIds);
  const matchKeys=splitCsvValues(mergeCsvValues(stop.providerStopIds?.marcelMatchKeys,stop.providerStopIds?.marcelMatchKey));
  const names=new Set(matchKeys.length?matchKeys:[stopPreciseNameKey(stop.name)]);
  const cities=new Set(splitCsvValues(stop.providerStopIds?.marcelCityMatchKeys));
  const positions= today ? limitTimetableRequest(fetchMarcelLivePositionsClient).catch(()=>[]) : Promise.resolve([]);
  const routes=routeIds.length?routeIds:(await limitTimetableRequest(fetchMarcelRoutesClient)).map(route=>String(route.idTr));
  const rows:Departure[]=[];let failed=0,successful=0;
  const courses=await Promise.allSettled(routes.map(route=>limitTimetableRequest(()=>fetchMarcelCoursesClient(route,date))));
  const ordered=courses.flatMap(result=>{if(result.status==='rejected'){failed++;return [];}return result.value;});
  const now=today?Date.now():warsawTimeMs(date,'00:00');
  const priority=(course:typeof ordered[number])=>{
    const time=warsawTimeMs(date,course.godz||course.godzPr||'');
    if(!Number.isFinite(time))return Number.MAX_SAFE_INTEGER;
    // A course already underway can still reach this stop; do not discard it.
    return time>=now-3*3600_000?Math.abs(time-now):24*3600_000+Math.abs(time-now);
  };
  ordered.sort((a,b)=>priority(a)-priority(b));
  await Promise.all(ordered.map(course=>limitTimetableRequest(()=>fetchMarcelPublicCourseStopsClient(course.idKu)).then(async points=>{
    successful++;
    const delay=estimateMarcelCourseDelay(course.idKu,points,date,await positions);
    points.forEach((point,index)=>{
      if(index>=points.length-1)return;
      const matches=cities.size?cities.has(marcelCourseStopIndexKey(point)):names.has(marcelCourseStopMatchKey(point));
      const row=matches?departureFromMarcelCourseStop(course,point,date,index,delay):null;
      if(row)rows.push(row);
    });
    if(rows.length)partial?.({departures:[...rows]});
  }).catch(()=>{failed++;})));
  if(failed&&!successful)throw new Error('Marcel: nie udało się pobrać rozkładu.');
  return {departures:rows,warning:failed?'Marcel: pokazano dostępne odjazdy; część kursów jest niedostępna.':undefined};
}
