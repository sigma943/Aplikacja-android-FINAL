import {readBusCoordinates} from '../bus-coordinates';
import {correctPksStop} from '../pks-stop-corrections';

import {type StopsMap, type FullStopRecord, type StopPointIndex} from '../transport/types';
import {requestEinfoJson} from '../transport/http';
import {CLIENT_STOP_CACHE_TTL_MS, readPersistentClientCache, writePersistentClientCache} from '../transport/cache';

let stopsDictionaryPromise: Promise<Record<string, string>> | null = null;

let fullStopsDictionaryPromise: Promise<Record<string, FullStopRecord>> | null = null;

let stopPointIndexPromise: Promise<StopPointIndex> | null = null;

const PKS_STOPS_CACHE_KEY = 'pks-live:pks-stops:v8';

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

function toTitleCase(str: string) {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(?:^|[\s,\/.\-])\S/g, (match) => match.toUpperCase());
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
    // The timetable API contains approximate points; matched GTFS platforms are authoritative.
    const verified = fallback?.coordinateSource === 'gtfs' && String(fallback.areaId) === String(stop.stop_area_id) && String(fallback.code) === String(stop.stop_point_code);
    const snapshotPoint = readBusCoordinates(fallback?.lat,fallback?.lon);
    const apiPoint = readBusCoordinates(stop.location?.lat ?? stop.location?.latitude,
      stop.location?.lon ?? stop.location?.lng ?? stop.location?.long ?? stop.location?.longitude);
    const point = verified ? snapshotPoint : apiPoint || snapshotPoint;
    const lat = point?.lat, lon = point?.lon;
    const hasCoords = Boolean(point);
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

    compressedMap[String(stop.stop_point_id)] = correctPksStop({
      n: formattedName,
      lat: hasCoords ? lat : undefined,
      lon: hasCoords ? lon : undefined,
      areaId: String(stop.stop_area_id),
      code: stop.stop_point_code ? String(stop.stop_point_code).trim() : '',
    }, String(stop.stop_point_id));
  }

  return compressedMap;
}

// Apply packaged, identity-checked corrections to older offline records as well.

function verifiedCachedPksStops(stops: StopsMap, snapshot: any): StopsMap {
  let result = stops;
  for (const [id, stop] of Object.entries(stops)) {
    const corrected = correctPksStop(stop, id);
    if (corrected !== stop) {
      if (result === stops) result = {...stops};
      result[id] = corrected;
      continue;
    }
    const verified = snapshot.stops?.[id];
    if (verified?.coordinateSource !== 'gtfs' || String(verified.areaId) !== stop.areaId || String(verified.code) !== stop.code) continue;
    const point = readBusCoordinates(verified.lat, verified.lon);
    if (!point || (stop.lat === point.lat && stop.lon === point.lon)) continue;
    if (result === stops) result = {...stops};
    result[id] = {...stop, ...point};
  }
  return result;
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
    return verifiedCachedPksStops(cached.data, await readBundledPksStops());
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
  catch (error) { if (cached) return verifiedCachedPksStops(cached.data, await readBundledPksStops()); throw error; }
}

export {stopsDictionaryPromise};
export {fullStopsDictionaryPromise};
export {stopPointIndexPromise};
export {PKS_STOPS_CACHE_KEY};
export {normalizeNameForComparison};
export {bestPksStopName};
export {loadStopsDictionary};
export {loadFullStopsDictionary};
export {loadStopPointIndex};
export {toTitleCase};
export {bundledPksStops};
export {readBundledPksStops};
export {snapshotStopItems};
export {fetchStopsFromNetwork};
export {formatPksStops};
export {verifiedCachedPksStops};
export {refreshingPksStops};
export {refreshPksStops};
