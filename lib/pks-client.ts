import {Capacitor, CapacitorHttp} from '@capacitor/core';
import type {Vehicle} from '@/components/BusMap';

type StopsMap = Record<string, {n: string; lat?: number; lon?: number; areaId?: string; code?: string}>;
type ShapePoint = [number, number];
type ShapeMetadata = { id: string; bbox: [number, number, number, number]; samples: ShapePoint[] };
export type TransportProviderId = 'pks' | 'mpk_rzeszow' | 'marcel';

type TransportApiVehicle = {
  id: string;
  provider: TransportProviderId;
  operatorName: string;
  type: 'bus' | 'train';
  iconVariant: string;
  vehicleNumber?: string;
  line: string;
  displayName: string;
  name: string;
  routeId?: string;
  lat: number;
  lng: number;
  bearing?: number;
  speed?: number;
  direction?: string;
  delaySeconds?: number;
  delayMinutes?: number;
  dataAgeSec?: number;
  schedule?: Array<{ id: number; name: string; planned: string | null; real: string | null; lat?: number; lon?: number; lng?: number; isPast?: boolean }>;
  routeStops?: Array<{ id: number; name: string; planned: string | null; real: string | null; lat?: number; lon?: number; lng?: number; isPast?: boolean }>;
  routePath?: number[];
  model?: string;
  lastStopDistance?: number;
  lastStopId?: number;
  lastUpdate?: string;
  journeyId?: string | number;
  serviceId?: string | number;
  tripId?: string | number;
  brigadeName?: string;
  status?: 'active' | 'break' | 'inactive' | 'technical' | 'cached';
  statusText?: string;
  isHistorical?: boolean;
};

type TransportApiVehiclesResponse = {
  vehicles?: TransportApiVehicle[];
  providers?: Record<string, string>;
  meta?: {
    generatedAt?: string;
    cache?: string;
  };
};

let stopsDictionaryPromise: Promise<Record<string, string>> | null = null;
let shapeIndexPromise: Promise<Record<string, string>> | null = null;
let routeStopShapeIndexPromise: Promise<Record<string, string>> | null = null;
let routeShapeMetadataPromise: Promise<ShapeMetadata[]> | null = null;
const shapePointsCache = new Map<string, Promise<ShapePoint[]>>();
const roadRouteCache = new Map<string, Promise<ShapePoint[]>>();
const TRANSPORT_API_BASE_URL = (
  process.env.NEXT_PUBLIC_TRANSPORT_API_BASE_URL ||
  'https://us-central1-aplikacja-b20fa.cloudfunctions.net/transportApi'
).replace(/\/$/, '');
const MPK_RZESZOW_VEHICLES_XML_URL = 'https://www.mpkrzeszow.pl/mpk/vehicles_proxy.php';
const MPK_RZESZOW_VEHICLES_DETAILS_URL = 'https://www.mpkrzeszow.pl/mpk/get_vehicles.php';
const MPK_RZESZOW_TRIP_STOPS_URL = 'https://www.mpkrzeszow.pl/brygady/get_trip_stops_advanced.php';
const MARCEL_API_BASE_URL = (process.env.NEXT_PUBLIC_MARCEL_API_BASE_URL || 'https://api-site.marcel-bus.pl').replace(/\/$/, '');
const MARCEL_DIRECT_VEHICLES_URL =
  process.env.NEXT_PUBLIC_MARCEL_VEHICLES_URL ||
  `${MARCEL_API_BASE_URL}/client/api/trasy/lokalizacjaBusow?appVersion=v1.67`;
const marcelCourseStopsCache = new Map<string, Promise<MarcelCourseStop[]>>();
const marcelPositionFreshness = new Map<string, { signature: string; signalMs: number; lastSeenMs: number }>();
const MARCEL_STALE_MS = 7 * 60 * 1000;

type MarcelCourseStop = {
  id: number;
  name: string;
  lat: number;
  lon: number;
  plannedMs: number;
  planned: string | null;
  km: number;
  order: number;
};

const isNative = () => Capacitor.isNativePlatform();
const EINFO_DIRECT = 'http://einfo.zgpks.rzeszow.pl/api';

function einfoFallbackUrl(pathAndOptionalQuery: string) {
  const trimmed = pathAndOptionalQuery.replace(/^\//, '');
  return `${EINFO_DIRECT}/${trimmed}`;
}

async function requestJson<T>(url: string, init?: RequestInit & {headers?: Record<string, string>}): Promise<T> {
  if (isNative()) {
    const response = await CapacitorHttp.request({
      url,
      method: init?.method || 'GET',
      headers: init?.headers,
      connectTimeout: 12000,
      readTimeout: 12000,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Request failed: ${response.status}`);
    }

    return response.data as T;
  }

  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
  });

  const text = await response.text();
  if (!response.ok) {
    const hint = text ? ` - ${text.slice(0, 240)}` : '';
    throw new Error(`Request failed: ${response.status}${hint}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON (HTTP ${response.status}): ${text.slice(0, 120)}`);
  }
}

async function requestEinfoJson<T>(pathAndOptionalQuery: string, init?: RequestInit & {headers?: Record<string, string>}): Promise<T> {
  return requestJson<T>(einfoFallbackUrl(pathAndOptionalQuery), init);
}

async function requestText(url: string, init?: RequestInit & {headers?: Record<string, string>}): Promise<string> {
  if (isNative()) {
    const response = await CapacitorHttp.request({
      url,
      method: init?.method || 'GET',
      headers: init?.headers,
      connectTimeout: 12000,
      readTimeout: 12000,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Request failed: ${response.status}`);
    }

    return typeof response.data === 'string' ? response.data : String(response.data || '');
  }

  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
  });
  const text = await response.text();
  if (!response.ok) {
    const hint = text ? ` - ${text.slice(0, 240)}` : '';
    throw new Error(`Request failed: ${response.status}${hint}`);
  }
  return text;
}

async function fetchPksVehiclesClient(includeInactive: boolean, signal?: AbortSignal) {
  const rawVehicles = await requestJson<any[]>('https://www.mpkrzeszow.pl/pks/get_vehicles.php', { signal });
  const now = Date.now();

  return (Array.isArray(rawVehicles) ? rawVehicles : [])
    .map((vehicle) => mapVehicle(vehicle, now, includeInactive, {}, false))
    .filter((vehicle): vehicle is Vehicle => Boolean(vehicle))
    .map((vehicle) => ({
      ...vehicle,
      provider: 'pks' as const,
      operatorName: 'PKS Rzeszów',
      type: 'bus' as const,
    }));
}

async function fetchPksVehicleDetailsClient(vehicleId: string, includeInactive: boolean) {
  const [rawVehicles, stopsDict] = await Promise.all([
    requestJson<any[]>('https://www.mpkrzeszow.pl/pks/get_vehicles.php'),
    loadStopsDictionary(),
  ]);
  const rawVehicle = (Array.isArray(rawVehicles) ? rawVehicles : []).find((vehicle) =>
    String(vehicle?.vehicle_id ?? `json-${getTripBase(vehicle?.trip_id) || ''}`) === String(vehicleId),
  );
  if (!rawVehicle) return null;

  const mapped = mapVehicle(rawVehicle, Date.now(), includeInactive, stopsDict, true);
  return mapped
    ? {
        ...mapped,
        provider: 'pks' as const,
        operatorName: 'PKS Rzeszów',
        type: 'bus' as const,
      }
    : null;
}

