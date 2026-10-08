import {enrichMybusRoute} from './mpk-mybus-route';
import {parseMybusTimetable} from './mpk-mybus-timetable';
import { warsawDateIso, warsawTimeMs } from './transit-time';
import { busOperatingState } from './bus-operating-state';
import { mpkFeedVehicles, mpkSignalTime } from './mpk-vehicle-feed';
import { getCachedValue } from './cache';
import type { GetVehiclesOptions, ProviderVehiclesResult, TransportProvider, TransportStopSchedule, TransportVehicle } from './types';

const MYBUS_TIMETABLE_URL = 'http://84.38.160.220/myBusServices/SchedulesService.svc/GetVehicleTimeTable';
const MYBUS_VEHICLES_URL = 'http://84.38.160.220/myBusServices/SchedulesService.svc/GetVehicles?cNbLst=&cTrackLst=&cDirLst=&cIdLst=&cKrsLst=&cRouteLst=';
const VEHICLES_XML_URL = process.env.MPK_RZESZOW_VEHICLES_XML_URL || 'https://www.mpkrzeszow.pl/mpk/vehicles_proxy.php';
const VEHICLES_JSON_URL = process.env.MPK_RZESZOW_VEHICLES_JSON_URL || 'https://www.mpkrzeszow.pl/ztm/new/api.php?type=mpk';
const VEHICLES_DETAILS_URL = process.env.MPK_RZESZOW_VEHICLES_DETAILS_URL || 'https://www.mpkrzeszow.pl/mpk/get_vehicles.php';
const TRIP_STOPS_URL = process.env.MPK_RZESZOW_TRIP_STOPS_URL || 'https://www.mpkrzeszow.pl/brygady/get_trip_stops_advanced.php';
const STOPS_URL = 'https://www.mpkrzeszow.pl/przystanki/stopscache';
const REQUEST_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'Accept-Language': 'pl,en;q=0.9',
  Referer: 'http://einfo.zgpks.rzeszow.pl/',
  Origin: 'http://einfo.zgpks.rzeszow.pl',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

type StopsDictionary = Record<string, string>;
type StopPointIndex = Record<string, { name: string; lat?: number; lng?: number }>;
type RawStopPoint = Record<string, unknown>;
type MpkTripSchedule = {
  schedule: TransportStopSchedule[];
  routeStops: TransportStopSchedule[];
  routePath: number[];
};
const speedHistory = new Map<string, { lat: number; lng: number; atMs: number; lastSeenMs: number }>();

function distanceMeters(a: [number, number], b: [number, number]) {
  const meanLat = ((a[0] + b[0]) / 2) * Math.PI / 180;
  const dLat = (a[0] - b[0]) * 111_320;
  const dLng = (a[1] - b[1]) * Math.cos(meanLat) * 111_320;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function computeObservedSpeedKmh(vehicleKey: string, lat: number, lng: number, observedAtMs: number, rawSpeed?: number) {
  if (Number.isFinite(rawSpeed) && rawSpeed! > 0) {
    speedHistory.set(vehicleKey, { lat, lng, atMs: observedAtMs, lastSeenMs: Date.now() });
    return Math.max(0, rawSpeed!);
  }
  const previous = speedHistory.get(vehicleKey);
  speedHistory.set(vehicleKey, { lat, lng, atMs: observedAtMs, lastSeenMs: Date.now() });
  if (!previous) return Number.isFinite(rawSpeed) ? Math.max(0, rawSpeed!) : undefined;
  const elapsedSec = Math.max(0, (observedAtMs - previous.atMs) / 1000);
  const movedMeters = distanceMeters([lat, lng], [previous.lat, previous.lng]);
  if (elapsedSec < 3 || movedMeters < 8) return Number.isFinite(rawSpeed) ? Math.max(0, rawSpeed!) : 0;
  const speed = (movedMeters / elapsedSec) * 3.6;
  if (!Number.isFinite(speed) || speed > 140) return Number.isFinite(rawSpeed) ? Math.max(0, rawSpeed!) : undefined;
  return Math.round(speed);
}

function isRzeszowCityPoint(lat?: number, lng?: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat! >= 49.95 && lat! <= 50.13 && lng! >= 21.88 && lng! <= 22.12;
}

function formatMpkStopName(value: unknown, lat?: number, lng?: number) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const withoutDuplicateCity = raw.replace(/^(Rzesz(?:ow|\u00f3w)\s+)+/i, 'Rzesz\u00f3w ');
  if (/^Rzesz(?:ow|\u00f3w)\b/i.test(withoutDuplicateCity)) return withoutDuplicateCity.replace(/^Rzeszow\b/i, 'Rzesz\u00f3w');
  if (isRzeszowCityPoint(lat, lng) && !/^Przystanek\s+\d+$/i.test(withoutDuplicateCity)) {
    return `Rzesz\u00f3w ${withoutDuplicateCity}`;
  }
  return withoutDuplicateCity;
}

