'use client';

import { memo, startTransition, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMap, Polyline, CircleMarker, ZoomControl, useMapEvents, Pane } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { officialBusRoute } from '@/lib/official-bus-routes';
import { upcomingVehicleStops } from '@/lib/vehicle-upcoming-stops';
import { runFrameBatch } from '@/lib/map-frame-batch';
import { loadRouteWithRetry } from '@/lib/route-load-retry';
import { busDelayMinutes } from '@/lib/bus-punctuality';
import { fetchRouteGeometryClient, subscribeMarcelCourseDelays, warmMarcelBadgeCourses, withCachedMarcelDelay, type RouteGeometryStop } from '@/lib/pks-client';

const PKS_COLOR = '#14b8a6';
const MPK_RZESZOW_COLOR = '#ff7a00';
const MARCEL_COLOR = '#68c44a';
const PKP_INTERCITY_COLOR = '#1d4ed8';
const ROUTE_POINT_LIMIT = 5000;
const ROAD_ROUTE_GEOMETRY_CACHE_VERSION = 'road-v8-marcel-stop-waypoints';
const RAIL_ROUTE_GEOMETRY_CACHE_VERSION = 'rail-v1';
const ROUTE_GEOMETRY_LOCAL_PREFIX = 'routeGeometry:';
const ROUTE_GEOMETRY_DB_NAME = 'pks-live-route-geometry';
const ROUTE_GEOMETRY_DB_VERSION = 1;
const ROUTE_GEOMETRY_DB_STORE = 'routes';
let routeGeometryDbPromise: Promise<IDBDatabase | null> | null = null;

function deferMapStorageWrite(value: { center: L.LatLng; zoom: number }) {
  if (typeof window === 'undefined') return;
  const write = () => {
    try {
      window.localStorage.setItem('mks_map_state', JSON.stringify(value));
    } catch {}
  };

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(write, { timeout: 1200 });
    return;
  }
  globalThis.setTimeout(write, 0);
}

function getVehicleColor(vehicle?: Pick<Vehicle, 'provider'> | null, fallback = PKS_COLOR) {
  if (vehicle?.provider === 'mpk_rzeszow') return MPK_RZESZOW_COLOR;
  if (vehicle?.provider === 'marcel') return MARCEL_COLOR;
  if (vehicle?.provider === 'pkp_intercity') return PKP_INTERCITY_COLOR;
  if (vehicle?.provider === 'pks') return PKS_COLOR;
  return fallback;
}

function simplifyRouteForPaint(points: [number, number][], maxPoints = ROUTE_POINT_LIMIT) {
  const cleaned = points.filter(([lat,lon])=>Number.isFinite(lat)&&Number.isFinite(lon));
  if (cleaned.length <= maxPoints) return cleaned;
  const step = Math.ceil(cleaned.length / maxPoints);
  const simplified: [number, number][] = [];

  for (let i = 0; i < cleaned.length; i += step) {
    simplified.push(cleaned[i]);
  }

  const last = cleaned[cleaned.length - 1];
  const currentLast = simplified[simplified.length - 1];
  if (!currentLast || currentLast[0] !== last[0] || currentLast[1] !== last[1]) {
    simplified.push(last);
  }

  return simplified;
}

function routePaintDistanceMeters(a: [number, number], b: [number, number]) {
  const meanLat = ((a[0] + b[0]) / 2) * Math.PI / 180;
  const metersPerLat = 111_320;
  const metersPerLon = Math.cos(meanLat) * 111_320;
  const dx = (a[1] - b[1]) * metersPerLon;
  const dy = (a[0] - b[0]) * metersPerLat;
  return Math.hypot(dx, dy);
}

function removeRoutePaintSpikes(points: [number, number][]) {
  if (points.length < 4) return points;
  const cleaned: [number, number][] = [points[0]];

  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = cleaned[cleaned.length - 1];
    const current = points[i];
    const next = points[i + 1];
    const prevCurrent = routePaintDistanceMeters(prev, current);
    const currentNext = routePaintDistanceMeters(current, next);
    const prevNext = routePaintDistanceMeters(prev, next);
    const spikeLength = prevCurrent + currentNext;

    if (prevNext > 30 && spikeLength > prevNext * 4.5 && Math.max(prevCurrent, currentNext) > 90) {
      continue;
    }

    cleaned.push(current);
  }

  cleaned.push(points[points.length - 1]);
  return cleaned;
}

function dedupeStableStopIds(stopIds: Array<string | number>) {
  let last: string | null = null;
  const deduped: string[] = [];

  for (const rawId of stopIds) {
    const normalized = String(rawId || '').trim();
    if (!normalized) continue;
    if (!Number.isFinite(Number(normalized))) continue;
    // Preserve loop routes; remove only accidental consecutive duplicates.
    if (last === normalized) continue;
    deduped.push(normalized);
    last = normalized;
  }

  return deduped;
}

function normalizeRouteCachePart(value: unknown, fallback = 'unknown') {
  return String(value ?? fallback)
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || fallback;
}

function stableRouteHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function hashRouteGeometryStops(stops: RouteGeometryStop[]) {
  return stableRouteHash(
    stops
      .map((stop) => [
        String(stop.id ?? '').trim(),
        Number(stop.lat).toFixed(6),
        Number(stop.lon).toFixed(6),
      ].join(':'))
      .join('|'),
  );
}