async function fetchMpkRzeszowVehiclesClient(includeInactive: boolean, signal?: AbortSignal) {
  const searchParams = new URLSearchParams();
  searchParams.set('providers', 'mpk_rzeszow');
  if (includeInactive) searchParams.set('includeInactive', 'true');

  try {
    const response = await requestJson<TransportApiVehiclesResponse>(transportApiUrl('/vehicles', searchParams), { signal });
    const vehicles = (response.vehicles || []).map(mapTransportVehicleToClient);
    if (vehicles.length > 0) return vehicles;
    return fetchMpkRzeszowVehiclesDirect(includeInactive);
  } catch (error) {
    console.warn('MPK Rzeszów backend unavailable, using direct MPK feed:', error);
    return fetchMpkRzeszowVehiclesDirect(includeInactive);
  }
}

async function fetchMarcelVehiclesClient(includeInactive: boolean, signal?: AbortSignal) {
  return fetchMarcelVehiclesDirect(includeInactive, signal);
}

function unwrapMarcelVehiclesPayload(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  for (const key of ['vehicles', 'pojazdy', 'items', 'data', 'results']) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }

  return [];
}

function readMarcelField(raw: any, paths: string[]) {
  for (const path of paths) {
    const value = path.split('.').reduce<any>((current, key) => (current == null ? undefined : current[key]), raw);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function readMarcelString(raw: any, paths: string[], fallback = '') {
  const value = readMarcelField(raw, paths);
  return String(value ?? fallback).trim();
}

function readMarcelNumber(raw: any, paths: string[]) {
  const value = readMarcelField(raw, paths);
  const number = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function readMarcelTimestamp(raw: any) {
  const value = readMarcelField(raw, [
    'lastUpdate',
    'last_update',
    'positionDate',
    'position_date',
    'position.position_date',
    'timestamp',
    'updatedAt',
    'updated_at',
    'czas',
    'data',
  ]);

  if (typeof value === 'number') return value < 10_000_000_000 ? value * 1000 : value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value.replace(' ', 'T')).getTime();
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  return NaN;
}

function getObservedMarcelSignalMs(vehicleKey: string, lat: number, lon: number, now: number) {
  const signature = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  const existing = marcelPositionFreshness.get(vehicleKey);
  if (!existing || existing.signature !== signature) {
    marcelPositionFreshness.set(vehicleKey, { signature, signalMs: now, lastSeenMs: now });
    return now;
  }

  existing.lastSeenMs = now;
  if (marcelPositionFreshness.size > 400) {
    for (const [key, value] of marcelPositionFreshness) {
      if (now - value.lastSeenMs > 60 * 60 * 1000) marcelPositionFreshness.delete(key);
    }
  }
  return existing.signalMs;
}

function getWarsawDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read('year'), month: read('month'), day: read('day') };
}

function warsawWallTimeToUtcMs(year: number, month: number, day: number, hour: number, minute: number) {
  const guessedUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(guessedUtc));
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const renderedAsUtc = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'), read('second'));
  return guessedUtc - (renderedAsUtc - guessedUtc);
}

function buildMarcelPlannedMs(timeValue: unknown, previousMs: number | null, now = new Date()) {
  const raw = String(timeValue || '').trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return Number.NaN;
  const { year, month, day } = getWarsawDateParts(now);
  let plannedMs = warsawWallTimeToUtcMs(year, month, day, Number(match[1]), Number(match[2]));
  if (previousMs !== null && plannedMs < previousMs - 6 * 60 * 60 * 1000) plannedMs += 24 * 60 * 60 * 1000;
  return plannedMs;
}

function unwrapMarcelCourseStopsPayload(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  for (const key of ['stops', 'przystanki', 'items', 'data', 'results']) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function cleanMarcelStopName(value: string) {
  return String(value || '')
    .replace(/\s*\([+\-/]+\)\s*$/g, '')
    .replace(/\s+[+-]\s*$/g, '')
    .trim();
}

function getMarcelDestination(routeName: string, fallback = 'W trasie') {
  const normalized = String(routeName || '').trim();
  if (!normalized) return fallback;
  const parts = normalized.split(/\s*[-–—]\s*/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : normalized;
}

async function fetchMarcelCourseStops(tripId: unknown): Promise<MarcelCourseStop[]> {
  const id = String(tripId || '').trim();
  if (!id) return [];
  if (!marcelCourseStopsCache.has(id)) {
    marcelCourseStopsCache.set(
      id,
      requestJson<unknown>(`${MARCEL_API_BASE_URL}/client/api/trasy/kurs/${encodeURIComponent(id)}?appVersion=v1.67`, {
        headers: { Accept: 'application/json' },
      })
        .then((payload) => {
          let previousMs: number | null = null;
          return unwrapMarcelCourseStopsPayload(payload)
            .map((stop, index): MarcelCourseStop | null => {
              const source = stop && typeof stop === 'object' ? stop as Record<string, unknown> : {};
              const lat = readMarcelNumber(source, ['szGps', 'lat', 'latitude', 'szerokosc']);
              const lon = readMarcelNumber(source, ['dlGps', 'lon', 'lng', 'longitude', 'dlugosc']);
              const plannedMs = buildMarcelPlannedMs(source.godz || source.godzPr || source.godzina, previousMs);
              if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(plannedMs)) return null;
              previousMs = plannedMs;
              const idRaw = Number(source.idPr ?? source.id ?? source.kol ?? index + 1);
              const city = String(source.nazMi || source.nazwaMi || '').trim();
              const stopName = cleanMarcelStopName(String(source.nazPr || source.nazwaPr || source.name || '').trim());
              return {
                id: Number.isFinite(idRaw) ? idRaw : index + 1,
                name: [city, stopName].filter(Boolean).join(' - ') || `Przystanek ${index + 1}`,
                lat,
                lon,
                plannedMs,
                planned: new Date(plannedMs).toISOString(),
                km: Number.isFinite(Number(source.km)) ? Number(source.km) : index,
                order: Number.isFinite(Number(source.kol)) ? Number(source.kol) : index + 1,
              };
            })
            .filter((stop): stop is MarcelCourseStop => Boolean(stop))
            .sort((a, b) => a.order - b.order);
        })
        .catch(() => []),
    );
    if (marcelCourseStopsCache.size > 200) {
      const firstKey = marcelCourseStopsCache.keys().next().value;
      if (firstKey) marcelCourseStopsCache.delete(firstKey);
    }
  }
  return marcelCourseStopsCache.get(id)!;
}

function squaredMetersDistanceToSegment(point: ShapePoint, start: ShapePoint, end: ShapePoint) {
  const meanLat = ((point[0] + start[0] + end[0]) / 3) * Math.PI / 180;
  const metersPerLat = 111_320;
  const metersPerLon = Math.cos(meanLat) * 111_320;
  const px = point[1] * metersPerLon;
  const py = point[0] * metersPerLat;
  const ax = start[1] * metersPerLon;
  const ay = start[0] * metersPerLat;
  const bx = end[1] * metersPerLon;
  const by = end[0] * metersPerLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  const distanceSq = (px - cx) * (px - cx) + (py - cy) * (py - cy);
  return { distanceSq, t };
}

function distanceMeters(a: ShapePoint, b: ShapePoint) {
  const meanLat = ((a[0] + b[0]) / 2) * Math.PI / 180;
  const dLat = (a[0] - b[0]) * 111_320;
  const dLon = (a[1] - b[1]) * Math.cos(meanLat) * 111_320;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

function estimateMarcelDelaySeconds(lat: number, lon: number, stops: MarcelCourseStop[], nowMs: number) {
  if (stops.length === 0) return 0;
  if (stops.length === 1) return Math.round((nowMs - stops[0].plannedMs) / 1000);

  const point: ShapePoint = [lat, lon];
  let bestScheduledMs = stops[0].plannedMs;
  let bestDistanceSq = Number.POSITIVE_INFINITY;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const start = stops[i];
    const end = stops[i + 1];
    const { distanceSq, t } = squaredMetersDistanceToSegment(point, [start.lat, start.lon], [end.lat, end.lon]);
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestScheduledMs = start.plannedMs + (end.plannedMs - start.plannedMs) * t;
    }
  }

  const delaySeconds = Math.round((nowMs - bestScheduledMs) / 1000);
  return Math.abs(delaySeconds) <= 18_000 ? delaySeconds : 0;
}

