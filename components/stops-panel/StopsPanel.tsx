'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import StopList from '@/Panel/src/components/StopList';
import BusStopDetail from '@/Panel/src/components/BusStopDetail';
import type { Carrier, Departure, Stop } from '@/Panel/src/types';
import {
  fetchDeparturesClient,
  fetchMarcelCoursesClient,
  fetchMarcelPublicCourseStopsClient,
  fetchMarcelRoutesClient,
  fetchMpkRzeszowDeparturesClient,
  fetchMpkRzeszowStopsClient,
  fetchVehicleDetailsClient,
  fetchVehiclesClient,
  type MarcelCourse,
  type MarcelCourseStopPublic,
  type TransportProviderId,
} from '@/lib/pks-client';
import type { Vehicle } from '@/components/BusMap';

type RawStop = {
  id: string;
  name: string;
  areaId?: string;
  code?: string;
  lat?: number;
  lon?: number;
};

interface StopsPanelProps {
  stops: RawStop[];
  isLoading: boolean;
  hasError: boolean;
  favorites: string[];
  vehicles: Vehicle[];
  transparentUI: boolean;
  onRetry: () => void;
  onClose: () => void;
  onToggleFavorite: (stopId: string) => void;
  onShowOnMap: (stop: Stop) => void;
}

const PKS_CARRIER: Carrier = {
  id: 'pks',
  name: 'PKS Rzeszow',
  colorClass: 'text-teal-400',
  borderClass: 'border-teal-400/30',
  bgClass: 'bg-teal-400/10',
  dotClass: 'bg-teal-400',
};

const MARCEL_CARRIER: Carrier = {
  id: 'marcel',
  name: 'Marcel',
  colorClass: 'text-lime-400',
  borderClass: 'border-lime-400/30',
  bgClass: 'bg-lime-400/10',
  dotClass: 'bg-lime-400',
};

const MPK_CARRIER: Carrier = {
  id: 'mpk',
  name: 'MPK Rzeszow',
  colorClass: 'text-orange-500',
  borderClass: 'border-orange-500/30',
  bgClass: 'bg-orange-500/10',
  dotClass: 'bg-orange-500',
};

type InternalStop = Stop & {
  lineSet: Set<string>;
  carrierMap: Map<string, Carrier>;
  baseNameKey: string;
  displayNamesByProvider: Record<string, string>;
};

type MarcelIndexedStop = {
  id: string;
  name: string;
  matchName: string;
  matchKey: string;
  lat?: number;
  lon?: number;
  routeIds: string[];
};

const TOKEN_CACHE = new Map<string, string[]>();
const NUM_TOKEN_CACHE = new Map<string, Set<string>>();
const MARCEL_STOPS_INDEX_CACHE = new Map<string, Promise<MarcelIndexedStop[]>>();
const LIVE_DETAILS_TTL_MS = 90_000;
const LIVE_DELAY_LIMIT_SECONDS = 18_000;
const LIVE_DEPARTURE_MATCH_WINDOW_MS = 8 * 60_000;
const LIVE_DETAILS_CACHE = new Map<string, { expiresAt: number; promise: Promise<Vehicle | null> }>();
const GEO_BUCKET_PRECISION = 0.002;
const STOP_CACHE_VERSION = 2;
const STOP_CACHE_TTL_MS = 15 * 60 * 1000;
const MARCEL_STOPS_PERSISTENT_PREFIX = 'pks-live:marcel-stops-index:v2:';

type LiveDepartureProvider = 'pks' | 'mpk_rzeszow';

type LiveDepartureCorrection = {
  key: string;
  provider: LiveDepartureProvider;
  line: string;
  plannedAtMs: number;
  realAtMs: number;
  delayMins: number;
  vehicleDesc: string;
};

function cleanLine(value: unknown) {
  return String(value || '').trim().replace(/^MKS\s+/i, '');
}

function normalizeLineKey(value: unknown) {
  return cleanLine(value).toUpperCase().replace(/\s+/g, '');
}

function parseDateMs(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return Number.NaN;
  const parsed = new Date(raw.replace(' ', 'T')).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function providerFromVehicle(vehicle: Vehicle): LiveDepartureProvider | null {
  const provider = String(vehicle.provider || 'pks');
  if (provider === 'pks' || provider === 'mpk_rzeszow') return provider;
  return null;
}

function providerFromDeparture(departure: Departure): LiveDepartureProvider | null {
  if (departure.carrier?.id === 'pks') return 'pks';
  if (departure.carrier?.id === 'mpk') return 'mpk_rzeszow';
  return null;
}

function stopIdsForLiveProvider(stop: Stop, provider: LiveDepartureProvider) {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    splitCsvValues(value).forEach((normalized) => ids.add(normalized));
  };

  add(stop.id);
  if (provider === 'pks') add(stop.providerStopIds?.pks);
  if (provider === 'mpk_rzeszow') add(stop.providerStopIds?.mpk_rzeszow);
  return ids;
}

function vehicleHasLiveStop(vehicle: Vehicle, stopIds: Set<string>) {
  return [...(vehicle.schedule || []), ...(vehicle.routeStops || [])].some((entry) =>
    stopIds.has(String(entry.id || '').trim()),
  );
}

function liveVehicleCandidateScore(vehicle: Vehicle, stopIds: Set<string>) {
  const hasStop = vehicleHasLiveStop(vehicle, stopIds) ? 1000 : 0;
  const hasDetails = (vehicle.schedule?.length || 0) + (vehicle.routeStops?.length || 0);
  const freshness = Math.max(0, 240 - Number(vehicle.dataAgeSec || 0));
  return hasStop + Math.min(hasDetails, 80) + freshness;
}

function vehicleDisplayNumber(vehicle: Vehicle) {
  return String(vehicle.vehicleNumber || vehicle.id || '')
    .replace(/^(mpk_rzeszow|marcel)_/, '')
    .trim();
}

function mergeVehicleSnapshot(base: Vehicle, details: Vehicle | null) {
  if (!details) return base;
  return {
    ...base,
    ...details,
    schedule: details.schedule?.length ? details.schedule : base.schedule,
    routeStops: details.routeStops?.length ? details.routeStops : base.routeStops,
    routePath: details.routePath?.length ? details.routePath : base.routePath,
    delay: Number.isFinite(Number(details.delay)) ? details.delay : base.delay,
  };
}

function fetchCachedVehicleDetails(provider: LiveDepartureProvider, vehicle: Vehicle) {
  const key = `${provider}:${vehicle.id}`;
  const now = Date.now();
  const cached = LIVE_DETAILS_CACHE.get(key);
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = fetchVehicleDetailsClient(provider as TransportProviderId, vehicle.id, true).catch(() => null);
  LIVE_DETAILS_CACHE.set(key, { expiresAt: now + LIVE_DETAILS_TTL_MS, promise });

  if (LIVE_DETAILS_CACHE.size > 160) {
    const firstKey = LIVE_DETAILS_CACHE.keys().next().value;
    if (firstKey) LIVE_DETAILS_CACHE.delete(firstKey);
  }

  return promise;
}

function normalizeStopName(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bdw\.\b/g, 'dworzec')
    .replace(/\bul\.\b/g, 'ulica')
    .replace(/\bal\.\b/g, 'aleja')
    .replace(/\bpl\.\b/g, 'plac')
    .replace(/\bos\.\b/g, 'osiedle')
    .replace(/\s+/g, ' ');
}