function readLocalRouteGeometry(cacheKey: string, version: string) {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`${ROUTE_GEOMETRY_LOCAL_PREFIX}${cacheKey}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { version?: string; points?: [number, number][]; expiresAt?: number };
    if (parsed.version !== version) return [];
    if (parsed.expiresAt && parsed.expiresAt <= Date.now()) return [];
    const points = Array.isArray(parsed.points) ? parsed.points : [];
    return points.filter((point): point is [number, number] =>
      Array.isArray(point) &&
      point.length === 2 &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]),
    );
  } catch {
    return [];
  }
}

function openRouteGeometryDb() {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return Promise.resolve(null);
  if (!routeGeometryDbPromise) {
    routeGeometryDbPromise = new Promise((resolve) => {
      const request = window.indexedDB.open(ROUTE_GEOMETRY_DB_NAME, ROUTE_GEOMETRY_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(ROUTE_GEOMETRY_DB_STORE)) {
          db.createObjectStore(ROUTE_GEOMETRY_DB_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }
  return routeGeometryDbPromise;
}

async function readIndexedRouteGeometry(cacheKey: string, version: string) {
  const db = await openRouteGeometryDb();
  if (!db) return [];
  return new Promise<[number, number][]>((resolve) => {
    const transaction = db.transaction(ROUTE_GEOMETRY_DB_STORE, 'readonly');
    const store = transaction.objectStore(ROUTE_GEOMETRY_DB_STORE);
    const request = store.get(cacheKey);
    request.onsuccess = () => {
      const parsed = request.result as { version?: string; points?: [number, number][]; expiresAt?: number } | undefined;
      if (!parsed || parsed.version !== version || (parsed.expiresAt && parsed.expiresAt <= Date.now())) {
        resolve([]);
        return;
      }
      const points = Array.isArray(parsed.points) ? parsed.points : [];
      resolve(points.filter((point): point is [number, number] =>
        Array.isArray(point) &&
        point.length === 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]),
      ));
    };
    request.onerror = () => resolve([]);
  });
}

async function readPersistentRouteGeometry(cacheKey: string, version: string) {
  const indexed = await readIndexedRouteGeometry(cacheKey, version).catch(() => []);
  if (indexed.length > 1) return indexed;
  return readLocalRouteGeometry(cacheKey, version);
}

function writeLocalRouteGeometry(cacheKey: string, points: [number, number][], version: string) {
  if (typeof window === 'undefined' || points.length <= 1) return;
  try {
    window.localStorage.setItem(
      `${ROUTE_GEOMETRY_LOCAL_PREFIX}${cacheKey}`,
      JSON.stringify({
        version,
        createdAt: Date.now(),
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        points,
      }),
    );
  } catch {
    // localStorage may be full; memory cache still keeps the current session fast.
  }
}

async function writeIndexedRouteGeometry(cacheKey: string, points: [number, number][], version: string) {
  if (points.length <= 1) return;
  const db = await openRouteGeometryDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(ROUTE_GEOMETRY_DB_STORE, 'readwrite');
    const store = transaction.objectStore(ROUTE_GEOMETRY_DB_STORE);
    store.put({
      key: cacheKey,
      version,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      points,
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

function writePersistentRouteGeometry(cacheKey: string, points: [number, number][], version: string) {
  writeLocalRouteGeometry(cacheKey, points, version);
  void writeIndexedRouteGeometry(cacheKey, points, version).catch(() => {});
}

function MapStateTracker({
  onInteraction,
  onViewportChange,
}: {
  onInteraction: (active: boolean) => void;
  onViewportChange?: (payload: { bbox: [number, number, number, number]; center: [number, number]; zoom: number }) => void;
}) {
  const map = useMap();
  const emitViewport = useCallback(() => {
    if (!onViewportChange) return;
    const bounds = map.getBounds();
    const center = map.getCenter();
    onViewportChange({
      bbox: [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()],
      center: [center.lat, center.lng],
      zoom: map.getZoom(),
    });
  }, [map, onViewportChange]);

  useEffect(() => {
    emitViewport();
  }, [emitViewport]);

  useMapEvents({
    zoomstart: () => onInteraction(true),
    zoomend: () => {
      onInteraction(false);
      deferMapStorageWrite({ center: map.getCenter(), zoom: map.getZoom() });
      emitViewport();
    },
    movestart: () => onInteraction(true),
    moveend: () => {
      onInteraction(false);
      deferMapStorageWrite({ center: map.getCenter(), zoom: map.getZoom() });
      emitViewport();
    },
  });
  return null;
}

const formatDelay = (delaySec: number | undefined, provider?: string) => {
  if (delaySec === undefined) return null;
  if (!Number.isFinite(delaySec) || Math.abs(delaySec) > 18000) return null;
  const signedMinutes = busDelayMinutes(delaySec);
  const min = Math.abs(signedMinutes);
  
  if (signedMinutes < 0) {
    return { text: `Przed ${min}m`, textLong: `Przed czasem: ${min} min`, class: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' }; // Ahead of time
  } else if (signedMinutes > 0) {
    return { text: `Opóźn. ${min}m`, textLong: `Opóźniony: ${min} min`, class: 'text-rose-600', bg: 'bg-rose-50 border-rose-200' }; // Delayed
  }
  return { text: 'Punktualnie', textLong: 'Zgodnie z planem', class: 'text-slate-500', bg: 'bg-white border-slate-200' };
};

// Caching icons to prevent React-Leaflet from recreating DOM nodes unnecessarily
const iconCache = new Map<string, L.DivIcon>();
const clusterIconCache = new Map<string, L.DivIcon>();

const getMarkerAgeBucket = (dataAgeSec?: number) => {
  if (dataAgeSec === undefined) return 0;
  if (dataAgeSec > 180) return Math.floor(dataAgeSec / 60);
  if (dataAgeSec > 60) return dataAgeSec < 120 ? 1 : Math.floor(dataAgeSec / 60);
  return 0;
};

export const getCachedBusIcon = (
  routeShortName: string,
  vehicleId: string,
  delaySec?: number,
  isSelected?: boolean,
  themeColor: string = PKS_COLOR,
  dataAgeSec?: number,
  isHighVolume?: boolean,
  iconVariant?: string,
  vehicleLabel?: string,
  zoom: number = 14,
) => {
  const ageBucket = getMarkerAgeBucket(dataAgeSec);
  const delayBucket = delaySec === undefined ? 'na' : busDelayMinutes(delaySec);
  const zoomBucket = zoom <= 12 ? 12 : zoom <= 13 ? 13 : 14;
  const hash = `${routeShortName}_${vehicleId}_${vehicleLabel}_${delayBucket}_${isSelected}_${themeColor}_${ageBucket}_${isHighVolume}_${iconVariant}_${zoomBucket}`;
  
  if (iconCache.has(hash)) {
    return iconCache.get(hash)!;
  }
  
  const icon = createBusIcon(routeShortName, vehicleId, delaySec, isSelected, themeColor, dataAgeSec, isHighVolume, iconVariant, vehicleLabel, zoom);
  
  // keep cache size reasonable
  if (iconCache.size > 2000) {
    const keys = Array.from(iconCache.keys());
    for (let i = 0; i < 500; i++) iconCache.delete(keys[i]);
  }
  
  iconCache.set(hash, icon);
  return icon;
};

const createBusIcon = (
  routeShortName: string,
  vehicleId: string,
  delaySec?: number,
  isSelected?: boolean,
  themeColor: string = PKS_COLOR,
  dataAgeSec?: number,
  isHighVolume?: boolean,
  iconVariant?: string,
  vehicleLabel?: string,
  zoom: number = 14,
) => {
  const trainCategory = String(iconVariant || routeShortName || '').toUpperCase();
  if (trainCategory === 'IC' || trainCategory === 'EIC' || trainCategory === 'EIP') {
    return createTrainIcon(routeShortName, vehicleId, delaySec, isSelected, dataAgeSec, isHighVolume, trainCategory, vehicleLabel);
  }

  const display = routeShortName || '?';
  const numberLabel = String(vehicleLabel || '').trim();
  const delayInfo = formatDelay(delaySec, iconVariant);
  
  let opacityClass = 'opacity-90';
  let filterStyle = '';

  const isSelClass = isSelected 
    ? 'z-[2000] scale-125 saturate-110 drop-shadow-2xl' 
    : `z-[100] scale-100 ${opacityClass} ${isHighVolume ? '' : 'drop-shadow-md hover:scale-105'}`;

  let badgeHtml = '';
  if (delayInfo && delaySec !== undefined && busDelayMinutes(delaySec) !== 0) {
    const delayPositionClass = delaySec > 0 ? '-top-[18px] left-[34px]' : '-top-4 -right-3';
    badgeHtml = `
      <div class="absolute ${delayPositionClass} px-1.5 py-0.5 rounded ${delayInfo.bg} ${delayInfo.class} text-[9px] font-black border border-white ${isHighVolume?'':'shadow-sm'} z-50 whitespace-nowrap">
        ${delaySec > 0 ? '+' : '-'}${Math.abs(busDelayMinutes(delaySec))}
      </div>
    `;
  }

  const markerColor = iconVariant === 'mpk_rzeszow' ? MPK_RZESZOW_COLOR : iconVariant === 'marcel' ? MARCEL_COLOR : themeColor;

  const html = `
    <div class="mks-marker-inner relative flex flex-col items-center justify-start ${isSelClass}" style="width: 48px; height: 68px; ${filterStyle}">
      
      <!-- Sleek App-Icon Style Bus Front -->
      <div class="relative w-[34px] bg-white border-2 border-white rounded-[8px] z-10 flex flex-col overflow-hidden ${isHighVolume?'':'shadow-sm'}" style="background-color: ${markerColor};">
        
        <!-- Large Route Number -->
        <span class="text-white font-black text-[13px] pt-1 pb-0.5 text-center leading-none drop-shadow-sm">
          ${display}
        </span>
        
        <!-- Minimal Windshield Container -->
        <div class="px-[4px] pb-[3px] w-full">
          <div class="w-full h-[8px] rounded-[2px]" style="background-color: rgba(15, 23, 42, 0.65); box-shadow: inset 0 2px 4px rgba(0,0,0,0.2)"></div>
        </div>

        <!-- Minimal Headlights -->
        <div class="flex justify-between px-1.5 pb-1 w-full">
          <div class="w-1 h-1 rounded-full" style="background-color: rgba(255,255,255,0.9)"></div>
          <div class="w-1 h-1 rounded-full" style="background-color: rgba(255,255,255,0.9)"></div>
        </div>

        ${isSelected ? `<div class="absolute inset-0 bg-white/20 pointer-events-none"></div>` : ''}
      </div>

      <!-- Tiny Tires -->
      <div class="flex justify-between w-[24px] -mt-0.5 z-0">
        <div class="w-1.5 h-1.5 rounded-b-sm" style="background-color: #1e293b"></div>
        <div class="w-1.5 h-1.5 rounded-b-sm" style="background-color: #1e293b"></div>
      </div>

      ${numberLabel ? `
        <!-- Minimal Vehicle ID -->
        <div class="mt-1 border border-slate-200 rounded px-1.5 py-[1px] text-[8px] tracking-wide font-bold max-w-[44px] truncate text-center ${isHighVolume?'':'shadow-sm'} flex items-center justify-center gap-1" style="background-color: rgba(255,255,255,0.95); color: #64748b;">
          <span>${numberLabel}</span>
        </div>
      ` : ''}

      ${badgeHtml}
    </div>
  `;

  return L.divIcon({
    className: 'mks-bus-marker !bg-transparent !border-0',
    html: html,
    iconSize: [48, 72],
    iconAnchor: [24, 46],
    popupAnchor: [0, -46],
  });
};

const createTrainIcon = (
  routeShortName: string,
  vehicleId: string,
  delaySec?: number,
  isSelected?: boolean,
  dataAgeSec?: number,
  isHighVolume?: boolean,
  iconVariant?: string,
  vehicleLabel?: string,
) => {
  const category = iconVariant === 'EIP' || iconVariant === 'EIC' || iconVariant === 'IC' ? iconVariant : 'IC';
  const display = routeShortName || category;
  const numberLabel = String(vehicleLabel || '').trim();
  const delayInfo = formatDelay(delaySec);
  const isSelClass = isSelected
    ? 'z-[2000] scale-125 saturate-110 drop-shadow-2xl'
    : `z-[100] scale-100 opacity-95 ${isHighVolume ? '' : 'drop-shadow-md hover:scale-105'}`;

  let badgeHtml = '';
  if (delayInfo && delaySec !== undefined && busDelayMinutes(delaySec) !== 0) {
    badgeHtml = `
      <div class="absolute -top-2 -right-2 px-1.5 py-0.5 rounded ${delayInfo.bg} ${delayInfo.class} text-[9px] font-black border border-white ${isHighVolume ? '' : 'shadow-sm'} z-50 whitespace-nowrap">
        ${delaySec > 0 ? '+' : '-'}${Math.abs(busDelayMinutes(delaySec))}
      </div>
    `;
  }

  const html = `
    <div class="mks-marker-inner relative flex flex-col items-center justify-start ${isSelClass}" style="width: 58px; height: 72px;">
      <div class="relative flex h-[45px] w-[45px] items-center justify-center rounded-[12px] border-2 border-white bg-white ${isHighVolume ? '' : 'shadow-lg'} overflow-hidden">
        <img src="/train-icons/${category}.svg" alt="" class="h-[38px] w-[38px] object-contain" />
        <div class="absolute left-1 top-1 rounded bg-[#1d4ed8] px-1 text-[8px] font-black leading-3 text-white">${display}</div>
        ${isSelected ? `<div class="absolute inset-0 bg-blue-400/10 pointer-events-none"></div>` : ''}
      </div>
      ${numberLabel ? `
        <div class="mt-1 border border-slate-200 rounded px-1.5 py-[1px] text-[8px] tracking-wide font-bold max-w-[54px] truncate text-center ${isHighVolume ? '' : 'shadow-sm'} flex items-center justify-center" style="background-color: rgba(255,255,255,0.96); color: #1e3a8a;">
          <span>${numberLabel}</span>
        </div>
      ` : ''}
      ${badgeHtml}
    </div>
  `;

  return L.divIcon({
    className: 'mks-bus-marker mks-train-marker !bg-transparent !border-0',
    html,
    iconSize: [58, 74],
    iconAnchor: [29, 50],
    popupAnchor: [0, -50],
  });
};

const getCachedClusterIcon = (count: number, size: number, clusterColor: string, visualOffset: number) => {
  const key = `${count}_${size}_${clusterColor}_${visualOffset}`;
  const cached = clusterIconCache.get(key);
  if (cached) return cached;

  const icon = L.divIcon({
    className: 'mks-bus-cluster !bg-transparent !border-0',
    html: `
      <div class="relative flex items-center justify-center" style="width:${size}px;height:${size}px;transform:translateX(${visualOffset}px)">
        <div class="absolute inset-0 rounded-full" style="background:${clusterColor};opacity:.20;box-shadow:0 0 28px ${clusterColor}66"></div>
        <div class="absolute inset-[5px] rounded-full border-2 border-white/90 shadow-xl" style="background:${clusterColor}"></div>
        <div class="relative z-10 text-white font-black text-[15px] tracking-tight">${count}</div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

  if (clusterIconCache.size > 300) {
    const firstKey = clusterIconCache.keys().next().value;
    if (firstKey) clusterIconCache.delete(firstKey);
  }
  clusterIconCache.set(key, icon);
  return icon;
};

