'use client';

import type { Carrier, Departure, Stop } from '@/Panel/src/types';
import { fetchMarcelCoursesClient, fetchMarcelPublicCourseStopsClient, fetchMarcelRoutesClient, fetchVehicleDetailsClient, type MarcelCourse, type MarcelCourseStopPublic, type TransportProviderId } from '@/lib/pks-client';
import type { Vehicle } from '@/components/BusMap';
import { getSimilarity, normalizeStopName as normalizeMergeName } from '@/lib/rzeszow-stop-consolidation';
import { warsawDateIso, warsawTimeMs, warsawClock } from '@/lib/transit-time';
import { departureTiming, finiteDelay } from '@/lib/departure-timing';
import { busDelayMinutes } from '@/lib/bus-punctuality';

type RawStop = {
  id: string;
  name: string;
  areaId?: string;
  code?: string;
  lat?: number;
  lon?: number;
  lines?: string[];
};

interface StopsPanelProps {
  active?: boolean;
  stops: RawStop[];
  isLoading: boolean;
  hasError: boolean;
  favorites: string[];
  vehicles: Vehicle[];
  transparentUI: boolean;
  isDarkTheme: boolean;
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

type MarcelIndexedStop = {
  id: string;
  name: string;
  matchName: string;
  matchKey: string;
  cityMatchKey?: string;
  lat?: number;
  lon?: number;
  routeIds: string[];
};

type InternalStop = Stop & {
  lineSet: Set<string>;
  carrierMap: Map<string, Carrier>;
  baseNameKey: string;
  displayNamesByProvider: Record<string, string>;
};

type StopsSearchState = {
  isFullListOpen?: boolean;
  previewScrollTop?: number;
  fullScrollTop?: number;
  inputValue: string;
  fullInputValue: string;
  carrierFilter: 'all' | 'pks' | 'mpk' | 'marcel';
  visibleFullCount: number;
};

const TOKEN_CACHE = new Map<string, string[]>();
const NUM_TOKEN_CACHE = new Map<string, Set<string>>();
const MARCEL_STOPS_INDEX_CACHE = new Map<string, Promise<MarcelIndexedStop[]>>();

const STOP_CACHE_VERSION = 10;
const STOP_CACHE_TTL_MS = 15 * 60 * 1000;
const MARCEL_STOPS_PERSISTENT_PREFIX = 'pks-live:marcel-stops-index:v10:';
const MERGED_STOPS_RUNTIME_CACHE = new Map<string, Stop[]>();
const MERGED_STOPS_RUNTIME_CACHE_LIMIT = 3;
const GEO_BUCKET_PRECISION = 0.001;

function cleanLine(value: unknown) {
  return String(value || '').trim().replace(/^MKS\s+/i, '');
}

const TEXT_ENCODING_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Ăł/g, 'ó'],
  [/Ă“/g, 'Ó'],
  [/Ä…/g, 'ą'],
  [/Ä„/g, 'Ą'],
  [/Ä‡/g, 'ć'],
  [/Ä/g, 'ć'],
  [/ÄĆ/g, 'Ć'],
  [/Ä™/g, 'ę'],
  [/Ä/g, 'Ę'],
  [/Ĺ‚/g, 'ł'],
  [/Ĺ/g, 'Ł'],
  [/Ĺ„/g, 'ń'],
  [/Ĺ/g, 'Ń'],
  [/Ĺ›/g, 'ś'],
  [/Ĺš/g, 'Ś'],
  [/Ĺş/g, 'ź'],
  [/Ĺą/g, 'Ź'],
  [/ĹĽ/g, 'ż'],
  [/Ĺ»/g, 'Ż'],
  [/Â/g, ''],
];

function repairTextEncoding(value: unknown) {
  let text = String(value || '');
  TEXT_ENCODING_REPLACEMENTS.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });
  return text;
}

function normalizeStopName(value: unknown) {
  return repairTextEncoding(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/ł/g, 'l')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bdw\.\b/g, 'dworzec')
    .replace(/\bul\.\b/g, 'ulica')
    .replace(/\bal\.\b/g, 'aleja')
    .replace(/\bpl\.\b/g, 'plac')
    .replace(/\bos\.\b/g, 'osiedle')
    .replace(/\s+/g, ' ');
}