function buildMarcelSchedule(stops: MarcelCourseStop[], delaySeconds: number, nowMs: number) {
  return stops
    .map((stop) => {
      const predictedMs = stop.plannedMs + delaySeconds * 1000;
      return {
        id: stop.id,
        name: stop.name,
        planned: stop.planned,
        real: new Date(predictedMs).toISOString(),
        lat: stop.lat,
        lon: stop.lon,
        isPast: predictedMs < nowMs - 2 * 60 * 1000,
      };
    })
    .filter((stop) => !stop.isPast);
}

function buildMarcelRouteStops(stops: MarcelCourseStop[], delaySeconds: number, nowMs: number) {
  return stops.map((stop) => {
    const predictedMs = stop.plannedMs + delaySeconds * 1000;
    return {
      id: stop.id,
      name: stop.name,
      planned: stop.planned,
      real: new Date(predictedMs).toISOString(),
      lat: stop.lat,
      lon: stop.lon,
      isPast: predictedMs < nowMs - 2 * 60 * 1000,
    };
  });
}

function inferMarcelStatus(
  hasLine: boolean,
  lat: number,
  lon: number,
  stops: MarcelCourseStop[],
  delaySeconds: number,
  dataAgeSec: number,
  nowMs: number,
) {
  if (!hasLine) {
    return { status: 'inactive' as const, statusText: 'Pojazd bez przypisanej linii' };
  }

  const firstStop = stops[0];
  const firstDepartureMs = firstStop ? firstStop.plannedMs + delaySeconds * 1000 : NaN;
  const isNearFirstStop = firstStop
    ? distanceMeters([lat, lon], [firstStop.lat, firstStop.lon]) <= 350
    : false;

  if (Number.isFinite(firstDepartureMs) && firstDepartureMs - nowMs > 2 * 60 * 1000 && isNearFirstStop) {
    return { status: 'break' as const, statusText: `Przerwa do ${formatClock(firstDepartureMs)}` };
  }

  if (dataAgeSec > 90) {
    return { status: 'active' as const, statusText: 'Postój na trasie' };
  }

  return { status: 'active' as const, statusText: 'W trasie' };
}

async function mapMarcelDirectVehicle(raw: any, now: number, includeInactive: boolean): Promise<Vehicle | null> {
  const lat = readMarcelNumber(raw, ['lat', 'latitude', 'szGps', 'szerokosc', 'szerokoscGeo', 'position.lat', 'position.latitude']);
  const lon = readMarcelNumber(raw, ['lon', 'lng', 'long', 'longitude', 'dlGps', 'dlugosc', 'dlugoscGeo', 'position.lon', 'position.lng', 'position.long', 'position.longitude']);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const tripId = readMarcelString(raw, ['journeyId', 'journey_id', 'idKu', 'kursId', 'idKursu']) || undefined;
  const rawVehicleId = readMarcelString(raw, ['vehicle_id', 'vehicle.id', 'idPojazdu', 'pojazdId', 'idPo'])
    || tripId
    || `${lat.toFixed(5)}_${lon.toFixed(5)}`;
  const vehicleNumber = readMarcelString(raw, ['vehicleNumber', 'vehicle_number', 'vehicle.label', 'nrBoczny', 'numerBoczny', 'nrRej', 'rejestracja']) || undefined;
  const routeName = readMarcelString(raw, ['nazTr', 'routeName', 'trasa', 'relacja', 'opisTrasy', 'route.description', 'journey.route.description']);
  const line = readMarcelString(raw, ['line', 'routeShortName', 'route_short_name', 'routeId', 'route_id', 'linia', 'nrLinii'], 'M') || 'M';
  const direction = getMarcelDestination(
    routeName || readMarcelString(raw, ['direction', 'destination', 'kierunek', 'relacja', 'route.description', 'journey.route.description']),
  );
  const timestampMs = readMarcelTimestamp(raw);
  const signalMs = Number.isFinite(timestampMs)
    ? timestampMs
    : getObservedMarcelSignalMs(String(rawVehicleId), lat, lon, now);
  const dataAgeSec = Math.max(0, Math.floor((now - signalMs) / 1000));
  const courseStops = await fetchMarcelCourseStops(tripId);
  const delay = estimateMarcelDelaySeconds(lat, lon, courseStops, now);
  const schedule = buildMarcelSchedule(courseStops, delay, now);
  const routeStops = buildMarcelRouteStops(courseStops, delay, now);
  const fullRoutePath = routeStops.map((stop) => stop.id);
  const hasLine = line !== '?';
  const vehicleStatus = inferMarcelStatus(hasLine, lat, lon, courseStops, delay, dataAgeSec, now);

  if (!includeInactive && !hasLine) return null;
  if (dataAgeSec > MARCEL_STALE_MS / 1000) return null;

  return {
    id: `marcel_${rawVehicleId}`,
    provider: 'marcel',
    operatorName: 'Marcel',
    type: 'bus',
    iconVariant: 'marcel',
    vehicleNumber,
    name: `Marcel ${routeName || (line !== '?' ? line : vehicleNumber || rawVehicleId)}`,
    routeId: routeName || (line !== '?' ? line : undefined),
    routeShortName: line,
    lat,
    lon,
    direction,
    delay,
    dataAgeSec,
    schedule,
    routeStops,
    routePath: fullRoutePath,
    model: readMarcelString(raw, ['model', 'vehicle.model']),
    lastSignalTime: new Date(signalMs).toISOString(),
    journeyId: tripId,
    serviceId: readMarcelString(raw, ['serviceId', 'service_id', 'brygada']) || undefined,
    tripId,
    brigadeName: readMarcelString(raw, ['brigadeName', 'brigade_name', 'brygada']) || undefined,
    status: vehicleStatus.status,
    statusText: vehicleStatus.statusText,
  };
}

async function fetchMarcelVehiclesDirect(includeInactive: boolean, signal?: AbortSignal) {
  const payload = await requestJson<unknown>(MARCEL_DIRECT_VEHICLES_URL, {
    signal,
    headers: {'Accept': 'application/json'},
  });
  const now = Date.now();
  const rawVehicles = unwrapMarcelVehiclesPayload(payload);
  const vehicles: Vehicle[] = [];
  const concurrency = 6;
  for (let start = 0; start < rawVehicles.length; start += concurrency) {
    const chunk = rawVehicles.slice(start, start + concurrency);
    const mapped = await Promise.all(chunk.map((rawVehicle) => mapMarcelDirectVehicle(rawVehicle, now, includeInactive)));
    vehicles.push(...mapped.filter((vehicle): vehicle is Vehicle => Boolean(vehicle)));
  }
  return vehicles;
}

async function fetchMarcelVehicleDetailsDirect(vehicleId: string, includeInactive: boolean) {
  const lookupVehicleId = String(vehicleId || '').replace(/^marcel_/, '');
  const vehicles = await fetchMarcelVehiclesDirect(includeInactive);
  return vehicles.find((vehicle) =>
    String(vehicle.id).replace(/^marcel_/, '') === lookupVehicleId ||
    String(vehicle.vehicleNumber || '') === lookupVehicleId ||
    String(vehicle.journeyId || '') === lookupVehicleId
  ) || null;
}

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

  return rawDelay;
}

function buildDateFromMpkTime(timeValue: unknown, anchorDate: Date, previousDate: Date | null) {
  const raw = String(timeValue || '').trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (!match) return null;

  const date = new Date(anchorDate);
  date.setHours(Number(match[1]), Number(match[2]), Number(match[3] || '0'), 0);
  if (previousDate && date < previousDate) date.setDate(date.getDate() + 1);
  return date;
}

