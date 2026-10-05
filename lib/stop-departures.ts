import type { Stop, Departure } from '@/Panel/src/types';
import { fetchDeparturesClient,fetchMpkRzeszowDeparturesClient,fetchMarcelRoutesClient,fetchMarcelCoursesClient,fetchMarcelPublicCourseStopsClient } from '@/lib/pks-client';
import { stopTimetableStore,limitTimetableRequest,type DepartureSource } from '@/lib/stop-timetable-store';
import { selectedDateIso,splitCsvValues,mapJourneyToDeparture,departureFromMpkSchedule,mergeCsvValues,stopPreciseNameKey,marcelCourseStopIndexKey,marcelCourseStopMatchKey,departureFromMarcelCourseStop } from '@/components/stops-panel/stop-domain';
export async function loadStopDepartures (stop: Stop, dayIndex = 0) {
    const dateIso = selectedDateIso(dayIndex);
    const sources: DepartureSource[] = [];
    if (stop.sourceProviderIds?.includes('pks') || !stop.sourceProviderIds?.length) {
      const points = stop.pksStopPoints?.length ? stop.pksStopPoints : [{id:stop.id,areaId:stop.areaId,code:stop.code}];
      for(const point of points) sources.push({
        key:JSON.stringify(['pks',point,dateIso]),label:'PKS',load:async()=> {
          const response = await limitTimetableRequest(()=>fetchDeparturesClient(point.id,point.areaId,point.code,dateIso));
          return {departures: response.journeys.map((row: any,index: number)=>mapJourneyToDeparture(row,index)).filter((row: Departure|null): row is Departure=>Boolean(row)),warning:response.warning};
        },
      });
    }
    for(const id of splitCsvValues(stop.providerStopIds?.mpk_rzeszow)) sources.push({
      key:JSON.stringify(['mpk',id,dateIso]),label:'MPK',load:async()=> {
        const rows = await limitTimetableRequest(()=>fetchMpkRzeszowDeparturesClient(id,dateIso));
        return {warning:rows.warning,departures:rows.map((row,index)=>departureFromMpkSchedule(row as unknown as Record<string,unknown>,dateIso,index)).filter((row): row is Departure=>Boolean(row))};
      },
    });
    if (stop.sourceProviderIds?.includes('marcel')) {
      const routeIds = splitCsvValues(stop.providerStopIds?.marcelRouteIds);
      const matchKeys = splitCsvValues(mergeCsvValues(stop.providerStopIds?.marcelMatchKeys,stop.providerStopIds?.marcelMatchKey));
      const names = new Set(matchKeys.length ? matchKeys : [stopPreciseNameKey(stop.name)]);
      const cities = new Set(splitCsvValues(stop.providerStopIds?.marcelCityMatchKeys));
      sources.push({key:JSON.stringify(['marcel',routeIds,[...names],[...cities],dateIso]),label:'Marcel',load:async()=> {
        const routes = routeIds.length ? routeIds : (await limitTimetableRequest(()=>fetchMarcelRoutesClient())).map(route=>String(route.idTr));
        const results = await Promise.allSettled(routes.map(async routeId => {
          const courses = await limitTimetableRequest(()=>fetchMarcelCoursesClient(routeId,dateIso));
          const results = await Promise.allSettled(courses.map(async course => {
            const stops = await limitTimetableRequest(()=>fetchMarcelPublicCourseStopsClient(course.idKu));
            return stops.flatMap((point,index)=> {
              const matches = cities.size ? cities.has(marcelCourseStopIndexKey(point)) : names.has(marcelCourseStopMatchKey(point));
              const row = matches && index<stops.length-1 ? departureFromMarcelCourseStop(course,point,dateIso,index) : null;
              return row ? [row] : [];
            });
          }));
          if(results.some(r=>r.status==='rejected')) throw new Error('Niepełny rozkład Marcel');
          return results.flatMap(r=>r.status==='fulfilled'?r.value:[]);
        }));
        if(results.some(r=>r.status==='rejected')) throw new Error('Niepełny rozkład Marcel');
        return {departures:results.flatMap(r=>r.status==='fulfilled'?r.value:[])};
      }});
    }
    return stopTimetableStore.load(sources);
}