function stableCacheString(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableCacheString).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableCacheString((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashCacheString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stopCacheSignature(value: unknown) {
  const size = Array.isArray(value)
    ? value.length
    : value && typeof value === 'object'
      ? Object.keys(value as Record<string, unknown>).length
      : 0;
  return `${size}:${hashCacheString(stableCacheString(value))}`;
}

function readStopCache<T>(key: string): { savedAt: number; signature: string; data: T } | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null') as {
      version?: number;
      savedAt?: number;
      signature?: string;
      data?: T;
    } | null;
    if (!parsed || parsed.version !== STOP_CACHE_VERSION || !parsed.data || !parsed.savedAt || !parsed.signature) return null;
    return { savedAt: parsed.savedAt, signature: parsed.signature, data: parsed.data };
  } catch {
    return null;
  }
}

function writeStopCache<T>(key: string, data: T) {
  const signature = stopCacheSignature(data);
  if (typeof window === 'undefined') return signature;
  const current = readStopCache<T>(key);
  if (current?.signature === signature) return signature;
  try {
    window.localStorage.setItem(key, JSON.stringify({
      version: STOP_CACHE_VERSION,
      savedAt: Date.now(),
      signature,
      data,
    }));
  } catch {
    // Keep the current session data even if persistent storage is full.
  }
  return signature;
}

function stopDisplayName(value: unknown) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s+/g, ', ')
    .trim();
}

function normalizeMpkDisplayName(value: unknown) {
  const base = stopDisplayName(value).replace(/\bmatuszczka\b/gi, 'Matuszczaka');
  return base;
}

function hasKnownCityPrefix(value: unknown) {
  return /^(rzeszow|rzeszów|boguchwala|boguchwała|babica|czudec|gwoznica|gwoźnica|wyzne|wyżne|lutoryz|lutoryż|zarzecze|polomia|połomia|baryczka|jasionka)\b/i
    .test(stopDisplayName(value));
}

function mpkStopDisplayName(stop: { stop_name?: string; zone_id?: string | number }) {
  const base = normalizeMpkDisplayName(stop.stop_name || '');
  const zone = String(stop.zone_id || '').trim().toUpperCase();
  if (base && zone === 'A' && !hasKnownCityPrefix(base)) return `Rzeszów ${base}`;
  return base;
}

function preferredStopDisplayName(namesByProvider: Record<string, string>) {
  return (
    namesByProvider.pks ||
    namesByProvider.mpk_rzeszow ||
    namesByProvider.marcel ||
    Object.values(namesByProvider).find(Boolean) ||
    ''
  );
}

function stopBaseNameKey(value: unknown) {
  return normalizeStopName(value)
    .replace(/[()]/g, ' ')
    .replace(/\s*[-/]\s*/g, ' ')
    .replace(/\b(?:rzeszow|przystanek|przyst|autobusowy|autobusowa)\b/g, ' ')
    .replace(/\bdworzec\s+autobusowy\b/g, 'dworzec')
    .replace(/\b(?:st|skr)\.?\s*\d{1,3}[a-z]?\b/gi, (m) => m.replace(/\d{1,3}[a-z]?/i, ''))
    .replace(/\b\d{1,3}[a-z]?\b$/i, '')
    .replace(/\b\d{1,2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeTokens(value: unknown) {
  const key = stopBaseNameKey(value);
  if (TOKEN_CACHE.has(key)) return TOKEN_CACHE.get(key) || [];
  const normalized = key
    .replace(/\b(?:rzeszow|jasionka|przystanek|przyst|ul|ulica|al|aleja|rondo|plac|miasto)\b/g, ' ')
    .replace(/\b(?:nz|n|z)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = normalized ? normalized.split(' ').filter(Boolean) : [];
  TOKEN_CACHE.set(key, tokens);
  return tokens;
}

function numericTokens(value: unknown) {
  const key = stopBaseNameKey(value);
  if (NUM_TOKEN_CACHE.has(key)) return NUM_TOKEN_CACHE.get(key) || new Set<string>();
  const tokens = new Set((key.match(/\b\d{1,3}[a-z]?\b/g) || []).map((token) => token.toLowerCase()));
  NUM_TOKEN_CACHE.set(key, tokens);
  return tokens;
}

function nameSimilarityScore(left: unknown, right: unknown) {
  const leftTokens = new Set(mergeTokens(left));
  const rightTokens = new Set(mergeTokens(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let overlap = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) overlap += 1;
  });
  const tokenScore = overlap / Math.max(leftTokens.size, rightTokens.size);
  const leftNums = numericTokens(left);
  const rightNums = numericTokens(right);
  let numsOverlap = 0;
  leftNums.forEach((token) => {
    if (rightNums.has(token)) numsOverlap += 1;
  });
  const numScore = leftNums.size > 0 && rightNums.size > 0 ? numsOverlap / Math.max(leftNums.size, rightNums.size) : 0;
  return tokenScore * 0.75 + numScore * 0.25;
}

function stopTokenSet(value: unknown) {
  return new Set(mergeTokens(value));
}

function sharedStopTokenCount(left: unknown, right: unknown) {
  const leftTokens = stopTokenSet(left);
  const rightTokens = stopTokenSet(right);
  let count = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) count += 1;
  });
  return count;
}

function hasConflictingCityToken(left: unknown, right: unknown) {
  const cityTokens = new Set([
    'rzeszow',
    'boguchwala',
    'babica',
    'czudec',
    'gwoznica',
    'wyzne',
    'lutoryz',
    'zarzecze',
    'polomia',
    'baryczka',
    'jasionka',
  ]);
  const tokens = (value: unknown) => normalizeStopName(value).split(' ').filter(Boolean);
  const leftCities = tokens(left).filter((token) => cityTokens.has(token));
  const rightCities = tokens(right).filter((token) => cityTokens.has(token));
  if (leftCities.length === 0 || rightCities.length === 0) return false;
  return !leftCities.some((token) => rightCities.includes(token));
}

function distanceMeters(aLat?: number, aLon?: number, bLat?: number, bLon?: number) {
  if (!Number.isFinite(aLat) || !Number.isFinite(aLon) || !Number.isFinite(bLat) || !Number.isFinite(bLon)) {
    return Number.POSITIVE_INFINITY;
  }
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad((bLat as number) - (aLat as number));
  const dLon = toRad((bLon as number) - (aLon as number));
  const lat1 = toRad(aLat as number);
  const lat2 = toRad(bLat as number);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

function hasFinitePoint(lat?: number, lon?: number) {
  return Number.isFinite(lat) && Number.isFinite(lon);
}

function geoBucketKeys(lat?: number, lon?: number) {
  if (!hasFinitePoint(lat, lon)) return [];
  const latBucket = Math.floor((lat as number) / GEO_BUCKET_PRECISION);
  const lonBucket = Math.floor((lon as number) / GEO_BUCKET_PRECISION);
  const keys: string[] = [];
  for (let latOffset = -1; latOffset <= 1; latOffset += 1) {
    for (let lonOffset = -1; lonOffset <= 1; lonOffset += 1) {
      keys.push(`${latBucket + latOffset}:${lonBucket + lonOffset}`);
    }
  }
  return keys;
}

function stripMarcelStopName(value: unknown) {
  const cleaned = String(value || '')
    .replace(/^\(\d+[a-z]?\)\s*/i, '')
    .replace(/\s*\((?:\+|-|\/|\s)+\)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  if (/^\d+[a-z]?$/i.test(cleaned)) return '';
  if (/^\(\d+[a-z]?\)$/i.test(cleaned)) return '';
  return cleaned;
}

function marcelStopDisplayName(cityValue: unknown, stopValue: unknown) {
  const city = stopDisplayName(cityValue);
  const stop = stripMarcelStopName(stopValue);
  if (!stop) return '';
  if (!city) return stopDisplayName(stop);
  if (normalizeStopName(stop).startsWith(`${normalizeStopName(city)} `)) return stopDisplayName(stop);
  return `${city} - ${stopDisplayName(stop)}`;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }));

  return results;
}