async function fetchMpkTripSchedule(tripId: unknown, delaySeconds: number): Promise<{
  schedule: Vehicle['schedule'];
  routePath: number[];
}> {
  const normalizedTripId = String(tripId || '').trim();
  if (!normalizedTripId) return { schedule: [], routePath: [] };

  const searchParams = new URLSearchParams({ trip_id: normalizedTripId });
  const data = await requestJson<{ stops?: any[] }>(`${MPK_RZESZOW_TRIP_STOPS_URL}?${searchParams.toString()}`).catch(() => null);
  const stops = Array.isArray(data?.stops) ? data.stops : [];
  if (stops.length === 0) return { schedule: [], routePath: [] };

  const anchorDate = new Date();
  if (anchorDate.getHours() < 3) anchorDate.setDate(anchorDate.getDate() - 1);
  anchorDate.setHours(0, 0, 0, 0);

  let previousDate: Date | null = null;
  const nowMs = Date.now();
  const allStops = stops.map((stop) => {
    const plannedDate = buildDateFromMpkTime(stop.departure_time || stop.arrival_time, anchorDate, previousDate);
    if (plannedDate) previousDate = plannedDate;
    const realDate = plannedDate && Number.isFinite(delaySeconds) && Math.abs(delaySeconds) <= 18000
      ? new Date(plannedDate.getTime() + delaySeconds * 1000)
      : null;
    const stopId = Number(stop.stop_id);

    return {
      id: Number.isFinite(stopId) ? stopId : Number(stop.stop_sequence || 0),
      name: String(stop.stop_name || '').trim() || `Przystanek ${stop.stop_sequence || ''}`.trim(),
      planned: plannedDate ? plannedDate.toISOString() : null,
      real: realDate ? realDate.toISOString() : null,
    };
  });
  const upcomingStops = allStops.filter((stop) => {
    const time = stop.real || stop.planned;
    if (!time) return true;
    return new Date(time).getTime() >= nowMs - 2 * 60 * 1000;
  });

  return {
    schedule: upcomingStops.length > 0 ? upcomingStops : allStops,
    routePath: allStops.map((stop) => stop.id).filter((id) => Number.isFinite(Number(id))),
  };
}

function mapMpkDirectVehicle(
  rawVehicle: Record<string, string>,
  detailsByVehicle: Map<string, any>,
  now: number,
  includeInactive: boolean,
  tripSchedule?: { schedule: Vehicle['schedule']; routePath: number[] },
): Vehicle | null {
  const lat = Number(rawVehicle.y);
  const lon = Number(rawVehicle.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const vehicleNumber = normalizeMpkVehicleId(rawVehicle.nb || rawVehicle.id);
  const details = detailsByVehicle.get(vehicleNumber);
  const line = String(rawVehicle.nr || rawVehicle.nnr || details?.nr || '').trim() || '?';
  const hasLine = line !== '?';
  const dataAgeSec = Math.max(0, Number(rawVehicle.is || 0));
  if (!includeInactive && !hasLine) return null;
  if (dataAgeSec > 30 * 60) return null;

  const previousLat = Number(rawVehicle.py);
  const previousLon = Number(rawVehicle.px);
  const movedDistance = Number.isFinite(previousLat) && Number.isFinite(previousLon)
    ? Math.hypot(lat - previousLat, lon - previousLon)
    : 0;
  const speed = movedDistance > 0 ? Math.min(55, Math.round(movedDistance * 100000)) : 0;
  const rawDelay = Number(rawVehicle.o ?? details?.delay ?? 0);
  const statusCode = String(rawVehicle.s || details?.status || '');
  const delay = getEffectiveMpkDelay(rawDelay, statusCode, speed, tripSchedule?.schedule);
  const nextStopId = Number(rawVehicle.nk || details?.end_stop_id);
  const nextStopName = String(rawVehicle.nop || details?.end_stop_name || '').trim();
  const direction = String(rawVehicle.op || details?.op || rawVehicle.nop || '').trim() || (speed > 3 ? 'W trasie' : 'Postój');
  const isBreak = isMpkBreakStatus(statusCode);

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
    direction,
    delay,
    dataAgeSec,
    schedule: tripSchedule?.schedule?.length
      ? tripSchedule.schedule
      : Number.isFinite(nextStopId) && nextStopName
      ? [{ id: nextStopId, name: nextStopName, planned: null, real: null }]
      : [],
    routePath: tripSchedule?.routePath || [],
    model: details?.bus,
    lastStopDistance: Number.isFinite(Number(rawVehicle.dp)) ? Number(rawVehicle.dp) : undefined,
    lastStopId: Number.isFinite(Number(rawVehicle.ik)) ? Number(rawVehicle.ik) : undefined,
    lastSignalTime: new Date(now - dataAgeSec * 1000).toISOString(),
    journeyId: details?.rawBrygada ?? rawVehicle.kwi?.trim() ?? undefined,
    serviceId: rawVehicle.kwi?.trim() || details?.brygada,
    tripId: details?.trip_id ?? rawVehicle.ik ?? undefined,
    brigadeName: rawVehicle.kwi?.trim() || details?.brygada,
    status: isBreak ? 'break' : 'active',
    statusText: isBreak ? 'Postój na pętli' : speed <= 1 ? 'Postój na trasie' : 'W trasie',
  };
}

async function fetchMpkRzeszowVehiclesDirect(includeInactive: boolean) {
  const [xml, details] = await Promise.all([
    requestText(MPK_RZESZOW_VEHICLES_XML_URL),
    requestJson<any[]>(MPK_RZESZOW_VEHICLES_DETAILS_URL).catch(() => []),
  ]);
  const detailsByVehicle = new Map(
    (Array.isArray(details) ? details : []).map((detail: any) => [normalizeMpkVehicleId(detail?.nb), detail]),
  );
  const now = Date.now();

  return parseMpkVehiclesXml(xml)
    .map((rawVehicle) => mapMpkDirectVehicle(rawVehicle, detailsByVehicle, now, includeInactive))
    .filter((vehicle): vehicle is Vehicle => Boolean(vehicle));
}

async function fetchMpkRzeszowVehicleDetailsDirect(vehicleId: string, includeInactive: boolean) {
  const lookupVehicleId = normalizeMpkVehicleId(String(vehicleId || '').replace(/^mpk_rzeszow_/, ''));
  const [xml, details] = await Promise.all([
    requestText(MPK_RZESZOW_VEHICLES_XML_URL),
    requestJson<any[]>(MPK_RZESZOW_VEHICLES_DETAILS_URL).catch(() => []),
  ]);
  const rawVehicle = parseMpkVehiclesXml(xml).find((vehicle) =>
    normalizeMpkVehicleId(vehicle.nb || vehicle.id) === lookupVehicleId,
  );
  if (!rawVehicle) return null;

  const detailsByVehicle = new Map(
    (Array.isArray(details) ? details : []).map((detail: any) => [normalizeMpkVehicleId(detail?.nb), detail]),
  );
  const vehicleDetails = detailsByVehicle.get(lookupVehicleId);
  const statusCode = String(rawVehicle.s || vehicleDetails?.status || '');
  const delaySeconds = getEffectiveMpkDelay(Number(rawVehicle.o ?? vehicleDetails?.delay ?? 0), statusCode);
  const tripSchedule = await fetchMpkTripSchedule(vehicleDetails?.trip_id ?? rawVehicle.ik, delaySeconds);

  return mapMpkDirectVehicle(rawVehicle, detailsByVehicle, Date.now(), includeInactive, tripSchedule);
}

async function loadStopsDictionary() {
  if (!stopsDictionaryPromise) {
    stopsDictionaryPromise = fetch('/data/stops-dictionary.json', {cache: 'force-cache'}).then((res) => res.json());
  }
  return stopsDictionaryPromise;
}

