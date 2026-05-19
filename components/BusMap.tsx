'use client';

import { memo, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMap, Polyline, CircleMarker, ZoomControl, useMapEvents, Pane } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {fetchRouteShapeClient} from '@/lib/pks-client';

const PKS_COLOR = '#14b8a6';
const MPK_RZESZOW_COLOR = '#ff7a00';
const MARCEL_COLOR = '#68c44a';
const ROUTE_POINT_LIMIT = 720;

function getVehicleColor(vehicle?: Pick<Vehicle, 'provider'> | null, fallback = PKS_COLOR) {
  if (vehicle?.provider === 'mpk_rzeszow') return MPK_RZESZOW_COLOR;
  if (vehicle?.provider === 'marcel') return MARCEL_COLOR;
  if (vehicle?.provider === 'pks') return PKS_COLOR;
  return fallback;
}

function simplifyRouteForPaint(points: [number, number][], maxPoints = ROUTE_POINT_LIMIT) {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const simplified: [number, number][] = [];

  for (let i = 0; i < points.length; i += step) {
    simplified.push(points[i]);
  }

  const last = points[points.length - 1];
  const currentLast = simplified[simplified.length - 1];
  if (!currentLast || currentLast[0] !== last[0] || currentLast[1] !== last[1]) {
    simplified.push(last);
  }

  return simplified;
}

function MapStateTracker({ onInteraction }: { onInteraction: (active: boolean) => void }) {
  const map = useMap();
  useMapEvents({
    zoomstart: () => onInteraction(true),
    zoomend: () => {
      onInteraction(false);
      localStorage.setItem('mks_map_state', JSON.stringify({ center: map.getCenter(), zoom: map.getZoom() }));
    },
    movestart: () => onInteraction(true),
    moveend: () => {
      onInteraction(false);
      localStorage.setItem('mks_map_state', JSON.stringify({ center: map.getCenter(), zoom: map.getZoom() }));
    },
  });
  return null;
}