const TECHNICAL_TERMS = [
  'zjazd',
  'zajezd',
  'baza',
  'technicz',
  'technic',
  'serwis',
  'warsztat',
  'przejazd techn',
  'przejazd sluzbowy',
  'przejazd służbowy',
  'bez pasazer',
  'bez pasażer',
  'manewr',
  'rezerwowy',
  'out of service',
  'deadhead',
  'depot',
  'garaz',
  'garaż',
  'do bazy',
  'do zajezdni',
  'poza linia',
  'poza linią',
];

function normalizeTechnicalText(value: unknown) {
  return normalizeStopName(value)
    .replace(/[.,/\\_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasTechnicalTerm(value: unknown) {
  const text = normalizeTechnicalText(value);
  if (!text) return false;
  return TECHNICAL_TERMS.some((term) => text.includes(normalizeTechnicalText(term)));
}

function isTechnicalDepartureData(line: unknown, direction: unknown, extras: unknown[] = []) {
  if (hasTechnicalTerm(line) || hasTechnicalTerm(direction)) return true;
  return extras.some((value) => hasTechnicalTerm(value));
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

function stopCollectionSignature(items: unknown) {
  if (!Array.isArray(items)) return stopCacheSignature(items);
  const parts = items.map((item) => {
    if (!item || typeof item !== 'object') return String(item ?? '');
    const record = item as Record<string, unknown>;
    const lat = Number(record.lat);
    const lon = Number(record.lon);
    const lines = Array.isArray(record.lines) ? record.lines.join(',') : '';
    const routeIds = Array.isArray(record.routeIds) ? record.routeIds.join(',') : '';
    const providers = Array.isArray(record.sourceProviderIds) ? record.sourceProviderIds.join(',') : '';
    return [
      record.id,
      record.name,
      record.matchName,
      record.matchKey,
      record.areaId,
      record.code,
      Number.isFinite(lat) ? lat.toFixed(5) : '',
      Number.isFinite(lon) ? lon.toFixed(5) : '',
      lines,
      routeIds,
      providers,
    ].map((value) => repairTextEncoding(value)).join('\u001f');
  });
  return `${items.length}:${hashCacheString(parts.join('\u001e'))}`;
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
  return repairTextEncoding(value)
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
  const firstToken = normalizeStopName(value).split(' ')[0] || '';
  if ([
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
  ].includes(firstToken)) return true;
  return /^(rzeszow|rzeszów|boguchwala|boguchwała|babica|czudec|gwoznica|gwoźnica|wyzne|wyżne|lutoryz|lutoryż|zarzecze|polomia|połomia|baryczka|jasionka)\b/i
    .test(stopDisplayName(value));
}

function shouldPrefixAsRzeszow(lat?: number, lon?: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad((lat as number) - 50.0413);
  const dLon = toRad((lon as number) - 21.999);
  const lat1 = toRad(50.0413);
  const lat2 = toRad(lat as number);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const distance = 2 * 6371000 * Math.asin(Math.sqrt(h));
  return Number.isFinite(distance) && distance <= 7_500;
}

function ensureMpkCityPrefix(value: unknown, lat?: number, lon?: number) {
  const base = normalizeMpkDisplayName(value);
  if (!base) return base;
  if (!shouldPrefixAsRzeszow(lat, lon)) return base;
  if (base && !hasKnownCityPrefix(base)) return `Rzesz\u00f3w ${base}`;
  return base;
}

function preferredStopDisplayName(displayNamesByProvider: Record<string, string>) {
  return stopDisplayName(
    displayNamesByProvider.pks ||
    displayNamesByProvider.mpk_rzeszow ||
    displayNamesByProvider.marcel ||
    '',
  );
}

function stopBaseNameKey(value: unknown) {
  return normalizeMergeName(value)
    .replace(/\bpodkarp(?:acka)?\b/g, 'podkarpacka')
    .replace(/\bpodkar\b/g, 'podkarpacka')
    .replace(/\bmatuszczka\b/g, 'matuszczaka')
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

function stopPreciseNameKey(value: unknown) {
  return normalizeStopName(stripMarcelStopName(value))
    .replace(/\bpodkarp\.\b/g, 'podkarpacka')
    .replace(/\bpodkarp(?:acka)?\b/g, 'podkarpacka')
    .replace(/\bpodkarp\b/g, 'podkarpacka')
    .replace(/\bpodkar\b/g, 'podkarpacka')
    .replace(/\bmatuszczka\b/g, 'matuszczaka')
    .replace(/[()]/g, ' ')
    .replace(/\s*[-/]\s*/g, ' ')
    .replace(/\b(?:rzeszow|przystanek|przyst|autobusowy|autobusowa)\b/g, ' ')
    .replace(/\bdworzec\s+autobusowy\b/g, 'dworzec')
    .replace(/\b(?:st|skr)\.?\s*(\d{1,3}[a-z]?)\b/gi, '$1')
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
  if (!leftTokens.size || !rightTokens.size) return 0;
  let shared = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) shared += 1;
  });
  return shared / Math.max(leftTokens.size, rightTokens.size);
}

function sharedStopTokenCount(left: unknown, right: unknown) {
  const rightTokens = new Set(mergeTokens(right));
  let shared = 0;
  mergeTokens(left).forEach((token) => {
    if (rightTokens.has(token)) shared += 1;
  });
  return shared;
}

function hasConflictingCityToken(left: unknown, right: unknown) {
  const knownCities = [
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
  ];
  const cityFor = (value: unknown) => knownCities.find((city) => normalizeStopName(value).split(' ').includes(city));
  const leftCity = cityFor(left);
  const rightCity = cityFor(right);
  return Boolean(leftCity && rightCity && leftCity !== rightCity);
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

function mergeStopArraysUnique(...arrays: Array<string[] | undefined>) {
  return [...new Set(arrays.flatMap((items) => items || []).filter(Boolean))];
}

function mergeStopProviderIds(
  left: Record<string, string> | undefined,
  right: Record<string, string> | undefined,
) {
  const merged: Record<string, string> = { ...(left || {}) };
  Object.entries(right || {}).forEach(([key, value]) => {
    merged[key] = key.endsWith('Names')
      ? mergeDebugNames(merged[key], value)
      : mergeCsvValues(merged[key], value);
  });
  return merged;
}

function hasFinitePoint(lat?: number, lon?: number) {
  return Number.isFinite(lat) && Number.isFinite(lon);
}

function distanceMeters(lat1?: number, lon1?: number, lat2?: number, lon2?: number) {
  if (!hasFinitePoint(lat1, lon1) || !hasFinitePoint(lat2, lon2)) return Number.POSITIVE_INFINITY;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad((lat2 as number) - (lat1 as number));
  const dLon = toRad((lon2 as number) - (lon1 as number));
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1 as number)) *
      Math.cos(toRad(lat2 as number)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
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

function normalizeStopMergeName(value: unknown) {
  return normalizeStopName(stopDisplayName(value))
    .replace(/\bpodkarp\.\b/g, 'podkarpacka')
    .replace(/\bpodkarp(?:acka)?\b/g, 'podkarpacka')
    .replace(/\bpodkarp\b/g, 'podkarpacka')
    .replace(/\bpodkar\b/g, 'podkarpacka')
    .replace(/\bmatuszczka\b/g, 'matuszczaka')
    .replace(/\bskrzyzowanie\b/g, 'skr')
    .replace(/\bskrz\.\b/g, 'skr')
    .replace(/\bprzed\s+torami\b/g, 'przedtorami')
    .replace(/\s*[-/]\s*/g, ' ')
    .replace(/\bn[żz]\b/g, ' ')
    .replace(/\bna zadanie\b/g, ' ')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stopMergeTokenSet(value: unknown) {
  const tokens = normalizeStopMergeName(value).split(' ').map((token) => token.trim()).filter(Boolean);
  return new Set(tokens);
}

function stopMergeNumberSet(value: unknown) {
  return new Set((normalizeStopMergeName(value).match(/\b\d{1,3}[a-z]?\b/g) || []).map((token) => token.toLowerCase().replace(/^0+(?=\d)/, '')));
}

function stopMergeNameScore(left: unknown, right: unknown) {
  const leftTokens = stopMergeTokenSet(left);
  const rightTokens = stopMergeTokenSet(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let shared = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) shared += 1;
  });
  return shared / Math.max(leftTokens.size, rightTokens.size);
}

function stopMergeSharedTokenCount(left: unknown, right: unknown) {
  const leftTokens = stopMergeTokenSet(left);
  const rightTokens = stopMergeTokenSet(right);
  let shared = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) shared += 1;
  });
  return shared;
}