async function loadShapeIndex() {
  if (!shapeIndexPromise) {
    shapeIndexPromise = fetch('/data/trip-shape-index.json', {cache: 'force-cache'}).then((res) => res.json());
  }
  return shapeIndexPromise;
}

async function loadRouteStopShapeIndex() {
  if (!routeStopShapeIndexPromise) {
    routeStopShapeIndexPromise = fetch('/data/route-stop-shape-index.json', {cache: 'force-cache'})
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}));
  }
  return routeStopShapeIndexPromise;
}

async function loadRouteShapeMetadata() {
  if (!routeShapeMetadataPromise) {
    routeShapeMetadataPromise = fetch('/data/route-shape-metadata.json', {cache: 'force-cache'})
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => []);
  }
  return routeShapeMetadataPromise;
}

function safeShapeId(shapeId: string) {
  return String(shapeId || '').trim().replace(/[^a-zA-Z0-9_.+-]/g, '_');
}

async function loadShapePoints(shapeId: string) {
  const safeId = safeShapeId(shapeId);
  if (!safeId) return [];
  if (!shapePointsCache.has(safeId)) {
    shapePointsCache.set(
      safeId,
      fetch(`/data/route-shapes/${encodeURIComponent(safeId)}.json`, {cache: 'force-cache'})
        .then((res) => (res.ok ? res.json() : []))
        .catch(() => []),
    );
  }
  return shapePointsCache.get(safeId)!;
}

function nearestDistanceSq(point: ShapePoint, samples: ShapePoint[]) {
  let best = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    const dLat = point[0] - sample[0];
    const dLon = point[1] - sample[1];
    const d = dLat * dLat + dLon * dLon;
    if (d < best) best = d;
  }
  return best;
}

function findBestShapeByStops(stops: ShapePoint[], metadata: ShapeMetadata[]) {
  if (stops.length < 2 || metadata.length === 0) return '';
  const minStopLat = Math.min(...stops.map(([lat]) => lat));
  const maxStopLat = Math.max(...stops.map(([lat]) => lat));
  const minStopLon = Math.min(...stops.map(([, lon]) => lon));
  const maxStopLon = Math.max(...stops.map(([, lon]) => lon));
  const pad = 0.035;
  const maxAvgDistanceSq = 0.0000045; // roughly 200-250m around Rzeszow.

  let bestId = '';
  let bestScore = Number.POSITIVE_INFINITY;

  for (const shape of metadata) {
    const [minLat, minLon, maxLat, maxLon] = shape.bbox;
    if (maxLat + pad < minStopLat || minLat - pad > maxStopLat || maxLon + pad < minStopLon || minLon - pad > maxStopLon) {
      continue;
    }

    let total = 0;
    let worst = 0;
    for (const stop of stops) {
      const d = nearestDistanceSq(stop, shape.samples);
      total += d;
      if (d > worst) worst = d;
    }
    const avg = total / stops.length;
    const score = avg + worst * 0.45;
    if (avg <= maxAvgDistanceSq && score < bestScore) {
      bestScore = score;
      bestId = shape.id;
    }
  }

  return bestId;
}

async function fetchRoadRouteForStops(coords: ShapePoint[], cacheKey: string) {
  const cleanCoords = coords.filter(
    ([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon),
  );
  if (cleanCoords.length < 2) return [];

  if (roadRouteCache.has(cacheKey)) return roadRouteCache.get(cacheKey)!;

  const routePromise = (async () => {
    const chunks: ShapePoint[][] = [];
    const maxPoints = 24;
    for (let start = 0; start < cleanCoords.length - 1; start += maxPoints - 1) {
      chunks.push(cleanCoords.slice(start, Math.min(cleanCoords.length, start + maxPoints)));
    }

    const merged: ShapePoint[] = [];
    const appendPoints = (points: ShapePoint[]) => {
      for (const point of points) {
        const last = merged[merged.length - 1];
        if (last && Math.abs(last[0] - point[0]) < 0.000001 && Math.abs(last[1] - point[1]) < 0.000001) {
          continue;
        }
        merged.push(point);
      }
    };

    const fetchOsrmRoute = async (chunk: ShapePoint[]) => {
      const coordString = chunk.map(([lat, lon]) => `${lon},${lat}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson&alternatives=false&steps=false&continue_straight=false`;
      const data = await requestJson<{ routes?: Array<{ geometry?: { coordinates?: [number, number][] } }> }>(url);
      return data.routes?.[0]?.geometry?.coordinates?.map(([lon, lat]) => [lat, lon] as ShapePoint) || [];
    };

    const decodeValhallaShape = (shape: string) => {
      const points: ShapePoint[] = [];
      let index = 0;
      let lat = 0;
      let lon = 0;
      const precision = 1e6;

      while (index < shape.length) {
        let result = 1;
        let shift = 0;
        let b = 0;
        do {
          b = shape.charCodeAt(index++) - 63 - 1;
          result += b << shift;
          shift += 5;
        } while (b >= 0x1f && index < shape.length);
        lat += (result & 1) ? ~(result >> 1) : (result >> 1);

        result = 1;
        shift = 0;
        do {
          b = shape.charCodeAt(index++) - 63 - 1;
          result += b << shift;
          shift += 5;
        } while (b >= 0x1f && index < shape.length);
        lon += (result & 1) ? ~(result >> 1) : (result >> 1);

        points.push([lat / precision, lon / precision]);
      }

      return points;
    };

    const fetchValhallaRoute = async (chunk: ShapePoint[]) => {
      const query = {
        locations: chunk.map(([lat, lon]) => ({ lat, lon, type: 'break' })),
        costing: 'bus',
        directions_options: { units: 'kilometers' },
      };
      const url = `https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify(query))}`;
      const data = await requestJson<{ trip?: { legs?: Array<{ shape?: string }> } }>(url);
      const legs = data.trip?.legs || [];
      const points: ShapePoint[] = [];
      for (const leg of legs) {
        const decoded = leg.shape ? decodeValhallaShape(leg.shape) : [];
        for (const point of decoded) points.push(point);
      }
      return points;
    };

    for (const chunk of chunks) {
      if (chunk.length < 2) continue;
      const points = await fetchOsrmRoute(chunk).catch(() => []);
      if (points.length > 1) {
        appendPoints(points);
        continue;
      }

      const valhallaPoints = await fetchValhallaRoute(chunk).catch(() => []);
      if (valhallaPoints.length > 1) {
        appendPoints(valhallaPoints);
        continue;
      }

      for (let i = 0; i < chunk.length - 1; i++) {
        const segment = await fetchOsrmRoute([chunk[i], chunk[i + 1]]).catch(() => []);
        if (segment.length > 1) {
          appendPoints(segment);
          continue;
        }

        const valhallaSegment = await fetchValhallaRoute([chunk[i], chunk[i + 1]]).catch(() => []);
        if (valhallaSegment.length > 1) appendPoints(valhallaSegment);
      }
    }

    return merged.length > 1 ? merged : [];
  })();

  roadRouteCache.set(cacheKey, routePromise);
  if (roadRouteCache.size > 80) {
    const [firstKey] = roadRouteCache.keys();
    roadRouteCache.delete(firstKey);
  }
  return routePromise;
}

function createQuickCurvedRoute(coords: ShapePoint[]) {
  const cleanCoords = coords.filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
  if (cleanCoords.length < 2) return [];

  const points: ShapePoint[] = [];
  for (let i = 0; i < cleanCoords.length - 1; i += 1) {
    const prev = cleanCoords[Math.max(0, i - 1)];
    const start = cleanCoords[i];
    const end = cleanCoords[i + 1];
    const next = cleanCoords[Math.min(cleanCoords.length - 1, i + 2)];
    const steps = i === 0 || i === cleanCoords.length - 2 ? 12 : 8;

    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const lat = 0.5 * (
        (2 * start[0]) +
        (-prev[0] + end[0]) * t +
        (2 * prev[0] - 5 * start[0] + 4 * end[0] - next[0]) * t2 +
        (-prev[0] + 3 * start[0] - 3 * end[0] + next[0]) * t3
      );
      const lon = 0.5 * (
        (2 * start[1]) +
        (-prev[1] + end[1]) * t +
        (2 * prev[1] - 5 * start[1] + 4 * end[1] - next[1]) * t2 +
        (-prev[1] + 3 * start[1] - 3 * end[1] + next[1]) * t3
      );
      points.push([lat, lon]);
    }
  }

  points.push(cleanCoords[cleanCoords.length - 1]);
  return points;
}

function toTitleCase(str: string) {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(?:^|[\s,\/.\-])\S/g, (match) => match.toUpperCase());
}