function mergeCsvValues(...values: Array<string | undefined>) {
  const next = new Set<string>();
  values.forEach((value) => {
    splitCsvValues(value).forEach((part) => next.add(part));
  });
  return [...next].join(',');
}

function mergeDebugNames(current: string | undefined, nextName: string) {
  const next = new Set(
    String(current || '')
      .split(' | ')
      .map((part) => part.trim())
      .filter(Boolean),
  );
  const clean = stopDisplayName(nextName);
  if (clean) next.add(clean);
  return [...next].join(' | ');
}

function splitCsvValues(value: unknown) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function marcelCourseStopMatchKey(stop: MarcelCourseStopPublic) {
  return stopBaseNameKey(stripMarcelStopName(stop.nazPr));
}

function marcelCourseStopIndexKey(stop: MarcelCourseStopPublic) {
  return [normalizeStopName(stop.nazMi), marcelCourseStopMatchKey(stop)].filter(Boolean).join('|');
}

function getMarcelStopsIndex(dateIso: string, options?: { forceRefresh?: boolean }) {
  const cacheKey = `${MARCEL_STOPS_PERSISTENT_PREFIX}${dateIso}`;
  const cached = readStopCache<MarcelIndexedStop[]>(cacheKey);
  const isFresh = cached && Date.now() - cached.savedAt < STOP_CACHE_TTL_MS;
  if (cached && !options?.forceRefresh) {
    if (!isFresh) {
      getMarcelStopsIndex(dateIso, { forceRefresh: true }).catch(() => undefined);
    }
    return Promise.resolve(cached.data);
  }

  if (options?.forceRefresh) MARCEL_STOPS_INDEX_CACHE.delete(dateIso);
  if (!MARCEL_STOPS_INDEX_CACHE.has(dateIso)) {
    MARCEL_STOPS_INDEX_CACHE.set(dateIso, (async () => {
      const routes = await fetchMarcelRoutesClient();
      const routeCourses = await mapWithConcurrency(routes, 6, async (route) => ({
        routeId: String(route.idTr),
        courses: await fetchMarcelCoursesClient(route.idTr, dateIso),
      }));
      const courseRefs = routeCourses.flatMap(({ routeId, courses }) =>
        courses.map((course) => ({ routeId, courseId: course.idKu })),
      );
      const uniqueCourseRefs = [...new Map(courseRefs.map((ref) => [String(ref.courseId), ref])).values()];
      const indexedStops = new Map<string, MarcelIndexedStop & { routeIdSet: Set<string> }>();

      await mapWithConcurrency(uniqueCourseRefs, 10, async ({ routeId, courseId }) => {
        const stopsForCourse = await fetchMarcelPublicCourseStopsClient(courseId);
        stopsForCourse.forEach((courseStop) => {
          const matchName = stripMarcelStopName(courseStop.nazPr);
          const matchKey = marcelCourseStopMatchKey(courseStop);
          const displayName = marcelStopDisplayName(courseStop.nazMi, courseStop.nazPr);
          const key = marcelCourseStopIndexKey(courseStop);
          if (!displayName || !matchName || !matchKey || !key) return;

          const current = indexedStops.get(key);
          if (current) {
            current.routeIdSet.add(routeId);
            if (current.lat === undefined && Number.isFinite(Number(courseStop.szGps))) current.lat = Number(courseStop.szGps);
            if (current.lon === undefined && Number.isFinite(Number(courseStop.dlGps))) current.lon = Number(courseStop.dlGps);
            return;
          }

          indexedStops.set(key, {
            id: stableKeyId('marcel', key),
            name: stopDisplayName(displayName),
            matchName: stopDisplayName(matchName),
            matchKey,
            lat: Number.isFinite(Number(courseStop.szGps)) ? Number(courseStop.szGps) : undefined,
            lon: Number.isFinite(Number(courseStop.dlGps)) ? Number(courseStop.dlGps) : undefined,
            routeIds: [],
            routeIdSet: new Set([routeId]),
          });
        });
      });

      const stops = [...indexedStops.values()].map(({ routeIdSet, ...stop }) => ({
        ...stop,
        routeIds: [...routeIdSet],
      }));
      writeStopCache(cacheKey, stops);
      return stops;
    })());
  }
  return MARCEL_STOPS_INDEX_CACHE.get(dateIso)!.catch((error) => {
    if (cached) return cached.data;
    throw error;
  });
}

function canExposeStandaloneMarcelStop(value: unknown) {
  const display = stopDisplayName(value);
  if (!display) return false;
  const key = stopBaseNameKey(display);
  if (!key) return false;
  if (key.length < 3) return false;
  return /[a-z]/i.test(key);
}

function isWeakMarcelName(value: unknown) {
  const tokens = mergeTokens(value);
  if (tokens.length === 0) return true;
  if (tokens.length === 1) return true;
  const hasDigits = /\d/.test(stopBaseNameKey(value));
  return !hasDigits && tokens.length <= 2;
}

function stableKeyId(prefix: string, value: string) {
  const base = normalizeStopName(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'stop';
  return `${prefix}_${base}`;
}

function marcelDirectionDestination(value: unknown) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Marcel';
  const parts = normalized.split(/\s*(?:-|>)\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1];
  return normalized;
}

function providerCarrier(provider: unknown): Carrier {
  if (provider === 'mpk_rzeszow') return MPK_CARRIER;
  if (provider === 'marcel') return MARCEL_CARRIER;
  return PKS_CARRIER;
}

function sortedLines(lines: Iterable<string>) {
  return [...lines]
    .map(cleanLine)
    .filter(Boolean)
    .filter((line, index, all) => all.indexOf(line) === index)
    .sort((left, right) => {
      const leftNumber = Number.parseInt(left, 10);
      const rightNumber = Number.parseInt(right, 10);
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
      if (Number.isFinite(leftNumber)) return -1;
      if (Number.isFinite(rightNumber)) return 1;
      return left.localeCompare(right, 'pl');
    });
}

function selectedDateIso(dayIndex: number) {
  const date = new Date();
  date.setDate(date.getDate() + Math.max(0, dayIndex));
  return date.toLocaleDateString('en-CA', { timeZone: 'Europe/Warsaw' });
}

function parseTimeOnDate(dateIso: string, timeValue: unknown) {
  const raw = String(timeValue || '').trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || '0');
  const date = new Date(`${dateIso}T00:00:00`);
  date.setHours(hours, minutes, seconds, 0);
  return date.getTime();
}