export interface StopSchedule {
  id: number;
  name: string;
  planned: string | null;
  real: string | null;
  lat?: number;
  lon?: number;
  isPast?: boolean;
  platform?: string;
  track?: string;
  stopDelayMinutes?: number;
  timeType?: 'arrival' | 'departure';
}

export interface Vehicle {
  id: string;
  provider?: string;
  operatorName?: string;
  type?: 'bus' | 'train';
  iconVariant?: string;
  vehicleNumber?: string;
  name: string;
  routeId?: string;
  routeShortName?: string;
  lat: number;
  lon: number;
  speed?: number;
  direction?: string;
  delay?: number;
  positionObservedAtMs?: number;
  dataAgeSec?: number;
  schedule?: StopSchedule[];
  routeStops?: StopSchedule[];
  routePath?: number[];
  model?: string;
  // Test fields
  lastStopDistance?: number;
  lastStopId?: number;
  lastSignalTime?: string;
  previousTripEndedAtMs?: number;
  nextTripStartAtMs?: number;
  nextTripFirstStopId?: number;
  computedSpeed?: number;
  journeyId?: string | number;
  serviceId?: string | number;
  tripId?: string | number;
  brigadeName?: string;
  bearing?: number;
  status?: 'active' | 'break' | 'inactive' | 'technical' | 'cached';
  statusText?: string;
  isHistorical?: boolean;
  trainName?: string;
  positionQuality?: 'known' | 'estimated';
}