function hasConflictingStopNumbers(left: unknown, right: unknown) {
  const leftNumbers = stopMergeNumberSet(left);
  const rightNumbers = stopMergeNumberSet(right);
  if (!leftNumbers.size || !rightNumbers.size) return false;
  for (const token of leftNumbers) {
    if (rightNumbers.has(token)) return false;
  }
  return true;
}

function providerValueSet(stop: Pick<Stop, 'providerStopIds'>, key: string) {
  return new Set(splitCsvValues(stop.providerStopIds?.[key]));
}

function setsOverlap(left: Set<string>, right: Set<string>) {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

function shouldKeepSameProviderStopsSeparate(left: Stop, right: Stop) {
  const leftProviders = new Set(left.sourceProviderIds || []);
  const rightProviders = new Set(right.sourceProviderIds || []);

  for (const provider of ['pks', 'mpk_rzeszow', 'marcel']) {
    if (!leftProviders.has(provider) || !rightProviders.has(provider)) continue;
    const leftIds = providerValueSet(left, provider);
    const rightIds = providerValueSet(right, provider);
    if (leftIds.size && rightIds.size && !setsOverlap(leftIds, rightIds)) {
      if (provider === 'pks' && setsOverlap(providerValueSet(left, 'pksAreaIds'), providerValueSet(right, 'pksAreaIds'))) continue;
      return true;
    }
  }

  const leftMarcelKeys = new Set([
    ...splitCsvValues(left.providerStopIds?.marcelMatchKeys),
    ...splitCsvValues(left.providerStopIds?.marcelMatchKey),
  ]);
  const rightMarcelKeys = new Set([
    ...splitCsvValues(right.providerStopIds?.marcelMatchKeys),
    ...splitCsvValues(right.providerStopIds?.marcelMatchKey),
  ]);
  return Boolean(leftMarcelKeys.size && rightMarcelKeys.size && !setsOverlap(leftMarcelKeys, rightMarcelKeys));
}

function shouldMergeStopsByGps(left: Stop, right: Stop) {
  if (hasConflictingCityToken(left.name, right.name)) return false;
  if (hasConflictingStopNumbers(left.name, right.name)) return false;
  if (shouldKeepSameProviderStopsSeparate(left, right)) return false;
  const nameScore = stopMergeNameScore(left.name, right.name);
  const sharedTokens = stopMergeSharedTokenCount(left.name, right.name);
  const distance = distanceMeters(left.lat, left.lon, right.lat, right.lon);
  const lightNameMatch = sharedTokens >= 1 || nameScore >= 0.22;
  if (Number.isFinite(distance)) {
    if (distance <= 35 && lightNameMatch) return true;
    if (distance <= 70 && nameScore >= 0.56 && sharedTokens >= 2) return true;
    return false;
  }
  return stopBaseNameKey(left.name) === stopBaseNameKey(right.name) || (getSimilarity(left.name, right.name) >= 0.92 && sharedTokens >= 1);
}

function mergeStopsCluster(cluster: Stop[]) {
  const byProviderPriority = (stop: Stop) => {
    const providers = stop.sourceProviderIds || [];
    if (providers.includes('pks')) return 0;
    if (providers.includes('mpk_rzeszow')) return 1;
    if (providers.includes('marcel')) return 2;
    return 9;
  };

  const canonical = [...cluster].sort((left, right) => byProviderPriority(left) - byProviderPriority(right))[0];
  const mergedLines = new Set<string>();
  const mergedCarriers = new Map<string, Carrier>();

  cluster.forEach((stop) => {
    (stop.lines || []).forEach((line) => mergedLines.add(line));
    (stop.carriers || []).forEach((carrier) => mergedCarriers.set(carrier.id, carrier));
  });

  const bestName = cluster.filter((stop) => (stop.sourceProviderIds || []).includes('pks'))[0]?.name || cluster
    .map((stop) => stopDisplayName(stop.name))
    .sort((left, right) => right.length - left.length)[0] || canonical.name;

  return {
    ...canonical,
    name: (canonical.sourceProviderIds || []).includes('pks') ? bestName : ensureMpkCityPrefix(bestName, canonical.lat, canonical.lon),
    pksStopPoints: cluster.flatMap((stop) => stop.pksStopPoints || []),
    lines: sortedLines(mergedLines),
    carriers: [...mergedCarriers.values()],
    isFavorite: cluster.some((stop) => stop.isFavorite),
    sourceProviderIds: mergeStopArraysUnique(...cluster.map((stop) => stop.sourceProviderIds)),
    providerStopIds: cluster.reduce<Record<string, string>>(
      (acc, stop) => mergeStopProviderIds(acc, stop.providerStopIds),
      {},
    ),
  };
}

function mergeStopsByGpsAndName(stops: Stop[]) {
  if (stops.length <= 1) return stops;

  const precision = Math.min(GEO_BUCKET_PRECISION, 0.0015);
  const geoBuckets = new Map<string, number[]>();
  const nameBuckets = new Map<string, number[]>();
  const visited = new Array<boolean>(stops.length).fill(false);
  const merged: Stop[] = [];

  const geoKey = (lat: number, lon: number) =>
    `${Math.floor(lat / precision)}:${Math.floor(lon / precision)}`;

  const neighboringGeoKeys = (lat?: number, lon?: number) => {
    if (!hasFinitePoint(lat, lon)) return [];
    const latBucket = Math.floor((lat as number) / precision);
    const lonBucket = Math.floor((lon as number) / precision);
    const keys: string[] = [];
    for (let latOffset = -1; latOffset <= 1; latOffset += 1) {
      for (let lonOffset = -1; lonOffset <= 1; lonOffset += 1) {
        keys.push(`${latBucket + latOffset}:${lonBucket + lonOffset}`);
      }
    }
    return keys;
  };

  stops.forEach((stop, index) => {
    const nameKey = stopBaseNameKey(stop.name);
    if (nameKey) {
      const bucket = nameBuckets.get(nameKey) || [];
      bucket.push(index);
      nameBuckets.set(nameKey, bucket);
    }

    if (hasFinitePoint(stop.lat, stop.lon)) {
      const key = geoKey(stop.lat as number, stop.lon as number);
      const bucket = geoBuckets.get(key) || [];
      bucket.push(index);
      geoBuckets.set(key, bucket);
    }
  });

  for (let seedIndex = 0; seedIndex < stops.length; seedIndex += 1) {
    if (visited[seedIndex]) continue;
    visited[seedIndex] = true;

    const queue = [seedIndex];
    const clusterIndices = [seedIndex];

    while (queue.length > 0) {
      const currentIndex = queue.pop() as number;
      const current = stops[currentIndex];
      const candidateIndices = new Set<number>();

      const nameKey = stopBaseNameKey(current.name);
      if (nameKey) {
        (nameBuckets.get(nameKey) || []).forEach((index) => candidateIndices.add(index));
      }
      neighboringGeoKeys(current.lat, current.lon).forEach((key) => {
        (geoBuckets.get(key) || []).forEach((index) => candidateIndices.add(index));
      });

      candidateIndices.forEach((candidateIndex) => {
        if (candidateIndex === currentIndex || visited[candidateIndex]) return;
        const candidate = stops[candidateIndex];
        if (!shouldMergeStopsByGps(current, candidate)) return;
        visited[candidateIndex] = true;
        queue.push(candidateIndex);
        clusterIndices.push(candidateIndex);
      });
    }

    const cluster = clusterIndices.map((index) => stops[index]);
    merged.push(cluster.length === 1 ? cluster[0] : mergeStopsCluster(cluster));
  }

  return merged;
}

function isMpkOnlyStop(stop: Stop) {
  const providers = stop.sourceProviderIds || [];
  return providers.includes('mpk_rzeszow') && !providers.includes('pks') && !providers.includes('marcel');
}

function shouldMergeMpkStops(left: Stop, right: Stop) {
  if (!isMpkOnlyStop(left) || !isMpkOnlyStop(right)) return false;
  if (hasConflictingStopNumbers(left.name, right.name)) return false;
  const distance = distanceMeters(left.lat, left.lon, right.lat, right.lon);
  const score = stopMergeNameScore(left.name, right.name);
  const sharedTokens = stopMergeSharedTokenCount(left.name, right.name);
  if (Number.isFinite(distance)) {
    if (distance <= 35 && sharedTokens >= 1) return true;
    if (distance <= 90 && score >= 0.58 && sharedTokens >= 2) return true;
    return false;
  }
  return score >= 0.92 && sharedTokens >= 2;
}

function mergeMpkStopsForList(stops: Stop[]) {
  const visited = new Set<number>();
  const result: Stop[] = [];
  const names = new Map<string, number[]>();
  const locations = new Map<string, number[]>();
  const precision = 0.002;
  stops.forEach((stop, index) => {
    if (!isMpkOnlyStop(stop)) return;
    const name = stopBaseNameKey(stop.name);
    names.set(name, [...(names.get(name) || []), index]);
    if (hasFinitePoint(stop.lat, stop.lon)) {
      const key = Math.floor(stop.lat! / precision) + ':' + Math.floor(stop.lon! / precision);
      locations.set(key, [...(locations.get(key) || []), index]);
    }
  });
  for (let index = 0; index < stops.length; index++) {
    if (visited.has(index)) continue;
    const seed = stops[index];
    visited.add(index);
    if (!isMpkOnlyStop(seed)) { result.push(seed); continue; }
    const candidates = new Set(names.get(stopBaseNameKey(seed.name)) || []);
    if (hasFinitePoint(seed.lat, seed.lon)) {
      const latBucket = Math.floor(seed.lat! / precision);
      const lonBucket = Math.floor(seed.lon! / precision);
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) {
        (locations.get((latBucket + x) + ':' + (lonBucket + y)) || []).forEach(candidate => candidates.add(candidate));
      }
    }
    const cluster = [seed];
    candidates.forEach(candidateIndex => {
      if (visited.has(candidateIndex) || !shouldMergeMpkStops(seed, stops[candidateIndex])) return;
      visited.add(candidateIndex);
      cluster.push(stops[candidateIndex]);
    });
    result.push(cluster.length === 1 ? seed : mergeStopsCluster(cluster));
  }
  return result;
}

