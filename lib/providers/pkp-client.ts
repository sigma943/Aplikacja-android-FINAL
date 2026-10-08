

import type {Vehicle} from '@/lib/transport/vehicle';

import {type PkpQueryViewport, type TransportApiVehiclesResponse, type PkpTrainMetadata} from '../transport/types';
import {PKP_INTERCITY_GPS_PROXY_URL, PKP_STATIONS_DATASET_URL, PKP_DEFAULT_CENTER, PKP_MAX_DISTANCE_KM, PKP_METADATA_CACHE_TTL_MS} from '../transport/endpoints';
import {requestJson, requestText} from '../transport/http';
import {mapTransportVehicleToClient} from '../transport/vehicle-adapter';

let pkpStationCoordinatesPromise: Promise<Record<string, { lat: number; lon: number }>> | null = null;

const pkpTrainMetadataCache = new Map<string, { expiresAt: number; value: PkpTrainMetadata | null }>();

const pkpTrainMetadataInflight = new Map<string, Promise<PkpTrainMetadata | null>>();

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

export {pkpStationCoordinatesPromise};
export {pkpTrainMetadataCache};
export {pkpTrainMetadataInflight};
export {requestPkpDirectJson};
export {isAbortLikeError};
export {getPkpRecord};
export {getPkpPath};
export {readPkpFirst};
export {readPkpString};
export {readPkpNumber};
export {readPkpDateIso};
export {normalizePkpStationName};
export {loadPkpStationCoordinates};
export {normalizePkpCategory};
export {normalizeTrainNumber};
export {distanceKmBetween};
export {isPointInsideBbox};
export {normalizePkpLatLon};
export {resolvePkpCoords};
export {resolvePkpLiveCoords};
export {getPkpTrainDelaySeconds};
export {fetchPkpTrainMetadata};
export {mapPkpOperationToVehicle};
export {fetchPkpIntercityVehiclesDirect};
export {normalizePkpVehicleLookupId};
export {fetchPkpIntercityPortalGpsVehicles};
export {fetchPkpIntercityVehicleDetailsDirect};