function carrierForLine(line: string): Carrier {
  const normalized = line.toLowerCase();
  if (line.startsWith('M') || normalized.includes('marcel')) return MARCEL_CARRIER;
  const numericLine = Number.parseInt(line, 10);
  if (Number.isFinite(numericLine) && numericLine < 100) return MPK_CARRIER;
  return PKS_CARRIER;
}

function timestampFromJourney(journey: Record<string, unknown>) {
  const raw = String(journey.timetable_time || journey.plannedDeparture || '').replace(' ', 'T');
  const timestamp = new Date(raw).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function formatWarsawTime(ms: number | undefined, fallback?: unknown) {
  if (Number.isFinite(ms)) {
    return new Date(ms as number).toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Warsaw',
    });
  }
  const raw = String(fallback || '').trim();
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '--:--';
}

function mapJourneyToDeparture(journey: Record<string, unknown>, index: number): Departure {
  const line = cleanLine(journey.line_name || journey.line || '?') || '?';
  const plannedAtMs = timestampFromJourney(journey);
  const vehicleId = String(journey.vehicle_id || journey.vehicleId || journey.vehicle_number || '').trim();
  const hasRealtimeMarker = Boolean(vehicleId || journey.realDeparture || journey.real_departure_time);
  const delayMinutes = hasRealtimeMarker ? Number(journey.deviation ?? journey.delayMinutes ?? 0) : 0;
  const hasDelay = hasRealtimeMarker && Number.isFinite(delayMinutes) && Math.abs(delayMinutes) > 1;
  const realAtMs = Number.isFinite(plannedAtMs) && Number.isFinite(delayMinutes)
    ? (plannedAtMs as number) + delayMinutes * 60_000
    : plannedAtMs;
  const direction = String(journey.route_description || journey.direction || journey.destination || 'Nieznany kierunek');
  const carrier = carrierForLine(line);

  return {
    id: [line, plannedAtMs || journey.timetable_time || index, direction, vehicleId || 'schedule'].join(':'),
    line,
    direction,
    time: formatWarsawTime(realAtMs, journey.realDeparture || journey.plannedDeparture || journey.timetable_time),
    status: hasDelay ? 'delayed' : 'on_time',
    delayMins: hasDelay ? Math.round(delayMinutes) : 0,
    vehicleDesc: vehicleId ? `${carrier.name} - pojazd ${vehicleId}` : carrier.name,
    carrier,
    type: 'departure',
    plannedAtMs,
    realAtMs,
  };
}

function departureFromMpkSchedule(entry: Record<string, unknown>, dateIso: string, index: number): Departure | null {
  const line = cleanLine(entry.line);
  if (!line) return null;
  const plannedAtMs = parseTimeOnDate(dateIso, entry.departure_time);
  const direction = String(entry.trip_headsign || entry.end_stop_name || 'Nieznany kierunek').trim();
  return {
    id: `mpk:${entry.trip_id || entry.block_id || index}:${plannedAtMs || entry.departure_time}`,
    line,
    direction,
    time: formatWarsawTime(plannedAtMs, entry.departure_time),
    status: 'on_time',
    delayMins: 0,
    carrier: MPK_CARRIER,
    type: 'departure',
    plannedAtMs,
    realAtMs: plannedAtMs,
  };
}

function departureFromMarcelCourseStop(
  course: MarcelCourse,
  stop: MarcelCourseStopPublic,
  dateIso: string,
  index: number,
): Departure | null {
  const plannedAtMs = parseTimeOnDate(dateIso, stop.godz || course.godz);
  return {
    id: `marcel:${course.idKu}:${stop.kol || index}:${plannedAtMs || stop.godz || course.godz}`,
    line: 'M',
    direction: marcelDirectionDestination(course.nazTr || stop.nazTr || 'Marcel'),
    time: formatWarsawTime(plannedAtMs, stop.godz || course.godz),
    status: 'on_time',
    delayMins: 0,
    carrier: MARCEL_CARRIER,
    type: 'departure',
    plannedAtMs,
    realAtMs: plannedAtMs,
  };
}

async function enrichVehiclesForLiveStop(
  vehicles: Vehicle[],
  stop: Stop,
  departures: Departure[],
) {
  const departureLines = new Set(departures.map((departure) => normalizeLineKey(departure.line)).filter(Boolean));
  const uniqueVehicles = new Map<string, Vehicle>();

  vehicles.forEach((vehicle) => {
    const provider = providerFromVehicle(vehicle);
    if (!provider) return;
    if (vehicle.status === 'break' || vehicle.status === 'inactive' || vehicle.status === 'technical') return;
    const line = normalizeLineKey(vehicle.routeShortName || vehicle.routeId);
    if (!line || !departureLines.has(line)) return;
    uniqueVehicles.set(`${provider}:${vehicle.id}`, vehicle);
  });

  const candidateStopIds = new Map<LiveDepartureProvider, Set<string>>([
    ['pks', stopIdsForLiveProvider(stop, 'pks')],
    ['mpk_rzeszow', stopIdsForLiveProvider(stop, 'mpk_rzeszow')],
  ]);
  const candidates = [...uniqueVehicles.values()]
    .sort((left, right) => {
      const leftProvider = providerFromVehicle(left);
      const rightProvider = providerFromVehicle(right);
      const leftScore = leftProvider ? liveVehicleCandidateScore(left, candidateStopIds.get(leftProvider)!) : 0;
      const rightScore = rightProvider ? liveVehicleCandidateScore(right, candidateStopIds.get(rightProvider)!) : 0;
      return rightScore - leftScore;
    })
    .slice(0, 18);
  const enriched = await mapWithConcurrency(candidates, 4, async (vehicle) => {
      const provider = providerFromVehicle(vehicle);
      if (!provider) return vehicle;
      const stopIds = stopIdsForLiveProvider(stop, provider);
      if (vehicleHasLiveStop(vehicle, stopIds)) return vehicle;
      const details = await fetchCachedVehicleDetails(provider, vehicle);
      return mergeVehicleSnapshot(vehicle, details);
    });

  return enriched;
}

function correctionsFromLiveVehicles(vehicles: Vehicle[], stop: Stop): LiveDepartureCorrection[] {
  const corrections: LiveDepartureCorrection[] = [];

  vehicles.forEach((vehicle) => {
    const provider = providerFromVehicle(vehicle);
    if (!provider) return;
    if (vehicle.status === 'break' || vehicle.status === 'inactive' || vehicle.status === 'technical') return;

    const line = normalizeLineKey(vehicle.routeShortName || vehicle.routeId);
    if (!line) return;

    const rawDelaySeconds = Number(vehicle.delay || 0);
    const hasUsableVehicleDelay =
      Number.isFinite(rawDelaySeconds) &&
      Math.abs(rawDelaySeconds) <= LIVE_DELAY_LIMIT_SECONDS;
    const stopIds = stopIdsForLiveProvider(stop, provider);
    const stopsForVehicle = [...(vehicle.schedule || []), ...(vehicle.routeStops || [])].filter((entry) =>
      stopIds.has(String(entry.id || '').trim()),
    );

    stopsForVehicle.forEach((entry) => {
      const plannedAtMs = parseDateMs(entry.planned);
      if (!Number.isFinite(plannedAtMs)) return;

      const rawRealAtMs = parseDateMs(entry.real);
      const rawRealLooksPlanned =
        Number.isFinite(rawRealAtMs) &&
        Math.abs(rawRealAtMs - plannedAtMs) < 60_000;
      const realAtMs =
        hasUsableVehicleDelay && rawDelaySeconds !== 0 && rawRealLooksPlanned
          ? plannedAtMs + rawDelaySeconds * 1000
          : Number.isFinite(rawRealAtMs)
            ? rawRealAtMs
            : hasUsableVehicleDelay
              ? plannedAtMs + rawDelaySeconds * 1000
              : Number.NaN;

      if (!Number.isFinite(realAtMs)) return;
      const delayMins = Math.round((realAtMs - plannedAtMs) / 60_000);
      if (Math.abs(delayMins) <= 1) return;

      const carrier = provider === 'mpk_rzeszow' ? MPK_CARRIER : PKS_CARRIER;
      const vehicleNumber = vehicleDisplayNumber(vehicle);
      corrections.push({
        key: `${provider}:${vehicle.id}:${String(entry.id || '')}:${plannedAtMs}`,
        provider,
        line,
        plannedAtMs,
        realAtMs,
        delayMins,
        vehicleDesc: vehicleNumber ? `${carrier.name} - pojazd ${vehicleNumber}` : carrier.name,
      });
    });
  });

  return corrections;
}

