import { mpkFeedVehicles, mpkSignalTime } from './mpk-vehicle-feed';
import {officialBusStops} from './official-bus-routes';
import {decodePolyline,routeChunks,joinRouteChunks} from './bus-road-geometry';
import { busOperatingState, transitTimestamp } from './bus-operating-state';
import pksSchoolCalendar from '@/public/data/mpk-service-calendar.json';
import {Capacitor, CapacitorHttp} from '@capacitor/core';
import type {Vehicle} from '@/components/BusMap';
import { warsawDateIso, warsawTimeMs } from './transit-time';
import { withRequestDeadline } from './request-deadline';
import { mpkBoardEntries, mpkServicesOnDate, type MpkCalendar } from './mpk-departures';

type StopsMap = Record<string, {n: string; lat?: number; lon?: number; areaId?: string; code?: string}>;
type FullStopRecord = { id?: string; name?: string; areaId?: string; code?: string };
type PersistentCacheEnvelope<T> = {
  version: number;
  savedAt: number;
  signature: string;
  data: T;
};
type ShapePoint = [number, number];
type ShapeMetadata = { id: string; bbox: [number, number, number, number]; samples: ShapePoint[] };
type StopPointIndex = Record<string, { n: string; lat?: number; lon?: number }>;
export type TransportProviderId = 'pks' | 'mpk_rzeszow' | 'marcel' | 'pkp_intercity';
export type RouteGeometryStop = {
  id?: string | number;
  name?: string;
  lat: number;
  lon: number;
  sequence?: number;
};
export type PkpQueryViewport = {
  bbox?: [number, number, number, number] | null;
  center?: [number, number] | null;
  zoom?: number;
};
export type RouteGeometryClientRequest = {
  carrier: string;
  line: string;
  direction: string;
  variant?: string;
  stops: RouteGeometryStop[];
  dataVersion?: string;
  mode?: 'road' | 'rail';
};
export type RouteGeometryClientResponse = {
  carrier: string;
  line: string;
  direction: string;
  variant: string;
  stopsHash: string;
  cacheKey: string;
  geometry?: {
    type: 'LineString';
    coordinates?: [number, number][];
  };
  source?: string;
  sourceQuality?: 'high' | 'fallback' | 'none';
  isSynthetic?: boolean;
  cached?: boolean;
  skippedSegments?: number;
};

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
  schedule?: Array<{ id: number; name: string; planned: string | null; real: string | null; lat?: number; lon?: number; lng?: number; isPast?: boolean; platform?: string; track?: string; stopDelayMinutes?: number; timeType?: 'arrival' | 'departure' }>;
  routeStops?: Array<{ id: number; name: string; planned: string | null; real: string | null; lat?: number; lon?: number; lng?: number; isPast?: boolean; platform?: string; track?: string; stopDelayMinutes?: number; timeType?: 'arrival' | 'departure' }>;
  routePath?: number[];
  model?: string;
  lastStopDistance?: number;
  lastStopId?: number;
  lastUpdate?: string;
  previousTripEndedAtMs?: number;
  nextTripStartAtMs?: number;
  nextTripFirstStopId?: number;
  computedSpeed?: number;
  journeyId?: string | number;
  serviceId?: string | number;
  tripId?: string | number;
  brigadeName?: string;
  status?: 'active' | 'break' | 'inactive' | 'technical' | 'cached';
  statusText?: string;
  isHistorical?: boolean;
  trainName?: string;
  positionQuality?: 'known' | 'estimated';
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
let fullStopsDictionaryPromise: Promise<Record<string, FullStopRecord>> | null = null;
let stopPointIndexPromise: Promise<StopPointIndex> | null = null;
let shapeIndexPromise: Promise<Record<string, string>> | null = null;
let routeStopShapeIndexPromise: Promise<Record<string, string>> | null = null;
let routeShapeMetadataPromise: Promise<ShapeMetadata[]> | null = null;
let pkpStationCoordinatesPromise: Promise<Record<string, { lat: number; lon: number }>> | null = null;
const pkpTrainMetadataCache = new Map<string, { expiresAt: number; value: PkpTrainMetadata | null }>();
const pkpTrainMetadataInflight = new Map<string, Promise<PkpTrainMetadata | null>>();
const shapePointsCache = new Map<string, Promise<ShapePoint[]>>();
const roadRouteCache = new Map<string, ShapePoint[]>();
const TRANSPORT_API_BASE_URL = (
  process.env.NEXT_PUBLIC_TRANSPORT_API_BASE_URL ||
  'https://us-central1-aplikacja-b20fa.cloudfunctions.net/transportApi'
).replace(/\/$/, '');
const MPK_RZESZOW_VEHICLES_JSON_URL = 'https://www.mpkrzeszow.pl/ztm/new/api.php?type=mpk';
const MPK_RZESZOW_VEHICLES_XML_URL = 'https://www.mpkrzeszow.pl/mpk/vehicles_proxy.php';
const MPK_RZESZOW_VEHICLES_DETAILS_URL = 'https://www.mpkrzeszow.pl/mpk/get_vehicles.php';
const MPK_RZESZOW_TRIP_STOPS_URL = 'https://www.mpkrzeszow.pl/brygady/get_trip_stops_advanced.php';
const MARCEL_API_BASE_URL = (process.env.NEXT_PUBLIC_MARCEL_API_BASE_URL || 'https://api-site.marcel-bus.pl').replace(/\/$/, '');
const MARCEL_DIRECT_VEHICLES_URL =
  process.env.NEXT_PUBLIC_MARCEL_VEHICLES_URL ||
  `${MARCEL_API_BASE_URL}/client/api/trasy/lokalizacjaBusow?appVersion=v1.67`;
const MPK_RZESZOW_STOPS_URL = 'https://www.mpkrzeszow.pl/przystanki/stopscache';
const MPK_RZESZOW_STOP_SCHEDULE_URL = 'https://www.mpkrzeszow.pl/przystanki/offline_schedule.php';
const PKP_INTERCITY_GPS_PROXY_URL =
  process.env.NEXT_PUBLIC_PKP_INTERCITY_GPS_PROXY_URL ||
  '/api/pkp-intercity/gps';
const PKP_STATIONS_DATASET_URL =
  process.env.NEXT_PUBLIC_PKP_STATIONS_DATASET_URL ||
  'https://cdn.jsdelivr.net/gh/trainline-eu/stations/stations.csv';
const PKP_DEFAULT_CENTER: [number, number] = [50.0429, 22.0069]; // Rzeszow Glowny
const PKP_MAX_DISTANCE_KM = Number(process.env.NEXT_PUBLIC_PKP_INTERCITY_MAX_DISTANCE_KM || 120);
const PKP_METADATA_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PKP_METADATA_LOOKUP_LIMIT = 80;
const mpkTripStopsByTripCache = new Map<string, Promise<any[]>>();
const marcelCourseStopsCache = new Map<string, Promise<MarcelCourseStop[]>>();
const marcelResolvedCourseStops = new Map<string, MarcelCourseStop[]>();
const marcelCourseListeners = new Set<(courseId: string) => void>();
let marcelBadgeQueue: string[] = [];
let marcelBadgeRequests = 0;
const marcelBadgeInflight = new Set<string>();
const marcelPositionFreshness = new Map<string, { signature: string; signalMs: number; lastSeenMs: number }>();
const marcelProgressState = new Map<string, {
  positionSignature: string;
  positionSinceMs: number;
  tripProgressSignature: string;
  tripProgressSinceMs: number;
  lastSeenMs: number;
}>();
const vehicleSpeedHistory = new Map<string, { lat: number; lon: number; atMs: number; lastSeenMs: number }>();
const MARCEL_STALE_MS = 7 * 60 * 1000;
const CLIENT_STOP_CACHE_VERSION = 4;
const CLIENT_STOP_CACHE_TTL_MS = 15 * 60 * 1000;
const PKS_STOPS_CACHE_KEY = 'pks-live:pks-stops:v5';
const MPK_STOPS_CACHE_KEY = 'pks-live:mpk-rzeszow-stops:v4';

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

type PkpTrainMetadata = {
  trainNumber: string;
  category: string;
  trainName?: string;
};

const isNative = () => Capacitor.isNativePlatform();
const EINFO_DIRECT = 'http://einfo.zgpks.rzeszow.pl/api';

