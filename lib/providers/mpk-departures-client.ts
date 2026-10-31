import {sharedInflight} from '../shared-inflight';
import mpkStopSnapshot from '../../public/data/mpk-stop-points.json';
import {isMpkPassengerLine} from '../mpk-passenger-lines';


import {warsawDateIso, warsawTimeMs} from '../transit-time';
import {withRequestDeadline} from '../request-deadline';
import {mpkBoardEntries, mpkServicesOnDate, type MpkCalendar} from '../mpk-departures';

import {type MpkRzeszowStop, type MpkRzeszowScheduleEntry} from '../transport/types';
import {MPK_RZESZOW_STOPS_URL, MPK_RZESZOW_STOP_SCHEDULE_URL} from '../transport/endpoints';
import {requestText,requestJson} from '../transport/http';
import {CLIENT_STOP_CACHE_TTL_MS, readPersistentClientCache, writePersistentClientCache} from '../transport/cache';

const MPK_STOPS_CACHE_KEY = 'pks-live:mpk-rzeszow-stops:v4';

const MPK_STOPS_UPDATED_EVENT = 'pks-live:mpk-stops-updated';
function validMpkStops(value: unknown): value is MpkRzeszowStop[] {
  return Array.isArray(value) && value.length > 0 && value.every(stop => stop &&
    (typeof stop.stop_id === 'string' || typeof stop.stop_id === 'number') && typeof stop.stop_name === 'string' && stop.stop_name.trim());
}
const fetchMpkRzeszowStopsFromNetwork=sharedInflight(async (signal)=>{
  const rows = await requestJson<unknown>(MPK_RZESZOW_STOPS_URL, {signal,headers:{Accept:'application/json'}});
  if (!validMpkStops(rows)) throw new Error('Empty or invalid MPK stop catalog');
  writePersistentClientCache(MPK_STOPS_CACHE_KEY,rows);
  return rows;
});
let mpkBackgroundRefresh:Promise<void>|undefined;
function notifyMpkStopsUpdated() {
  if(typeof window!=='undefined')window.dispatchEvent(new Event(MPK_STOPS_UPDATED_EVENT));
}
export async function fetchMpkRzeszowStopsClient(options?: { signal?: AbortSignal; forceRefresh?: boolean }) {
  const stored = readPersistentClientCache<MpkRzeszowStop[]>(MPK_STOPS_CACHE_KEY);
  const cached = stored && validMpkStops(stored.data) ? stored : null;
  const isFresh = cached && Date.now()-cached.savedAt < CLIENT_STOP_CACHE_TTL_MS;
  if(cached && !options?.forceRefresh) {
    if(!isFresh&&!mpkBackgroundRefresh)mpkBackgroundRefresh=fetchMpkRzeszowStopsFromNetwork().then(notifyMpkStopsUpdated).catch(()=>undefined).finally(()=>{mpkBackgroundRefresh=undefined;});
    return cached.data;
  }
  try {
    const fresh = await fetchMpkRzeszowStopsFromNetwork(options?.signal);
    // The caller publishes this result; notify only background cache refreshes.
    return fresh;
  } catch(error) {
    if(options?.signal?.aborted)throw error;
    if(cached)return cached.data;
    // Keep provider identities and passenger lines when the public endpoint is unavailable.
    if(!validMpkStops(mpkStopSnapshot.stops))throw error;
    // Do not cache the bundled fallback as a fresh API response: retry the live endpoint later.
    return mpkStopSnapshot.stops;
  }
}

let mpkCalendarPromise: Promise<MpkCalendar> | undefined;

const mpkServicesCache = new Map<string, Promise<string[]>>();

async function mpkServiceIdsForDate(dateIso: string) {
  if (mpkServicesCache.has(dateIso)) return mpkServicesCache.get(dateIso)!;
  const promise = (async () => {
    if (dateIso === warsawDateIso()) {
      const live = await requestJson<{ service_ids?: Array<string | number>; date_used?: string }>('https://www.mpkrzeszow.pl/get_current_service.php').catch(() => null);
      if (live?.date_used === dateIso.replace(/-/g, '') && live.service_ids?.length) return live.service_ids.map(String);
    }
    mpkCalendarPromise ??= withRequestDeadline(async (signal) => {
      const response = await fetch('/data/mpk-service-calendar.json', { signal });
      if (!response.ok) throw new Error('MPK calendar HTTP ' + response.status);
      return response.json() as Promise<MpkCalendar>;
    }).catch((error) => {
      mpkCalendarPromise = undefined;
      throw error;
    });
    const ids = mpkServicesOnDate(await mpkCalendarPromise, dateIso);
    if (!ids.length) throw new Error(`Brak aktualnego kalendarza MPK dla ${dateIso}. Zaktualizuj kalendarz GTFS.`);
    return ids;
  })().catch((error) => { mpkServicesCache.delete(dateIso); throw error; });
  mpkServicesCache.set(dateIso, promise);
  if (mpkServicesCache.size > 14) mpkServicesCache.delete(mpkServicesCache.keys().next().value!);
  return promise;
}