export interface StopData {
  n: string;
  lat: number;
  lon: number;
}

function parseScheduleStopMs(stop: { planned?: string | null; real?: string | null }) {
  const raw = String(stop.real || stop.planned || '').trim();
  if (!raw) return NaN;
  return new Date(raw.replace(' ', 'T')).getTime();
}

function isUpcomingScheduleStop(
  stop: { planned?: string | null; real?: string | null; isPast?: boolean },
  nowMs: number,
) {
  if (stop.isPast) return false;
  const timeMs = parseScheduleStopMs(stop);
  if (!Number.isFinite(timeMs)) return true;
  return timeMs >= nowMs - 30 * 1000;
}

interface BusMapProps {
  vehicles: Vehicle[];
  onVehicleClick?: (vehicle: Vehicle) => void;
  selectedVehicleId?: string | null;
  selectedVehicle?: Vehicle | null;
  stopsData?: Record<string, StopData> | null;
  themeColor?: string;
  refreshInterval?: number;
  forcedCenter?: [number, number] | null;
  onCenterComplete?: () => void;
  highlightedStopId?: string | null;
  onStopClick?: (stopId: string) => void;
  onMapClick?: () => void;
  onViewportChange?: (payload: { bbox: [number, number, number, number]; center: [number, number]; zoom: number }) => void;
}

function MapCenterer({ center, onComplete }: { center: [number, number] | null, onComplete?: () => void }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, 16, { animate: true, duration: 1.5 });
      if (onComplete) {
        setTimeout(onComplete, 1600);
      }
    }
  }, [center, map, onComplete]);
  return null;
}

function MapClickListener({ onClick }: { onClick?: () => void }) {
  useMapEvents({
    click: () => {
      if (onClick) onClick();
    }
  });
  return null;
}

type BusMarkerProps = {
  markerKey: string;
  vehicle: Vehicle;
  isSelected: boolean;
  isHighVolume: boolean;
  vehicleColor: string;
  zoom: number;
  onMarkerClick?: (markerKey: string) => void;
  registerMarker?: (markerKey: string, marker: L.Marker | null) => void;
};

const BusMarker = memo(function BusMarker({
  markerKey,
  vehicle,
  isSelected,
  isHighVolume,
  vehicleColor,
  zoom,
  onMarkerClick,
  registerMarker,
}: BusMarkerProps) {
  const initialPosition = useMemo<[number, number]>(() => [vehicle.lat, vehicle.lon], []); // eslint-disable-line react-hooks/exhaustive-deps
  const delayBucket = vehicle.delay === undefined ? 'na' : busDelayMinutes(vehicle.delay);
  const ageBucket = getMarkerAgeBucket(vehicle.dataAgeSec);
  const icon = useMemo(
    () =>
      getCachedBusIcon(
        vehicle.routeShortName || '',
        vehicle.id,
        vehicle.delay,
        isSelected,
        vehicleColor,
        vehicle.dataAgeSec,
        isHighVolume,
        vehicle.iconVariant,
        vehicle.provider === 'pkp_intercity'
          ? String(
              vehicle.vehicleNumber
                ? `${String(vehicle.routeShortName || vehicle.iconVariant || '').trim().toUpperCase()} ${String(vehicle.vehicleNumber).trim()}`
                : '',
            ).trim()
          : (vehicle.vehicleNumber || (vehicle.provider === 'marcel' ? '' : vehicle.id)),
        zoom,
      ),
    [
      vehicle.routeShortName,
      vehicle.id,
      delayBucket,
      isSelected,
      vehicleColor,
      ageBucket,
      isHighVolume,
      vehicle.iconVariant,
      vehicle.vehicleNumber,
      zoom,
    ],
  );
  const eventHandlers = useMemo(
    () => ({
      click: (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e as any);
        if (onMarkerClick) onMarkerClick(markerKey);
      },
    }),
    [markerKey, onMarkerClick],
  );
  const refHandler = useCallback(
    (marker: L.Marker | null) => {
      if (registerMarker) registerMarker(markerKey, marker);
    },
    [markerKey, registerMarker],
  );

  return (
    <Marker
      ref={refHandler}
      position={initialPosition}
      icon={icon}
      zIndexOffset={isSelected ? 1000 : 0}
      eventHandlers={eventHandlers}
    />
  );
}, (prev, next) => {
  const prevVehicle = prev.vehicle;
  const nextVehicle = next.vehicle;
  return (
    prev.markerKey === next.markerKey &&
    prevVehicle.routeShortName === nextVehicle.routeShortName &&
    prevVehicle.id === nextVehicle.id &&
    prevVehicle.provider === nextVehicle.provider &&
    prevVehicle.iconVariant === nextVehicle.iconVariant &&
    prevVehicle.vehicleNumber === nextVehicle.vehicleNumber &&
    busDelayMinutes(prevVehicle.delay || 0) === busDelayMinutes(nextVehicle.delay || 0) &&
    getMarkerAgeBucket(prevVehicle.dataAgeSec) === getMarkerAgeBucket(nextVehicle.dataAgeSec) &&
    prev.isSelected === next.isSelected &&
    prev.isHighVolume === next.isHighVolume &&
    prev.vehicleColor === next.vehicleColor &&
    prev.zoom === next.zoom &&
    prev.onMarkerClick === next.onMarkerClick &&
    prev.registerMarker === next.registerMarker
  );
});