function pksLinesForStop(
  stop: Pick<Stop, 'id' | 'providerStopIds'>,
  pksLinesByStopId: Record<string, string[]>,
) {
  const lineSet = new Set<string>();
  const ids = splitCsvValues(stop.providerStopIds?.pks || stop.id);
  ids.forEach((id) => {
    (pksLinesByStopId[id] || []).forEach((line) => lineSet.add(line));
  });
  return sortedLines(lineSet);
}

function marcelCourseStopMatchKey(stop: MarcelCourseStopPublic) {
  return stopPreciseNameKey(stripMarcelStopName(stop.nazPr)) || stopBaseNameKey(stripMarcelStopName(stop.nazPr));
}

function marcelCourseStopIndexKey(stop: MarcelCourseStopPublic) {
  return [normalizeStopName(stop.nazMi), marcelCourseStopMatchKey(stop)].filter(Boolean).join('|');
}

function getMarcelStopsIndex(dateIso: string, options?: { forceRefresh?: boolean }) {
  const cacheKey = `${MARCEL_STOPS_PERSISTENT_PREFIX}${dateIso}`;
  const cached = readStopCache<MarcelIndexedStop[]>(cacheKey);
  const isFresh = cached && Date.now() - cached.savedAt < STOP_CACHE_TTL_MS;
  if (cached && isFresh && !options?.forceRefresh) return Promise.resolve(cached.data);

  if (options?.forceRefresh) MARCEL_STOPS_INDEX_CACHE.delete(dateIso);
  if (!MARCEL_STOPS_INDEX_CACHE.has(dateIso)) {
    MARCEL_STOPS_INDEX_CACHE.set(dateIso, (async () => {
      const routes = await fetchMarcelRoutesClient();
      const routeDays = routes.flatMap(route=>Array.from({length:7},(_,offset)=>({route,date:warsawDateIso(offset,new Date(dateIso+'T12:00:00Z'))})));
      const routeCourses = await mapWithConcurrency(routeDays, 6, async ({route,date}) => ({
        routeId: String(route.idTr),
        courses: await fetchMarcelCoursesClient(route.idTr, date),
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
            cityMatchKey: key,
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
    MARCEL_STOPS_INDEX_CACHE.delete(dateIso);
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
  return warsawDateIso(Math.max(0, dayIndex));
}

function parseTimeOnDate(dateIso: string, timeValue: unknown) {
  const ms = warsawTimeMs(dateIso, timeValue);
  return Number.isFinite(ms) ? ms : undefined;
}

function timestampFromJourney(journey: Record<string, unknown>) {
  const raw = String(journey.timetable_time || journey.plannedDeparture || '').replace(' ', 'T');
  const timestamp = new Date(raw).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function formatWarsawTime(ms: number | undefined, fallback?: unknown) {
  if (Number.isFinite(ms)) {
    return warsawClock(ms as number);
  }
  const raw = String(fallback || '').trim();
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '--:--';
}

function mapJourneyToDeparture(journey: Record<string, unknown>, index: number, stopId?: string): Departure | null {
  const line = cleanLine(journey.line_name || journey.line || '?') || '?';
  const plannedAtMs = timestampFromJourney(journey);
  const vehicleId = String(journey.vehicle_id || journey.vehicleId || journey.vehicle_number || '').trim();
  const timing = departureTiming(plannedAtMs, journey.realDeparture || journey.real_departure_time,
    journey.deviation ?? journey.delayMinutes);
  const hasDelay = timing.hasRealtime && timing.delayMins !== 0;
  const realAtMs = timing.realAtMs;
  const direction = String(journey.route_description || journey.direction || journey.destination || 'Nieznany kierunek');
  if (
    isTechnicalDepartureData(line, direction, [
      journey.status,
      journey.trip_type,
      journey.service_type,
      journey.course_type,
      journey.note,
      journey.route_name,
    ])
  ) {
    return null;
  }
  const carrier = PKS_CARRIER;

  return {
    id: [line, plannedAtMs || journey.timetable_time || index, direction, vehicleId || 'schedule'].join(':'),
    courseId: String(journey.journey_id ?? journey.trip_id ?? '').trim() || undefined,
    vehicleId: vehicleId || undefined,
    stopId: stopId || String(journey.stop_point_id ?? '').trim() || undefined,
    line,
    direction,
    time: formatWarsawTime(realAtMs, journey.realDeparture || journey.plannedDeparture || journey.timetable_time),
    status: hasDelay ? 'delayed' : 'on_time',
    delayMins: timing.delayMins,
    carrier,
    type: 'departure',
    plannedAtMs,
    realAtMs,
    realtimeSource: timing.hasRealtime ? 'stop-board' : undefined,
  };
}

function departureFromMpkSchedule(entry: Record<string, unknown>, dateIso: string, index: number): Departure | null {
  const line = cleanLine(entry.line);
  if (!line) return null;
  const plannedAtMs = parseTimeOnDate(dateIso, entry.departure_time);
  let realAtMs = parseTimeOnDate(dateIso, entry.real_departure_time) ?? plannedAtMs;
  if (realAtMs != null && plannedAtMs != null && realAtMs < plannedAtMs - 12 * 3600_000) {
    realAtMs = parseTimeOnDate(warsawDateIso(1, new Date(`${dateIso}T12:00:00Z`)), entry.real_departure_time);
  }
  const delayMins = plannedAtMs != null && realAtMs != null ? busDelayMinutes((realAtMs - plannedAtMs) / 1000) : 0;
  const direction = String(entry.trip_headsign || entry.end_stop_name || 'Nieznany kierunek').trim();
  if (
    isTechnicalDepartureData(line, direction, [
      entry.trip_type,
      entry.service_type,
      entry.route_desc,
      entry.note,
    ])
  ) {
    return null;
  }
  return {
    id: `mpk:${entry.trip_id || entry.block_id || index}:${plannedAtMs || entry.departure_time}`,
    line,
    direction,
    time: formatWarsawTime(realAtMs, entry.departure_time),
    status: delayMins !== 0 ? 'delayed' : 'on_time',
    delayMins,
    carrier: MPK_CARRIER,
    type: 'departure',
    plannedAtMs,
    realAtMs,
    realtimeSource: entry.realtime_source === 'stop-board' ? 'stop-board' : undefined,
    boardIsPast: entry.board_is_past === true,
    boardAtStop: entry.board_at_stop === true,
    boardObservedAtMs: typeof entry.board_observed_at_ms === 'number' ? entry.board_observed_at_ms : undefined,
    boardTimePrecisionMs: typeof entry.board_time_precision_ms === 'number' ? entry.board_time_precision_ms : undefined,
  };
}

function departureFromMarcelCourseStop(
  course: MarcelCourse,
  stop: MarcelCourseStopPublic,
  dateIso: string,
  index: number,
  estimatedDelaySeconds?: number,
): Departure | null {
  if (
    isTechnicalDepartureData('M', course.nazTr || stop.nazTr || '', [
      (course as Record<string, unknown>).nazLin,
      stop.nazPr,
    ])
  ) {
    return null;
  }
  const plannedAtMs = parseTimeOnDate(dateIso, stop.godz || course.godz);
  const rawStop = stop as unknown as Record<string, unknown>;
  const rawCourse = course as unknown as Record<string, unknown>;
  const confirmedDelay = finiteDelay(rawStop.delayMinutes ?? rawStop.deviation ?? rawCourse.delayMinutes ?? rawCourse.deviation);
  const prediction = rawStop.realDeparture || rawStop.real_departure_time || rawCourse.realDeparture || rawCourse.real_departure_time;
  const confirmed = departureTiming(plannedAtMs, prediction, confirmedDelay);
  const estimated = !confirmed.hasRealtime && Number.isFinite(estimatedDelaySeconds);
  const timing = estimated ? { ...departureTiming(plannedAtMs, undefined, estimatedDelaySeconds! / 60),
    delayMins: busDelayMinutes(estimatedDelaySeconds!) } : confirmed;
  return {
    id: `marcel:${course.idKu}:${stop.kol || index}:${plannedAtMs || stop.godz || course.godz}`,
    courseId: String(course.idKu),
    line: 'M',
    direction: marcelDirectionDestination(course.nazTr || stop.nazTr || 'Marcel'),
    time: formatWarsawTime(timing.realAtMs, stop.godz || course.godz),
    status: timing.hasRealtime && timing.delayMins !== 0 ? 'delayed' : 'on_time',
    delayMins: timing.delayMins,
    delayEstimated: estimated || undefined,
    realtimeSource: estimated ? 'position-estimate' : timing.hasRealtime ? 'vehicle-feed' : undefined,
    carrier: MARCEL_CARRIER,
    type: 'departure',
    plannedAtMs,
    realAtMs: timing.realAtMs,
  };
}

export { departureFromMpkSchedule, shouldMergeStopsByGps, mergeStopsCluster, type StopsPanelProps, type MarcelIndexedStop, type StopsSearchState, MERGED_STOPS_RUNTIME_CACHE, stopCollectionSignature, ensureMpkCityPrefix, splitCsvValues, pksLinesForStop, getMarcelStopsIndex, sortedLines, selectedDateIso, type RawStop, PKS_CARRIER, MARCEL_CARRIER, MPK_CARRIER, type InternalStop, MERGED_STOPS_RUNTIME_CACHE_LIMIT, stopDisplayName, preferredStopDisplayName, stopBaseNameKey, mergeTokens, numericTokens, nameSimilarityScore, sharedStopTokenCount, hasConflictingCityToken, mergeCsvValues, mergeDebugNames, distanceMeters, geoBucketKeys, normalizeStopMergeName, hasConflictingStopNumbers, mergeStopsByGpsAndName, mergeMpkStopsForList, canExposeStandaloneMarcelStop, isWeakMarcelName, mapJourneyToDeparture, stopPreciseNameKey, marcelCourseStopIndexKey, marcelCourseStopMatchKey, departureFromMarcelCourseStop };