// A failing SIP server affects every stop. Back off globally instead of issuing
// the same failing request on each refresh, while continuing normal schedules.
const realtimeBackoff=new Map<string,number>();
const realtimeSources=[
  (id:string)=>`http://84.38.160.220/myBusServices/SchedulesService.svc/GetTimeTableReal?${new URLSearchParams({nBusStopId:id})}`,
  (id:string)=>`https://einfo.erzeszow.pl/Home/GetNextDepartues?${new URLSearchParams({busStopId:id})}`,
];
async function fetchRealtimeBoard(sipId:string,signal?:AbortSignal){
  const {parseMybusDepartures}=await import('../mpk-mybus-departures');
  let lastError:unknown;
  for(const source of realtimeSources){
    signal?.throwIfAborted();
    const key=source('');
    if((realtimeBackoff.get(key)||0)>Date.now())continue;
    try{
      const xml=await withRequestDeadline(activeSignal=>requestText(source(sipId),{signal:activeSignal}),signal,3000);
      const rows=parseMybusDepartures(xml,sipId,Date.now());
      realtimeBackoff.delete(key);return rows;
    }catch(error){
      if(signal?.aborted)throw new DOMException('Request aborted','AbortError');
      const {isAppVisible}=await import('../app-activity');
      if(!isAppVisible())throw error;
      lastError=error;realtimeBackoff.set(key,Date.now()+60_000);
    }
  }
  throw lastError||new Error('MPK: źródła prognoz chwilowo niedostępne; ponowna próba za minutę.');
}

export async function fetchMpkRzeszowDeparturesClient(
  stopId: string,
  dateIso: string,
  options?: { signal?: AbortSignal },
) {
  const boardPromise = dateIso === warsawDateIso()
    ? requestJson<unknown>(`https://www.mpkrzeszow.pl/przystanki/departures.php?${new URLSearchParams({ stopId, hide_last_stop: '1' })}`, { signal: options?.signal }).then(payload => mpkBoardEntries(payload))
    : Promise.resolve([]);
  const schedulePromise = (async () => {
    const serviceIds = await mpkServiceIdsForDate(dateIso);
    const data = await requestJson<{ schedule?: Record<string, MpkRzeszowScheduleEntry[]> }>(
      `${MPK_RZESZOW_STOP_SCHEDULE_URL}?${new URLSearchParams({ stop_id: String(stopId), service_id: serviceIds.join(',') })}`,
      { signal: options?.signal, headers: { Accept: 'application/json' } },
    );
    if (!data.schedule || typeof data.schedule !== 'object') throw new Error('Invalid MPK schedule response');
    return Object.values(data.schedule).flat().filter((entry) => !entry.is_last_stop && isMpkPassengerLine(entry.line));
  })();
  const [board, schedule] = await Promise.allSettled([boardPromise, schedulePromise]);
  if (options?.signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
  if (schedule.status === 'rejected' && dateIso !== warsawDateIso()) throw schedule.reason;
  const entries = new Map<string, MpkRzeszowScheduleEntry>();
  // Board HH:mm and GTFS HH:mm:ss must identify the same departure.
  const key = (entry: MpkRzeszowScheduleEntry) => `${entry.trip_id ?? `${entry.line}:${entry.trip_headsign}`}:${Math.floor(warsawTimeMs(dateIso, entry.departure_time) / 60_000)}`;
  if (schedule.status === 'fulfilled') schedule.value.forEach((entry) => entries.set(key(entry), entry));
  if (board.status === 'fulfilled') board.value.forEach((entry) => entries.set(key(entry), entry));
  let values = [...entries.values()];
  let realtimeUnavailable = false;
  const nearby=values.some(entry=>{const at=warsawTimeMs(dateIso,entry.departure_time);return Number.isFinite(at)&&at>=Date.now()-120_000&&at<=Date.now()+60*60_000;});
  if (dateIso === warsawDateIso() && !values.some(entry => entry.real_departure_time) && (nearby||!values.length||board.status==='rejected')) {
    try {
      const {mybusStopCatalogue} = await import('../mpk-mybus-stop-catalogue');
      const matches = Object.entries(mybusStopCatalogue).filter(([,entry]) => String(entry[0]) === stopId);
      if (matches.length !== 1) throw new Error('MPK stop has no unique SIP identity');
      const sipId = matches[0][0];
      const board=await fetchRealtimeBoard(sipId,options?.signal);
      const {mergeMybusDepartures}=await import('../mpk-mybus-departures');
      const observedAt=Date.now();
      values=mergeMybusDepartures(values,board,dateIso,observedAt);
    } catch (error) {
      if (options?.signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
      realtimeUnavailable = true;
    }
  }
  const result = values as MpkRzeszowScheduleEntry[] & { warning?: string };
  if(schedule.status==='rejected' || board.status==='rejected') result.warning = 'MPK: nie wszystkie dane są dostępne; pokazano dostępny rozkład.';
  if(realtimeUnavailable && schedule.status === 'rejected' && board.status === 'rejected') throw schedule.reason;
  // Forecasts are normally unavailable for courses hours away. Do not label
  // a healthy distant timetable as a live-data failure.
  if(realtimeUnavailable&&nearby) result.warning = 'MPK: prognozy na żywo są niedostępne; pokazano dostępny rozkład.';
  return result;
}

export {MPK_STOPS_CACHE_KEY};
export {fetchMpkRzeszowStopsFromNetwork};
export {mpkCalendarPromise};
export {mpkServicesCache};
export {mpkServiceIdsForDate};