const VehicleClusterMarker = memo(function VehicleClusterMarker({ groupKey, lat, lon, count, color, offset, onClick }: {
  groupKey: string; lat: number; lon: number; count: number; color: string; offset: number;
  onClick: (key: string) => void;
}) {
  const position = useMemo<[number, number]>(() => [lat, lon], [lat, lon]);
  const handlers = useMemo(() => ({ click: (event: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(event as any);
    onClick(groupKey);
  } }), [groupKey, onClick]);
  return <Marker position={position} zIndexOffset={900}
    icon={getCachedClusterIcon(count, count >= 10 ? 54 : 46, color, offset)} eventHandlers={handlers} />;
});

const VehicleMarkerLayer = memo(function VehicleMarkerLayer({
  vehicles,
  selectedVehicleId,
  themeColor,
  refreshInterval,
  onVehicleClick,
}: {
  vehicles: Vehicle[];
  selectedVehicleId?: string | null;
  themeColor: string;
  refreshInterval: number;
  onVehicleClick?: (vehicle: Vehicle) => void;
}) {
  const map = useMap();
  const [viewTick, setViewTick] = useState(0);
  const [badgeRevision, setBadgeRevision] = useState(0);
  const [renderVehicles, setRenderVehicles] = useState(vehicles);
  const latestVehiclesRef = useRef(vehicles);
  const latestVehicleByKeyRef = useRef(new Map<string, Vehicle>());
  const markerRefs = useRef(new Map<string, L.Marker>());
  const mapMovingRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const getVehicleMarkerKey = useCallback((vehicle: Vehicle) => `${vehicle.provider || 'pks'}:${vehicle.id}`, []);

  const registerMarker = useCallback((markerKey: string, marker: L.Marker | null) => {
    if (marker) markerRefs.current.set(markerKey, marker);
    else markerRefs.current.delete(markerKey);
  }, []);

  const handleMarkerClick = useCallback((markerKey: string) => {
    const vehicle = latestVehicleByKeyRef.current.get(markerKey);
    if (vehicle && onVehicleClick) onVehicleClick(vehicle);
  }, [onVehicleClick]);

  const flushVehicleUpdates = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // zoomend and moveend can arrive together; perform one render per frame.
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      setViewTick(value => value + 1);
      setRenderVehicles(latestVehiclesRef.current);
    });
  }, []);

  useMapEvents({
    movestart: () => {
      mapMovingRef.current = true;
    },
    zoomstart: () => {
      mapMovingRef.current = true;
    },
    zoomend: () => {
      mapMovingRef.current = false;
      flushVehicleUpdates();
    },
    moveend: () => {
      mapMovingRef.current = false;
      flushVehicleUpdates();
    },
  });

  useEffect(() => {
    latestVehiclesRef.current = vehicles;
    latestVehicleByKeyRef.current = new Map(vehicles.map((vehicle) => [getVehicleMarkerKey(vehicle), vehicle]));
    if (mapMovingRef.current) return;

    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      setRenderVehicles(latestVehiclesRef.current);
    });

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [getVehicleMarkerKey, vehicles]);

  const zoom = map.getZoom();
  const isHighVolumeLayer = renderVehicles.length > 35;
  const visibleVehicles = useMemo(() => {
    if (renderVehicles.length <= 35) return renderVehicles;
    const paddedBounds = map.getBounds().pad(0.2);
    return renderVehicles.filter((vehicle) => paddedBounds.contains([vehicle.lat, vehicle.lon]));
  }, [map, renderVehicles, viewTick, zoom]);
  useEffect(() => {
    const courseIds = new Set(visibleVehicles.filter(v => v.provider === 'marcel')
      .map(v => String(v.tripId || v.journeyId || '')));
    const unsubscribe = subscribeMarcelCourseDelays(courseId => {
      if (courseIds.has(courseId)) setBadgeRevision(value => value + 1);
    });
    const bounds = map.getBounds().pad(0.2);
    warmMarcelBadgeCourses(visibleVehicles, [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
    return unsubscribe;
  }, [map, visibleVehicles]);

  const viewportVehicles = useMemo(() => visibleVehicles.map(vehicle => withCachedMarcelDelay(vehicle)),
    [visibleVehicles, badgeRevision]);
  const shouldCluster = viewportVehicles.length > 8 && (zoom <= 14 || (isHighVolumeLayer && zoom <= 15));
  const groups = useMemo(() => {
    if (!shouldCluster) {
      return viewportVehicles.map((vehicle) => ({
        vehicles: [vehicle],
        lat: vehicle.lat,
        lon: vehicle.lon,
        provider: vehicle.provider || 'pks',
        visualOffset: 0,
        groupKey: `${vehicle.provider || 'pks'}:${vehicle.id}`,
      }));
    }

    const gridSize = zoom <= 10 ? 104 : zoom <= 12 ? 86 : zoom <= 14 ? 66 : 54;
    const providerCells = new Map<string, Set<string>>();
    const grouped = new Map<string, { vehicles: Vehicle[]; lat: number; lon: number; provider: string; overlapKey: string }>();
    for (const vehicle of viewportVehicles) {
      const point = map.project([vehicle.lat, vehicle.lon], zoom);
      const provider = vehicle.provider || 'pks';
      const cellX = Math.floor(point.x / gridSize);
      const cellY = Math.floor(point.y / gridSize);
      const overlapKey = `${cellX}:${cellY}`;
      const key = `${provider}:${overlapKey}`;
      const providersInCell = providerCells.get(overlapKey) || new Set<string>();
      providersInCell.add(provider);
      providerCells.set(overlapKey, providersInCell);

      const group = grouped.get(key);
      if (group) {
        group.vehicles.push(vehicle);
        group.lat += vehicle.lat;
        group.lon += vehicle.lon;
      } else {
        grouped.set(key, { vehicles: [vehicle], lat: vehicle.lat, lon: vehicle.lon, provider, overlapKey });
      }
    }

    return Array.from(grouped.values()).map((group) => ({
      ...group,
      lat: group.lat / group.vehicles.length,
      lon: group.lon / group.vehicles.length,
      groupKey: `${group.provider}:${group.overlapKey}`,
      visualOffset: (providerCells.get(group.overlapKey)?.size || 0) > 1
        ? group.provider === 'mpk_rzeszow' ? 7 : group.provider === 'marcel' ? 0 : group.provider === 'pkp_intercity' ? 14 : -7
        : 0,
    }));
  }, [map, shouldCluster, viewportVehicles, viewTick, zoom]);

  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const handleClusterClick = useCallback((key: string) => {
    const group = groupsRef.current.find(group => group.groupKey === key);
    if (!group) return;
    const bounds = L.latLngBounds(group.vehicles.map(vehicle => [vehicle.lat, vehicle.lon] as [number, number]));
    map.fitBounds(bounds.pad(0.35), { animate: true, maxZoom: Math.max(14, map.getZoom() + 2) });
  }, [map]);

  useEffect(() => {
    const updates: { marker: L.Marker; lat: number; lon: number }[] = [];
    for (const vehicle of viewportVehicles) {
      const marker = markerRefs.current.get(getVehicleMarkerKey(vehicle));
      if (marker) {
        const point = marker.getLatLng();
        if (point.lat !== vehicle.lat || point.lng !== vehicle.lon) updates.push({ marker, lat: vehicle.lat, lon: vehicle.lon });
      }
    }
    return runFrameBatch(updates, ({ marker, lat, lon }) => marker.setLatLng([lat, lon]), {
      request: callback => window.requestAnimationFrame(callback),
      cancel: id => window.cancelAnimationFrame(id),
      now: () => performance.now(),
      paused: () => mapMovingRef.current,
    });
  }, [getVehicleMarkerKey, viewportVehicles]);

  return (
    <>
      {groups.map((group) => {
        if (group.vehicles.length > 1) {
          const count = group.vehicles.length;
          const clusterColor = getVehicleColor(group.vehicles[0]);
          return (
            <VehicleClusterMarker
              key={`cluster-${group.groupKey}`}
              groupKey={group.groupKey} lat={group.lat} lon={group.lon} count={count}
              color={clusterColor} offset={group.visualOffset} onClick={handleClusterClick}
            />
          );
        }

        const vehicle = group.vehicles[0];
        const isSelected = selectedVehicleId === vehicle.id;
        const isHighVolume = renderVehicles.length > 35;
        const vehicleColor = getVehicleColor(vehicle);
        return (
          <BusMarker
            key={getVehicleMarkerKey(vehicle)}
            markerKey={getVehicleMarkerKey(vehicle)}
            vehicle={vehicle}
            isSelected={isSelected}
            isHighVolume={isHighVolume}
            vehicleColor={vehicleColor}
            zoom={zoom}
            onMarkerClick={handleMarkerClick}
            registerMarker={registerMarker}
          />
        );
      })}
    </>
  );
});