async function applyLiveDepartureCorrections(
  departures: Departure[],
  stop: Stop,
  vehicles: Vehicle[],
  dayIndex: number,
) {
  if (dayIndex !== 0 || departures.length === 0 || vehicles.length === 0) return departures;

  const enrichedVehicles = await enrichVehiclesForLiveStop(vehicles, stop, departures);
  const corrections = correctionsFromLiveVehicles(enrichedVehicles, stop);
  if (corrections.length === 0) return departures;
  const usedCorrectionKeys = new Set<string>();

  return departures.map((departure) => {
    const provider = providerFromDeparture(departure);
    const plannedAtMs = Number(departure.plannedAtMs);
    if (!provider || !Number.isFinite(plannedAtMs)) return departure;

    const line = normalizeLineKey(departure.line);
    let selectedCorrection: LiveDepartureCorrection | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;

    for (const correction of corrections) {
      if (usedCorrectionKeys.has(correction.key)) continue;
      if (correction.provider !== provider) continue;
      if (correction.line !== line) continue;
      const diff = Math.abs(correction.plannedAtMs - plannedAtMs);
      if (diff > LIVE_DEPARTURE_MATCH_WINDOW_MS || diff >= bestDiff) continue;
      bestDiff = diff;
      selectedCorrection = correction;
    }

    if (!selectedCorrection) return departure;
    usedCorrectionKeys.add(selectedCorrection.key);

    return {
      ...departure,
      time: formatWarsawTime(selectedCorrection.realAtMs, departure.time),
      status: 'delayed' as const,
      delayMins: selectedCorrection.delayMins,
      realAtMs: selectedCorrection.realAtMs,
      vehicleDesc: selectedCorrection.vehicleDesc,
    };
  });
}

