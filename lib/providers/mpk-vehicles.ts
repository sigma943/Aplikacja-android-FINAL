

import {parseMybusTimetable} from '../mpk-mybus-timetable';

import {mpkFeedVehicles, mpkSignalTime} from '../mpk-vehicle-feed';

import {busOperatingState} from '../bus-operating-state';

import type {Vehicle} from '@/lib/transport/vehicle';
import {warsawDateIso, warsawTimeMs} from '../transit-time';

import {MPK_RZESZOW_MYBUS_TIMETABLE_URL, MPK_RZESZOW_MYBUS_VEHICLES_URL, MPK_RZESZOW_VEHICLES_JSON_URL, MPK_RZESZOW_VEHICLES_XML_URL, MPK_RZESZOW_VEHICLES_DETAILS_URL, MPK_RZESZOW_TRIP_STOPS_URL} from '../transport/endpoints';
import {requestJson, requestText} from '../transport/http';
import {computeObservedSpeedKmh} from '../transport/vehicle-speed';
import {isAbortLikeError} from '../providers/pkp-client';
import {fetchMpkRzeszowStopsClient} from '../providers/mpk-departures-client';

const mpkTripStopsByTripCache = new Map<string, Promise<any[]>>();

function decodeXmlEntity(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseMpkVehiclesXml(xml: string) {
  const vehicles: Record<string, string>[] = [];
  const vehicleRegex = /<V\s+([\s\S]*?)\/>/g;
  let vehicleMatch: RegExpExecArray | null;

  while ((vehicleMatch = vehicleRegex.exec(xml))) {
    const attrs: Record<string, string> = {};
    const attrRegex = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
    let attrMatch: RegExpExecArray | null;

    while ((attrMatch = attrRegex.exec(vehicleMatch[1]))) {
      attrs[attrMatch[1]] = decodeXmlEntity(attrMatch[2]);
    }

    vehicles.push(attrs);
  }

  return vehicles;
}

function normalizeMpkVehicleId(rawVehicleId: unknown) {
  return String(rawVehicleId ?? '').trim() || 'unknown';
}

function isMpkBreakStatus(statusCode: string) {
  return statusCode === '3' || statusCode === '6' || statusCode === '7' || statusCode === '10';
}

function isMpkWaitingStatus(statusCode: string) {
  return statusCode === '2' || isMpkBreakStatus(statusCode);
}

function getEffectiveMpkDelay(
  rawDelay: number,
  statusCode: string,
  speed = 0,
  schedule?: Vehicle['schedule'],
) {
  if (!Number.isFinite(rawDelay) || Math.abs(rawDelay) > 18000) return 0;
  if (isMpkWaitingStatus(statusCode)) return 0;

  const firstPlannedMs = schedule?.[0]?.planned ? new Date(schedule[0].planned).getTime() : NaN;
  if (rawDelay > 0 && speed <= 1 && Number.isFinite(firstPlannedMs) && firstPlannedMs > Date.now()) {
    return 0;
  }

  // MPK reports planned minus actual time; the app uses actual minus planned.
  return rawDelay === 0 ? 0 : -rawDelay;
}

function buildDateFromMpkTime(timeValue: unknown, anchorDate: Date, previousDate: Date|null) {
  let ms=warsawTimeMs(warsawDateIso(0,anchorDate),timeValue);
  if(previousDate && ms<previousDate.getTime())ms=warsawTimeMs(warsawDateIso(1,anchorDate),timeValue);
  return Number.isFinite(ms)?new Date(ms):null;
}

async function fetchMpkTripStops(tripId: string) {
  if (!mpkTripStopsByTripCache.has(tripId)) {
    const searchParams = new URLSearchParams({ trip_id: tripId });
    mpkTripStopsByTripCache.set(
      tripId,
      requestJson<{ stops?: any[] }>(`${MPK_RZESZOW_TRIP_STOPS_URL}?${searchParams.toString()}`)
        .then((data) => {
          const stops = Array.isArray(data?.stops) ? data.stops : [];
          if (!stops.length) mpkTripStopsByTripCache.delete(tripId);
          return stops;
        })
        .catch(error => {mpkTripStopsByTripCache.delete(tripId);throw error;}),
    );
    if (mpkTripStopsByTripCache.size > 300) {
      const firstKey = mpkTripStopsByTripCache.keys().next().value;
      if (firstKey) mpkTripStopsByTripCache.delete(firstKey);
    }
  }
  return mpkTripStopsByTripCache.get(tripId)!;
}

async function fetchMpkTripSchedule(tripId: unknown, delaySeconds: number): Promise<{
  schedule: Vehicle['schedule'];
  routeStops: Vehicle['routeStops'];
  routePath: number[];
}> {
  const normalizedTripId = String(tripId || '').trim();
  if (!normalizedTripId) return { schedule: [], routeStops: [], routePath: [] };

  const [stops, stopPointIndex] = await Promise.all([
    fetchMpkTripStops(normalizedTripId),
    fetchMpkRzeszowStopsClient().then(points=>Object.fromEntries(points.map(point=>[String(point.stop_id),{n:point.stop_name,lat:Number(point.stop_lat),lon:Number(point.stop_lon)}]))),
  ]);
  if (stops.length === 0) return { schedule: [], routeStops: [], routePath: [] };

  const anchorDate = new Date(warsawDateIso()+'T12:00:00Z');

  let previousDate: Date | null = null;
  const nowMs = Date.now();
  const allStops = stops.map((stop) => {
    const plannedDate = buildDateFromMpkTime(stop.departure_time || stop.arrival_time, anchorDate, previousDate);
    if (plannedDate) previousDate = plannedDate;
    const realDate = plannedDate && Number.isFinite(delaySeconds) && Math.abs(delaySeconds) <= 18000
      ? new Date(plannedDate.getTime() + delaySeconds * 1000)
      : null;
    const stopId = Number(stop.stop_id);
    const stopIndexEntry = stopPointIndex[String(stopId)] || null;
    const rawLat = Number(stop.lat ?? stop.latitude ?? stop.stop_lat ?? stop.stop_latitude);
    const rawLon = Number(stop.lon ?? stop.lng ?? stop.long ?? stop.longitude ?? stop.stop_lon ?? stop.stop_lng ?? stop.stop_longitude);
    const lat = Number.isFinite(rawLat) ? rawLat : stopIndexEntry?.lat;
    const lon = Number.isFinite(rawLon) ? rawLon : stopIndexEntry?.lon;
    const stopName = String(stop.stop_name || stopIndexEntry?.n || '').trim();

    return {
      id: Number.isFinite(stopId) ? stopId : Number(stop.stop_sequence || 0),
      name: stopName || `Przystanek ${stop.stop_sequence || ''}`.trim(),
      planned: plannedDate ? plannedDate.toISOString() : null,
      real: realDate ? realDate.toISOString() : null,
      lat,
      lon,
    };
  });
  const upcomingStops = allStops.filter((stop) => {
    const time = stop.real || stop.planned;
    if (!time) return true;
    return new Date(time).getTime() >= nowMs - 2 * 60 * 1000;
  });

  return {
    schedule: upcomingStops.length > 0 ? upcomingStops : allStops,
    routeStops: allStops,
    routePath: allStops.map((stop) => stop.id).filter((id) => Number.isFinite(Number(id))),
  };
}

function mapMpkDirectVehicle(
  rawVehicle: Record<string, string>,
  detailsByVehicle: Map<string, any>,
  now: number,
  includeInactive: boolean,
  tripSchedule?: { schedule: Vehicle['schedule']; routeStops: Vehicle['routeStops']; routePath: number[] },
): Vehicle | null {
  const lat = Number(rawVehicle.y);
  const lon = Number(rawVehicle.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const vehicleNumber = normalizeMpkVehicleId(rawVehicle.nb || rawVehicle.id);
  const details = detailsByVehicle.get(vehicleNumber);
  const line = String(rawVehicle.nr || rawVehicle.nnr || details?.nr || '').trim() || '?';
  const hasLine = line !== '?';
  const signalMs = mpkSignalTime(rawVehicle, now);
  const dataAgeSec = Math.max(0, Math.floor((now - signalMs) / 1000));
  if (!includeInactive && !hasLine) return null;
  if (dataAgeSec > 30 * 60 || (!includeInactive && rawVehicle.online === 'no')) return null;

  const previousLat = Number(rawVehicle.py);
  const previousLon = Number(rawVehicle.px);
  const movedDistance = Number.isFinite(previousLat) && Number.isFinite(previousLon)
    ? Math.hypot(lat - previousLat, lon - previousLon)
    : 0;
  const geometrySpeed = movedDistance > 0 ? Math.min(55, Math.round(movedDistance * 100000)) : 0;
  const speed = computeObservedSpeedKmh(`mpk_rzeszow:${vehicleNumber}`, lat, lon, now - dataAgeSec * 1000, geometrySpeed) ?? 0;
  const rawDelay = Number(rawVehicle.o ?? details?.delay ?? 0);
  const statusCode = String(rawVehicle.s || details?.status || '');
  const delay = getEffectiveMpkDelay(rawDelay, statusCode, speed, tripSchedule?.schedule);
  const nextStopId = Number(rawVehicle.nk || details?.end_stop_id);
  const nextStopName = String(rawVehicle.nop || details?.end_stop_name || '').trim();
  const direction = String(rawVehicle.op || details?.op || rawVehicle.nop || '').trim() || 'W trasie';
  const operating = busOperatingState({lat,lon,speed,nowMs:now,stops:tripSchedule?.routeStops||[],reportedBreak:isMpkBreakStatus(statusCode)});
  const isBreak = operating.status==='break';
  const breakUntilMs = 'nextTripStartAtMs' in operating ? operating.nextTripStartAtMs : undefined;

  return {
    id: `mpk_rzeszow_${vehicleNumber}`,
    provider: 'mpk_rzeszow',
    operatorName: 'MPK Rzeszów',
    type: 'bus',
    iconVariant: 'mpk_rzeszow',
    vehicleNumber,
    name: `MPK ${line !== '?' ? line : vehicleNumber}`,
    routeId: line !== '?' ? line : undefined,
    routeShortName: line,
    lat,
    lon,
    speed,
    computedSpeed: speed,
    direction,
    delay,
    dataAgeSec,
    schedule: tripSchedule?.schedule?.length
      ? tripSchedule.schedule
      : Number.isFinite(nextStopId) && nextStopName
      ? [{ id: nextStopId, name: nextStopName, planned: null, real: null }]
      : [],
    routeStops: tripSchedule?.routeStops || [],
    routePath: tripSchedule?.routePath || [],
    model: details?.bus,
    lastStopDistance: Number.isFinite(Number(rawVehicle.dp)) ? Number(rawVehicle.dp) : undefined,
    lastStopId: undefined,
    lastSignalTime: new Date(now - dataAgeSec * 1000).toISOString(),
    previousTripEndedAtMs: isBreak ? now : undefined,
    nextTripStartAtMs: breakUntilMs,
    nextTripFirstStopId: 'nextTripFirstStopId' in operating ? Number(operating.nextTripFirstStopId) : undefined,
    journeyId: details?.rawBrygada ?? rawVehicle.kwi?.trim() ?? undefined,
    serviceId: rawVehicle.kwi?.trim() || details?.brygada,
    tripId: details?.trip_id ?? rawVehicle.tripid ?? rawVehicle.ik ?? undefined,
    brigadeName: rawVehicle.kwi?.trim() || details?.brygada,
    status: isBreak ? 'break' : 'active',
    statusText: operating.statusText,
  };
}

async function fetchMpkVehicleFeed(signal?: AbortSignal) {
  let emptyResponse = false;
  let lastError: unknown;
  const loaders = [
    async () => mpkFeedVehicles(await requestJson<unknown>(MPK_RZESZOW_VEHICLES_JSON_URL, {signal})),
    async () => parseMpkVehiclesXml(await requestText(MPK_RZESZOW_VEHICLES_XML_URL, {signal})),
    async () => parseMpkVehiclesXml(await requestText(MPK_RZESZOW_MYBUS_VEHICLES_URL, {signal})).map((vehicle): Record<string, string> => ({...vehicle, feedSource: 'mybus'})),
  ];
  for (const load of loaders) {
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
    try {
      const rows = await load();
      if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
      if (rows.length > 0) return rows;
      emptyResponse = true;
    } catch (error) {
      if (signal?.aborted || isAbortLikeError(error)) throw error;
      lastError = error;
    }
  }
  if (emptyResponse) return [];
  throw lastError instanceof Error ? lastError : new Error('MPK vehicle sources unavailable');
}

async function fetchMpkRzeszowVehiclesDirect(includeInactive: boolean, signal?: AbortSignal) {
  const [positions, details] = await Promise.all([
    fetchMpkVehicleFeed(signal),
    requestJson<any[]>(MPK_RZESZOW_VEHICLES_DETAILS_URL, { signal }).catch(() => []),
  ]);
  const detailsByVehicle = new Map(
    (Array.isArray(details) ? details : []).map((detail: any) => [normalizeMpkVehicleId(detail?.nb), detail]),
  );
  const now = Date.now();

  return positions
    .map((rawVehicle) => mapMpkDirectVehicle(rawVehicle, detailsByVehicle, now, includeInactive))
    .filter((vehicle): vehicle is Vehicle => Boolean(vehicle));
}

async function fetchMpkRzeszowVehicleDetailsDirect(vehicleId: string, includeInactive: boolean) {
  const lookupVehicleId = normalizeMpkVehicleId(String(vehicleId || '').replace(/^mpk_rzeszow_/, ''));
  const [positions, details] = await Promise.all([
    fetchMpkVehicleFeed(),
    requestJson<any[]>(MPK_RZESZOW_VEHICLES_DETAILS_URL).catch(() => []),
  ]);
  const rawVehicle = positions.find((vehicle) =>
    normalizeMpkVehicleId(vehicle.nb || vehicle.id) === lookupVehicleId,
  );
  if (!rawVehicle) return null;

  const detailsByVehicle = new Map(
    (Array.isArray(details) ? details : []).map((detail: any) => [normalizeMpkVehicleId(detail?.nb), detail]),
  );
  const vehicleDetails = detailsByVehicle.get(lookupVehicleId);
  const statusCode = String(rawVehicle.s || vehicleDetails?.status || '');
  const delaySeconds = getEffectiveMpkDelay(Number(rawVehicle.o ?? vehicleDetails?.delay ?? 0), statusCode);
  let tripSchedule = await fetchMpkTripSchedule(vehicleDetails?.trip_id ?? rawVehicle.tripid ?? (rawVehicle.feedSource === 'mybus' ? undefined : rawVehicle.ik), delaySeconds)
    .catch(() => ({schedule: [], routeStops: [], routePath: []}));
  let routeGeometry: [number, number][] | undefined;
  let scheduleSource: Vehicle['scheduleSource'];
  if (!tripSchedule.schedule?.some(stop => stop.planned || stop.real)) {
    const xml = await requestText(`${MPK_RZESZOW_MYBUS_TIMETABLE_URL}?${new URLSearchParams({nNb: lookupVehicleId})}`).catch(() => null);
    if (xml) {
      try {
        const schedule = parseMybusTimetable(xml, Date.now(), String(rawVehicle.nr || rawVehicle.nnr || '').trim());
        if (schedule.length) {
          const {enrichMybusRoute} = await import('../mpk-mybus-route');
          const enriched = await enrichMybusRoute(xml, schedule, requestText);
          tripSchedule = enriched;
          routeGeometry = enriched.routeGeometry;
          scheduleSource = 'mybus';
        }
      } catch { /* Keep the existing vehicle when the backup timetable is unavailable. */ }
    }
  }

  const vehicle = mapMpkDirectVehicle(rawVehicle, detailsByVehicle, Date.now(), includeInactive, tripSchedule);
  return vehicle ? {...vehicle, scheduleSource, routeGeometry} : null;
}

export {mpkTripStopsByTripCache};
export {decodeXmlEntity};
export {parseMpkVehiclesXml};
export {normalizeMpkVehicleId};
export {isMpkBreakStatus};
export {isMpkWaitingStatus};
export {getEffectiveMpkDelay};
export {buildDateFromMpkTime};
export {fetchMpkTripStops};
export {fetchMpkTripSchedule};
export {mapMpkDirectVehicle};
export {fetchMpkVehicleFeed};
export {fetchMpkRzeszowVehiclesDirect};
export {fetchMpkRzeszowVehicleDetailsDirect};
