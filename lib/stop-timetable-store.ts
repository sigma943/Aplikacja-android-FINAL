import type { Departure, DepartureResult, Stop } from '@/Panel/src/types';

/** Identity contains only source addresses, never badges, favorites or live vehicles. */
export function stopRequestKey(stop: Stop) {
  const refs = stop.providerStopIds || {};
  return JSON.stringify([stop.id, stop.areaId, stop.code, stop.pksStopPoints,
    stop.sourceProviderIds, Object.keys(refs).sort().filter(k => !k.endsWith('Lines')).map(k => [k,refs[k]])]);
}

let running = 0;
const waiting: Array<() => void> = [];
export async function limitTimetableRequest<T>(load: () => Promise<T>): Promise<T> {
  if (running >= 6) await new Promise<void>(resolve => waiting.push(resolve));
  else running++;
  try { return await load(); }
  finally { const next = waiting.shift(); if(next) next(); else running--; }
}

type SourceData = { departures: Departure[]; warning?: string };
export type DepartureSource = { key: string; label: string; load: () => Promise<SourceData> };
/** Last complete provider responses remain available if only one operator fails. */
export class StopTimetableStore {
  private good = new Map<string, {data: SourceData; at: number}>();
  private pending = new Map<string, Promise<SourceData>>();
  private request(source: DepartureSource) {
    const current = this.pending.get(source.key);
    if (current) return current;
    const request = source.load().then(data => {
      if (!data.warning) {
        this.good.delete(source.key);
        this.good.set(source.key,{data,at:Date.now()});
        if(this.good.size>100) this.good.delete(this.good.keys().next().value!);
      }
      return data;
    }).finally(() => this.pending.delete(source.key));
    this.pending.set(source.key,request);
    return request;
  }
  async load(sources: DepartureSource[]): Promise<DepartureResult> {
    const results = await Promise.allSettled(sources.map(source => this.request(source)));
    const warnings: string[] = [];
    const rows: Departure[] = [];
    let available = 0;
    results.forEach((result,index) => {
      const source = sources[index];
      if (result.status === 'fulfilled') {
        available++;
        rows.push(...result.value.departures);
        if(result.value.warning) warnings.push(result.value.warning);
      } else {
        const cached = this.good.get(source.key);
        if(cached && Date.now()-cached.at < 24*3600_000) {
          available++;
          rows.push(...cached.data.departures.map(row => ({...row,realAtMs:row.plannedAtMs,time:row.plannedAtMs ? new Date(row.plannedAtMs).toLocaleTimeString('pl-PL',{timeZone:'Europe/Warsaw',hour:'2-digit',minute:'2-digit'}) : row.time,delayMins:0,status:'on_time' as const,realtimeSource:undefined})));
          warnings.push(source.label+': zapisany rozkład; odświeżenie nie powiodło się.');
        } else warnings.push(source.label+': nie udało się pobrać odjazdów.');
      }
    });
    if (!available) throw new Error(warnings.join(' ') || 'Brak źródła rozkładu dla tego przystanku.');
    const unique = new Map<string,Departure>();
    rows.forEach(row => unique.set(row.carrier?.id+':'+row.id,row));
    return {departures:[...unique.values()].sort((a,b)=>(a.realAtMs??a.plannedAtMs??0)-(b.realAtMs??b.plannedAtMs??0)),warnings,updatedAt:Date.now()};
  }
}
export const stopTimetableStore = new StopTimetableStore();