function einfoFallbackUrl(pathAndOptionalQuery: string) {
  const trimmed = pathAndOptionalQuery.replace(/^\//, '');
  return `${EINFO_DIRECT}/${trimmed}`;
}

async function requestJson<T>(url: string, init?: RequestInit & {headers?: Record<string, string>}): Promise<T> {
  return withRequestDeadline((signal) => requestJsonImpl<T>(url, { ...init, signal }), init?.signal || undefined);
}

async function requestJsonImpl<T>(url: string, init?: RequestInit & {headers?: Record<string, string>}): Promise<T> {
  if (isNative()) {
    let data: unknown;
    if (typeof init?.body === 'string' && init.body) {
      try {
        data = JSON.parse(init.body);
      } catch {
        data = init.body;
      }
    }
    const response = await CapacitorHttp.request({
      url,
      method: init?.method || 'GET',
      headers: init?.headers,
      data,
      connectTimeout: 12000,
      readTimeout: 12000,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Request failed: ${response.status}`);
    }

    if (typeof response.data === 'string') {
      try {
        return JSON.parse(response.data) as T;
      } catch {
        throw new Error(`Invalid JSON (HTTP ${response.status}): ${response.data.slice(0, 120)}`);
      }
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
  return requestJson<T>(isNative() ? einfoFallbackUrl(pathAndOptionalQuery) : '/api/pks/einfo/' + pathAndOptionalQuery, init);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function cacheSignature(value: unknown) {
  const normalized = stableStringify(value);
  const size = Array.isArray(value)
    ? value.length
    : value && typeof value === 'object'
      ? Object.keys(value as Record<string, unknown>).length
      : 0;
  return `${size}:${hashString(normalized)}`;
}

function readPersistentClientCache<T>(key: string): PersistentCacheEnvelope<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null') as PersistentCacheEnvelope<T> | null;
    if (!parsed || parsed.version !== CLIENT_STOP_CACHE_VERSION || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersistentClientCache<T>(key: string, data: T) {
  if (typeof window === 'undefined') return cacheSignature(data);
  const signature = cacheSignature(data);

  try {
    window.localStorage.setItem(key, JSON.stringify({
      version: CLIENT_STOP_CACHE_VERSION,
      savedAt: Date.now(),
      signature,
      data,
    } satisfies PersistentCacheEnvelope<T>));
  } catch {
    // The in-memory/network result is still used if persistent storage is full.
  }
  return signature;
}

function normalizeNameForComparison(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function bestPksStopName(areaName: string, stopName: string) {
  const area = areaName.trim();
  const name = stopName.trim();
  if (!area) return name;
  if (!name) return area;
  const normalizedArea = normalizeNameForComparison(area);
  const normalizedName = normalizeNameForComparison(name);
  const areaHasCity = /\b(rzeszow|boguchwala|babica|czudec|gwoznica|wyzne|lutoryz|zarzecze|polomia|baryczka)\b/.test(normalizedArea);
  const nameHasCity = /\b(rzeszow|boguchwala|babica|czudec|gwoznica|wyzne|lutoryz|zarzecze|polomia|baryczka)\b/.test(normalizedName);
  if (!areaHasCity && nameHasCity && normalizedName.includes(normalizedArea)) return name;
  return area;
}

async function requestText(url: string, init?: RequestInit & {headers?: Record<string, string>}): Promise<string> {
  return withRequestDeadline((signal) => requestTextImpl(url, { ...init, signal }), init?.signal || undefined);
}

async function requestTextImpl(url: string, init?: RequestInit & {headers?: Record<string, string>}): Promise<string> {
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

async function fetchPksVehiclesSnapshot(signal?: AbortSignal) {
  const panelFeedUrl = isNative() ? 'http://185.214.67.112/api/its/vehicles' : '/api/pks/vehicles';
  const panelRequest = requestJson<any>(panelFeedUrl, {
    signal,
    headers: isNative()
      ? {
          Host: 'einfo.zgpks.rzeszow.pl',
          Accept: 'application/json',
        }
      : { Accept: 'application/json' },
  }).then((feed) => Array.isArray(feed?.items) ? feed.items : Array.isArray(feed) ? feed : []);
  const directRequest = requestJson<any[]>('https://www.mpkrzeszow.pl/pks/get_vehicles.php', { signal });
  try {
    return await Promise.any([panelRequest, directRequest].map(async (request) => {
      const items = await request;
      if (!Array.isArray(items) || items.length === 0) throw new Error('Empty PKS snapshot');
      return items;
    }));
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
  }

  const wsItems = await fetchPksVehiclesFromPanelWebSocket(signal).catch(() => []);
  if (wsItems.length > 0) return wsItems;

  return [];
}

function fetchPksVehiclesFromPanelWebSocket(signal?: AbortSignal): Promise<any[]> {
  if (typeof WebSocket === 'undefined') return Promise.resolve([]);

  return new Promise((resolve) => {
    let settled = false;
    let ws: WebSocket | null = null;
    const finish = (items: any[]) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortHandler);
      try {
        ws?.close();
      } catch {}
      resolve(items);
    };
    const abortHandler = () => finish([]);
    const timeoutId = window.setTimeout(() => finish([]), 3500);

    signal?.addEventListener('abort', abortHandler, { once: true });
    try {
      ws = new WebSocket('ws://185.214.67.112:3000/rist');
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data || ''));
          const items = Array.isArray(payload?.items) ? payload.items : [];
          if (items.length > 0) finish(items);
        } catch {
          finish([]);
        }
      };
      ws.onerror = () => finish([]);
      ws.onclose = () => finish([]);
    } catch {
      finish([]);
    }
  });
}

async function fetchPksVehiclesClient(includeInactive: boolean, signal?: AbortSignal) {
  const rawVehicles = await fetchPksVehiclesSnapshot(signal);
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
    fetchPksVehiclesSnapshot(),
    loadStopPointIndex(),
  ]);
  const rawVehicle = (Array.isArray(rawVehicles) ? rawVehicles : []).find((vehicle) =>
    String(vehicle?.vehicle_id ?? vehicle?.id ?? `json-${getTripBase(vehicle?.trip_id) || ''}`) === String(vehicleId),
  );
  if (!rawVehicle) return null;

  const mapped = mapVehicle(rawVehicle, Date.now(), includeInactive, stopsDict, true);
  if(mapped) {
    const officialStops=await officialBusStops('pks',rawVehicle.trip_id).catch(()=>[]);
    const full=mapped.routeStops||[];
    const aligned=officialStops.length===full.length && full.every((stop,index)=>!Number.isFinite(stop.lat)||!Number.isFinite(stop.lon)||distanceMeters([stop.lat!,stop.lon!],[officialStops[index].lat,officialStops[index].lon])<1200);
    if(aligned) {
      mapped.routeStops=full.map((stop,index)=>({...stop,lat:stop.lat??officialStops[index].lat,lon:stop.lon??officialStops[index].lon}));
      const byId=new Map(mapped.routeStops.map(stop=>[String(stop.id),stop]));
      mapped.schedule=mapped.schedule?.map(stop=>({...stop,lat:stop.lat??byId.get(String(stop.id))?.lat,lon:stop.lon??byId.get(String(stop.id))?.lon}));
    }
  }
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
    const direct = await fetchMpkRzeszowVehiclesDirect(includeInactive, signal);
    if (direct.length > 0) return direct;
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  try {
    const response = await requestJson<TransportApiVehiclesResponse>(transportApiUrl('/vehicles', searchParams), { signal });
    const vehicles = (response.vehicles || []).map(mapTransportVehicleToClient);
      if (vehicles.length > 0) return vehicles;
    return fetchMpkRzeszowVehiclesDirect(includeInactive, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    console.warn('MPK Rzeszów backend unavailable, using direct MPK feed:', error);
    return fetchMpkRzeszowVehiclesDirect(includeInactive, signal);
  }
}

async function fetchMarcelVehiclesClient(includeInactive: boolean, signal?: AbortSignal, viewport?: PkpQueryViewport) {
  const vehicles = await fetchMarcelVehiclesDirect(includeInactive, signal);
  if (!signal?.aborted && viewport?.bbox) warmMarcelBadgeCourses(vehicles, viewport.bbox);
  return vehicles;
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

function getMarcelProgressState(
  vehicleKey: string,
  lat: number,
  lon: number,
  tripId: unknown,
  nextStopId: unknown,
  now: number,
) {
  const positionSignature = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const tripProgressSignature = `${String(tripId || '').trim()}:${String(nextStopId || '').trim()}`;
  const existing = marcelProgressState.get(vehicleKey);

  if (!existing) {
    marcelProgressState.set(vehicleKey, {
      positionSignature,
      positionSinceMs: now,
      tripProgressSignature,
      tripProgressSinceMs: now,
      lastSeenMs: now,
    });
    return { positionUnchangedMinutes: 0, tripProgressUnchangedMinutes: 0 };
  }

  if (existing.positionSignature !== positionSignature) {
    existing.positionSignature = positionSignature;
    existing.positionSinceMs = now;
  }
  if (existing.tripProgressSignature !== tripProgressSignature) {
    existing.tripProgressSignature = tripProgressSignature;
    existing.tripProgressSinceMs = now;
  }
  existing.lastSeenMs = now;

  if (marcelProgressState.size > 500) {
    for (const [key, value] of marcelProgressState) {
      if (now - value.lastSeenMs > 2 * 60 * 60 * 1000) marcelProgressState.delete(key);
    }
  }

  return {
    positionUnchangedMinutes: Math.floor((now - existing.positionSinceMs) / 60_000),
    tripProgressUnchangedMinutes: Math.floor((now - existing.tripProgressSinceMs) / 60_000),
  };
}

function shouldHideDeadMarcelVehicle({
  delaySeconds,
  speed,
  positionUnchangedMinutes,
  tripProgressUnchangedMinutes,
  isAtTerminalOrDepot,
}: {
  delaySeconds: number;
  speed: number;
  positionUnchangedMinutes: number;
  tripProgressUnchangedMinutes: number;
  isAtTerminalOrDepot: boolean;
}) {
  const hugeDelay = delaySeconds / 60 >= 180;
  const samePlaceLong = positionUnchangedMinutes >= 20;
  const inferredSpeed = Number.isFinite(speed) ? speed : samePlaceLong ? 0 : Number.POSITIVE_INFINITY;
  const notMoving = inferredSpeed <= 2;
  const noTripProgress = tripProgressUnchangedMinutes >= 20;

  return hugeDelay && notMoving && samePlaceLong && (noTripProgress || isAtTerminalOrDepot);
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
        .then(stops => {
          marcelResolvedCourseStops.set(id, stops);
          for (const listener of marcelCourseListeners) listener(id);
          return stops;
        })
        .catch(error => { marcelCourseStopsCache.delete(id); throw error; }),
    );
    if (marcelCourseStopsCache.size > 200) {
      const firstKey = marcelCourseStopsCache.keys().next().value;
      if (firstKey) { marcelCourseStopsCache.delete(firstKey); marcelResolvedCourseStops.delete(firstKey); }
    }
  }
  return marcelCourseStopsCache.get(id)!;
}

/** Notify map markers as soon as background course data becomes available. */
export function subscribeMarcelCourseDelays(listener: (courseId: string) => void) {
  marcelCourseListeners.add(listener);
  return () => { marcelCourseListeners.delete(listener); };
}

/** Use the latest vehicle position; never replay an old fleet snapshot. */
export function withCachedMarcelDelay(vehicle: Vehicle, now = Date.now()): Vehicle {
  if (vehicle.provider !== 'marcel') return vehicle;
  const stops = marcelResolvedCourseStops.get(String(vehicle.tripId || vehicle.journeyId || ''));
  if (!stops || stops.length < 2) return vehicle;
  const delay = estimateMarcelDelaySeconds(vehicle.lat, vehicle.lon, stops, now);
  return delay === undefined || delay === vehicle.delay ? vehicle : { ...vehicle, delay };
}

/** Warm only visible courses, two at a time, without holding up position polling. */
export function warmMarcelBadgeCourses(vehicles: Vehicle[], bbox: [number, number, number, number]) {
  const [west, south, east, north] = bbox;
  if (!bbox.every(Number.isFinite)) return;
  marcelBadgeQueue = [...new Set(vehicles.filter(v => v.provider === 'marcel' && v.lon >= west && v.lon <= east && v.lat >= south && v.lat <= north)
    .map(v => String(v.tripId || v.journeyId || '')).filter(id => id && !marcelCourseStopsCache.has(id) && !marcelBadgeInflight.has(id)))];
  const pump = () => {
    while (marcelBadgeRequests < 2 && marcelBadgeQueue.length) {
      const id = marcelBadgeQueue.shift()!;
      if (marcelCourseStopsCache.has(id) || marcelBadgeInflight.has(id)) continue;
      marcelBadgeRequests++; marcelBadgeInflight.add(id);
      void fetchMarcelCourseStops(id).catch(() => { /* Retry on the next fleet refresh. */ }).finally(() => {
        marcelBadgeRequests--; marcelBadgeInflight.delete(id); pump();
      });
    }
  };
  pump();
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

function computeObservedSpeedKmh(vehicleKey: string, lat: number, lon: number, observedAtMs: number, rawSpeed?: number) {
  if (Number.isFinite(rawSpeed) && rawSpeed! > 0) {
    vehicleSpeedHistory.set(vehicleKey, { lat, lon, atMs: observedAtMs, lastSeenMs: Date.now() });
    return Math.max(0, rawSpeed!);
  }

  const previous = vehicleSpeedHistory.get(vehicleKey);
  vehicleSpeedHistory.set(vehicleKey, { lat, lon, atMs: observedAtMs, lastSeenMs: Date.now() });

  if (!previous) return Number.isFinite(rawSpeed) ? Math.max(0, rawSpeed!) : undefined;
  const elapsedSec = Math.max(0, (observedAtMs - previous.atMs) / 1000);
  const movedMeters = distanceMeters([lat, lon], [previous.lat, previous.lon]);
  if (elapsedSec < 3 || movedMeters < 8) return Number.isFinite(rawSpeed) ? Math.max(0, rawSpeed!) : 0;

  const speed = (movedMeters / elapsedSec) * 3.6;
  if (!Number.isFinite(speed) || speed > 140) return Number.isFinite(rawSpeed) ? Math.max(0, rawSpeed!) : undefined;

  if (vehicleSpeedHistory.size > 900) {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (const [key, value] of vehicleSpeedHistory) {
      if (value.lastSeenMs < cutoff) vehicleSpeedHistory.delete(key);
    }
  }

  return Math.round(speed);
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

async function mapMarcelDirectVehicle(raw: any, now: number, includeInactive: boolean, includeRoute = false): Promise<Vehicle | null> {
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
  const courseStops = includeRoute ? await fetchMarcelCourseStops(tripId) : marcelResolvedCourseStops.get(String(tripId || '')) || [];
  const delay = courseStops.length >= 2 ? estimateMarcelDelaySeconds(lat, lon, courseStops, now) : undefined;
  const schedule = includeRoute ? buildMarcelSchedule(courseStops, delay ?? 0, now) : [];
  const routeStops = includeRoute ? buildMarcelRouteStops(courseStops, delay ?? 0, now) : [];
  const fullRoutePath = routeStops.map((stop) => stop.id);
  const hasLine = line !== '?';

  const rawSpeed = readMarcelNumber(raw, ['speed', 'predkosc', 'prędkość', 'v', 'velocity', 'position.speed']);
  const speed = computeObservedSpeedKmh(`marcel:${rawVehicleId}`, lat, lon, signalMs, rawSpeed);
  const vehicleStatus = busOperatingState({lat,lon,speed:speed??0,nowMs:now,stops:routeStops});
  const nextStopId = schedule[0]?.id ?? routeStops.find((stop) => !stop.isPast)?.id ?? '';
  const progressState = getMarcelProgressState(String(rawVehicleId), lat, lon, tripId, nextStopId, now);
  const firstStop = routeStops[0];
  const lastStop = routeStops[routeStops.length - 1];
  const isAtTerminalOrDepot = Boolean(
    (firstStop && distanceMeters([lat, lon], [firstStop.lat, firstStop.lon]) <= 350) ||
    (lastStop && distanceMeters([lat, lon], [lastStop.lat, lastStop.lon]) <= 350)
  );

  if (!includeInactive && !hasLine) return null;
  if (dataAgeSec > MARCEL_STALE_MS / 1000) return null;
  if (shouldHideDeadMarcelVehicle({
    delaySeconds: delay ?? 0,
    speed: speed ?? Number.NaN,
    positionUnchangedMinutes: progressState.positionUnchangedMinutes,
    tripProgressUnchangedMinutes: progressState.tripProgressUnchangedMinutes,
    isAtTerminalOrDepot,
  })) return null;

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
    speed: Number.isFinite(speed) ? speed : undefined,
    computedSpeed: speed,
    direction,
    delay,
    dataAgeSec,
    schedule,
    routeStops,
    routePath: fullRoutePath,
    model: readMarcelString(raw, ['model', 'vehicle.model']),
    lastSignalTime: new Date(signalMs).toISOString(),
    previousTripEndedAtMs: vehicleStatus.status === 'break' ? now : undefined,
    nextTripStartAtMs: 'nextTripStartAtMs' in vehicleStatus ? vehicleStatus.nextTripStartAtMs : undefined,
    nextTripFirstStopId: vehicleStatus.status === 'break' ? courseStops[0]?.id : undefined,
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
  const payload = await requestJson<unknown>(MARCEL_DIRECT_VEHICLES_URL, { headers: { Accept: 'application/json' } });
  const raw = unwrapMarcelVehiclesPayload(payload).find((row) => {
    const id = readMarcelString(row, ['vehicle_id', 'vehicle.id', 'idPojazdu', 'pojazdId', 'idPo'])
      || readMarcelString(row, ['journeyId', 'journey_id', 'idKu', 'kursId', 'idKursu']);
    const number = readMarcelString(row, ['vehicleNumber', 'vehicle_number', 'vehicle.label', 'nrBoczny', 'numerBoczny', 'nrRej', 'rejestracja']);
    return id === lookupVehicleId || number === lookupVehicleId;
  });
  return raw ? mapMarcelDirectVehicle(raw, Date.now(), includeInactive, true) : null;
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
        .then((data) => (Array.isArray(data?.stops) ? data.stops : []))
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
  try {
    return mpkFeedVehicles(await requestJson<unknown>(MPK_RZESZOW_VEHICLES_JSON_URL, {signal}));
  } catch (error) {
    if (isAbortLikeError(error)) throw error;
    return parseMpkVehiclesXml(await requestText(MPK_RZESZOW_VEHICLES_XML_URL, {signal}));
  }
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
  const tripSchedule = await fetchMpkTripSchedule(vehicleDetails?.trip_id ?? rawVehicle.tripid ?? rawVehicle.ik, delaySeconds);

  return mapMpkDirectVehicle(rawVehicle, detailsByVehicle, Date.now(), includeInactive, tripSchedule);
}

async function loadStopsDictionary() {
  if (!stopsDictionaryPromise) {
    stopsDictionaryPromise = fetch('/data/stops-dictionary.json', {cache: 'force-cache'}).then((res) => res.json());
  }
  return stopsDictionaryPromise;
}

async function loadFullStopsDictionary() {
  if (!fullStopsDictionaryPromise) {
    fullStopsDictionaryPromise = fetch('/data/stops-dictionary-full.json', {cache: 'force-cache'})
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}));
  }
  return fullStopsDictionaryPromise;
}

async function loadStopPointIndex(): Promise<StopPointIndex> {
  if (!stopPointIndexPromise) stopPointIndexPromise = fetchStopsClient().then(stops =>
    Object.fromEntries(Object.entries(stops).map(([id, point]) => [id, {n: point.n, lat: point.lat, lon: point.lon}])),
  ).catch(error => { stopPointIndexPromise = null; throw error; });
  return stopPointIndexPromise;
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

function routeLengthMeters(points: ShapePoint[]) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distanceMeters(points[index - 1], points[index]);
  }
  return total;
}

function maxDeviationFromChordMeters(points: ShapePoint[], start: ShapePoint, end: ShapePoint) {
  if (points.length <= 2) return 0;
  const meanLat = ((start[0] + start[0] + end[0]) / 3) * Math.PI / 180;
  const metersPerLat = 111_320;
  const metersPerLon = Math.cos(meanLat) * 111_320;
  const ax = start[1] * metersPerLon;
  const ay = start[0] * metersPerLat;
  const bx = end[1] * metersPerLon;
  const by = end[0] * metersPerLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let maxDistanceSq = 0;

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const px = point[1] * metersPerLon;
    const py = point[0] * metersPerLat;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
    const cx = ax + dx * t;
    const cy = ay + dy * t;
    const distX = px - cx;
    const distY = py - cy;
    const distanceSq = distX * distX + distY * distY;
    if (distanceSq > maxDistanceSq) maxDistanceSq = distanceSq;
  }

  return Math.sqrt(maxDistanceSq);
}

function collapseHairpins(points: ShapePoint[], options?: { strict?: boolean }) {
  if (points.length < 3) return points;
  const strict = Boolean(options?.strict);
  const closeBacktrackMeters = strict ? 70 : 45;
  const detourRatio = strict ? 3.2 : 4.5;
  const minLegMeters = strict ? 30 : 18;
  const next: ShapePoint[] = [points[0]];

  for (let index = 1; index < points.length - 1; index += 1) {
    const a = next[next.length - 1];
    const b = points[index];
    const c = points[index + 1];
    const ab = distanceMeters(a, b);
    const bc = distanceMeters(b, c);
    const ac = distanceMeters(a, c);
    const via = ab + bc;

    if (ab >= minLegMeters && bc >= minLegMeters && ac <= closeBacktrackMeters && via > ac * detourRatio) {
      continue;
    }

    next.push(b);
  }

  next.push(points[points.length - 1]);
  return next;
}

function collapseLocalLoops(points: ShapePoint[], options?: { strict?: boolean }) {
  if (points.length < 4) return points;
  const strict = Boolean(options?.strict);
  const joinDistanceMeters = strict ? 16 : 10;
  const maxLoopLengthMeters = strict ? 1400 : 800;
  const maxLoopChordMeters = strict ? 210 : 130;
  const result = [...points];

  let index = 0;
  while (index < result.length - 2) {
    let removed = false;
    for (let back = Math.max(0, index - 100); back < index - 1; back += 1) {
      const rejoin = distanceMeters(result[back], result[index]);
      if (rejoin > joinDistanceMeters) continue;

      const loop = result.slice(back, index + 1);
      const loopLength = routeLengthMeters(loop);
      const chord = distanceMeters(loop[0], loop[loop.length - 1]);
      if (loopLength <= maxLoopLengthMeters && chord <= maxLoopChordMeters) {
        result.splice(back + 1, index - back - 1);
        index = Math.max(0, back - 1);
        removed = true;
        break;
      }
    }
    if (!removed) index += 1;
  }

  return result;
}

async function fetchRoadRouteForStops(coords: ShapePoint[],cacheKey: string,options?: {strictShortSegments?:boolean;signal?:AbortSignal;stopWaypoints?:boolean}) {
  const points=coords.filter(([lat,lon])=>Number.isFinite(lat)&&Number.isFinite(lon));
  if(points.length<2)return [];
  if(roadRouteCache.has(cacheKey))return roadRouteCache.get(cacheKey)!;
  const promise=(async()=> {
    const chunks=routeChunks(points);
    const results: ShapePoint[][]=new Array(chunks.length);
    let cursor=0;
    await Promise.all(Array.from({length:Math.min(3,chunks.length)},async()=> {
      while(cursor<chunks.length) {
        const index=cursor++,chunk=chunks[index];
        let route: ShapePoint[]=[];
        try {
          // Stop coordinates can sit in a bay or side road. A through point
          // forbids turning there and can force a loop around nearby streets.
          const query={locations:chunk.map(([lat,lon],i)=>({lat,lon,type:i===0||i===chunk.length-1?'break':options?.stopWaypoints?'via':'through',...(options?.stopWaypoints?{radius:35,rank_candidates:false}:{})})),costing:'bus',directions_options:{units:'kilometers'}};
          const data=await requestJson<{trip?:{legs?:Array<{shape?:string}>}}>('https://valhalla1.openstreetmap.de/route?json='+encodeURIComponent(JSON.stringify(query)),{signal:options?.signal});
          route=joinRouteChunks((data.trip?.legs||[]).map(leg=>leg.shape?decodePolyline(leg.shape):[]));
        }catch(error){if(options?.signal?.aborted)throw error;}
        if(route.length<2) {
          const coordinates=chunk.map(([lat,lon])=>lon+','+lat).join(';');
          const data=await requestJson<{code?:string;routes?:Array<{geometry?:{coordinates?:Array<[number,number]>}}>}>(
            'https://router.project-osrm.org/route/v1/driving/'+coordinates+'?overview=full&geometries=geojson&alternatives=false&steps=false&continue_straight=false',{signal:options?.signal});
          route=(data.routes?.[0]?.geometry?.coordinates||[]).map(([lon,lat])=>[lat,lon]);
        }
        if(route.length<2)throw new Error('Incomplete road route');
        results[index]=route;
      }
    }));
    return joinRouteChunks(results);
  })();
  // Pending requests belong to their caller's AbortSignal. Reusing one after
  // selection changes can poison the new route with the previous cancellation.
  const route = await promise;
  if (options?.signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
  roadRouteCache.set(cacheKey,route);
  if(roadRouteCache.size>100)roadRouteCache.delete(roadRouteCache.keys().next().value!);
  return route;
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
    previousTripEndedAtMs: vehicle.previousTripEndedAtMs,
    nextTripStartAtMs: vehicle.nextTripStartAtMs,
    nextTripFirstStopId: vehicle.nextTripFirstStopId,
    computedSpeed: vehicle.computedSpeed,
    journeyId: vehicle.journeyId,
    serviceId: vehicle.serviceId,
    tripId: vehicle.tripId,
    brigadeName: vehicle.brigadeName,
    status: vehicle.status,
    statusText: vehicle.statusText,
    isHistorical: vehicle.isHistorical,
    bearing: vehicle.bearing,
    trainName: vehicle.trainName,
    positionQuality: vehicle.positionQuality,
  };
}

function formatStopName(rawName: string | undefined) {
  if (!rawName) return 'Przystanek nieznany';
  return rawName.trim();
}

function buildSchedule(nextStopPoints: any[] | undefined, stopsDict: StopPointIndex) {
  return (nextStopPoints || []).map((sp: any) => {
    const stopId = Number(sp.stop_point_id ?? sp.stopPointId ?? sp.id);
    const plannedRaw = sp.planned_departure_time ?? sp.timetable_time ?? sp.planned;
    const realRaw = sp.real_departure_time ?? sp.real;
    const lat = Number(sp.location?.lat ?? sp.lat ?? sp.latitude);
    const lon = Number(sp.location?.lon ?? sp.location?.lng ?? sp.lon ?? sp.lng ?? sp.long ?? sp.longitude);
    return {
      id: stopId,
      name: formatStopName(sp.name || stopsDict[String(stopId)]?.n || `Przystanek ${stopId}`),
      planned: Number.isFinite(transitTimestamp(plannedRaw)) ? new Date(transitTimestamp(plannedRaw)).toISOString() : null,
      real: Number.isFinite(transitTimestamp(realRaw)) ? new Date(transitTimestamp(realRaw)).toISOString() : null,
      lat: Number.isFinite(lat) ? lat : stopsDict[String(stopId)]?.lat,
      lon: Number.isFinite(lon) ? lon : stopsDict[String(stopId)]?.lon,
    };
  });
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

function inferVehicleStatus(v: any,ageSec: number,speed: number,now: number,hasLine: boolean,schedule: ReturnType<typeof buildSchedule>) {
  if(!hasLine)return {status:'inactive' as const,statusText:'Pojazd bez przypisanej linii',nextTripStartAtMs:undefined,nextTripFirstStopId:undefined};
  if(v.journey?.route?.is_technical)return {status:'technical' as const,statusText:'Przejazd techniczny',nextTripStartAtMs:undefined,nextTripFirstStopId:undefined};
  const path=buildRoutePath(v.journey?.route);
  const firstId=path[0];
  const pointNumber=Number(v.position?.last_stop_point_number);
  const distance=Number(v.position?.last_stop_point_distance);
  const atFirst=pointNumber===0 && distance<=150;
  const atLast=path.length>1 && pointNumber>=path.length-1 && distance<=150;
  const firstDepartureMs=v.journey?.departure_time ? warsawTimeMs(v.journey.vehicle_journey_date||warsawDateIso(),v.journey.departure_time) : transitTimestamp(schedule.find(stop=>stop.id===firstId)?.planned);
  const operating=busOperatingState({lat:Number(v.position?.lat),lon:Number(v.position?.long??v.position?.lon),speed,nowMs:now,stops:schedule,firstDepartureMs,firstStopId:firstId,atFirstStop:atFirst,atLastStop:atLast});
  return {...operating,nextTripStartAtMs:'nextTripStartAtMs' in operating ? operating.nextTripStartAtMs : undefined,nextTripFirstStopId:'nextTripFirstStopId' in operating ? Number(operating.nextTripFirstStopId) : undefined};
}

function mapVehicle(
  v: any,
  now: number,
  includeInactive: boolean,
  stopsDict: StopPointIndex,
  includeDetails = true,
): Vehicle | null {
  const position = v.position || v.location || {};
  const lat = Number(position.lat ?? position.latitude);
  const lon = Number(position.long ?? position.lon ?? position.lng ?? position.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const signalRaw = (position.position_date || position.timestamp || v.lastUpdate || v.updatedAt)
    ? String(position.position_date || position.timestamp || v.lastUpdate || v.updatedAt).replace(' ', 'T')
    : '';
  const signalMs = signalRaw ? transitTimestamp(signalRaw) : now;
  const lineName = String(v.journey?.line?.line_name || v.journey?.line?.name || '').trim() || '---';
  const fallbackLineName = String(v.line_name || v.line || '').trim();
  const effectiveLineName = lineName !== '---' ? lineName : (fallbackLineName || '---');
  const hasLine = effectiveLineName !== '---' && effectiveLineName !== '?';
  const ageSec = Math.max(0, Math.floor((now - (Number.isNaN(signalMs) ? now : signalMs)) / 1000));
  if (!includeInactive && !hasLine) return null;
  if (ageSec > 7 * 60) return null;

  const vehicleId = String(v.vehicle_id ?? v.id ?? `json-${getTripBase(v.trip_id) || now}`);
  const rawSpeed = Number(position.speed);
  const speed = computeObservedSpeedKmh(`pks:${vehicleId}`, lat, lon, Number.isNaN(signalMs) ? now : signalMs, rawSpeed);
  const destination = v.journey?.route?.description || v.journey?.route?.name || v.route_description || v.direction || 'W trasie';
  const schedule = includeDetails ? buildSchedule(v.next_stop_points, stopsDict) : [];
  const statusSchedule = includeDetails ? schedule : buildSchedule((v.next_stop_points || []).slice(0,1), {});
  const vehicleStatus = inferVehicleStatus(v, ageSec, speed ?? 0, now, hasLine, statusSchedule);
  const routePath = includeDetails ? buildRoutePath(v.journey?.route) : [];
  const routeStops = routePath.map(id => {const timed=schedule.find(stop=>stop.id===id);const point=stopsDict[String(id)];return {...timed,id,name:point?.n||timed?.name||`Przystanek ${id}`,lat:point?.lat??timed?.lat,lon:point?.lon??timed?.lon,planned:timed?.planned||null,real:timed?.real||null};});

  return {
    id: vehicleId,
    routeId: effectiveLineName,
    name: `PKS ${effectiveLineName !== '---' ? effectiveLineName : vehicleId}`,
    routeShortName: effectiveLineName !== '---' ? effectiveLineName : '?',
    lat,
    lon,
    speed,
    computedSpeed: speed,
    direction: destination,
    delay: typeof v.delay === 'number' ? v.delay : typeof v.deviation === 'number' ? v.deviation * 60 : 0,
    dataAgeSec: ageSec,
    schedule,
    routePath,
    routeStops,
    model: v.model,
    lastStopDistance: typeof position.last_stop_point_distance === 'number' ? position.last_stop_point_distance : undefined,
    lastStopId: Number(position.last_stop_point_number)>0 ? buildRoutePath(v.journey?.route)[Number(position.last_stop_point_number)-1] : undefined,
    lastSignalTime: Number.isFinite(signalMs) ? new Date(signalMs).toISOString() : undefined,
    previousTripEndedAtMs: Number.isFinite(vehicleStatus.nextTripStartAtMs) ? now : undefined,
    nextTripStartAtMs: vehicleStatus.nextTripStartAtMs,
    nextTripFirstStopId: vehicleStatus.nextTripFirstStopId,
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

async function requestPkpDirectJson<T>(path: string, searchParams?: URLSearchParams, signal?: AbortSignal): Promise<T> {
  const proxySearch = new URLSearchParams(searchParams ? Array.from(searchParams.entries()) : []);
  proxySearch.set('endpoint', path.startsWith('/') ? path : `/${path}`);
  return requestJson<T>(`/api/pkp-intercity/operations?${proxySearch.toString()}`, { signal });
}

function isAbortLikeError(error: unknown) {
  const err = error as { name?: string; message?: string } | null;
  const name = String(err?.name || '');
  const message = String(err?.message || '').toLowerCase();
  return name === 'AbortError' || message.includes('abort');
}

function getPkpRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getPkpPath(source: unknown, path: string) {
  let current: unknown = source;
  for (const key of path.split('.')) {
    const record = getPkpRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
}

function readPkpFirst(source: unknown, paths: string[]) {
  for (const path of paths) {
    const value = getPkpPath(source, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function readPkpString(source: unknown, paths: string[], fallback = '') {
  const value = readPkpFirst(source, paths);
  return String(value ?? fallback).trim();
}

function readPkpNumber(source: unknown, paths: string[]) {
  const value = readPkpFirst(source, paths);
  const parsed = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function readPkpDateIso(source: unknown, paths: string[]) {
  const value = readPkpFirst(source, paths);
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw.replace(' ', 'T')).getTime();
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function normalizePkpStationName(name: string) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function loadPkpStationCoordinates() {
  if (!pkpStationCoordinatesPromise) {
    pkpStationCoordinatesPromise = requestText(PKP_STATIONS_DATASET_URL)
      .then((csv) => {
        const lines = csv.split(/\r?\n/);
        if (lines.length <= 1) return {} as Record<string, { lat: number; lon: number }>;
        const header = lines[0].split(';');
        const idxName = header.indexOf('name');
        const idxLat = header.indexOf('latitude');
        const idxLon = header.indexOf('longitude');
        const idxCountry = header.indexOf('country');
        if (idxName < 0 || idxLat < 0 || idxLon < 0 || idxCountry < 0) {
          return {} as Record<string, { lat: number; lon: number }>;
        }

        const lookup: Record<string, { lat: number; lon: number }> = {};
        for (let i = 1; i < lines.length; i += 1) {
          const line = lines[i];
          if (!line || line.indexOf(';') < 0) continue;
          const cols = line.split(';');
          if (cols[idxCountry] !== 'PL') continue;
          const name = normalizePkpStationName(cols[idxName] || '');
          if (!name) continue;
          const lat = Number(String(cols[idxLat] || '').replace(',', '.'));
          const lon = Number(String(cols[idxLon] || '').replace(',', '.'));
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          if (!lookup[name]) lookup[name] = { lat, lon };
        }
        return lookup;
      })
      .catch(() => ({}));
  }
  return pkpStationCoordinatesPromise;
}

function normalizePkpCategory(raw: string) {
  const category = raw.toUpperCase().replace(/[^A-Z]/g, '');
  if (category.includes('EIP')) return 'EIP';
  if (category.includes('EIC')) return 'EIC';
  if (category.includes('IC')) return 'IC';
  return 'IC';
}

function normalizeTrainNumber(raw: string) {
  const value = String(raw || '').trim();
  if (!value) return '';
  const compact = value.replace(/\s+/g, '');
  if (!compact) return '';
  if (/^\d+$/.test(compact)) return compact.replace(/^0+/, '') || compact;
  return compact.toUpperCase();
}

function distanceKmBetween(aLat: number, aLon: number, bLat: number, bLon: number) {
  const earthRadiusKm = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLon = (bLon - aLon) * Math.PI / 180;
  const lat1 = aLat * Math.PI / 180;
  const lat2 = bLat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function isPointInsideBbox(lat: number, lon: number, bbox?: [number, number, number, number] | null) {
  if (!bbox) return true;
  const [south, west, north, east] = bbox;
  return lat >= south && lat <= north && lon >= west && lon <= east;
}

function normalizePkpLatLon(lat: number, lon: number): { lat: number; lon: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < 47 || lat > 56 || lon < 12 || lon > 26) return null;
  return { lat, lon };
}

function resolvePkpCoords(source: unknown): { lat: number; lon: number } | null {
  const primary = normalizePkpLatLon(
    readPkpNumber(source, ['lat', 'latitude', 'position.lat', 'location.lat']),
    readPkpNumber(source, ['lng', 'lon', 'long', 'longitude', 'position.lon', 'position.lng', 'location.lng']),
  );
  if (primary) return primary;

  const record = getPkpRecord(source);
  if (!record) return null;
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (value && typeof value === 'object') {
      const nested = resolvePkpCoords(value);
      if (nested) return nested;
    }
  }
  return null;
}

function resolvePkpLiveCoords(source: unknown): { lat: number; lon: number } | null {
  return normalizePkpLatLon(
    readPkpNumber(source, ['lat', 'latitude', 'position.lat', 'location.lat']),
    readPkpNumber(source, ['lng', 'lon', 'long', 'longitude', 'position.lon', 'position.lng', 'location.lng']),
  );
}

function getPkpTrainDelaySeconds(routeStops: Array<{
  planned: string | null;
  real: string | null;
  isPast?: boolean;
}>) {
  const upcoming = routeStops.find((stop) => !stop.isPast && stop.planned && stop.real);
  if (!upcoming?.planned || !upcoming.real) return 0;
  const plannedMs = new Date(upcoming.planned).getTime();
  const realMs = new Date(upcoming.real).getTime();
  if (!Number.isFinite(plannedMs) || !Number.isFinite(realMs)) return 0;
  const delaySeconds = Math.round((realMs - plannedMs) / 1000);
  return Math.abs(delaySeconds) <= 18_000 ? delaySeconds : 0;
}

async function fetchPkpTrainMetadata(scheduleId: string, orderId: string, signal?: AbortSignal): Promise<PkpTrainMetadata | null> {
  const cacheKey = `${scheduleId}_${orderId}`;
  const now = Date.now();
  const cached = pkpTrainMetadataCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;

  const inflight = pkpTrainMetadataInflight.get(cacheKey);
  if (inflight) return inflight;

  const request = requestPkpDirectJson<unknown>(
    `/api/v1/schedules/route/${encodeURIComponent(scheduleId)}/${encodeURIComponent(orderId)}`,
    undefined,
    signal,
  )
    .then((payload) => {
      const record = getPkpRecord(payload);
      if (!record) return null;
      const trainNumber = readPkpString(record, ['nationalNumber', 'trainNumber', 'number', 'name'], '');
      const category = normalizePkpCategory(readPkpString(record, ['commercialCategorySymbol', 'commercialCategory', 'category', 'carrierCode'], 'IC'));
      const trainName = readPkpString(record, ['name'], '');
      const value = trainNumber
        ? {
            trainNumber: trainNumber.replace(/^0+/, '') || trainNumber,
            category,
            trainName: trainName || undefined,
          }
        : null;
      pkpTrainMetadataCache.set(cacheKey, { expiresAt: now + PKP_METADATA_CACHE_TTL_MS, value });
      return value;
    })
    .catch(() => null)
    .finally(() => {
      pkpTrainMetadataInflight.delete(cacheKey);
    });

  pkpTrainMetadataInflight.set(cacheKey, request);
  return request;
}

function mapPkpOperationToVehicle(
  trainRaw: unknown,
  stationsLookup: Record<string, unknown>,
  stationCoordinatesLookup: Record<string, { lat: number; lon: number }>,
  generatedAtIso: string,
  metadata?: PkpTrainMetadata | null,
): Vehicle | null {
  const train = getPkpRecord(trainRaw);
  if (!train) return null;
  const nowMs = Date.now();
  const rawStops = Array.isArray(train.stations) ? train.stations : [];
  const routeStops = rawStops.map((stopRaw: unknown, index: number) => {
    const stop = getPkpRecord(stopRaw) || {};
    const stationId = readPkpNumber(stop, ['stationId', 'station.id', 'id']);
    const stationLookupRaw = stationsLookup[String(stationId)];
    const stationDetails = getPkpRecord(stationLookupRaw) || {};
    const stationNameFromLookup = typeof stationLookupRaw === 'string' ? stationLookupRaw.trim() : '';
    const stationNameFromStop = readPkpString(stop, ['stationName', 'name', 'stopName']);
    const stationName = stationNameFromStop || stationNameFromLookup || readPkpString(stationDetails, ['name', 'stationName'], '');
    const stationCoords =
      resolvePkpCoords(stationDetails) ||
      resolvePkpCoords(stop) ||
      stationCoordinatesLookup[normalizePkpStationName(stationName)] ||
      null;
    const plannedIso = readPkpDateIso(stop, ['plannedDeparture', 'plannedArrival']);
    const realIso = readPkpDateIso(stop, ['actualDeparture', 'actualArrival']);
    const delayMinutes = readPkpNumber(stop, ['departureDelayMinutes', 'arrivalDelayMinutes', 'delayMinutes', 'delay']);
    const platform = readPkpString(stop, ['departurePlatform', 'arrivalPlatform', 'platform', 'platformNumber', 'plannedPlatform']);
    const track = readPkpString(stop, ['departureTrack', 'arrivalTrack', 'track', 'trackNumber', 'plannedTrack']);
    const timeType: 'arrival' | 'departure' = readPkpFirst(stop, ['plannedDeparture', 'actualDeparture', 'departureDelayMinutes'])
      ? 'departure'
      : 'arrival';
    const plannedMs = plannedIso ? new Date(plannedIso).getTime() : Number.NaN;
    const computedRealMs =
      realIso
        ? new Date(realIso).getTime()
        : Number.isFinite(delayMinutes) && Number.isFinite(plannedMs)
          ? plannedMs + delayMinutes * 60_000
          : Number.NaN;
    const effectiveRealIso = Number.isFinite(computedRealMs) ? new Date(computedRealMs).toISOString() : realIso;
    return {
      id: Number.isFinite(stationId) ? stationId : index + 1,
      name: stationName || `Stacja ${index + 1}`,
      planned: plannedIso,
      real: effectiveRealIso || null,
      lat: stationCoords?.lat,
      lon: stationCoords?.lon,
      isPast: Number.isFinite(computedRealMs) ? computedRealMs < nowMs - 120_000 : false,
      platform: platform || undefined,
      track: track || undefined,
      stopDelayMinutes: Number.isFinite(delayMinutes) ? delayMinutes : undefined,
      timeType,
    };
  });

  const liveCoords = resolvePkpLiveCoords(train);
  const lat = liveCoords?.lat;
  const lon = liveCoords?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const scheduleId = readPkpString(train, ['scheduleId', 'sid']);
  const orderId = readPkpString(train, ['orderId', 'oid']);
  const operatingDate = readPkpString(train, ['operatingDate', 'date']);
  const trainNumberRaw = (metadata?.trainNumber || readPkpString(train, ['trainNumber', 'number', 'trainNo'], '')).trim();
  const trainNumber = trainNumberRaw && !/^\d{8,}$/.test(trainNumberRaw) ? trainNumberRaw : '';
  const category = metadata?.category || normalizePkpCategory(readPkpString(train, ['commercialCategory', 'category', 'trainCategory', 'kind'], 'IC'));
  const relation = routeStops.length > 1
    ? `${routeStops[0].name} - ${routeStops[routeStops.length - 1].name}`
    : (routeStops[0]?.name || 'W trasie');
  const delaySeconds = getPkpTrainDelaySeconds(routeStops);
  const lookupId = [scheduleId, orderId, operatingDate].filter(Boolean).join('_') || String(trainNumber);
  const statusCode = readPkpString(train, ['trainStatus', 'status'], '').toUpperCase();
  const statusTextRaw = statusCode || 'W trasie';
  const generatedMs = new Date(generatedAtIso).getTime();
  const displayName = trainNumber ? `${category} ${trainNumber}`.trim() : category;
  const speedRaw = readPkpNumber(train, ['speed', 'position.speed']);
  const speed = Number.isFinite(speedRaw) ? speedRaw : undefined;
  const trainName = metadata?.trainName || readPkpString(train, ['trainName', 'compositionName', 'name']);

  return {
    id: `pkp_intercity_${lookupId}`,
    provider: 'pkp_intercity',
    operatorName: 'PKP Intercity',
    type: 'train',
    iconVariant: category,
    vehicleNumber: trainNumber || undefined,
    name: displayName,
    routeId: relation,
    routeShortName: category,
    lat: Number(lat),
    lon: Number(lon),
    speed,
    direction: relation,
    delay: delaySeconds,
    dataAgeSec: Number.isFinite(generatedMs) ? Math.max(0, Math.floor((nowMs - generatedMs) / 1000)) : undefined,
    schedule: routeStops.filter((stop) => !stop.isPast),
    routeStops,
    routePath: routeStops.map((stop) => Number(stop.id)).filter((id) => Number.isFinite(id)),
    trainName: trainName || undefined,
    lastSignalTime: generatedAtIso,
    journeyId: scheduleId || undefined,
    serviceId: orderId || undefined,
    tripId: lookupId || undefined,
    status: statusCode === 'X' ? 'inactive' : 'active',
    statusText: statusTextRaw,
    positionQuality: 'known',
  };
}

async function fetchPkpIntercityVehiclesDirect(signal?: AbortSignal, viewport?: PkpQueryViewport): Promise<Vehicle[]> {
  const [stationCoordinatesLookup] = await Promise.all([
    loadPkpStationCoordinates(),
  ]);

  const pageSize = 80;
  const maxPages = 1;
  const targetCount = viewport?.bbox ? 40 : 30;
  const defaultCenter: [number, number] = viewport?.center || PKP_DEFAULT_CENTER;
  const vehiclesById = new Map<string, Vehicle>();
  let generatedAtIso = new Date().toISOString();

  for (let page = 1; page <= maxPages; page += 1) {
    const searchParams = new URLSearchParams();
    searchParams.set('carriersInclude', 'IC');
    searchParams.set('fullRoutes', 'true');
    searchParams.set('withPlanned', 'true');
    searchParams.set('pageSize', String(pageSize));
    searchParams.set('page', String(page));

    const payload = await requestPkpDirectJson<{
      generatedAt?: string;
      trains?: unknown[];
      stations?: Record<string, unknown>;
      pagination?: { hasNextPage?: boolean };
    }>('/api/v1/operations', searchParams, signal);

    const currentGeneratedAtIso = readPkpDateIso(payload, ['generatedAt']);
    if (currentGeneratedAtIso) generatedAtIso = currentGeneratedAtIso;

    const trains = Array.isArray(payload?.trains) ? payload.trains : [];
    const stationsLookup = getPkpRecord(payload?.stations) || {};

    const activeTrains = trains.filter((trainRaw) => {
      const train = getPkpRecord(trainRaw);
      if (!train) return false;
      const status = readPkpString(train, ['trainStatus', 'status'], '').toUpperCase();
      return status === 'P';
    });

    const mappedVehicles = activeTrains
      .map((train) => mapPkpOperationToVehicle(train, stationsLookup, stationCoordinatesLookup, generatedAtIso))
      .filter((vehicle): vehicle is Vehicle => Boolean(vehicle))
      .filter((vehicle) => {
        if (viewport?.bbox && isPointInsideBbox(vehicle.lat, vehicle.lon, viewport.bbox)) return true;
        if (viewport?.bbox) {
          const radiusKm = Number.isFinite(PKP_MAX_DISTANCE_KM) && PKP_MAX_DISTANCE_KM > 0 ? PKP_MAX_DISTANCE_KM : 120;
          return distanceKmBetween(vehicle.lat, vehicle.lon, defaultCenter[0], defaultCenter[1]) <= radiusKm;
        }
        if (!Number.isFinite(PKP_MAX_DISTANCE_KM) || PKP_MAX_DISTANCE_KM <= 0) return true;
        return distanceKmBetween(vehicle.lat, vehicle.lon, defaultCenter[0], defaultCenter[1]) <= PKP_MAX_DISTANCE_KM;
      });

    for (const vehicle of mappedVehicles) {
      vehiclesById.set(vehicle.id, vehicle);
    }

    const hasNextPage = Boolean((payload as any)?.pagination?.hasNextPage);
    if (vehiclesById.size >= targetCount || !hasNextPage) break;
  }

  return Array.from(vehiclesById.values())
    .sort(
      (a, b) =>
        distanceKmBetween(a.lat, a.lon, defaultCenter[0], defaultCenter[1]) -
        distanceKmBetween(b.lat, b.lon, defaultCenter[0], defaultCenter[1]),
    )
    .slice(0, targetCount);
}

function normalizePkpVehicleLookupId(vehicleId: string) {
  return String(vehicleId || '').replace(/^pkp_intercity_/, '').trim();
}

async function fetchPkpIntercityPortalGpsVehicles(signal?: AbortSignal, viewport?: PkpQueryViewport): Promise<Vehicle[]> {
  const searchParams = new URLSearchParams();
  const bbox = viewport?.bbox;
  if (bbox && bbox.length === 4 && bbox.every((value) => Number.isFinite(Number(value)))) {
    searchParams.set('bbox', bbox.join(','));
  }
  if (Number.isFinite(Number(viewport?.zoom))) {
    searchParams.set('zoom', String(Math.round(Number(viewport?.zoom))));
  }

  const separator = PKP_INTERCITY_GPS_PROXY_URL.includes('?') ? '&' : '?';
  const query = searchParams.toString();
  const response = await requestJson<TransportApiVehiclesResponse>(
    `${PKP_INTERCITY_GPS_PROXY_URL}${query ? `${separator}${query}` : ''}`,
    { signal },
  );

  return (response.vehicles || [])
    .map(mapTransportVehicleToClient)
    .filter((vehicle) => Number.isFinite(vehicle.lat) && Number.isFinite(vehicle.lon));
}

async function fetchPkpIntercityVehicleDetailsDirect(vehicleId: string, signal?: AbortSignal) {
  const lookupId = normalizePkpVehicleLookupId(vehicleId);
  const [scheduleIdRaw, orderIdRaw, operatingDateRaw] = lookupId.split('_');
  const scheduleId = String(scheduleIdRaw || '').trim();
  const orderId = String(orderIdRaw || '').trim();
  const operatingDate = String(operatingDateRaw || '').trim();
  if (!scheduleId || !orderId || !operatingDate) return null;

  const [operationsPayload, stationCoordinatesLookup, metadata] = await Promise.all([
    requestPkpDirectJson<unknown>(
      `/api/v1/operations/train/${encodeURIComponent(scheduleId)}/${encodeURIComponent(orderId)}/${encodeURIComponent(operatingDate)}`,
      undefined,
      signal,
    ),
    loadPkpStationCoordinates(),
    fetchPkpTrainMetadata(scheduleId, orderId, signal),
  ]);

  const operationRecord = getPkpRecord(operationsPayload);
  if (!operationRecord) return null;
  const generatedAtIso = readPkpDateIso(operationRecord, ['generatedAt']) || new Date().toISOString();
  const stationsLookup = getPkpRecord((operationRecord as any).stations) || {};
  const trainRaw = getPkpRecord((operationRecord as any).train) || operationRecord;
  const mapped = mapPkpOperationToVehicle(trainRaw, stationsLookup, stationCoordinatesLookup, generatedAtIso, metadata);
  return mapped && normalizePkpVehicleLookupId(mapped.id) === lookupId ? mapped : mapped;
}

export async function fetchVehiclesClient(
  includeInactive: boolean,
  providers: TransportProviderId[] = ['pks'],
  options?: { signal?: AbortSignal; pkpViewport?: PkpQueryViewport; onProviderLoaded?: (provider: TransportProviderId, vehicles: Vehicle[]) => void },
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
      return fetchMarcelVehiclesClient(includeInactive, options?.signal, options?.pkpViewport).catch((error) => {
        if ((error as any)?.name === 'AbortError') throw error;
        console.warn('Marcel provider unavailable:', error);
        return [];
      });
    }
    if (provider === 'pkp_intercity') {
      const fetchBackendVehicles = async () => {
        const searchParams = new URLSearchParams();
        searchParams.set('providers', 'pkp_intercity');
        if (includeInactive) searchParams.set('includeInactive', 'true');
        const bbox = options?.pkpViewport?.bbox;
        if (bbox && bbox.length === 4 && bbox.every((value) => Number.isFinite(Number(value)))) {
          searchParams.set('bbox', bbox.join(','));
        }
        const response = await requestJson<TransportApiVehiclesResponse>(transportApiUrl('/vehicles', searchParams), {
          signal: options?.signal,
        });
        return (response.vehicles || []).map(mapTransportVehicleToClient);
      };

      const fallbackVehicles = async () => {
        if (!isNative()) {
          try {
            const gps = await fetchPkpIntercityPortalGpsVehicles(options?.signal, options?.pkpViewport);
            if (gps.length > 0) return gps;
          } catch (gpsError) {
            if (isAbortLikeError(gpsError)) throw gpsError;
            console.warn('PKP Intercity portal GPS fallback unavailable:', gpsError);
          }
        }

        try {
          const backend = await fetchBackendVehicles();
          if (backend.length > 0) return backend;
        } catch (backendError) {
          if (isAbortLikeError(backendError)) throw backendError;
          console.warn('PKP Intercity backend fallback unavailable:', backendError);
        }

        try {
          const direct = await fetchPkpIntercityVehiclesDirect(options?.signal, options?.pkpViewport);
          if (direct.length > 0) return direct;
        } catch (fallbackError) {
          if (isAbortLikeError(fallbackError)) throw fallbackError;
          console.warn('PKP Intercity direct fallback unavailable:', fallbackError);
        }

        return [];
      };

      return fallbackVehicles()
        .catch((error) => {
          if (isAbortLikeError(error)) throw error;
          console.warn('PKP Intercity provider unavailable:', error);
          return [];
        })
        .then((vehicles) => vehicles.filter((vehicle) => Number.isFinite(vehicle.lat) && Number.isFinite(vehicle.lon)))
        .catch((error) => {
          if (isAbortLikeError(error)) throw error;
          console.warn('PKP Intercity provider unavailable:', error);
          return [];
        });
    }
    return [];
  });

  const results = await Promise.all(requests.map(async (request, index) => {
    const vehicles = await request;
    if (!options?.signal?.aborted) options?.onProviderLoaded?.(activeProviders[index], vehicles);
    return vehicles;
  }));
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

  if (provider === 'pkp_intercity') {
    try {
      const searchParams = new URLSearchParams();
      if (includeInactive) searchParams.set('includeInactive', 'true');
      const response = await requestJson<{ vehicle?: TransportApiVehicle }>(
        transportApiUrl(`/vehicle/${encodeURIComponent(provider)}/${encodeURIComponent(vehicleId)}`, searchParams),
      );
      const vehicle = response.vehicle ? mapTransportVehicleToClient(response.vehicle) : null;
      if (vehicle) return vehicle;
    } catch (error) {
      console.warn('PKP Intercity details backend unavailable, using direct fallback:', error);
    }

    return fetchPkpIntercityVehicleDetailsDirect(vehicleId).catch((error) => {
      console.warn('PKP Intercity direct details unavailable:', error);
      return null;
    });
  }

  const searchParams = new URLSearchParams();
  if (includeInactive) searchParams.set('includeInactive', 'true');

  const response = await requestJson<{ vehicle?: TransportApiVehicle }>(
    transportApiUrl(`/vehicle/${encodeURIComponent(provider)}/${encodeURIComponent(vehicleId)}`, searchParams),
  );

  if (!response.vehicle) return null;
  return mapTransportVehicleToClient(response.vehicle);
}

let bundledPksStops: Promise<any> | null = null;
function readBundledPksStops() {
  if (!bundledPksStops) bundledPksStops = fetch('/data/pks-stop-points.json', {cache: 'force-cache'})
    .then(response => response.ok ? response.json() : {stops: {}})
    .catch(() => { bundledPksStops = null; return {stops: {}}; });
  return bundledPksStops;
}
function snapshotStopItems(snapshot: any) {
  return Object.entries(snapshot.stops || {}).map(([id, raw]) => {
    const point = raw as {n: string; areaId: string; code: string; lat?: number; lon?: number};
    return {stop_point_id: id, name: point.n, stop_area_name: point.n,
      stop_area_id: point.areaId, stop_point_code: point.code, location: {lat: point.lat, lon: point.lon}};
  });
}
async function fetchStopsFromNetwork(): Promise<StopsMap> {
  const snapshot = await readBundledPksStops();
  const data = await requestEinfoJson<any>('stop-point', {
    headers: {'Accept': 'application/json'},
  }).catch(async () => {
    if (Object.keys(snapshot.stops || {}).length) {
      return {items: Object.entries(snapshot.stops).map(([id, raw]) => {
        const point = raw as {n: string; areaId: string; code: string; lat?: number; lon?: number};
        return {stop_point_id: id, name: point.n, stop_area_name: point.n,
          stop_area_id: point.areaId, stop_point_code: point.code,
          location: {lat: point.lat, lon: point.lon}};
      })};
    }
    const fullDict = await loadFullStopsDictionary();
    if (Object.keys(fullDict).length > 0) {
      return {
        items: Object.entries(fullDict).map(([id, record]) => ({
          stop_point_id: id,
          name: record.name || '',
          stop_area_name: record.name || '',
          stop_area_id: record.areaId || '',
          stop_point_code: record.code || '',
          location: {},
        })),
      };
    }
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

  return formatPksStops(data, snapshot);
}
function formatPksStops(data: any, snapshot: any): StopsMap {
  const compressedMap: StopsMap = {};
  for (const stop of data?.items || []) {
    const fallback = snapshot.stops?.[String(stop.stop_point_id)];
    const lat = Number(stop.location?.lat ?? stop.location?.latitude ?? fallback?.lat);
    const lon = Number(stop.location?.lon ?? stop.location?.lng ?? stop.location?.long ?? stop.location?.longitude ?? fallback?.lon);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
    const areaName = stop.stop_area_name ? stop.stop_area_name.trim() : '';
    const name = stop.name ? stop.name.trim() : '';
    const finalNameRaw = bestPksStopName(areaName, name);
    let formattedName = toTitleCase(finalNameRaw);

    if (stop.stop_point_code && stop.stop_point_code.trim()) {
      let code = stop.stop_point_code.trim();
      const isRzeszow = formattedName.includes('Rzeszow') || formattedName.includes('Rzeszów');
      const isRzeszowDA = isRzeszow && (formattedName.includes('D.A.') || formattedName.toLowerCase().includes('dworzec'));

      if (!isRzeszowDA && /^0\d$/.test(code)) code = code.substring(1);
      const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedRawCode = stop.stop_point_code.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const alreadyHasCode =
        new RegExp(`(?:^|\\s)${escapedCode}$`).test(formattedName) ||
        new RegExp(`(?:^|\\s)${escapedRawCode}$`).test(formattedName);

      if (alreadyHasCode) {
        // Full local fallback names already include the stop-side code.
      } else if (isRzeszow) {
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

let refreshingPksStops: Promise<StopsMap> | null = null;
function refreshPksStops() {
  if (!refreshingPksStops) refreshingPksStops = fetchStopsFromNetwork().then(fresh => {
    if (!Object.keys(fresh).length) throw new Error('Empty PKS stop catalog');
    writePersistentClientCache(PKS_STOPS_CACHE_KEY, fresh);
    stopPointIndexPromise = null;
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('pks-live:stops-updated'));
    return fresh;
  }).finally(() => { refreshingPksStops = null; });
  return refreshingPksStops;
}
export async function fetchStopsClient(options?: { forceRefresh?: boolean }): Promise<StopsMap> {
  const cached = readPersistentClientCache<StopsMap>(PKS_STOPS_CACHE_KEY);
  const isFresh = cached && Date.now() - cached.savedAt < CLIENT_STOP_CACHE_TTL_MS;
  if (cached && !options?.forceRefresh) {
    if (!isFresh) void refreshPksStops().catch(() => undefined);
    return cached.data;
  }
  if (!options?.forceRefresh) {
    const snapshot = await readBundledPksStops();
    if (Object.keys(snapshot.stops || {}).length) {
      const localStops = formatPksStops({items: snapshotStopItems(snapshot)}, snapshot);
      // Ship the initial catalog locally; endpoint data replaces it in the background.
      void refreshPksStops().catch(() => undefined);
      return localStops;
    }
  }
  try { return await refreshPksStops(); }
  catch (error) { if (cached) return cached.data; throw error; }
}

function isJourneyRunning(legends: string[], dateIso: string) {
  if (!legends || legends.length === 0) return true;
  const normalizedLegends = legends.map((legend) =>
    String(legend || '')
      .trim()
      .replace('6Ĺ›', '6ś'),
  );
  const dt = new Date(dateIso);
  const day = dt.getUTCDay();
  const month = dt.getUTCMonth() + 1;
  const date = dt.getUTCDate();
  const services = mpkServicesOnDate(pksSchoolCalendar, dateIso);
  if(normalizedLegends.includes('l') && month===12 && date===31) return false;
  const isHoliday = services.includes('4') ||
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
    if ((legend === 'D' || legend === '(D)') && !isWeekendOrHoliday) effectiveRuns = true;
    if (legend === 'S' && !isWeekendOrHoliday && (services.length ? services.includes('2') : true)) effectiveRuns = true;
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
        if (!Number.isFinite(warsawTimeMs(dayIso, journey.time))) return;
        mapped.push({
          timetable_time: new Date(warsawTimeMs(dayIso, journey.time)).toISOString(),
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

const pksTimetables = new Map<string, { expires: number; promise: Promise<any> }>();
export function fetchPksTimetableClient(areaId: string, day: string) {
  const key = areaId + ':' + day;
  const cached = pksTimetables.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = requestEinfoJson<any>('stop-point-timetable/' + encodeURIComponent(areaId) + '?day=' + day, {headers:{Accept:'application/json'}})
    .then(data => { if (data.success === false || !Array.isArray(data.items)) throw new Error('Nieprawidłowy rozkład PKS'); return data; })
    .catch(error => { pksTimetables.delete(key); throw error; });
  if (pksTimetables.size > 200) pksTimetables.delete(pksTimetables.keys().next().value!);
  pksTimetables.set(key, {expires:Date.now()+300_000,promise});
  return promise;
}

export async function fetchDeparturesClient(stopId: string, areaId?: string, code?: string, dateIso?: string) {
  const today = warsawDateIso();
  const days = dateIso ? [dateIso] : [today, warsawDateIso(1)];
  const wantsBoard = days.includes(today);
  const hasTimetable = Boolean(areaId && code);
  const [board, ...tables] = await Promise.allSettled([
    wantsBoard ? requestEinfoJson<any>('its/infoboard/nearest-departures/' + encodeURIComponent(stopId), {headers:{Accept:'application/json'}})
      .then(data => { if (!Array.isArray(data.journeys)) throw new Error('Nieprawidłowa tablica PKS'); return data; }) : Promise.resolve({journeys:[]}),
    ...(hasTimetable ? days.map(day => fetchPksTimetableClient(areaId!, day)) : []),
  ]);
  if (!hasTimetable && !wantsBoard) throw new Error('Brak identyfikatora rozkładu PKS dla tego dnia');
  const failedTables = tables.some(result => result.status === 'rejected');
  if ((board.status === 'rejected' || !wantsBoard) && (!hasTimetable || failedTables)) throw new Error('Nie udało się pobrać rozkładu PKS');
  const live = board.status === 'fulfilled' ? board.value.journeys.map((journey: any) => {
    const raw = String(journey.timetable_time || '');
    const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(raw);
    const ms = match ? warsawTimeMs(match[1], match[2]) : Date.parse(raw);
    return {...journey, provider_id:'pks', timetable_time: Number.isFinite(ms) ? new Date(ms).toISOString() : ''};
  }) : [];
  const scheduled = tables.flatMap((result,index) => result.status === 'fulfilled' ? processTimetable(result.value, days[index], code!) : []);
  const journeys = [...live];
  for (const journey of scheduled) {
    const duplicate = live.some((row: any) => row.line_name === journey.line_name && row.route_description === journey.route_description && row.timetable_time === journey.timetable_time);
    if (!duplicate) journeys.push(journey);
  }
  return {journeys: journeys.filter((journey: any) => {
    const ms = Date.parse(journey.timetable_time);
    return Number.isFinite(ms) && (dateIso ? warsawDateIso(0,new Date(ms)) === dateIso : ms >= Date.now()-900_000 && ms <= Date.now()+86400_000);
  }).sort((a: any,b: any) => Date.parse(a.timetable_time)-Date.parse(b.timetable_time)),
  warning: failedTables || (hasTimetable && board.status === 'rejected') ? 'PKS: część danych niedostępna; pokazano dostępny rozkład.' : undefined};
}

export type MpkRzeszowStop = {
  stop_id: number | string;
  stop_name: string;
  stop_lat?: string | number;
  stop_lon?: string | number;
  zone_id?: string | number;
  lines?: string;
};

export type MpkRzeszowScheduleEntry = {
  line: string;
  trip_headsign?: string;
  departure_time: string;
  real_departure_time?: string;
  realtime_source?: 'stop-board';
  block_id?: string | number;
  private_code?: string;
  vehicle?: string | number | null;
  trip_id?: string | number;
  board_is_past?: boolean;
  board_at_stop?: boolean;
  board_observed_at_ms?: number;
  board_time_precision_ms?: number;
  is_last_stop?: boolean;
  start_stop_id?: string | number;
  start_stop_name?: string;
  end_stop_id?: string | number;
  end_stop_name?: string;
};

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

export type MarcelRoute = {
  idTr: number;
  nazTr: string;
  nazMiOd?: string;
  nazMiDo?: string;
};

export type MarcelCourse = {
  idKu: number;
  nazTr?: string;
  nazPr?: string;
  data?: string;
  godz?: string;
  godzPr?: string;
  idTr?: number;
};

export type MarcelCourseStopPublic = {
  kol?: number;
  szGps?: number;
  dlGps?: number;
  nazTr?: string;
  nazMi?: string;
  nazPr?: string;
  godz?: string;
};

export type MarcelLivePosition = { tripId: string; lat: number; lon: number; observedAtMs: number };
let marcelLivePositionsCache: { expiresAt: number; promise: Promise<MarcelLivePosition[]> } | undefined;

/** One live position download per refresh, shared by all courses of a stop. */
export function fetchMarcelLivePositionsClient(): Promise<MarcelLivePosition[]> {
  if (marcelLivePositionsCache && marcelLivePositionsCache.expiresAt > Date.now()) return marcelLivePositionsCache.promise;
  const promise = requestJson<unknown>(MARCEL_DIRECT_VEHICLES_URL, { headers: { Accept: 'application/json' } }).then(payload => {
    const observedAtMs = Date.now();
    return unwrapMarcelVehiclesPayload(payload).flatMap(row => {
      const tripId = readMarcelString(row, ['journeyId', 'journey_id', 'idKu', 'kursId', 'idKursu']);
      const lat = readMarcelNumber(row, ['szGps', 'lat', 'latitude']);
      const lon = readMarcelNumber(row, ['dlGps', 'lon', 'lng', 'longitude']);
      const timestamp = readMarcelTimestamp(row);
      const at = Number.isFinite(timestamp) ? timestamp : observedAtMs;
      return tripId && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(observedAtMs - at) < 60_000
        ? [{ tripId, lat, lon, observedAtMs: at }] : [];
    });
  }).catch(error => { marcelLivePositionsCache = undefined; throw error; });
  marcelLivePositionsCache = { expiresAt: Date.now() + 10_000, promise };
  return promise;
}

/** This is a GPS estimate, not an operator-confirmed delay. */
export function estimateMarcelCourseDelay(courseId: number | string, publicStops: MarcelCourseStopPublic[], dateIso: string, positions: MarcelLivePosition[]): number | undefined {
  const position = positions.find(row => row.tripId === String(courseId));
  if (!position || Math.abs(Date.now() - position.observedAtMs) > 60_000) return undefined;
  let previousMs: number | undefined;
  const stops = publicStops.flatMap((stop, index) => {
    let plannedMs = warsawTimeMs(dateIso, stop.godz);
    if (previousMs != null && plannedMs < previousMs - 6 * 3600_000) plannedMs += 24 * 3600_000;
    if (!Number.isFinite(plannedMs) || stop.szGps == null || stop.dlGps == null) return [];
    const lat = Number(stop.szGps), lon = Number(stop.dlGps);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    previousMs = plannedMs;
    return [{ id: stop.kol || index + 1, name: '', lat, lon, plannedMs,
      planned: new Date(plannedMs).toISOString(), km: index, order: index }];
  });
  if (stops.length < 2 || position.observedAtMs < stops[0].plannedMs) return undefined;
  const distance = Math.min(...stops.slice(1).map((end, index) => squaredMetersDistanceToSegment(
    [position.lat, position.lon], [stops[index].lat, stops[index].lon], [end.lat, end.lon],
  ).distanceSq));
  if (distance > 1000 ** 2) return undefined;
  return estimateMarcelDelaySeconds(position.lat, position.lon, stops, position.observedAtMs);
}

let marcelRoutesPromise: Promise<MarcelRoute[]> | null = null;
const marcelCoursesByRouteDateCache = new Map<string, Promise<MarcelCourse[]>>();
const marcelPublicCourseStopsCache = new Map<string, Promise<MarcelCourseStopPublic[]>>();

export async function fetchMarcelRoutesClient() {
  if (!marcelRoutesPromise) {
    marcelRoutesPromise = requestJson<MarcelRoute[]>(`${MARCEL_API_BASE_URL}/client/api/search/trasy?appVersion=v1.67`, {
      headers: {Accept: 'application/json'},
    });
  }
  return marcelRoutesPromise.catch(error => { marcelRoutesPromise = null; throw error; });
}

export async function fetchMarcelCoursesClient(routeId: number | string, dateIso: string) {
  const key = `${routeId}:${dateIso}`;
  if (!marcelCoursesByRouteDateCache.has(key)) {
    marcelCoursesByRouteDateCache.set(
      key,
      requestJson<MarcelCourse[]>(
        `${MARCEL_API_BASE_URL}/client/api/search/wariantTrasy/kusy?data=${encodeURIComponent(dateIso)}&idTr=${encodeURIComponent(String(routeId))}&appVersion=v1.67`,
        {headers: {Accept: 'application/json'}},
      ).catch(error => { marcelCoursesByRouteDateCache.delete(key); throw error; }),
    );
    if (marcelCoursesByRouteDateCache.size > 80) {
      const firstKey = marcelCoursesByRouteDateCache.keys().next().value;
      if (firstKey) marcelCoursesByRouteDateCache.delete(firstKey);
    }
  }
  return marcelCoursesByRouteDateCache.get(key)!;
}

export async function fetchMarcelPublicCourseStopsClient(courseId: number | string) {
  const key = String(courseId);
  if (!marcelPublicCourseStopsCache.has(key)) {
    marcelPublicCourseStopsCache.set(
      key,
      requestJson<MarcelCourseStopPublic[]>(
        `${MARCEL_API_BASE_URL}/client/api/trasy/kurs/${encodeURIComponent(key)}?appVersion=v1.67`,
        {headers: {Accept: 'application/json'}},
      ).catch(error => { marcelPublicCourseStopsCache.delete(key); throw error; }),
    );
    if (marcelPublicCourseStopsCache.size > 700) {
      const firstKey = marcelPublicCourseStopsCache.keys().next().value;
      if (firstKey) marcelPublicCourseStopsCache.delete(firstKey);
    }
  }
  return marcelPublicCourseStopsCache.get(key)!;
}

export async function fetchRouteGeometryClient(
  request: RouteGeometryClientRequest,
  options?: { signal?: AbortSignal },
): Promise<RouteGeometryClientResponse> {
  const isRail = request.mode === 'rail';
  const fetchClientFallback = async (): Promise<RouteGeometryClientResponse> => {
    if (isRail) {
      return {
        carrier: request.carrier,
        line: request.line,
        direction: request.direction,
        variant: request.variant || 'default',
        stopsHash: '',
        cacheKey: '',
        geometry: {
          type: 'LineString',
          coordinates: [],
        },
        source: 'rail-empty-fallback',
        sourceQuality: 'none',
        isSynthetic: false,
        cached: false,
        skippedSegments: 0,
      };
    }

    const stopCoords = request.stops
      .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lon))
      .map((stop) => [Number(stop.lat), Number(stop.lon)] as ShapePoint);
    const fallbackPoints = await fetchRoadRouteForStops(
      stopCoords,
      [
        request.carrier,
        request.line,
        request.direction,
        stopCoords.map(([lat, lon]) => `${lat.toFixed(6)},${lon.toFixed(6)}`).join('|'),
      ].join(':'),
      { strictShortSegments: request.carrier === 'mpk_rzeszow',stopWaypoints:request.carrier === 'marcel',signal:options?.signal },
    );
    if (fallbackPoints.length <= 1) {
      return {
        carrier: request.carrier,
        line: request.line,
        direction: request.direction,
        variant: request.variant || 'default',
        stopsHash: '',
        cacheKey: '',
        geometry: {
          type: 'LineString',
          coordinates: [],
        },
        source: 'road-empty-fallback',
        sourceQuality: 'none',
        isSynthetic: false,
        cached: false,
        skippedSegments: 0,
      };
    }

    return {
      carrier: request.carrier,
      line: request.line,
      direction: request.direction,
      variant: request.variant || 'default',
      stopsHash: '',
      cacheKey: '',
      geometry: {
        type: 'LineString',
        coordinates: fallbackPoints.map(([lat, lon]) => [lon, lat]),
      },
      source: 'bus-road-routing',
      sourceQuality: 'fallback',
      isSynthetic: false,
      cached: false,
      skippedSegments: 0,
    };
  };

  if(!isRail) return fetchClientFallback();

  let response: RouteGeometryClientResponse | null = null;
  try {
    response = await requestJson<RouteGeometryClientResponse>(transportApiUrl('/routes/geometry'), {
      method: 'POST',
      signal: options?.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
  } catch (error) {
    if ((error as any)?.name === 'AbortError' || options?.signal?.aborted) throw error;
    return fetchClientFallback();
  }

  const coordinates = response.geometry?.coordinates || [];
  const source = String(response.source || '').toLowerCase();
  const isSynthetic = response.isSynthetic === true || source.includes('synthetic');
  if (isSynthetic) {
    return fetchClientFallback();
  }
  if (response.geometry?.type !== 'LineString' || coordinates.length <= 1) {
    return fetchClientFallback();
  }

  const sourceQuality = response.sourceQuality
    || (source.includes('fallback') ? 'fallback' : 'high');
  return {
    ...response,
    sourceQuality,
    isSynthetic: false,
  };
}

export async function fetchRouteShapeClient(
  tripId: string,
  fallbackStops: Array<number | string>,
  stopsData?: Record<string, {lat: number; lon: number}> | null,
  options?: {
    fastFallback?: boolean;
    startPoint?: ShapePoint;
    skipOfficialShape?: boolean;
    refineTimeoutMs?: number;
    disableSyntheticFallback?: boolean;
  },
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
  if (!options?.disableSyntheticFallback) {
    const quickRoute = createQuickCurvedRoute(routeCoords);
    if (quickRoute.length > 1) return quickRoute;
  }
  return [];
}
