import {readBusCoordinates} from '../bus-coordinates';

import {createMarcelTimetableApi} from '../providers/marcel-timetable';
import type {MarcelCourseStopPublic} from '../providers/marcel-timetable';

import {busOperatingState, transitTimestamp} from '../bus-operating-state';

import type {Vehicle} from '@/lib/transport/vehicle';
import {warsawDateIso, warsawTimeMs} from '../transit-time';
import {withRequestDeadline} from '../request-deadline';

import {type ShapePoint, type MarcelCourseStop, type MarcelLivePosition, type MarcelPositionSnapshot} from '../transport/types';
import {MARCEL_API_BASE_URL, MARCEL_DIRECT_VEHICLES_URL} from '../transport/endpoints';
import {requestJson} from '../transport/http';
import {squaredMetersDistanceToSegment, distanceMeters, computeObservedSpeedKmh} from '../transport/vehicle-speed';

const marcelCourseStopsCache = new Map<string, Promise<MarcelCourseStop[]>>();

const marcelResolvedCourseStops = new Map<string, MarcelCourseStop[]>();

const marcelPublicCourseStops = new Map<string, MarcelCourseStopPublic[]>();

let marcelLatestPositions = new Map<string, MarcelLivePosition>();

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

const MARCEL_STALE_MS = 7 * 60 * 1000;

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
  const courseId = String(tripId || '').trim();
  if (!courseId) return [];
  const id = `${warsawDateIso()}:${courseId}`;
  if (!marcelCourseStopsCache.has(id)) {
    marcelCourseStopsCache.set(
      id,
      fetchMarcelPublicCourseStopsClient(courseId)
        .then((payload) => {
          let previousMs: number | null = null;
          return unwrapMarcelCourseStopsPayload(payload)
            .sort((a, b) => Number(a.kol ?? 0) - Number(b.kol ?? 0))
            .map((stop, index): MarcelCourseStop | null => {
              const source = stop && typeof stop === 'object' ? stop as Record<string, unknown> : {};
              const lat = readMarcelNumber(source, ['szGps', 'lat', 'latitude', 'szerokosc']);
              const lon = readMarcelNumber(source, ['dlGps', 'lon', 'lng', 'longitude', 'dlugosc']);
              const plannedMs = buildMarcelPlannedMs(source.godz || source.godzPr || source.godzina, previousMs);
              if (!readBusCoordinates(lat,lon) || !Number.isFinite(plannedMs)) return null;
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
          for (const listener of marcelCourseListeners) listener(courseId);
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
  const courseId = String(vehicle.tripId || vehicle.journeyId || '');
  const points = marcelPublicCourseStops.get(courseId);
  if (!points) return vehicle;
  const signalMs = vehicle.positionObservedAtMs ?? transitTimestamp(vehicle.lastSignalTime);
  const latest = marcelLatestPositions.get(courseId);
  const position = latest && latest.observedAtMs > signalMs ? latest
    : { tripId: courseId, lat: vehicle.lat, lon: vehicle.lon, observedAtMs: Number.isFinite(signalMs) ? signalMs : now };
  const delay = estimateMarcelCourseDelay(courseId, points, warsawDateIso(), [position]);
  return delay === vehicle.delay && position.observedAtMs === vehicle.positionObservedAtMs ? vehicle
    : { ...vehicle, delay, positionObservedAtMs: position.observedAtMs };
}

/** Warm only visible courses, two at a time, without holding up position polling. */

export function warmMarcelBadgeCourses(vehicles: Vehicle[], bbox: [number, number, number, number]) {
  const [west, south, east, north] = bbox;
  if (!bbox.every(Number.isFinite)) return;
  marcelBadgeQueue = [...new Set(vehicles.filter(v => v.provider === 'marcel' && v.lon >= west && v.lon <= east && v.lat >= south && v.lat <= north)
    .map(v => String(v.tripId || v.journeyId || '')).filter(id => id && !marcelCourseStopsCache.has(`${warsawDateIso()}:${id}`) && !marcelBadgeInflight.has(id)))];
  const pump = () => {
    while (marcelBadgeRequests < 2 && marcelBadgeQueue.length) {
      const id = marcelBadgeQueue.shift()!;
      if (marcelCourseStopsCache.has(`${warsawDateIso()}:${id}`) || marcelBadgeInflight.has(id)) continue;
      marcelBadgeRequests++; marcelBadgeInflight.add(id);
      void fetchMarcelCourseStops(id).catch(() => { /* Retry on the next fleet refresh. */ }).finally(() => {
        marcelBadgeRequests--; marcelBadgeInflight.delete(id); pump();
      });
    }
  };
  pump();
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

async function mapMarcelDirectVehicle(raw: any, now: number, includeInactive: boolean, includeRoute = false, fetchedAtMs = now): Promise<Vehicle | null> {
  const lat = readMarcelNumber(raw, ['lat', 'latitude', 'szGps', 'szerokosc', 'szerokoscGeo', 'position.lat', 'position.latitude']);
  const lon = readMarcelNumber(raw, ['lon', 'lng', 'long', 'longitude', 'dlGps', 'dlugosc', 'dlugoscGeo', 'position.lon', 'position.lng', 'position.long', 'position.longitude']);
  if (!readBusCoordinates(lat,lon)) return null;

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
  const courseStops = includeRoute ? await fetchMarcelCourseStops(tripId) : marcelResolvedCourseStops.get(`${warsawDateIso()}:${tripId || ''}`) || [];
  const positionObservedAtMs = Number.isFinite(timestampMs) ? timestampMs : fetchedAtMs;
  const publicStops = marcelPublicCourseStops.get(String(tripId || ''));
  const delay = publicStops ? estimateMarcelCourseDelay(String(tripId || ''), publicStops, warsawDateIso(),
    [{ tripId: String(tripId || ''), lat, lon, observedAtMs: positionObservedAtMs }]) : undefined;
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
    positionObservedAtMs,
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
  const snapshot = await fetchMarcelPositionSnapshot(signal);
  const now = Date.now();
  const rawVehicles = snapshot.rows;
  const vehicles: Vehicle[] = [];
  const concurrency = 6;
  for (let start = 0; start < rawVehicles.length; start += concurrency) {
    const chunk = rawVehicles.slice(start, start + concurrency);
    const mapped = await Promise.all(chunk.map((rawVehicle) => mapMarcelDirectVehicle(rawVehicle, now, includeInactive, false, snapshot.observedAtMs)));
    vehicles.push(...mapped.filter((vehicle): vehicle is Vehicle => Boolean(vehicle)));
  }
  return vehicles;
}

async function fetchMarcelVehicleDetailsDirect(vehicleId: string, includeInactive: boolean) {
  const lookupVehicleId = String(vehicleId || '').replace(/^marcel_/, '');
  const snapshot = await fetchMarcelPositionSnapshot();
  const raw = snapshot.rows.find((row) => {
    const id = readMarcelString(row, ['vehicle_id', 'vehicle.id', 'idPojazdu', 'pojazdId', 'idPo'])
      || readMarcelString(row, ['journeyId', 'journey_id', 'idKu', 'kursId', 'idKursu']);
    const number = readMarcelString(row, ['vehicleNumber', 'vehicle_number', 'vehicle.label', 'nrBoczny', 'numerBoczny', 'nrRej', 'rejestracja']);
    return id === lookupVehicleId || number === lookupVehicleId;
  });
  return raw ? mapMarcelDirectVehicle(raw, Date.now(), includeInactive, true, snapshot.observedAtMs) : null;
}

let marcelPositionSnapshotCache: { expiresAt: number; promise: Promise<MarcelPositionSnapshot> } | undefined;

/** Map, selected bus and stop departures share one position and observation time. */

function fetchMarcelPositionSnapshot(signal?: AbortSignal): Promise<MarcelPositionSnapshot> {
  if (!marcelPositionSnapshotCache || marcelPositionSnapshotCache.expiresAt <= Date.now()) {
    const promise = requestJson<unknown>(MARCEL_DIRECT_VEHICLES_URL, { headers: { Accept: 'application/json' } }).then(payload => {
      const observedAtMs = Date.now();
      const rows = unwrapMarcelVehiclesPayload(payload);
      const positions = rows.flatMap(row => {
        const tripId = readMarcelString(row, ['journeyId', 'journey_id', 'idKu', 'kursId', 'idKursu']);
        const lat = readMarcelNumber(row, ['lat', 'latitude', 'szGps', 'szerokosc', 'szerokoscGeo', 'position.lat', 'position.latitude']);
        const lon = readMarcelNumber(row, ['lon', 'lng', 'long', 'longitude', 'dlGps', 'dlugosc', 'dlugoscGeo', 'position.lon', 'position.lng', 'position.long', 'position.longitude']);
        const timestamp = readMarcelTimestamp(row);
        const at = Number.isFinite(timestamp) ? timestamp : observedAtMs;
        return tripId && readBusCoordinates(lat,lon) && Math.abs(observedAtMs - at) < 60_000
          ? [{ tripId, lat, lon, observedAtMs: at }] : [];
      });
      if (marcelPositionSnapshotCache?.promise === promise) marcelPositionSnapshotCache.expiresAt = observedAtMs + 10_000;
      marcelLatestPositions = new Map(positions.map(position => [position.tripId, position]));
      for (const courseId of marcelPublicCourseStops.keys()) {
        for (const listener of marcelCourseListeners) listener(courseId);
      }
      return { rows, observedAtMs, positions };
    }).catch(error => {
      if (marcelPositionSnapshotCache?.promise === promise) marcelPositionSnapshotCache = undefined;
      throw error;
    });
    marcelPositionSnapshotCache = { expiresAt: Infinity, promise };
  }
  const snapshot = marcelPositionSnapshotCache.promise;
  return signal ? withRequestDeadline(() => snapshot, signal) : snapshot;
}

/** One live position download per refresh, shared by all courses of a stop. */

export function fetchMarcelLivePositionsClient(): Promise<MarcelLivePosition[]> {
  return fetchMarcelPositionSnapshot().then(snapshot => snapshot.positions);
}

/** This is a GPS estimate, not an operator-confirmed delay. */

export function estimateMarcelCourseDelay(courseId: number | string, publicStops: MarcelCourseStopPublic[], dateIso: string, positions: MarcelLivePosition[]): number | undefined {
  const position = positions.find(row => row.tripId === String(courseId));
  if (!position || Math.abs(Date.now() - position.observedAtMs) > 60_000) return undefined;
  let previousMs: number | undefined;
  const stops = [...publicStops].sort((a, b) => (a.kol ?? 0) - (b.kol ?? 0)).flatMap((stop, index) => {
    let plannedMs = warsawTimeMs(dateIso, stop.godz);
    if (previousMs != null && plannedMs < previousMs - 6 * 3600_000) plannedMs += 24 * 3600_000;
    if (!Number.isFinite(plannedMs) || stop.szGps == null || stop.dlGps == null) return [];
    const point = readBusCoordinates(stop.szGps,stop.dlGps);
    if (!point) return [];
    const {lat,lon} = point;
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

const marcelTimetable = createMarcelTimetableApi(requestJson,MARCEL_API_BASE_URL);

export const {fetchMarcelRoutesClient,fetchMarcelCoursesClient} = marcelTimetable;
/** The stop list, map badges and bus details reuse the same persistent course response. */

export async function fetchMarcelPublicCourseStopsClient(id: number | string) {
  const points = await marcelTimetable.fetchMarcelPublicCourseStopsClient(id);
  marcelPublicCourseStops.set(String(id), points);
  if (marcelPublicCourseStops.size > 700) marcelPublicCourseStops.delete(marcelPublicCourseStops.keys().next().value!);
  return points;
}

export {marcelCourseStopsCache};
export {marcelResolvedCourseStops};
export {marcelPublicCourseStops};
export {marcelLatestPositions};
export {marcelCourseListeners};
export {marcelBadgeQueue};
export {marcelBadgeRequests};
export {marcelBadgeInflight};
export {marcelPositionFreshness};
export {marcelProgressState};
export {MARCEL_STALE_MS};
export {unwrapMarcelVehiclesPayload};
export {readMarcelField};
export {readMarcelString};
export {readMarcelNumber};
export {readMarcelTimestamp};
export {getObservedMarcelSignalMs};
export {getMarcelProgressState};
export {shouldHideDeadMarcelVehicle};
export {getWarsawDateParts};
export {warsawWallTimeToUtcMs};
export {buildMarcelPlannedMs};
export {unwrapMarcelCourseStopsPayload};
export {cleanMarcelStopName};
export {getMarcelDestination};
export {fetchMarcelCourseStops};
export {estimateMarcelDelaySeconds};
export {buildMarcelSchedule};
export {buildMarcelRouteStops};
export {mapMarcelDirectVehicle};
export {fetchMarcelVehiclesDirect};
export {fetchMarcelVehicleDetailsDirect};
export {marcelPositionSnapshotCache};
export {fetchMarcelPositionSnapshot};
export {marcelTimetable};