function RouteStopsLayer({
  selectedVehicle,
  stopsData,
  stopIds,
  highlightedStopId,
  selectedRouteColor,
  onStopClick,
}: {
  selectedVehicle?: Vehicle;
  stopsData: Record<string, StopData>;
  stopIds: Array<string | number>;
  highlightedStopId?: string | null;
  selectedRouteColor: string;
  onStopClick?: (stopId: string) => void;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });

  const visibleStopIds = selectedVehicle ? stopIds : [];

  if (!selectedVehicle) return null;

  const baseRadius = zoom <= 11 ? 4.5 : zoom <= 13 ? 5.1 : zoom <= 14 ? 5.8 : 6.5;

  return (
    <>
      {visibleStopIds.map((stopId, idx) => {
        const stop = stopsData[String(stopId)];
        if (!stop) return null;
        const isHighlighted = String(stopId) === highlightedStopId;

        return (
          <CircleMarker
            key={`stop-${stopId}-${idx}`}
            pane="routeStopsPane"
            center={[stop.lat, stop.lon]}
            radius={isHighlighted ? baseRadius + 2.3 : baseRadius}
            color={isHighlighted ? selectedRouteColor : 'rgba(12,18,28,0.9)'}
            fillColor="#ffffff"
            fillOpacity={1}
            weight={isHighlighted ? 4.6 : 2.8}
            pathOptions={{ pane: 'routeStopsPane', className: 'mks-route-stop-marker' }}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e as any);
                if (onStopClick) onStopClick(String(stopId));
              }
            }}
          />
        );
      })}
    </>
  );
}

