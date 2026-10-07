import {loadMarcelStopDepartures} from './providers/marcel-departures';
import type { Stop, Departure, DepartureResult } from '@/Panel/src/types';
import { fetchDeparturesClient,fetchMpkRzeszowDeparturesClient } from '@/lib/pks-client';
import { stopTimetableStore,limitTimetableRequest,type DepartureSource } from '@/lib/stop-timetable-store';
import { selectedDateIso,splitCsvValues,mapJourneyToDeparture,departureFromMpkSchedule } from '@/components/stops-panel/stop-domain';
export async function loadStopDepartures (stop: Stop, dayIndex = 0,partial?: (result:DepartureResult)=>void) {
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
      sources.push({key:JSON.stringify(['marcel',stop.id,stop.providerStopIds,dateIso]),label:'Marcel',load:partial=>loadMarcelStopDepartures(stop,dateIso,dayIndex===0,partial)});
    }
    return stopTimetableStore.load(sources,partial);
}