function getTripBase(tripId: unknown) {
  return String(tripId || '').trim().split('_')[0] || '';
}

function transportApiUrl(path: string, searchParams?: URLSearchParams) {
  const basePath = path.startsWith('/') ? path : `/${path}`;
  const query = searchParams && Array.from(searchParams.keys()).length > 0 ? `?${searchParams.toString()}` : '';
  return `${TRANSPORT_API_BASE_URL}${basePath}${query}`;
}

function mapTransportVehicleToClient(vehicle: TransportApiVehicle): Vehicle {
  const rawDelay = vehicle.delaySeconds ?? (typeof vehicle.delayMinutes === 'number' ? vehicle.delayMinutes * 60 : 0);
  const statusText = String(vehicle.statusText || '').toLowerCase();
  const delay =
    vehicle.provider === 'mpk_rzeszow' &&
    (vehicle.status === 'break' || statusText.includes('petli') || statusText.includes('pętli') || statusText.includes('przystanku'))
      ? 0
      : rawDelay;

  return {
    id: vehicle.id,
    provider: vehicle.provider,
    operatorName: vehicle.operatorName,
    type: vehicle.type,
    iconVariant: vehicle.iconVariant,
    vehicleNumber: vehicle.vehicleNumber,
    name: vehicle.name || vehicle.displayName,
    routeId: vehicle.routeId,
    routeShortName: vehicle.line,
    lat: Number(vehicle.lat),
    lon: Number(vehicle.lng),
    speed: vehicle.speed,
    direction: vehicle.direction,
    delay,
    dataAgeSec: vehicle.dataAgeSec,
    schedule: vehicle.schedule?.map((stop) => ({
      ...stop,
      lon: stop.lon ?? stop.lng,
    })),
    routeStops: vehicle.routeStops?.map((stop) => ({
      ...stop,
      lon: stop.lon ?? stop.lng,
    })),
    routePath: vehicle.routePath,
    model: vehicle.model,
    lastStopDistance: vehicle.lastStopDistance,
    lastStopId: vehicle.lastStopId,
    lastSignalTime: vehicle.lastUpdate,
    journeyId: vehicle.journeyId,
    serviceId: vehicle.serviceId,
    tripId: vehicle.tripId,
    brigadeName: vehicle.brigadeName,
    status: vehicle.status,
    statusText: vehicle.statusText,
    isHistorical: vehicle.isHistorical,
    bearing: vehicle.bearing,
  };
}

function formatStopName(rawName: string | undefined) {
  if (!rawName) return 'Przystanek nieznany';
  return rawName.trim();
}

function buildSchedule(nextStopPoints: any[] | undefined, stopsDict: Record<string, string>) {
  return (nextStopPoints || []).map((sp: any) => ({
    id: Number(sp.stop_point_id),
    name: formatStopName(stopsDict[String(sp.stop_point_id)]),
    planned: sp.planned_departure_time ? String(sp.planned_departure_time).replace(' ', 'T') : null,
    real: sp.real_departure_time ? String(sp.real_departure_time).replace(' ', 'T') : null,
  }));
}