async function fetchJsonWithRetry<T>(url: string, init?: RequestInit, retries = 1): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
      }

      return JSON.parse(text) as T;
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function fetchTextWithRetry(url: string, init?: RequestInit, retries = 1): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
      return text;
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function decodeXmlEntity(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseVehicleXml(xml: string) {
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

async function loadRawVehicles() {
  return getCachedValue('mpk_rzeszow:raw_json_vehicles', {
    ttlMs: 10_000,
    staleMs: 50_000,
    loader: async () => {
      let emptyResponse = false;
      let lastError: unknown;
      const loaders = [
        async () => mpkFeedVehicles(await fetchJsonWithRetry<unknown>(VEHICLES_JSON_URL, { headers: REQUEST_HEADERS })),
        async () => parseVehicleXml(await fetchTextWithRetry(VEHICLES_XML_URL, { headers: REQUEST_HEADERS })),
        async () => parseVehicleXml(await fetchTextWithRetry(MYBUS_VEHICLES_URL, { headers: {Accept: 'application/xml'} })).map((vehicle): Record<string, string> => ({...vehicle, feedSource: 'mybus'})),
      ];
      for (const load of loaders) {
        try {
          const rows = await load();
          if (rows.length > 0) return rows;
          emptyResponse = true;
        } catch (error) { lastError = error; }
      }
      if (emptyResponse) return [];
      throw lastError instanceof Error ? lastError : new Error('MPK vehicle sources unavailable');
    },
  });
}

async function loadVehicleDetails() {
  return getCachedValue('mpk_rzeszow:vehicle_details', {
    ttlMs: 15_000,
    staleMs: 60_000,
    loader: async () => {
      const data = await fetchJsonWithRetry<unknown[]>(VEHICLES_DETAILS_URL, { headers: REQUEST_HEADERS });
      return Array.isArray(data) ? data : [];
    },
  });
}

async function loadStopsDictionary() {
  return getCachedValue('mpk_rzeszow:stops_dictionary', {
    ttlMs: 24 * 60 * 60 * 1000,
    staleMs: 24 * 60 * 60 * 1000,
    loader: async () => {
      const data = await loadRawStopPoints();
      const dictionary: StopsDictionary = {};

      for (const stop of data) {
        const stopId = String(stop.stop_id || stop.stop_point_id || '').trim();
        const lat = Number(stop.stop_lat ?? (stop.location as any)?.lat ?? (stop.location as any)?.latitude);
        const lng = Number(stop.stop_lon ?? (stop.location as any)?.lon ?? (stop.location as any)?.lng ?? (stop.location as any)?.longitude);
        const stopName = formatMpkStopName(stop.stop_name || stop.name, lat, lng);
        if (!stopId || !stopName) continue;
        dictionary[stopId] = stopName;
      }

      return dictionary;
    },
  });
}

async function loadRawStopPoints() {
  const { value } = await getCachedValue('mpk_rzeszow:raw_stop_points', {
    ttlMs: 24 * 60 * 60 * 1000,
    staleMs: 24 * 60 * 60 * 1000,
    loader: async () => {
      const data = await fetchJsonWithRetry<{ items?: RawStopPoint[] }>(STOPS_URL, {
        headers: REQUEST_HEADERS,
      });
      return Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];
    },
  });
  return value;
}

async function loadStopPointIndex() {
  return getCachedValue('mpk_rzeszow:stop_point_index', {
    ttlMs: 24 * 60 * 60 * 1000,
    staleMs: 24 * 60 * 60 * 1000,
    loader: async () => {
      const data = await loadRawStopPoints();
      const index: StopPointIndex = {};

      for (const stop of data) {
        const stopId = String(stop.stop_point_id || '').trim();
        if (!stopId) continue;
        const lat = Number((stop.location as any)?.lat ?? (stop.location as any)?.latitude);
        const lng = Number((stop.location as any)?.lon ?? (stop.location as any)?.lng ?? (stop.location as any)?.longitude);
        index[stopId] = {
          name: formatMpkStopName(stop.name, lat, lng),
          lat: Number.isFinite(lat) ? lat : undefined,
          lng: Number.isFinite(lng) ? lng : undefined,
        };
      }

      return index;
    },
  });
}

function buildSchedule(nextStopPoints: any[] | undefined, stopsDictionary: StopsDictionary): TransportStopSchedule[] {
  return (nextStopPoints || []).map((stopPoint: any) => {
    const stopId = Number(stopPoint.stop_point_id);
    return {
      id: stopId,
      name: stopsDictionary[String(stopId)] || `Przystanek ${stopId}`,
      planned: stopPoint.planned_departure_time ? String(stopPoint.planned_departure_time).replace(' ', 'T') : null,
      real: stopPoint.real_departure_time ? String(stopPoint.real_departure_time).replace(' ', 'T') : null,
    };
  });
}

function buildRoutePath(route: any): number[] {
  const fromStopPoints = Array.isArray(route?.stop_points)
    ? route.stop_points
        .map((stopPoint: any) => Number(typeof stopPoint === 'object' && stopPoint !== null ? stopPoint.stop_point_id : stopPoint))
        .filter((stopPointId: number) => Number.isFinite(stopPointId))
    : [];

  if (fromStopPoints.length > 1) return fromStopPoints;

  const links = Array.isArray(route?.route_links)
    ? [...route.route_links].sort((a: any, b: any) => Number(a?.index ?? 0) - Number(b?.index ?? 0))
    : [];
  const routePath: number[] = [];

  for (const link of links) {
    const from = Number(link?.from);
    const to = Number(link?.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    if (routePath.length === 0) routePath.push(from);
    if (routePath[routePath.length - 1] !== to) routePath.push(to);
  }

  return routePath;
}

function buildDateFromMpkTime(timeValue: unknown, anchorDate: Date, previousDate: Date | null) {
  let ms = warsawTimeMs(warsawDateIso(0, anchorDate), timeValue);
  if (previousDate && ms < previousDate.getTime()) ms = warsawTimeMs(warsawDateIso(1, anchorDate), timeValue);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

async function fetchMpkTripSchedule(tripId: unknown, delaySeconds: number): Promise<MpkTripSchedule> {
  const normalizedTripId = String(tripId || '').trim();
  if (!normalizedTripId) return { schedule: [], routeStops: [], routePath: [] };

  const params = new URLSearchParams({ trip_id: normalizedTripId });
  const [{ stops = [] } = {}, { value: stopPointIndex }] = await Promise.all([
    fetchJsonWithRetry<{ stops?: any[] }>(`${TRIP_STOPS_URL}?${params.toString()}`, { headers: REQUEST_HEADERS }).catch(() => ({ stops: [] })),
    loadStopPointIndex(),
  ]);
  if (!Array.isArray(stops) || stops.length === 0) return { schedule: [], routeStops: [], routePath: [] };

  const anchorDate = new Date(warsawDateIso() + 'T12:00:00Z');

  let previousDate: Date | null = null;
  const nowMs = Date.now();
  const allStops = stops.map((stop) => {
    const plannedDate = buildDateFromMpkTime(stop.departure_time || stop.arrival_time, anchorDate, previousDate);
    if (plannedDate) previousDate = plannedDate;
    const realDate = plannedDate && Number.isFinite(delaySeconds) && Math.abs(delaySeconds) <= 18000
      ? new Date(plannedDate.getTime() + delaySeconds * 1000)
      : null;
    const stopId = Number(stop.stop_id);
    const indexed = stopPointIndex[String(stopId)];
    const lat = Number(stop.lat ?? stop.latitude ?? stop.stop_lat ?? indexed?.lat);
    const lng = Number(stop.lon ?? stop.lng ?? stop.long ?? stop.longitude ?? stop.stop_lon ?? indexed?.lng);

    return {
      id: Number.isFinite(stopId) ? stopId : Number(stop.stop_sequence || 0),
      name: formatMpkStopName(stop.stop_name || indexed?.name || `Przystanek ${stop.stop_sequence || ''}`, Number.isFinite(lat) ? lat : undefined, Number.isFinite(lng) ? lng : undefined),
      planned: plannedDate ? plannedDate.toISOString() : null,
      real: realDate ? realDate.toISOString() : null,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
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

function inBoundingBox(lat: number, lng: number, bbox?: [number, number, number, number] | null) {
  if (!bbox) return true;
  const [south, west, north, east] = bbox;
  return lat >= south && lat <= north && lng >= west && lng <= east;
}

function normalizeVehicleId(rawVehicleId: unknown) {
  return String(rawVehicleId ?? '').trim() || 'unknown';
}

function toCleanLine(value: unknown) {
  const raw = String(value || '').trim();
  return raw || '?';
}

function getMpkStatusText(status: string, speed: number) {
  return 'W trasie';
}

function isMpkBreakStatus(status: string) {
  return status === '3' || status === '6' || status === '7' || status === '10';
}

function isMpkWaitingStatus(status: string) {
  return status === '2' || isMpkBreakStatus(status);
}

function getEffectiveMpkDelay(rawDelay: number, status: string) {
  if (!Number.isFinite(rawDelay) || Math.abs(rawDelay) > 18000) return 0;
  // MPK reports planned minus actual time; the app uses actual minus planned.
  return isMpkWaitingStatus(status) || rawDelay === 0 ? 0 : -rawDelay;
}

function toTransportVehicle(
  rawVehicle: Record<string, string>,
  now: number,
  includeInactive: boolean,
  stopsDictionary: StopsDictionary,
  details?: any,
  tripSchedule?: MpkTripSchedule,
): TransportVehicle | null {
  const lat = Number(rawVehicle.y);
  const lng = Number(rawVehicle.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const rawVehicleNumber = normalizeVehicleId(rawVehicle.nb || rawVehicle.id);
  const line = toCleanLine(rawVehicle.nr || rawVehicle.nnr || details?.nr);
  const hasLine = line !== '?';
  const ageSec = Math.max(0, Math.floor((now - mpkSignalTime(rawVehicle, now)) / 1000));

  if (!includeInactive && !hasLine) return null;
  if (ageSec > 30 * 60 || (!includeInactive && rawVehicle.online === 'no')) return null;

  const previousLat = Number(rawVehicle.py);
  const previousLng = Number(rawVehicle.px);
  const movedDistance = Number.isFinite(previousLat) && Number.isFinite(previousLng)
    ? Math.hypot(lat - previousLat, lng - previousLng)
    : 0;
  const geometrySpeed = movedDistance > 0 ? Math.min(55, Math.round(movedDistance * 100000)) : 0;
  const speed = computeObservedSpeedKmh(`mpk_rzeszow:${rawVehicleNumber}`, lat, lng, now - ageSec * 1000, geometrySpeed) ?? 0;
  const statusCode = String(rawVehicle.s || details?.status || '');
  const direction = String(rawVehicle.op || details?.op || rawVehicle.nop || '').trim() || 'W trasie';
  const delaySeconds = getEffectiveMpkDelay(Number(rawVehicle.o ?? details?.delay ?? 0), statusCode);
  const operating = busOperatingState({
    lat, lon: lng, speed, nowMs: now,
    stops: (tripSchedule?.routeStops || []).map(stop => ({ ...stop, lon: stop.lng })),
    reportedBreak: isMpkBreakStatus(statusCode),
  });
  const isBreak = operating.status === 'break';
  const nextTripStartAtMs = 'nextTripStartAtMs' in operating ? operating.nextTripStartAtMs : undefined;
  const nextTripFirstStopId = 'nextTripFirstStopId' in operating ? Number(operating.nextTripFirstStopId) : undefined;
  const statusText = isBreak ? operating.statusText : getMpkStatusText(statusCode, speed);
  const prefixedId = `mpk_rzeszow_${rawVehicleNumber}`;
  const nextStopId = Number(rawVehicle.nk || details?.end_stop_id);
  const nextStopName =
    formatMpkStopName(rawVehicle.nop || details?.end_stop_name) ||
    stopsDictionary[String(nextStopId)] ||
    (Number.isFinite(nextStopId) ? `Przystanek ${nextStopId}` : '');

  return {
    id: prefixedId,
    provider: 'mpk_rzeszow',
    operatorName: 'MPK Rzeszów',
    type: 'bus',
    iconVariant: 'mpk_rzeszow',
    vehicleNumber: rawVehicleNumber,
    line,
    displayName: line,
    name: `MPK ${line !== '?' ? line : rawVehicleNumber}`,
    routeId: line !== '?' ? line : undefined,
    lat,
    lng,
    bearing: undefined,
    speed,
    computedSpeed: speed,
    direction,
    delaySeconds,
    delayMinutes: Math.round(delaySeconds / 60),
    dataAgeSec: ageSec,
    schedule: tripSchedule?.schedule?.length
      ? tripSchedule.schedule
      : Number.isFinite(nextStopId) && nextStopName
      ? [{
          id: nextStopId,
          name: nextStopName,
          planned: null,
          real: null,
        }]
      : [],
    routeStops: tripSchedule?.routeStops || [],
    routePath: tripSchedule?.routePath || [],
    model: details?.bus,
    lastStopDistance: Number.isFinite(Number(rawVehicle.dp)) ? Number(rawVehicle.dp) : undefined,
    lastStopId: undefined,
    lastUpdate: new Date(now - ageSec * 1000).toISOString(),
    previousTripEndedAtMs: isBreak ? now : undefined,
    nextTripStartAtMs,
    nextTripFirstStopId,
    journeyId: details?.rawBrygada ?? rawVehicle.kwi?.trim() ?? undefined,
    serviceId: rawVehicle.kwi?.trim() || details?.brygada,
    tripId: details?.trip_id ?? rawVehicle.tripid ?? rawVehicle.ik ?? undefined,
    brigadeName: rawVehicle.kwi?.trim() || details?.brygada,
    status: isBreak ? 'break' : 'active',
    statusText,
  };
}

function parseLookupVehicleId(vehicleId: string) {
  const raw = String(vehicleId || '').trim();
  if (!raw) return '';
  return raw.startsWith('mpk_rzeszow_') ? raw.slice('mpk_rzeszow_'.length) : raw;
}

export const mpkRzeszowProvider: TransportProvider = {
  id: 'mpk_rzeszow',
  operatorName: 'MPK Rzeszów',
  implemented: true,

  async getVehicles(options: GetVehiclesOptions): Promise<ProviderVehiclesResult> {
    const [{ value: rawVehicles, cache }, { value: stopsDictionary }, { value: vehicleDetails }] = await Promise.all([
      loadRawVehicles(),
      loadStopsDictionary(),
      loadVehicleDetails(),
    ]);

    const now = Date.now();
    const detailsByVehicle = new Map(
      vehicleDetails.map((detail: any) => [normalizeVehicleId(detail?.nb), detail]),
    );
    const vehicles = rawVehicles
      .map((rawVehicle) =>
        toTransportVehicle(rawVehicle, now, options.includeInactive, stopsDictionary, detailsByVehicle.get(normalizeVehicleId(rawVehicle.nb || rawVehicle.id))),
      )
      .filter((vehicle): vehicle is TransportVehicle => Boolean(vehicle))
      .filter((vehicle) => inBoundingBox(vehicle.lat, vehicle.lng, options.bbox));

    return { vehicles, cache };
  },

  async getVehicleDetails(vehicleId: string, options?: Pick<GetVehiclesOptions, 'includeInactive'>): Promise<TransportVehicle | null> {
    const lookupVehicleId = parseLookupVehicleId(vehicleId);
    const [{ value: rawVehicles }, { value: stopsDictionary }, { value: vehicleDetails }] = await Promise.all([
      loadRawVehicles(),
      loadStopsDictionary(),
      loadVehicleDetails(),
    ]);

    const rawVehicle = rawVehicles.find((candidate) => normalizeVehicleId(candidate?.nb || candidate?.id) === lookupVehicleId);
    if (!rawVehicle) return null;
    const detail: any = vehicleDetails.find((candidate: any) => normalizeVehicleId(candidate?.nb) === lookupVehicleId) || {};
    const statusCode = String(rawVehicle.s || detail?.status || '');
    let tripSchedule = await fetchMpkTripSchedule(
      detail?.trip_id ?? rawVehicle.tripid ?? (rawVehicle.feedSource === 'mybus' ? undefined : rawVehicle.ik),
      getEffectiveMpkDelay(Number(rawVehicle.o ?? detail?.delay ?? 0), statusCode),
    ).catch(() => ({schedule: [], routeStops: [], routePath: []} as MpkTripSchedule));
    let routeGeometry: [number, number][] | undefined;
    let scheduleSource: TransportVehicle['scheduleSource'];
    if (!tripSchedule.schedule.some(stop => stop.planned || stop.real)) {
      try {
        const xml = await fetchTextWithRetry(`${MYBUS_TIMETABLE_URL}?${new URLSearchParams({nNb: lookupVehicleId})}`, {headers: {Accept: 'application/xml'}});
        const schedule = parseMybusTimetable(xml, Date.now(), String(rawVehicle.nr || rawVehicle.nnr || '').trim());
        if (schedule.length) {
          const enriched = await enrichMybusRoute(xml, schedule, url => fetchTextWithRetry(url, {headers: {Accept: 'application/xml'}}));
          tripSchedule = enriched;
          routeGeometry = enriched.routeGeometry;
          scheduleSource = 'mybus';
        }
      } catch { /* An unavailable backup timetable must not hide the vehicle. */ }
    }

    const vehicle = toTransportVehicle(rawVehicle, Date.now(), options?.includeInactive ?? true, stopsDictionary, detail, tripSchedule);
    return vehicle ? {...vehicle, scheduleSource, routeGeometry} : null;
  },
};