export default function StopsPanel({
  stops,
  isLoading,
  hasError,
  favorites,
  vehicles,
  transparentUI,
  onRetry,
  onClose,
  onToggleFavorite,
  onShowOnMap,
}: StopsPanelProps) {
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [panelVehicles, setPanelVehicles] = useState<Vehicle[]>([]);
  const [mpkStops, setMpkStops] = useState<Array<{ id: string; name: string; lat?: number; lon?: number; lines: string[] }>>([]);
  const [marcelStops, setMarcelStops] = useState<MarcelIndexedStop[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetchVehiclesClient(true, ['mpk_rzeszow', 'marcel'], { signal: controller.signal })
      .then((next) => setPanelVehicles(next.filter((vehicle) => vehicle.type !== 'train')))
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === 'AbortError') return;
        console.warn('[StopsPanel] bus providers unavailable', error);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const mapMpkStops = (data: Awaited<ReturnType<typeof fetchMpkRzeszowStopsClient>>) =>
      data
        .map((stop) => ({
          id: String(stop.stop_id),
          name: mpkStopDisplayName(stop),
          lat: Number.isFinite(Number(stop.stop_lat)) ? Number(stop.stop_lat) : undefined,
          lon: Number.isFinite(Number(stop.stop_lon)) ? Number(stop.stop_lon) : undefined,
          lines: sortedLines(String(stop.lines || '').split(',').map((line) => line.trim())),
        }))
        .filter((stop) => stop.id && stop.name);
    const signature = (items: typeof mpkStops) => stopCacheSignature(items);

    fetchMpkRzeszowStopsClient({ signal: controller.signal })
      .then((data) => {
        const cachedStops = mapMpkStops(data);
        setMpkStops(cachedStops);
        return fetchMpkRzeszowStopsClient({ forceRefresh: true })
          .then((fresh) => {
            const freshStops = mapMpkStops(fresh);
            setMpkStops((current) => (signature(current) === signature(freshStops) ? current : freshStops));
          })
          .catch(() => undefined);
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === 'AbortError') return;
        console.warn('[StopsPanel] MPK stops unavailable', error);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    const dateIso = selectedDateIso(0);

    const loadMarcelStops = async () => {
      const indexedStops = await getMarcelStopsIndex(dateIso);
      if (!active) return;
      setMarcelStops(indexedStops);
      const freshStops = await getMarcelStopsIndex(dateIso, { forceRefresh: true }).catch(() => null);
      if (!active || !freshStops) return;
      setMarcelStops((current) => (stopCacheSignature(current) === stopCacheSignature(freshStops) ? current : freshStops));
    };

    loadMarcelStops().catch((error) => console.warn('[StopsPanel] Marcel stops unavailable', error));
    return () => {
      active = false;
    };
  }, []);

  const uiStops = useMemo<Stop[]>(() => {
    const favoriteSet = new Set(favorites);
    const byTechnical = new Map<string, InternalStop>();
    const baseBuckets = new Map<string, InternalStop[]>();
    const tokenBuckets = new Map<string, Set<InternalStop>>();
    const geoBuckets = new Map<string, Set<InternalStop>>();
    const crossMatchCache = new Map<string, InternalStop | null>();

    const technicalKey = (provider: string, id: string) => `${provider}:${String(id).trim()}`;

    const registerBucket = (stop: InternalStop) => {
      const list = baseBuckets.get(stop.baseNameKey) || [];
      if (!list.includes(stop)) list.push(stop);
      baseBuckets.set(stop.baseNameKey, list);

      const textTokens = mergeTokens(stop.name);
      textTokens.forEach((token) => {
        const bucket = tokenBuckets.get(token) || new Set<InternalStop>();
        bucket.add(stop);
        tokenBuckets.set(token, bucket);
      });
      const numbers = numericTokens(stop.name);
      numbers.forEach((token) => {
        const bucket = tokenBuckets.get(`num:${token}`) || new Set<InternalStop>();
        bucket.add(stop);
        tokenBuckets.set(`num:${token}`, bucket);
      });
      geoBucketKeys(stop.lat, stop.lon).forEach((key) => {
        const bucket = geoBuckets.get(key) || new Set<InternalStop>();
        bucket.add(stop);
        geoBuckets.set(key, bucket);
      });
    };

    const attachProvider = (
      target: InternalStop,
      raw: {
        id: string;
        name: string;
        areaId?: string;
        code?: string;
        lat?: number;
        lon?: number;
        provider: string;
        carrier: Carrier;
      },
    ) => {
      target.providerStopIds = {
        ...(target.providerStopIds || {}),
        [raw.provider]: mergeCsvValues(target.providerStopIds?.[raw.provider], String(raw.id)),
        [`${raw.provider}Names`]: mergeDebugNames(target.providerStopIds?.[`${raw.provider}Names`], raw.name),
      };
      if (raw.provider === 'pks') {
        target.providerStopIds.pksAreaIds = mergeCsvValues(target.providerStopIds.pksAreaIds, raw.areaId);
        target.providerStopIds.pksCodes = mergeCsvValues(target.providerStopIds.pksCodes, raw.code);
      }
      target.sourceProviderIds = [...new Set([...(target.sourceProviderIds || []), raw.provider])];
      target.displayNamesByProvider = {
        ...(target.displayNamesByProvider || {}),
        [raw.provider]: target.displayNamesByProvider?.[raw.provider] || stopDisplayName(raw.name),
      };
      target.name = preferredStopDisplayName(target.displayNamesByProvider) || target.name;
      target.baseNameKey = stopBaseNameKey(target.name);
      registerBucket(target);
      target.carrierMap.set(raw.carrier.id, raw.carrier);
      if (target.lat === undefined && raw.lat !== undefined) target.lat = raw.lat;
      if (target.lon === undefined && raw.lon !== undefined) target.lon = raw.lon;
      if (!target.areaId && raw.areaId) target.areaId = raw.areaId;
      if (!target.code && raw.code) target.code = raw.code;
    };

    const createStop = (raw: {
      id: string;
      name: string;
      areaId?: string;
      code?: string;
      lat?: number;
      lon?: number;
      provider: string;
      carrier: Carrier;
    }) => {
      const displayName = stopDisplayName(raw.name);
      const baseNameKey = stopBaseNameKey(displayName);
      const publicId = raw.provider === 'pks' ? String(raw.id) : `${raw.provider}:${String(raw.id)}`;
      const next: InternalStop = {
        id: publicId,
        name: displayName,
        type: 'bus',
        carriers: [raw.carrier],
        carrierMap: new Map([[raw.carrier.id, raw.carrier]]),
        lines: [],
        lineSet: new Set<string>(),
        displayNamesByProvider: { [raw.provider]: displayName },
        isFavorite: favoriteSet.has(publicId),
        areaId: raw.areaId,
        code: raw.code,
        lat: raw.lat,
        lon: raw.lon,
        sourceProviderIds: [raw.provider],
        providerStopIds: {
          [raw.provider]: String(raw.id),
          [`${raw.provider}Names`]: displayName,
          ...(raw.provider === 'pks' ? { pksAreaIds: String(raw.areaId || ''), pksCodes: String(raw.code || '') } : {}),
        },
        baseNameKey,
      };
      byTechnical.set(technicalKey(raw.provider, raw.id), next);
      registerBucket(next);
      return next;
    };

    const ensureTechnicalStop = (raw: {
      id: string;
      name: string;
      areaId?: string;
      code?: string;
      lat?: number;
      lon?: number;
      provider: string;
      carrier: Carrier;
    }) => {
      const key = technicalKey(raw.provider, raw.id);
      const current = byTechnical.get(key);
      if (current) {
        attachProvider(current, raw);
        return current;
      }
      return createStop(raw);
    };

    const findSafeCrossProviderMatch = (
      raw: { name: string; lat?: number; lon?: number },
      candidateProviders = new Set(['pks', 'mpk_rzeszow']),
    ) => {
      const baseNameKey = stopBaseNameKey(raw.name);
      if (!baseNameKey) return null;
      const latKey = Number.isFinite(raw.lat) ? Number(raw.lat).toFixed(4) : 'x';
      const lonKey = Number.isFinite(raw.lon) ? Number(raw.lon).toFixed(4) : 'x';
      const providerKey = [...candidateProviders].sort().join('+');
      const cacheKey = `${providerKey}|${baseNameKey}|${latKey}|${lonKey}`;
      if (crossMatchCache.has(cacheKey)) return crossMatchCache.get(cacheKey) || null;

      const exactCandidates = (baseBuckets.get(baseNameKey) || []).filter((candidate) => {
        const providers = candidate.sourceProviderIds || [];
        return providers.some((provider) => candidateProviders.has(provider));
      });
      const fallbackSet = new Set<InternalStop>();
      const rawTokens = mergeTokens(raw.name).slice(0, 4);
      rawTokens.forEach((token) => {
        const bucket = tokenBuckets.get(token);
        if (bucket) bucket.forEach((candidate) => fallbackSet.add(candidate));
      });
      const rawNumbers = numericTokens(raw.name);
      rawNumbers.forEach((token) => {
        const bucket = tokenBuckets.get(`num:${token}`);
        if (bucket) bucket.forEach((candidate) => fallbackSet.add(candidate));
      });
      geoBucketKeys(raw.lat, raw.lon).forEach((key) => {
        const bucket = geoBuckets.get(key);
        if (bucket) bucket.forEach((candidate) => fallbackSet.add(candidate));
      });
      const fallbackPool = [...fallbackSet].filter((candidate) => {
        const providers = candidate.sourceProviderIds || [];
        return providers.some((provider) => candidateProviders.has(provider));
      });
      const pool = exactCandidates.length > 0 ? exactCandidates : fallbackPool;
      if (pool.length === 0) return null;

      const weakName = isWeakMarcelName(raw.name);
      let bestCandidate: InternalStop | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      let bestScore = -1;

      for (const candidate of pool) {
        const distance = distanceMeters(raw.lat, raw.lon, candidate.lat, candidate.lon);
        const hasGeo = Number.isFinite(distance);
        if (hasConflictingCityToken(raw.name, candidate.name)) continue;
        if (weakName && hasGeo && distance > 320) continue;
        const similarity = nameSimilarityScore(raw.name, candidate.name);
        const sharedTokens = sharedStopTokenCount(raw.name, candidate.name);
        const exactBaseBoost = candidate.baseNameKey === baseNameKey ? 0.34 : 0;
        if (hasGeo && distance > 900 && similarity < 0.94) continue;
        if (!hasGeo && candidate.baseNameKey !== baseNameKey && similarity < 0.92) continue;
        const distanceScore = hasGeo
          ? distance <= 60
            ? 1
            : distance <= 110
              ? 0.86
              : distance <= 180
                ? 0.62
                : distance <= 320
                  ? 0.34
                  : 0
          : 0;
        const gpsDominantBoost = hasGeo && sharedTokens > 0 && distance <= 90 ? 0.45 : 0;
        const score = similarity * 0.58 + distanceScore * 0.42 + exactBaseBoost + gpsDominantBoost;
        if (score > bestScore || (score === bestScore && distance < bestDistance)) {
          bestScore = score;
          bestDistance = distance;
          bestCandidate = candidate;
        }
      }

      if (!bestCandidate) {
        crossMatchCache.set(cacheKey, null);
        return null;
      }

      const sharedTokens = sharedStopTokenCount(raw.name, bestCandidate.name);
      if (weakName) {
        const weakMatch = Number.isFinite(bestDistance) && bestDistance <= 260 ? bestCandidate : null;
        crossMatchCache.set(cacheKey, weakMatch);
        return weakMatch;
      }

      if (Number.isFinite(bestDistance) && bestDistance <= 90 && sharedTokens > 0) {
        crossMatchCache.set(cacheKey, bestCandidate);
        return bestCandidate;
      }
      if (Number.isFinite(bestDistance) && bestScore >= 0.78 && bestDistance <= 360) {
        crossMatchCache.set(cacheKey, bestCandidate);
        return bestCandidate;
      }
      if (Number.isFinite(bestDistance) && bestScore >= 0.66 && bestDistance <= 160 && sharedTokens > 0) {
        crossMatchCache.set(cacheKey, bestCandidate);
        return bestCandidate;
      }
      if (!Number.isFinite(bestDistance) && bestScore >= 1.02 && bestCandidate.baseNameKey === baseNameKey) {
        crossMatchCache.set(cacheKey, bestCandidate);
        return bestCandidate;
      }

      crossMatchCache.set(cacheKey, null);
      return null;
    };

    const mergeMarcelMetadata = (target: InternalStop, routeIds: string[], matchKey: string) => {
      target.providerStopIds = {
        ...(target.providerStopIds || {}),
        marcelRouteIds: mergeCsvValues(target.providerStopIds?.marcelRouteIds, routeIds.join(',')),
        marcelMatchKey: target.providerStopIds?.marcelMatchKey || matchKey,
        marcelMatchKeys: mergeCsvValues(target.providerStopIds?.marcelMatchKeys, matchKey),
      };
    };

    stops.forEach((stop) => {
      const raw = {
        ...stop,
        id: String(stop.id),
        name: stopDisplayName(stop.name),
        provider: 'pks',
        carrier: PKS_CARRIER,
      };
      const matched = findSafeCrossProviderMatch(raw, new Set(['pks']));
      if (matched) {
        attachProvider(matched, raw);
      } else {
        ensureTechnicalStop(raw);
      }
    });

    mpkStops.forEach((mpkStop) => {
      const raw = {
        ...mpkStop,
        id: String(mpkStop.id),
        name: normalizeMpkDisplayName(mpkStop.name),
        provider: 'mpk_rzeszow',
        carrier: MPK_CARRIER,
      };
      const matched =
        findSafeCrossProviderMatch(raw, new Set(['pks'])) ||
        findSafeCrossProviderMatch(raw, new Set(['mpk_rzeszow']));
      const stop = matched ? matched : ensureTechnicalStop(raw);
      if (matched) attachProvider(matched, raw);
      mpkStop.lines.forEach((line) => stop.lineSet.add(line));
    });

    marcelStops.forEach((marcelStop) => {
      const displayName = stopDisplayName(marcelStop.name);
      const baseName = stopBaseNameKey(displayName);
      if (!baseName) return;
      const matched =
        findSafeCrossProviderMatch({ name: displayName, lat: marcelStop.lat, lon: marcelStop.lon }, new Set(['pks'])) ||
        findSafeCrossProviderMatch({ name: marcelStop.matchName, lat: marcelStop.lat, lon: marcelStop.lon }, new Set(['pks'])) ||
        findSafeCrossProviderMatch({ name: displayName, lat: marcelStop.lat, lon: marcelStop.lon }, new Set(['mpk_rzeszow', 'marcel'])) ||
        findSafeCrossProviderMatch({ name: marcelStop.matchName, lat: marcelStop.lat, lon: marcelStop.lon }, new Set(['mpk_rzeszow', 'marcel']));
      if (matched) {
        attachProvider(matched, {
          ...marcelStop,
          id: String(marcelStop.id),
          name: displayName,
          provider: 'marcel',
          carrier: MARCEL_CARRIER,
        });
        matched.lineSet.add('M');
        mergeMarcelMetadata(matched, marcelStop.routeIds, marcelStop.matchKey || baseName);
        return;
      }
      if (isWeakMarcelName(displayName)) return;
      if (!canExposeStandaloneMarcelStop(displayName)) return;
      const marcelStandalone = ensureTechnicalStop({
        ...marcelStop,
        id: String(marcelStop.id),
        name: displayName,
        provider: 'marcel',
        carrier: MARCEL_CARRIER,
      });
      marcelStandalone.lineSet.add('M');
      mergeMarcelMetadata(marcelStandalone, marcelStop.routeIds, marcelStop.matchKey || baseName);
    });

    // Enrich providers/lines from a single live snapshot without rebuilding on each map tick.
    const snapshotStops = new Map<string, {
      provider: string;
      id: string;
      name: string;
      lat?: number;
      lon?: number;
      line: string;
      carrier: Carrier;
    }>();

    [...vehicles, ...panelVehicles].forEach((vehicle) => {
      if (vehicle.type === 'train') return;
      const provider = String(vehicle.provider || 'pks');
      if (provider !== 'pks' && provider !== 'mpk_rzeszow' && provider !== 'marcel') return;
      const line = cleanLine(vehicle.routeShortName);
      const carrier = providerCarrier(provider);
      const scheduleStops = [...(vehicle.routeStops || []), ...(vehicle.schedule || [])];
      scheduleStops.forEach((scheduleStop) => {
        if (!scheduleStop?.id || !scheduleStop.name) return;
        const rawName = provider === 'mpk_rzeszow'
          ? normalizeMpkDisplayName(scheduleStop.name)
          : stopDisplayName(scheduleStop.name);
        const key = `${provider}:${String(scheduleStop.id)}:${stopBaseNameKey(rawName)}`;
        if (!snapshotStops.has(key)) {
          snapshotStops.set(key, {
            provider,
            id: String(scheduleStop.id),
            name: rawName,
            lat: scheduleStop.lat,
            lon: scheduleStop.lon,
            line,
            carrier,
          });
        }
      });
    });

    snapshotStops.forEach((entry) => {
      let matched: InternalStop | null = null;
      if (entry.provider === 'pks') {
        matched = findSafeCrossProviderMatch({ name: entry.name, lat: entry.lat, lon: entry.lon }, new Set(['pks']));
        if (matched) {
          attachProvider(matched, {
            id: entry.id,
            name: entry.name,
            lat: entry.lat,
            lon: entry.lon,
            provider: entry.provider,
            carrier: entry.carrier,
          });
        }
      } else if (entry.provider === 'mpk_rzeszow') {
        matched =
          findSafeCrossProviderMatch({ name: entry.name, lat: entry.lat, lon: entry.lon }, new Set(['pks'])) ||
          findSafeCrossProviderMatch({ name: entry.name, lat: entry.lat, lon: entry.lon }, new Set(['mpk_rzeszow']));
        if (!matched) {
          matched = ensureTechnicalStop({
            id: entry.id,
            name: entry.name,
            lat: entry.lat,
            lon: entry.lon,
            provider: entry.provider,
            carrier: entry.carrier,
          });
        } else {
          attachProvider(matched, {
            id: entry.id,
            name: entry.name,
            lat: entry.lat,
            lon: entry.lon,
            provider: entry.provider,
            carrier: entry.carrier,
          });
        }
      } else if (entry.provider === 'marcel') {
        matched =
          findSafeCrossProviderMatch({ name: entry.name, lat: entry.lat, lon: entry.lon }, new Set(['pks'])) ||
          findSafeCrossProviderMatch({ name: entry.name, lat: entry.lat, lon: entry.lon }, new Set(['mpk_rzeszow', 'marcel']));
        if (matched) {
          attachProvider(matched, {
            id: entry.id,
            name: entry.name,
            lat: entry.lat,
            lon: entry.lon,
            provider: entry.provider,
            carrier: entry.carrier,
          });
          mergeMarcelMetadata(matched, [], matched.providerStopIds?.marcelMatchKey || stopBaseNameKey(entry.name));
        } else if (!isWeakMarcelName(entry.name) && canExposeStandaloneMarcelStop(entry.name)) {
          matched = ensureTechnicalStop({
            id: entry.id,
            name: entry.name,
            lat: entry.lat,
            lon: entry.lon,
            provider: entry.provider,
            carrier: entry.carrier,
          });
          mergeMarcelMetadata(matched, [], matched.providerStopIds?.marcelMatchKey || stopBaseNameKey(entry.name));
        }
      }
      if (!matched) return;
      if (entry.line && entry.line !== '?') matched.lineSet.add(entry.line);
      if (entry.provider === 'marcel') matched.lineSet.add('M');
    });

    return [...byTechnical.values()]
      .filter((stop) => stop.id && stop.name)
      .map((stop) => {
        const { lineSet, carrierMap, baseNameKey, displayNamesByProvider, ...cleanStop } = stop;
        return {
          ...cleanStop,
          carriers: [...carrierMap.values()].sort((left, right) => ['pks', 'mpk', 'marcel'].indexOf(left.id) - ['pks', 'mpk', 'marcel'].indexOf(right.id)),
          lines: sortedLines(lineSet),
          isFavorite: favoriteSet.has(cleanStop.id),
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name, 'pl'));
  }, [favorites, marcelStops, mpkStops, panelVehicles, stops, vehicles]);

  const toggleFavorite = useCallback((stopId: string) => {
    onToggleFavorite(stopId);
    setSelectedStop((current) => (current?.id === stopId ? { ...current, isFavorite: !current.isFavorite } : current));
  }, [onToggleFavorite]);

  const loadDepartures = useCallback(async (stop: Stop, dayIndex = 0) => {
    const departures: Departure[] = [];
    const dateIso = selectedDateIso(dayIndex);

    if (stop.sourceProviderIds?.includes('pks') || !stop.sourceProviderIds?.length) {
      const pksStopIds = splitCsvValues(stop.providerStopIds?.pks || stop.id);
      const pksAreaIds = splitCsvValues(stop.providerStopIds?.pksAreaIds || stop.areaId);
      const pksCodes = splitCsvValues(stop.providerStopIds?.pksCodes || stop.code);
      const pksResponses = await Promise.all(
        pksStopIds.map((pksStopId, sourceIndex) =>
          fetchDeparturesClient(
            pksStopId,
            pksAreaIds[sourceIndex] || pksAreaIds[0] || stop.areaId,
            pksCodes[sourceIndex] || pksCodes[0] || stop.code || '',
          ).catch(() => ({ journeys: [] })),
        ),
      );
      pksResponses.forEach((response) => {
        const journeys = Array.isArray(response?.journeys) ? response.journeys : [];
        departures.push(...journeys.map((journey: unknown, index: number) => mapJourneyToDeparture(journey as Record<string, unknown>, index)));
      });
    }

    if (stop.sourceProviderIds?.includes('mpk_rzeszow') && stop.providerStopIds?.mpk_rzeszow) {
      const mpkResponses = await Promise.all(
        splitCsvValues(stop.providerStopIds.mpk_rzeszow).map((mpkStopId) =>
          fetchMpkRzeszowDeparturesClient(mpkStopId, dateIso).catch(() => []),
        ),
      );
      mpkResponses.flat().forEach((entry, index) => {
        const departure = departureFromMpkSchedule(entry as unknown as Record<string, unknown>, dateIso, index);
        if (departure) departures.push(departure);
      });
    }

    if (stop.sourceProviderIds?.includes('marcel')) {
      const routeIds = String(stop.providerStopIds?.marcelRouteIds || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      const routes = routeIds.length > 0 ? routeIds : (await fetchMarcelRoutesClient()).map((route) => String(route.idTr));
      const stopNameKeys = new Set(
        mergeCsvValues(
          stop.providerStopIds?.marcelMatchKeys,
          stop.providerStopIds?.marcelMatchKey,
          stopBaseNameKey(stop.name),
        )
          .split(',')
          .map((key) => key.trim())
          .filter(Boolean),
      );
      const marcelDepartures: Departure[] = [];
      await Promise.all(
        routes.map(async (routeId) => {
          const courses = await fetchMarcelCoursesClient(routeId, dateIso);
          await Promise.all(
            courses.map(async (course) => {
              const stopsForCourse = await fetchMarcelPublicCourseStopsClient(course.idKu);
              const matchIndex = stopsForCourse.findIndex((courseStop) => stopNameKeys.has(marcelCourseStopMatchKey(courseStop)));
              if (matchIndex < 0) return;
              const departure = departureFromMarcelCourseStop(course, stopsForCourse[matchIndex], dateIso, matchIndex);
              if (departure) marcelDepartures.push(departure);
            }),
          );
        }),
      );
      departures.push(...marcelDepartures);
    }

    const liveCorrectedDepartures = await applyLiveDepartureCorrections(
      departures,
      stop,
      [...vehicles, ...panelVehicles],
      dayIndex,
    );

    const unique = new Map<string, Departure>();
    liveCorrectedDepartures.forEach((departure) => unique.set(departure.id, departure));
    return [...unique.values()].sort((left, right) => (left.realAtMs || left.plannedAtMs || 0) - (right.realAtMs || right.plannedAtMs || 0));
  }, [panelVehicles, vehicles]);

  const handleSelectStop = useCallback((stop: Stop) => {
    setSelectedStop(stop);
  }, []);

  const currentSelectedStop = useMemo(() => {
    if (!selectedStop) return null;
    const latest = uiStops.find((stop) => stop.id === selectedStop.id);
    return latest || selectedStop;
  }, [selectedStop, uiStops]);

  if (hasError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#07111d]/70 px-6 text-center text-slate-300 backdrop-blur-2xl">
        <div className="flex max-w-sm flex-col items-center gap-4">
          <p className="text-sm text-slate-400">Nie udalo sie pobrac przystankow.</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-2xl border border-teal-400/30 bg-teal-400/10 px-5 py-3 text-xs font-black uppercase tracking-wider text-teal-300 transition-colors hover:bg-teal-400/20"
          >
            Sprobuj ponownie
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={transparentUI ? 'absolute inset-0 z-10 overflow-hidden bg-slate-950/16 backdrop-blur-2xl backdrop-saturate-150' : 'absolute inset-0 z-10 overflow-hidden bg-[#03060a]'}>
      <div className="h-full w-full">
        {currentSelectedStop ? (
          <BusStopDetail
            stop={currentSelectedStop}
            onBack={() => setSelectedStop(null)}
            toggleFavorite={toggleFavorite}
            loadDepartures={loadDepartures}
            onShowOnMap={onShowOnMap}
          />
        ) : (
          <StopList
            stops={uiStops}
            isLoading={isLoading}
            onStopSelect={handleSelectStop}
            onClose={onClose}
            toggleFavorite={toggleFavorite}
            isFullScreen
          />
        )}
      </div>
    </div>
  );
}
