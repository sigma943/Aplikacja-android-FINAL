

import {warsawDateIso, warsawTimeMs} from '../transit-time';
import {withRequestDeadline} from '../request-deadline';
import {mpkBoardEntries, mpkServicesOnDate, type MpkCalendar} from '../mpk-departures';

import {type MpkRzeszowStop, type MpkRzeszowScheduleEntry} from '../transport/types';
import {MPK_RZESZOW_STOPS_URL, MPK_RZESZOW_STOP_SCHEDULE_URL} from '../transport/endpoints';
import {requestJson} from '../transport/http';
import {CLIENT_STOP_CACHE_TTL_MS, readPersistentClientCache, writePersistentClientCache} from '../transport/cache';

const MPK_STOPS_CACHE_KEY = 'pks-live:mpk-rzeszow-stops:v4';

async function fetchMpkRzeszowStopsFromNetwork(options?: { signal?: AbortSignal }) {
  return requestJson<MpkRzeszowStop[]>(MPK_RZESZOW_STOPS_URL, {
    signal: options?.signal,
    headers: {Accept: 'application/json'},
  });
}

export async function fetchMpkRzeszowStopsClient(options?: { signal?: AbortSignal; forceRefresh?: boolean }) {
  const cached = readPersistentClientCache<MpkRzeszowStop[]>(MPK_STOPS_CACHE_KEY);
  const isFresh = cached && Date.now() - cached.savedAt < CLIENT_STOP_CACHE_TTL_MS;
  if (cached && !options?.forceRefresh) {
    if (!isFresh) {
      fetchMpkRzeszowStopsFromNetwork()
        .then((fresh) => writePersistentClientCache(MPK_STOPS_CACHE_KEY, fresh))
        .catch(() => undefined);
    }
    return cached.data;
  }

  try {
    const fresh = await fetchMpkRzeszowStopsFromNetwork(options);
    writePersistentClientCache(MPK_STOPS_CACHE_KEY, fresh);
    return fresh;
  } catch (error) {
    if (cached) return cached.data;
    throw error;
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
    return Object.values(data.schedule).flat().filter((entry) => !entry.is_last_stop);
  })();
  const [board, schedule] = await Promise.allSettled([boardPromise, schedulePromise]);
  if (options?.signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
  if (schedule.status === 'rejected' && (dateIso !== warsawDateIso() || board.status === 'rejected')) throw schedule.reason;
  const entries = new Map<string, MpkRzeszowScheduleEntry>();
  // Board HH:mm and GTFS HH:mm:ss must identify the same departure.
  const key = (entry: MpkRzeszowScheduleEntry) => `${entry.trip_id ?? `${entry.line}:${entry.trip_headsign}`}:${Math.floor(warsawTimeMs(dateIso, entry.departure_time) / 60_000)}`;
  if (schedule.status === 'fulfilled') schedule.value.forEach((entry) => entries.set(key(entry), entry));
  if (board.status === 'fulfilled') board.value.forEach((entry) => entries.set(key(entry), entry));
  const result = [...entries.values()] as MpkRzeszowScheduleEntry[] & { warning?: string };
  if(schedule.status==='rejected' || board.status==='rejected') result.warning = 'MPK: nie wszystkie dane są dostępne; pokazano dostępny rozkład.';
  return result;
}

export {MPK_STOPS_CACHE_KEY};
export {fetchMpkRzeszowStopsFromNetwork};
export {mpkCalendarPromise};
export {mpkServicesCache};
export {mpkServiceIdsForDate};