export default function BusMap({ 
  vehicles, 
  onVehicleClick, 
  selectedVehicleId, 
  selectedVehicle: selectedVehicleOverride,
  stopsData, 
  themeColor = '#00A3A2', 
  refreshInterval = 5000,
  forcedCenter = null,
  onCenterComplete,
  highlightedStopId,
  onStopClick,
  onMapClick,
  onViewportChange,
}: BusMapProps) {
  const [initMapState, setInitMapState] = useState<{center: [number, number], zoom: number} | null>(() => {
    try {
      if (typeof window !== 'undefined') {
         const saved = localStorage.getItem('mks_map_state');
         if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.center && parsed.zoom) {
               return { center: [parsed.center.lat, parsed.center.lng], zoom: parsed.zoom };
            }
         }
      }
    } catch (err) {}
    return { center: [50.0412, 21.9991], zoom: 13 };
  });

  const mapContainerRef = useRef<HTMLDivElement>(null);

  const handleInteraction = useCallback((active: boolean) => {
    if (mapContainerRef.current) {
      if (active) {
        mapContainerRef.current.classList.add('is-map-moving');
      } else {
        mapContainerRef.current.classList.remove('is-map-moving');
      }
    }
  }, []);

  const selectedVehicle = selectedVehicleOverride || vehicles.find(v => v.id === selectedVehicleId);
  const [snappedRoute, setSnappedRoute] = useState<[number, number][]>([]);
  const refinedRouteCacheRef = useRef(new Map<string, [number, number][]>());
  const refinedRouteByVehicleRef = useRef(new Map<string, [number, number][]>());
  const selectedVehicleIdentityRef = useRef<string>('');
  const routeAbortRef = useRef<AbortController | null>(null);
  const activeRouteRequestIdRef = useRef(0);
  const routeStopsSource = useMemo(() => {
    const routeStops = selectedVehicle?.routeStops || [];
    if (routeStops.length > 0) return routeStops;
    return selectedVehicle?.schedule || [];
  }, [selectedVehicle?.routeStops, selectedVehicle?.schedule]);
  const routeStopsData = useMemo(() => {
    const next: Record<string, StopData> = selectedVehicle?.provider && selectedVehicle.provider !== 'pks'
      ? {}
      : { ...(stopsData || {}) };
    for (const stop of routeStopsSource) {
      if (Number.isFinite(stop.lat) && Number.isFinite(stop.lon)) {
        next[String(stop.id)] = {
          n: stop.name,
          lat: Number(stop.lat),
          lon: Number(stop.lon),
        };
      }
    }
    return next;
  }, [routeStopsSource, stopsData, selectedVehicle?.provider]);
  const routeStopIds = useMemo(() => {
    const fullRoute = selectedVehicle?.routePath?.filter((id) => Number.isFinite(Number(id))) || [];
    if (fullRoute.length > 0) return dedupeStableStopIds(fullRoute);
    const routeStops = (selectedVehicle?.routeStops || []).map((s: any) => s.id);
    if (routeStops.length > 0) return dedupeStableStopIds(routeStops);
    return dedupeStableStopIds((selectedVehicle?.schedule || []).map((s: any) => s.id));
  }, [selectedVehicle]);
  const visibleRouteStopIds = selectedVehicle?.type === 'train' || selectedVehicle?.provider === 'pkp_intercity'
    ? routeStopIds
    : upcomingVehicleStops(routeStopsSource, Date.now(), selectedVehicle?.lastStopId).map(stop => String(stop.id));
  const visibleRouteStopIdsKey = useMemo(() => visibleRouteStopIds.join(','), [visibleRouteStopIds]);
  const routeGeometryStops = useMemo<RouteGeometryStop[]>(() => {
    const next: RouteGeometryStop[] = [];
    for (let index = 0; index < routeStopIds.length; index += 1) {
      const stopId = routeStopIds[index];
      const stop = routeStopsData[String(stopId)];
      if (!stop || !Number.isFinite(stop.lat) || !Number.isFinite(stop.lon)) continue;
      next.push({
        id: stopId,
        name: stop.n,
        lat: Number(stop.lat),
        lon: Number(stop.lon),
        sequence: index,
      });
    }
    return next;
  }, [routeStopIds, routeStopsData]);
  // Paint only road geometry. Stop-to-stop chords can cut across buildings and fields.
  const paintedRoute = snappedRoute;
  // Selected details contain punctuality before the background fleet cache warms.
  const markerVehicles = useMemo(() => vehicles.map(vehicle =>
    selectedVehicle?.provider === vehicle.provider && selectedVehicle?.id === vehicle.id &&
    vehicle.delay === undefined && Number.isFinite(selectedVehicle.delay)
      ? { ...vehicle, delay: selectedVehicle.delay } : vehicle),
  [vehicles, selectedVehicle?.provider, selectedVehicle?.id, selectedVehicle?.delay]);
  const routeStopsHash = useMemo(() => hashRouteGeometryStops(routeGeometryStops), [routeGeometryStops]);
  const selectedRouteColor = getVehicleColor(selectedVehicle);
  const routeHaloOpts = { pane: 'routeLinePane', color: '#f8fafc', weight: 11, opacity: 0.5, lineCap: 'round', lineJoin: 'round', noClip: false, smoothFactor: 0 } as L.PolylineOptions;
  const routeGlowOpts = { pane: 'routeLinePane', color: '#020617', weight: 7.5, opacity: 0.58, lineCap: 'round', lineJoin: 'round', noClip: false, smoothFactor: 0 } as L.PolylineOptions;
  const routePolylineOpts = { pane: 'routeLinePane', color: selectedRouteColor, weight: 5.5, opacity: 0.98, lineCap: 'round', lineJoin: 'round', noClip: false, smoothFactor: 0 } as L.PolylineOptions;
  const routeLine = normalizeRouteCachePart(selectedVehicle?.routeShortName || selectedVehicle?.routeId || selectedVehicle?.name || '');
  const routeDirection = normalizeRouteCachePart(
    selectedVehicle?.direction ||
    routeGeometryStops[routeGeometryStops.length - 1]?.name ||
    selectedVehicle?.routeId ||
    '',
  );
  const routeMode = selectedVehicle?.provider === 'pkp_intercity' ? 'rail' : 'road';
  const routeGeometryVersion = routeMode === 'rail' ? RAIL_ROUTE_GEOMETRY_CACHE_VERSION : ROAD_ROUTE_GEOMETRY_CACHE_VERSION;
  const routeKey = selectedVehicle
    ? [
        routeMode,
        normalizeRouteCachePart(selectedVehicle.provider || 'pks'),
        routeLine,
        routeDirection,
        String(selectedVehicle.tripId || selectedVehicle.journeyId || selectedVehicle.routeId || ''),
        routeStopsHash,
      ].join(':')
    : '';

  useEffect(() => {
    activeRouteRequestIdRef.current += 1;
    const requestId = activeRouteRequestIdRef.current;
    routeAbortRef.current?.abort();
    routeAbortRef.current = null;

    if (!selectedVehicle) {
      startTransition(() => setSnappedRoute([]));
      selectedVehicleIdentityRef.current = '';
      return;
    }

    const currentIdentity = `${selectedVehicle.provider || 'pks'}:${selectedVehicle.id}:${routeKey}`;
    if (selectedVehicleIdentityRef.current && selectedVehicleIdentityRef.current !== currentIdentity) {
      startTransition(() => setSnappedRoute([]));
    }
    selectedVehicleIdentityRef.current = currentIdentity;

    if (routeGeometryStops.length < 2) {
      startTransition(() => setSnappedRoute([]));
      return;
    }

    const memoryRoute = refinedRouteCacheRef.current.get(routeKey);
    if (memoryRoute && memoryRoute.length > 1) {
      setSnappedRoute(memoryRoute);
      refinedRouteByVehicleRef.current.set(currentIdentity, memoryRoute);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    routeAbortRef.current = controller;

    const loadRoute = async () => {
      const localRoute = await readPersistentRouteGeometry(routeKey, routeGeometryVersion);
      if (cancelled || requestId !== activeRouteRequestIdRef.current || controller.signal.aborted) return;
      if (localRoute.length > 1) {
        const refinedLocalRoute = simplifyRouteForPaint(localRoute);
        refinedRouteCacheRef.current.set(routeKey, refinedLocalRoute);
        refinedRouteByVehicleRef.current.set(currentIdentity, refinedLocalRoute);
        setSnappedRoute(refinedLocalRoute);
        return;
      }

      const officialRoute = routeMode === 'road'
        ? await officialBusRoute(selectedVehicle.provider||'pks',selectedVehicle.tripId||selectedVehicle.journeyId,routeStopIds).catch(()=>[])
        : [];
      if (cancelled || requestId !== activeRouteRequestIdRef.current || controller.signal.aborted) return;
      if (officialRoute.length > 1) {
        const refinedOfficialRoute = simplifyRouteForPaint(officialRoute);
        refinedRouteCacheRef.current.set(routeKey, refinedOfficialRoute);
        refinedRouteByVehicleRef.current.set(currentIdentity, refinedOfficialRoute);
        writePersistentRouteGeometry(routeKey, refinedOfficialRoute, routeGeometryVersion);
        startTransition(() => setSnappedRoute(refinedOfficialRoute));
        return;
      }

      const response = await loadRouteWithRetry(() => fetchRouteGeometryClient({
        carrier: selectedVehicle.provider || 'pks',
        line: selectedVehicle.routeShortName || selectedVehicle.routeId || selectedVehicle.name || 'unknown',
        direction: selectedVehicle.direction || routeGeometryStops[routeGeometryStops.length - 1]?.name || 'unknown',
        variant: String(
          selectedVehicle.tripId ||
          selectedVehicle.journeyId ||
          selectedVehicle.serviceId ||
          selectedVehicle.brigadeName ||
          selectedVehicle.routeId ||
          'default',
        ),
        dataVersion: routeGeometryVersion,
        mode: routeMode,
        stops: routeGeometryStops,
      }, { signal: controller.signal }), controller.signal);
      if (cancelled || requestId !== activeRouteRequestIdRef.current || controller.signal.aborted) return;
        const points = (response.geometry?.coordinates || [])
          .map(([lon, lat]) => [lat, lon] as [number, number])
          .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
        if (points.length > 1) {
          const refinedRoute = simplifyRouteForPaint(points);
          refinedRouteCacheRef.current.set(routeKey, refinedRoute);
          if (response.cacheKey) refinedRouteCacheRef.current.set(response.cacheKey, refinedRoute);
          refinedRouteByVehicleRef.current.set(currentIdentity, refinedRoute);
          writePersistentRouteGeometry(routeKey, refinedRoute, routeGeometryVersion);
          if (response.cacheKey && response.cacheKey !== routeKey) {
            writePersistentRouteGeometry(response.cacheKey, refinedRoute, routeGeometryVersion);
          }
          if (refinedRouteCacheRef.current.size > 200) {
            const firstKey = refinedRouteCacheRef.current.keys().next().value;
            if (firstKey) refinedRouteCacheRef.current.delete(firstKey);
          }
          if (refinedRouteByVehicleRef.current.size > 400) {
            const firstVehicleKey = refinedRouteByVehicleRef.current.keys().next().value;
            if (firstVehicleKey) refinedRouteByVehicleRef.current.delete(firstVehicleKey);
          }
          startTransition(() => setSnappedRoute(refinedRoute));
          return;
        }
    };

    loadRoute().catch((error) => {
      if ((error as any)?.name === 'AbortError') return;
      if (requestId !== activeRouteRequestIdRef.current || controller.signal.aborted) return;
      // Keep the last good rendered route when a transient network/backend error happens.
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [routeKey, routeStopsHash, selectedVehicle?.provider, selectedVehicle?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!initMapState) return null;

  return (
    <div ref={mapContainerRef} className={`h-full w-full relative z-0 style-map ${vehicles.length > 35 ? 'is-high-volume' : ''}`}>
      <style>{`
        /* Hide zoom controls on mobile */
        @media (max-width: 768px) {
          .leaflet-control-zoom {
            display: none !important;
          }
        }
        
        /* 
           SMOOTH MOVEMENT:
           Interpolate position over the polling interval.
        */
        .mks-bus-marker {
          transition: transform ${Math.max(1, (refreshInterval / 1000) - 1)}s linear, opacity 0.5s ease-out;
          will-change: transform;
        }

        .mks-marker-inner {
          transform-origin: center bottom;
          transition: transform 0.18s ease, filter 0.18s ease;
        }

        .mks-bus-marker:hover .mks-marker-inner {
          transform: scale(1.08);
          filter: saturate(1.08);
        }

        @keyframes mksLivePulse {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(255,255,255,0.08)); }
          50% { filter: drop-shadow(0 0 10px rgba(255,255,255,0.18)); }
        }

        .mks-live-bus-body {
          animation: mksLivePulse 3.8s ease-in-out infinite;
        }

        .is-high-volume .mks-bus-marker {
          transition: none !important;
          will-change: auto;
        }

        .is-high-volume .mks-marker-inner {
          transition: none !important;
        }

        .is-high-volume .mks-live-bus-body {
          animation: none !important;
        }

        .is-high-volume .mks-route-stop-marker {
          filter: drop-shadow(0 0 5px rgba(255,255,255,0.5)) drop-shadow(0 2px 5px rgba(0,0,0,0.5));
        }
        
        /* Disable transition during ANY map interaction to prevent jitter */
        .is-map-moving .mks-bus-marker,
        .leaflet-zoom-anim .mks-bus-marker,
        .leaflet-drag-anim .mks-bus-marker,
        .leaflet-zoom-animated .mks-bus-marker,
        .mks-bus-marker.leaflet-zoom-animated {
          transition: none !important;
          transition-duration: 0s !important;
        }

        .mks-route-stop-marker {
          filter: drop-shadow(0 0 7px rgba(255,255,255,0.62)) drop-shadow(0 2px 6px rgba(0,0,0,0.5));
        }
      `}</style>
      <MapContainer
        center={initMapState.center}
        zoom={initMapState.zoom}
        scrollWheelZoom={true}
        preferCanvas={true}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <MapStateTracker onInteraction={handleInteraction} onViewportChange={onViewportChange} />
        <MapClickListener onClick={onMapClick} />
        <MapCenterer center={forcedCenter} onComplete={onCenterComplete} />
        <ZoomControl position="bottomright" />
        <TileLayer
          attribution='Map tiles by Google'
          url="https://mt1.google.com/vt/lyrs=m&hl=pl&gl=PL&x={x}&y={y}&z={z}"
          maxZoom={19}
        />

        {/* Highlighted Selected Stop */}
        {highlightedStopId && routeStopsData[highlightedStopId] && (
          <Marker 
            position={[routeStopsData[highlightedStopId].lat, routeStopsData[highlightedStopId].lon]}
            zIndexOffset={5000}
            icon={L.divIcon({
               className: 'stop-highlight-pin',
               html: `
                 <div class="relative flex flex-col items-center">
                       <div class="w-8 h-8 bg-white rounded-full shadow-xl flex items-center justify-center border-[3px]" style="border-color: ${themeColor}">
                       <div class="w-3 h-3 rounded-full animate-ping absolute" style="background-color: ${themeColor}"></div>
                       <div class="w-4 h-4 rounded-full z-10" style="background-color: ${themeColor}"></div>
                    </div>
                    <div class="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] -mt-1 shadow-xl" style="border-t-color: ${themeColor}"></div>
                 </div>
               `,
               iconSize: [32, 42],
               iconAnchor: [16, 42],
            })}
          />
        )}

        {/* Draw Route Line */}
        <Pane name="routeLinePane" style={{ zIndex: 430 }}>
          {paintedRoute.length > 1 && (
            <>
              <Polyline pane="routeLinePane" key={`route-halo-${selectedVehicleId}-${routeKey}`} positions={paintedRoute} pathOptions={routeHaloOpts} />
              <Polyline pane="routeLinePane" key={`route-glow-${selectedVehicleId}-${routeKey}`} positions={paintedRoute} pathOptions={routeGlowOpts} />
              <Polyline pane="routeLinePane" key={`route-line-${selectedVehicleId}-${routeKey}`} positions={paintedRoute} pathOptions={routePolylineOpts} />
            </>
          )}
        </Pane>

        {/* Draw Route Stops */}
        <Pane name="routeStopsPane" style={{ zIndex: 470 }}>
          {selectedVehicle && (
            <RouteStopsLayer
              selectedVehicle={selectedVehicle}
              stopsData={routeStopsData}
              stopIds={visibleRouteStopIds}
              highlightedStopId={highlightedStopId}
              selectedRouteColor={themeColor}
              onStopClick={onStopClick}
            />
          )}
        </Pane>

        <VehicleMarkerLayer
          vehicles={markerVehicles}
          selectedVehicleId={selectedVehicleId}
          themeColor={themeColor}
          refreshInterval={refreshInterval}
          onVehicleClick={onVehicleClick}
        />
      </MapContainer>
    </div>
  );
}