function buildRoutePath(route: any): number[] {
  const fromStopPoints = Array.isArray(route?.stop_points)
    ? route.stop_points
        .map((sp: any) => Number(typeof sp === 'object' && sp !== null ? sp.stop_point_id : sp))
        .filter((n: number) => Number.isFinite(n))
    : [];
  if (fromStopPoints.length > 1) return fromStopPoints;

  const links = Array.isArray(route?.route_links)
    ? [...route.route_links].sort((a: any, b: any) => Number(a?.index ?? 0) - Number(b?.index ?? 0))
    : [];
  const fromLinks: number[] = [];
  for (const link of links) {
    const from = Number(link?.from);
    const to = Number(link?.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    if (fromLinks.length === 0) fromLinks.push(from);
    if (fromLinks[fromLinks.length - 1] !== to) fromLinks.push(to);
  }
  return fromLinks;
}

function formatClock(ts: number) {
  if (!Number.isFinite(ts)) return '--:--';
  return new Date(ts).toLocaleTimeString('pl-PL', {hour: '2-digit', minute: '2-digit'});
}

function inferVehicleStatus(v: any, ageSec: number, speed: number, now: number, hasLine: boolean) {
  const nextStops = Array.isArray(v.next_stop_points) ? v.next_stop_points : [];
  const firstNext = nextStops[0];
  const plannedMs = firstNext?.planned_departure_time
    ? new Date(String(firstNext.planned_departure_time).replace(' ', 'T')).getTime()
    : NaN;
  const lastStopNumber = Number(v.position?.last_stop_point_number);
  const lastStopDistance = Number(v.position?.last_stop_point_distance);
  const isAtTripStart = lastStopNumber === 0 && (lastStopDistance === 0 || Number.isNaN(lastStopDistance));
  const waitMs = plannedMs - now;

  if (!hasLine) {
    return {
      status: 'inactive' as const,
      statusText: ageSec > 90 ? 'Ukryty pojazd z ostatnia pozycja' : 'Ukryty pojazd bez linii',
    };
  }

  if (v.journey?.route?.is_technical) {
    return {status: 'technical' as const, statusText: 'Przejazd techniczny'};
  }

  if (isAtTripStart && Number.isFinite(waitMs) && waitMs > 120000 && speed <= 5) {
    return {
      status: 'break' as const,
      statusText: `Przerwa do ${formatClock(plannedMs)}`,
    };
  }

  if (speed <= 1 && nextStops.length === 0) {
    return {status: 'inactive' as const, statusText: 'Postoj po kursie'};
  }

  if (speed <= 1) {
    return {status: 'active' as const, statusText: 'Postoj na trasie'};
  }

  return {status: 'active' as const, statusText: 'W trasie'};
}

function mapVehicle(
  v: any,
  now: number,
  includeInactive: boolean,
  stopsDict: Record<string, string>,
  includeDetails = true,
): Vehicle | null {
  if (!v.position || v.position.lat == null || v.position.long == null) return null;

  const signalRaw = v.position.position_date ? String(v.position.position_date).replace(' ', 'T') : '';
  const signalMs = signalRaw ? new Date(signalRaw).getTime() : now;
  const lineName = String(v.journey?.line?.line_name || v.journey?.line?.name || '').trim() || '---';
  const hasLine = lineName !== '---';
  const ageSec = Math.max(0, Math.floor((now - (Number.isNaN(signalMs) ? now : signalMs)) / 1000));
  if (!includeInactive && !hasLine) return null;
  if (ageSec > 7 * 60) return null;

  const speed = Number(v.position.speed || 0);
  let destination = v.journey?.route?.description || v.journey?.route?.name || (speed > 3 ? 'W trasie' : 'Postoj');
  const vehicleStatus = inferVehicleStatus(v, ageSec, speed, now, hasLine);

  return {
    id: String(v.vehicle_id ?? `json-${getTripBase(v.trip_id) || now}`),
    routeId: lineName,
    name: `PKS ${lineName !== '---' ? lineName : String(v.vehicle_id ?? '?')}`,
    routeShortName: lineName !== '---' ? lineName : '?',
    lat: Number(v.position.lat),
    lon: Number(v.position.long),
    speed,
    direction: destination,
    delay: typeof v.delay === 'number' ? v.delay : 0,
    dataAgeSec: ageSec,
    schedule: includeDetails ? buildSchedule(v.next_stop_points, stopsDict) : [],
    routePath: includeDetails ? buildRoutePath(v.journey?.route) : [],
    model: v.model,
    lastStopDistance: typeof v.position.last_stop_point_distance === 'number' ? v.position.last_stop_point_distance : undefined,
    lastStopId: typeof v.position.last_stop_point_number === 'number' ? v.position.last_stop_point_number : undefined,
    lastSignalTime: signalRaw || undefined,
    journeyId: v.journey?.journey_id ?? v.trip_id ?? undefined,
    tripId: v.trip_id ?? undefined,
    serviceId:
      typeof v.journey?.service === 'object'
        ? v.journey.service.service_code || v.journey.service.service_id || String(v.journey.service.timetable_id || '')
        : v.journey?.service,
    brigadeName:
      typeof v.brigade_name === 'string'
        ? v.brigade_name
        : v.journey?.service?.service_code,
    status: vehicleStatus.status,
    statusText: vehicleStatus.statusText,
  };
}

export async function fetchVehiclesClient(
  includeInactive: boolean,
  providers: TransportProviderId[] = ['pks'],
  options?: { signal?: AbortSignal },
) {
  const activeProviders = providers.filter(Boolean);
  if (activeProviders.length === 0) return [];

  const requests = activeProviders.map(async (provider) => {
    if (provider === 'pks') return fetchPksVehiclesClient(includeInactive, options?.signal);
    if (provider === 'mpk_rzeszow') {
      return fetchMpkRzeszowVehiclesClient(includeInactive, options?.signal).catch((error) => {
        if ((error as any)?.name === 'AbortError') throw error;
        console.warn('MPK Rzeszów provider unavailable:', error);
        return [];
      });
    }
    if (provider === 'marcel') {
      return fetchMarcelVehiclesClient(includeInactive, options?.signal).catch((error) => {
        if ((error as any)?.name === 'AbortError') throw error;
        console.warn('Marcel provider unavailable:', error);
        return [];
      });
    }
    return [];
  });

  const results = await Promise.all(requests);
  return results.flat();
}

export async function fetchVehicleDetailsClient(provider: TransportProviderId, vehicleId: string, includeInactive = true) {
  if (provider === 'marcel') {
    return fetchMarcelVehicleDetailsDirect(vehicleId, includeInactive).catch((error) => {
      console.warn('Marcel direct details unavailable:', error);
      return null;
    });
  }

  if (provider === 'mpk_rzeszow') {
    const directVehicle = await fetchMpkRzeszowVehicleDetailsDirect(vehicleId, includeInactive).catch((error) => {
      console.warn('MPK Rzeszów direct details unavailable, using backend:', error);
      return null;
    });
    if (directVehicle && (directVehicle.schedule?.length || 0) > 1) return directVehicle;

    try {
      const searchParams = new URLSearchParams();
      if (includeInactive) searchParams.set('includeInactive', 'true');
      const response = await requestJson<{ vehicle?: TransportApiVehicle }>(
        transportApiUrl(`/vehicle/${encodeURIComponent(provider)}/${encodeURIComponent(vehicleId)}`, searchParams),
      );
      const vehicle = response.vehicle ? mapTransportVehicleToClient(response.vehicle) : null;
      if (vehicle && (vehicle.schedule?.length || 0) > 1) return vehicle;
    } catch (error) {
      console.warn('MPK Rzeszów details backend unavailable:', error);
    }

    return directVehicle;
  }

  if (provider === 'pks') {
    const directVehicle = await fetchPksVehicleDetailsClient(vehicleId, includeInactive).catch((error) => {
      console.warn('PKS details unavailable:', error);
      return null;
    });
    if (directVehicle) return directVehicle;
  }

  const searchParams = new URLSearchParams();
  if (includeInactive) searchParams.set('includeInactive', 'true');

  const response = await requestJson<{ vehicle?: TransportApiVehicle }>(
    transportApiUrl(`/vehicle/${encodeURIComponent(provider)}/${encodeURIComponent(vehicleId)}`, searchParams),
  );

  if (!response.vehicle) return null;
  return mapTransportVehicleToClient(response.vehicle);
}

export async function fetchStopsClient(): Promise<StopsMap> {
  const data = await requestEinfoJson<any>('stop-point', {
    headers: {'Accept': 'application/json'},
  }).catch(async () => {
    const dict = await loadStopsDictionary();
    return {
      items: Object.entries(dict).map(([id, name]) => ({
        stop_point_id: id,
        name,
        stop_area_name: '',
        stop_area_id: '',
        stop_point_code: '',
        location: {},
      })),
    };
  });

  const compressedMap: StopsMap = {};
  for (const stop of data?.items || []) {
    const lat = Number(stop.location?.lat ?? stop.location?.latitude);
    const lon = Number(stop.location?.lon ?? stop.location?.lng ?? stop.location?.long ?? stop.location?.longitude);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
    const areaName = stop.stop_area_name ? stop.stop_area_name.trim() : '';
    const name = stop.name ? stop.name.trim() : '';
    const finalNameRaw = areaName || name;
    let formattedName = toTitleCase(finalNameRaw);

    if (stop.stop_point_code && stop.stop_point_code.trim()) {
      let code = stop.stop_point_code.trim();
      const isRzeszow = formattedName.includes('Rzeszow') || formattedName.includes('Rzeszów');
      const isRzeszowDA = isRzeszow && (formattedName.includes('D.A.') || formattedName.toLowerCase().includes('dworzec'));

      if (!isRzeszowDA && /^0\d$/.test(code)) code = code.substring(1);

      if (isRzeszow) {
        if (isRzeszowDA) {
          if (/^0+\d+$/.test(code)) code = String(Number(code));
          if (!formattedName.toLowerCase().includes('st.')) formattedName += ` st. ${code}`;
        } else {
          // Rzeszów: zawsze pokazujemy pełny kod z wiodącym zerem, jeśli istnieje w API.
          formattedName += ` ${stop.stop_point_code.trim()}`;
        }
      } else if (code) {
        // Poza Rzeszowem: zawsze dopinamy kod jako suffix, żeby np. 03/04 były widoczne osobno.
        formattedName += ` ${code}`;
      }
    }

    compressedMap[String(stop.stop_point_id)] = {
      n: formattedName,
      lat: hasCoords ? lat : undefined,
      lon: hasCoords ? lon : undefined,
      areaId: String(stop.stop_area_id),
      code: stop.stop_point_code ? String(stop.stop_point_code).trim() : '',
    };
  }

  return compressedMap;
}

function isJourneyRunning(legends: string[], dateIso: string) {
  if (!legends || legends.length === 0) return true;
  const normalizedLegends = legends.map((legend) =>
    String(legend || '')
      .trim()
      .replace('6Ĺ›', '6ś'),
  );
  const dt = new Date(dateIso);
  const day = dt.getDay();
  const month = dt.getMonth() + 1;
  const date = dt.getDate();
  const isHoliday =
    (month === 1 && date === 1) || (month === 1 && date === 6) ||
    (month === 5 && date === 1) || (month === 5 && date === 3) ||
    (month === 8 && date === 15) || (month === 11 && date === 1) ||
    (month === 11 && date === 11) || (month === 12 && date === 25) ||
    (month === 12 && date === 26);
  const isSundayOrHoliday = day === 0 || isHoliday;
  const isWeekendOrHoliday = day === 0 || day === 6 || isHoliday;
  const effectiveLegends = normalizedLegends.map((legend) =>
    legend.startsWith('6') && legend !== '6' && legend !== '6/7' ? '6\u015b' : legend,
  );
  const saturdaySchool = '6\u015b';
  const effectiveBaseLegends = ['D', '(D)', 'S', 'E', 'C', '+', saturdaySchool, '6', '7', '1-4', '2-5', '5', '5/6', '6/7'];
  if (!effectiveLegends.some((legend) => effectiveBaseLegends.includes(legend))) return true;

  let effectiveRuns = false;
  for (const legend of effectiveLegends) {
    if ((legend === 'D' || legend === '(D)' || legend === 'S') && !isWeekendOrHoliday) effectiveRuns = true;
    if (legend === 'E' && !isSundayOrHoliday) effectiveRuns = true;
    if (legend === 'C' && isWeekendOrHoliday) effectiveRuns = true;
    if (legend === saturdaySchool && day === 6 && !isHoliday) effectiveRuns = true;
    if (legend === '6' && day === 6) effectiveRuns = true;
    if ((legend === '+' || legend === '7') && isSundayOrHoliday) effectiveRuns = true;
    if (legend === '5' && day === 5 && !isHoliday) effectiveRuns = true;
    if (legend === '1-4' && day >= 1 && day <= 4 && !isHoliday) effectiveRuns = true;
    if (legend === '2-5' && day >= 2 && day <= 5 && !isHoliday) effectiveRuns = true;
    if (legend === '5/6' && day === 5) effectiveRuns = true;
    if (legend === '6/7' && day === 6) effectiveRuns = true;
  }
  return effectiveRuns;
}

function processTimetable(ttData: any, dayIso: string, codeToCompare: string) {
  if (!ttData?.items) return [];
  const mapped: any[] = [];
  const normalizedCode = String(codeToCompare || '').trim();
  const normalizedCodeNumber = parseInt(normalizedCode, 10);
  ttData.items.forEach((item: any) => {
    item.journeys?.forEach((journey: any) => {
      const journeyCode = String(journey.stop_point_code || '').trim();
      const journeyCodeNumber = parseInt(journeyCode, 10);
      const isMatch =
        journeyCode === normalizedCode ||
        (!Number.isNaN(journeyCodeNumber) &&
          !Number.isNaN(normalizedCodeNumber) &&
          journeyCodeNumber === normalizedCodeNumber);

      if (isMatch && isJourneyRunning(journey.legends || [], dayIso)) {
        mapped.push({
          timetable_time: `${dayIso}T${journey.time}:00`,
          past: false,
          deviation: null,
          legends: journey.legends,
          route_description: item.description,
          line_name: item.line_name,
          vias: item.vias,
          operator_short_name: journey.operator,
        });
      }
    });
  });
  return mapped;
}

export async function fetchDeparturesClient(stopId: string, areaId?: string, code?: string) {
  const nearestData = await requestEinfoJson<any>(`its/infoboard/nearest-departures/${stopId}`, {
    headers: {Accept: 'application/json'},
  }).catch(() => ({journeys: []}));

  if (!areaId || !code) {
    const nowMs = Date.now();
    return {
      ...nearestData,
      journeys: (nearestData.journeys || [])
        .map((journey: any) => ({
          ...journey,
          timetable_time: String(journey.timetable_time || '').replace(' ', 'T'),
        }))
        .filter((journey: any) => {
          const t = new Date(journey.timetable_time).getTime();
          return Number.isFinite(t) && t >= nowMs - 15 * 60000 && t <= nowMs + 24 * 3600000;
        }),
    };
  }

  const now = new Date();
  const warsawSvc = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayIso = warsawSvc.format(now);
  const tomorrowIso = warsawSvc.format(new Date(now.getTime() + 86400000));

  const [ttDataT, ttDataN] = await Promise.all([
    requestEinfoJson<any>(`stop-point-timetable/${areaId}?day=${todayIso}`, {headers: {Accept: 'application/json'}}).catch(() => ({items: []})),
    requestEinfoJson<any>(`stop-point-timetable/${areaId}?day=${tomorrowIso}`, {headers: {Accept: 'application/json'}}).catch(() => ({items: []})),
  ]);

  const originalLiveJourneys = [...(nearestData.journeys || [])].map((journey: any) => ({
    ...journey,
    timetable_time: String(journey.timetable_time || '').replace(' ', 'T'),
  }));
  const combinedJourneys = [...originalLiveJourneys];
  const mapped = [
    ...processTimetable(ttDataT, todayIso, String(code).trim()),
    ...processTimetable(ttDataN, tomorrowIso, String(code).trim()),
  ];

  mapped.forEach((journey) => {
    const journeyTimeMs = new Date(journey.timetable_time).getTime();
    const isDuplicate = originalLiveJourneys.some((live: any) => {
      if (live.line_name !== journey.line_name) return false;
      const liveTimeMs = new Date(live.timetable_time).getTime();
      return Math.abs(liveTimeMs - journeyTimeMs) <= 2 * 60000;
    });

    if (!isDuplicate) combinedJourneys.push(journey);
  });

  combinedJourneys.sort(
    (a: any, b: any) => new Date(a.timetable_time).getTime() - new Date(b.timetable_time).getTime(),
  );
  const nowMs = Date.now();

  return {
    ...nearestData,
    journeys: combinedJourneys.filter((journey: any) => {
      const t = new Date(journey.timetable_time).getTime();
      return Number.isFinite(t) && t >= nowMs - 15 * 60000 && t <= nowMs + 24 * 3600000;
    }),
  };
}

export async function fetchRouteShapeClient(
  tripId: string,
  fallbackStops: Array<number | string>,
  stopsData?: Record<string, {lat: number; lon: number}> | null,
  options?: { fastFallback?: boolean; startPoint?: ShapePoint; skipOfficialShape?: boolean },
) {
  const tripIdBase = String(tripId || '').trim().split('_')[0];
  const normalizedStops = fallbackStops
    .map((id) => String(id || '').trim())
    .filter(Boolean);

  if (!options?.skipOfficialShape && tripIdBase) {
    try {
      const shapeIndex = await loadShapeIndex();
      const shapeId = shapeIndex?.[tripIdBase];
      const points = shapeId ? await loadShapePoints(shapeId) : [];
      if (points.length > 1) return points;
    } catch {}
  }

  if (!options?.skipOfficialShape && normalizedStops.length > 1) {
    try {
      const stopShapeIndex = await loadRouteStopShapeIndex();
      const shapeId = stopShapeIndex[normalizedStops.join('-')];
      const points = shapeId ? await loadShapePoints(shapeId) : [];
      if (points.length > 1) return points;
    } catch {}
  }

  const stopCoords = normalizedStops
    .map((id) => stopsData?.[id])
    .filter((stop): stop is { lat: number; lon: number } => {
      if (!stop) return false;
      return Number.isFinite(stop.lat) && Number.isFinite(stop.lon);
    })
    .map((stop) => [stop.lat, stop.lon] as ShapePoint);
  const routeCoords = options?.startPoint
    ? [options.startPoint, ...stopCoords].filter(
        ([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon),
      )
    : stopCoords;

  if (options?.fastFallback) {
    const quickRoute = createQuickCurvedRoute(routeCoords);
    if (quickRoute.length > 1) return quickRoute;
  }

  if (stopCoords.length > 1) {
    try {
      const roadRoute = await fetchRoadRouteForStops(stopCoords, normalizedStops.join('-'));
      if (roadRoute.length > 1) return roadRoute;
    } catch {}

    if (!options?.skipOfficialShape) {
      try {
        const shapeId = findBestShapeByStops(stopCoords, await loadRouteShapeMetadata());
        const points = shapeId ? await loadShapePoints(shapeId) : [];
        if (points.length > 1) return points;
      } catch {}
    }

  }
  const quickRoute = createQuickCurvedRoute(routeCoords);
  if (quickRoute.length > 1) return quickRoute;
  return [];
}