const formatDelay = (delaySec: number | undefined) => {
  if (delaySec === undefined) return null;
  if (Math.abs(delaySec) > 18000) return null; // Ignore absurd delays > 5 hours
  const abs = Math.abs(delaySec);
  const min = Math.floor(abs / 60);
  
  if (delaySec < -60) {
    return { text: `Przed ${min}m`, textLong: `Przed czasem: ${min} min`, class: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' }; // Ahead of time
  } else if (delaySec > 60) {
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
  const delayBucket = delaySec === undefined ? 'na' : Math.trunc(delaySec / 60);
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
  const display = routeShortName || '?';
  const numberLabel = String(vehicleLabel || '').trim();
  const delayInfo = formatDelay(delaySec);
  
  let opacityClass = 'opacity-90';
  let filterStyle = '';

  const isSelClass = isSelected 
    ? 'z-[2000] scale-125 saturate-110 drop-shadow-2xl' 
    : `z-[100] scale-100 ${opacityClass} ${isHighVolume ? '' : 'drop-shadow-md hover:scale-105'}`;

  let badgeHtml = '';
  if (delayInfo && delaySec !== undefined && Math.abs(delaySec) > 60) {
    badgeHtml = `
      <div class="absolute -top-2.5 -right-2.5 px-1.5 py-0.5 rounded ${delayInfo.bg} ${delayInfo.class} text-[9px] font-black border border-white ${isHighVolume?'':'shadow-sm'} z-50 whitespace-nowrap">
        ${delaySec > 0 ? '+' : '-'}${Math.floor(Math.abs(delaySec)/60)}
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
  dataAgeSec?: number;
  schedule?: StopSchedule[];
  routeStops?: StopSchedule[];
  routePath?: number[];
  model?: string;
  // Test fields
  lastStopDistance?: number;
  lastStopId?: number;
  lastSignalTime?: string;
  journeyId?: string | number;
  serviceId?: string | number;
  tripId?: string | number;
  brigadeName?: string;
  bearing?: number;
  status?: 'active' | 'break' | 'inactive' | 'technical' | 'cached';
  statusText?: string;
  isHistorical?: boolean;
}

export interface StopData {
  n: string;
  lat: number;
  lon: number;
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
  const delayBucket = vehicle.delay === undefined ? 'na' : Math.trunc(vehicle.delay / 60);
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
        vehicle.vehicleNumber || (vehicle.provider === 'marcel' ? '' : vehicle.id),
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
    Math.trunc((prevVehicle.delay || 0) / 60) === Math.trunc((nextVehicle.delay || 0) / 60) &&
    getMarkerAgeBucket(prevVehicle.dataAgeSec) === getMarkerAgeBucket(nextVehicle.dataAgeSec) &&
    prev.isSelected === next.isSelected &&
    prev.isHighVolume === next.isHighVolume &&
    prev.vehicleColor === next.vehicleColor &&
    prev.zoom === next.zoom &&
    prev.onMarkerClick === next.onMarkerClick &&
    prev.registerMarker === next.registerMarker
  );
});

function VehicleMarkerLayer({
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
    setRenderVehicles(latestVehiclesRef.current);
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
      setViewTick((value) => value + 1);
      flushVehicleUpdates();
    },
    moveend: () => {
      mapMovingRef.current = false;
      setViewTick((value) => value + 1);
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

  useEffect(() => {
    for (const vehicle of renderVehicles) {
      const marker = markerRefs.current.get(getVehicleMarkerKey(vehicle));
      if (marker) marker.setLatLng([vehicle.lat, vehicle.lon]);
    }
  }, [getVehicleMarkerKey, renderVehicles]);

  const zoom = map.getZoom();
  const isHighVolumeLayer = renderVehicles.length > 35;
  const shouldCluster = renderVehicles.length > 8 && (zoom <= 14 || (isHighVolumeLayer && zoom <= 15));
  const groups = useMemo(() => {
    if (!shouldCluster) {
      return renderVehicles.map((vehicle) => ({
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
    for (const vehicle of renderVehicles) {
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
        ? group.provider === 'mpk_rzeszow' ? 7 : group.provider === 'marcel' ? 0 : -7
        : 0,
    }));
  }, [map, shouldCluster, renderVehicles, viewTick, zoom]);

  return (
    <>
      {groups.map((group) => {
        if (group.vehicles.length > 1) {
          const count = group.vehicles.length;
          const size = count >= 10 ? 54 : 46;
          const clusterColor = getVehicleColor(group.vehicles[0]);
          return (
            <Marker
              key={`cluster-${group.groupKey}`}
              position={[group.lat, group.lon]}
              zIndexOffset={900}
              icon={getCachedClusterIcon(count, size, clusterColor, group.visualOffset)}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e as any);
                  const bounds = L.latLngBounds(group.vehicles.map((vehicle) => [vehicle.lat, vehicle.lon] as [number, number]));
                  map.fitBounds(bounds.pad(0.35), { animate: true, maxZoom: Math.max(14, zoom + 2) });
                },
              }}
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
}

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

  const visibleStopIds = useMemo(() => {
    if (!selectedVehicle) return [];

    const maxStops =
      zoom <= 11 ? 12 :
      zoom <= 12 ? 18 :
      zoom <= 13 ? 30 :
      zoom <= 14 ? 44 :
      Number.POSITIVE_INFINITY;
    if (stopIds.length <= maxStops) return stopIds;

    const step = Math.ceil(stopIds.length / maxStops);
    return stopIds.filter((stopId, idx) =>
      idx === 0 ||
      idx === stopIds.length - 1 ||
      String(stopId) === highlightedStopId ||
      idx % step === 0,
    );
  }, [highlightedStopId, selectedVehicle, stopIds, zoom]);

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
            center={[stop.lat, stop.lon]}
            radius={isHighlighted ? baseRadius + 2.3 : baseRadius}
            color={isHighlighted ? selectedRouteColor : 'rgba(12,18,28,0.9)'}
            fillColor="#ffffff"
            fillOpacity={1}
            weight={isHighlighted ? 4.6 : 2.8}
            pathOptions={{ className: 'mks-route-stop-marker' }}
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
  onMapClick
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
  const lastFetchedRouteKeyRef = useRef<string>('');
  const routeStopsData = useMemo(() => {
    const next: Record<string, StopData> = { ...(stopsData || {}) };
    for (const stop of selectedVehicle?.routeStops || selectedVehicle?.schedule || []) {
      if (Number.isFinite(stop.lat) && Number.isFinite(stop.lon)) {
        next[String(stop.id)] = {
          n: stop.name,
          lat: Number(stop.lat),
          lon: Number(stop.lon),
        };
      }
    }
    return next;
  }, [selectedVehicle?.routeStops, selectedVehicle?.schedule, stopsData]);
  const routeStopIds = useMemo(() => {
    const fullRoute = selectedVehicle?.routePath?.filter((id) => Number.isFinite(Number(id))) || [];
    if (fullRoute.length > 0) return fullRoute;
    const routeStops = (selectedVehicle?.routeStops || []).map((s: any) => s.id);
    if (routeStops.length > 0) return routeStops;
    return (selectedVehicle?.schedule || []).map((s: any) => s.id);
  }, [selectedVehicle]);
  const visibleRouteStopIds = useMemo(() => {
    const scheduleIds = (selectedVehicle?.schedule || [])
      .map((s: any) => s.id)
      .filter((id: unknown) => Number.isFinite(Number(id)));
    return scheduleIds.length > 0 ? scheduleIds : routeStopIds;
  }, [selectedVehicle?.schedule, routeStopIds]);
  const routeStopIdsKey = useMemo(() => routeStopIds.join(','), [routeStopIds]);
  const routeCoordKey = useMemo(() => {
    return routeStopIds
      .map((stopId) => {
        const stop = routeStopsData[String(stopId)];
        if (!stop || !Number.isFinite(stop.lat) || !Number.isFinite(stop.lon)) return `${stopId}:missing`;
        return `${stopId}:${stop.lat.toFixed(5)},${stop.lon.toFixed(5)}`;
      })
      .join('|');
  }, [routeStopIds, routeStopsData]);

  const selectedRouteColor = getVehicleColor(selectedVehicle);
  const routeGlowOpts = { color: '#ffffff', weight: 10, opacity: 0.18, lineCap: 'round', lineJoin: 'round', noClip: false, smoothFactor: 1.35 } as L.PolylineOptions;
  const routePolylineOpts = { color: selectedRouteColor, weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round', noClip: false, smoothFactor: 1.35 } as L.PolylineOptions;
  const routeKey = selectedVehicle ? `${selectedVehicle.id}_${routeStopIdsKey}_${routeCoordKey}` : '';

  useEffect(() => {
    if (!selectedVehicle) {
      setSnappedRoute([]);
      lastFetchedRouteKeyRef.current = '';
      return;
    }

    const routeCoordCount = routeStopIds.filter((stopId) => {
      const stop = routeStopsData[String(stopId)];
      return stop && Number.isFinite(stop.lat) && Number.isFinite(stop.lon);
    }).length;
    if (routeStopIds.length > 1 && routeCoordCount < 2) {
      setSnappedRoute([]);
      return;
    }

    if (lastFetchedRouteKeyRef.current === routeKey) {
      // Already fetched and route hasn't changed
      return;
    }

    lastFetchedRouteKeyRef.current = routeKey;
    setSnappedRoute([]);

    const tripId = String(selectedVehicle.tripId || '').trim();
    let cancelled = false;
    fetchRouteShapeClient(tripId, routeStopIds, routeStopsData, {
      fastFallback: selectedVehicle.provider === 'mpk_rzeszow',
      skipOfficialShape: selectedVehicle.provider === 'marcel',
      startPoint: [selectedVehicle.lat, selectedVehicle.lon],
    })
      .then((points) => {
        if (cancelled || lastFetchedRouteKeyRef.current !== routeKey) return;
        if (points.length > 1) {
          setSnappedRoute(simplifyRouteForPaint(points));
          return;
        }
        setSnappedRoute([]);
      })
      .catch(() => {
        if (cancelled || lastFetchedRouteKeyRef.current !== routeKey) return;
        setSnappedRoute([]);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedVehicle?.tripId, routeKey, routeStopIdsKey, routeCoordKey, routeStopsData]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <MapStateTracker onInteraction={handleInteraction} />
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
                       <div class="w-8 h-8 bg-white rounded-full shadow-xl flex items-center justify-center border-[3px]" style="border-color: ${selectedRouteColor}">
                       <div class="w-3 h-3 rounded-full animate-ping absolute" style="background-color: ${selectedRouteColor}"></div>
                       <div class="w-4 h-4 rounded-full z-10" style="background-color: ${selectedRouteColor}"></div>
                    </div>
                    <div class="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] -mt-1 shadow-xl" style="border-t-color: ${selectedRouteColor}"></div>
                 </div>
               `,
               iconSize: [32, 42],
               iconAnchor: [16, 42],
            })}
          />
        )}

        {/* Draw Route Line */}
        <Pane name="routeLinePane" style={{ zIndex: 400 }}>
          {snappedRoute.length > 0 && (
            <>
              <Polyline key={`route-glow-${selectedVehicleId}-${routeStopIdsKey}`} positions={snappedRoute} pathOptions={routeGlowOpts} />
              <Polyline key={`route-line-${selectedVehicleId}-${routeStopIdsKey}`} positions={snappedRoute} pathOptions={routePolylineOpts} />
            </>
          )}
        </Pane>

        {/* Draw Route Stops */}
        <Pane name="routeStopsPane" style={{ zIndex: 410 }}>
          {selectedVehicle && (
            <RouteStopsLayer
              selectedVehicle={selectedVehicle}
              stopsData={routeStopsData}
              stopIds={visibleRouteStopIds}
              highlightedStopId={highlightedStopId}
              selectedRouteColor={selectedRouteColor}
              onStopClick={onStopClick}
            />
          )}
        </Pane>

        <VehicleMarkerLayer
          vehicles={vehicles}
          selectedVehicleId={selectedVehicleId}
          themeColor={themeColor}
          refreshInterval={refreshInterval}
          onVehicleClick={onVehicleClick}
        />
      </MapContainer>
    </div>
  );
}
