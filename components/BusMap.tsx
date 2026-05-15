'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMap, Polyline, CircleMarker, ZoomControl, useMapEvents, Pane } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {fetchRouteShapeClient} from '@/lib/pks-client';

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

function buildLocalRoutePreview(stopIds: number[], stopsData?: Record<string, StopData> | null) {
  if (!stopsData || stopIds.length < 2) return [];
  const coords = stopIds
    .map((id) => stopsData[String(id)])
    .filter((stop): stop is StopData => Boolean(stop) && Number.isFinite(stop.lat) && Number.isFinite(stop.lon))
    .map((stop) => [stop.lat, stop.lon] as [number, number]);
  if (coords.length < 2) return [];

  const points: [number, number][] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const [lat1, lon1] = coords[i];
    const [lat2, lon2] = coords[i + 1];
    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    const length = Math.hypot(dLat, dLon) || 1;
    const steps = Math.max(6, Math.min(22, Math.ceil(length / 0.002)));
    const wiggle = Math.min(0.00032, Math.max(0.00008, length * 0.035));

    for (let step = 0; step < steps; step++) {
      if (i > 0 && step === 0) continue;
      const t = step / steps;
      const ease = t * t * (3 - 2 * t);
      const curve = Math.sin(Math.PI * t) * wiggle * (i % 2 === 0 ? 1 : -1);
      points.push([
        lat1 + dLat * ease + (dLon / length) * curve,
        lon1 + dLon * ease - (dLat / length) * curve,
      ]);
    }
  }

  points.push(coords[coords.length - 1]);
  return points;
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

export const getCachedBusIcon = (routeShortName: string, vehicleId: string, delaySec?: number, speed?: number, isSelected?: boolean, themeColor: string = '#00A3A2', dataAgeSec?: number, isHighVolume?: boolean) => {
  // Discretize dataAgeSec to avoid cache busting constantly
  // We only visually change at >60s, >120s, >180s, etc.
  let ageBucket = 0;
  if (dataAgeSec !== undefined) {
    if (dataAgeSec > 180) ageBucket = Math.floor(dataAgeSec / 60);
    else if (dataAgeSec > 60) ageBucket = dataAgeSec < 120 ? 1 : Math.floor(dataAgeSec / 60);
  }

  const hash = `${routeShortName}_${vehicleId}_${delaySec}_${isSelected}_${themeColor}_${ageBucket}_${isHighVolume}`;
  
  if (iconCache.has(hash)) {
    return iconCache.get(hash)!;
  }
  
  const icon = createBusIcon(routeShortName, vehicleId, delaySec, speed, isSelected, themeColor, dataAgeSec, isHighVolume);
  
  // keep cache size reasonable
  if (iconCache.size > 2000) {
    const keys = Array.from(iconCache.keys());
    for (let i = 0; i < 500; i++) iconCache.delete(keys[i]);
  }
  
  iconCache.set(hash, icon);
  return icon;
};

const createBusIcon = (routeShortName: string, vehicleId: string, delaySec?: number, speed?: number, isSelected?: boolean, themeColor: string = '#00A3A2', dataAgeSec?: number, isHighVolume?: boolean) => {
  const display = routeShortName || '?';
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

  const html = `
    <div class="relative flex flex-col items-center justify-start ${isSelClass}" style="width: 48px; height: 68px; ${filterStyle}">
      
      <!-- Sleek App-Icon Style Bus Front -->
      <div class="relative w-[34px] bg-white border-2 border-white rounded-[8px] z-10 flex flex-col overflow-hidden ${isHighVolume?'':'shadow-sm'}" style="background-color: ${themeColor};">
        
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

      <!-- Minimal Vehicle ID -->
      <div class="mt-1 border border-slate-200 rounded px-1.5 py-[1px] text-[8px] tracking-wide font-bold max-w-[44px] truncate text-center ${isHighVolume?'':'shadow-sm'} flex items-center justify-center gap-1" style="background-color: rgba(255,255,255,0.95); color: #64748b;">
        <span>${vehicleId}</span>
      </div>

      ${badgeHtml}
    </div>
  `;

  return L.divIcon({
    className: 'mks-bus-marker !bg-transparent !border-0',
    html: html,
    iconSize: [48, 72],
    iconAnchor: [24, 46],     // Anchor is set at the bottom visual edge of the bus tires
    popupAnchor: [0, -46],
  });
};

export interface StopSchedule {
  id: number;
  name: string;
  planned: string | null;
  real: string | null;
}

export interface Vehicle {
  id: string;
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

export default function BusMap({ 
  vehicles, 
  onVehicleClick, 
  selectedVehicleId, 
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

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const [snappedRoute, setSnappedRoute] = useState<[number, number][]>([]);
  const lastFetchedRouteKeyRef = useRef<string>('');
  const routeStopIds = useMemo(() => {
    const fullRoute = selectedVehicle?.routePath?.filter((id) => Number.isFinite(Number(id))) || [];
    if (fullRoute.length > 0) return fullRoute;
    return (selectedVehicle?.schedule || []).map((s: any) => s.id);
  }, [selectedVehicle]);
  const upcomingStopIds = useMemo(
    () => (selectedVehicle?.schedule || []).map((s: any) => s.id).filter((id: unknown) => id != null),
    [selectedVehicle?.schedule],
  );
  const routeStopIdsKey = useMemo(() => routeStopIds.join(','), [routeStopIds]);

  const routeGlowOpts = { color: '#ffffff', weight: 12, opacity: 0.22, lineCap: 'round', lineJoin: 'round', noClip: true, smoothFactor: 0 } as L.PolylineOptions;
  const routePolylineOpts = { color: themeColor, weight: 7, opacity: 0.92, lineCap: 'round', lineJoin: 'round', noClip: true, smoothFactor: 0 } as L.PolylineOptions;
  const routeKey = selectedVehicle ? `${selectedVehicle.id}_${routeStopIdsKey}` : '';

  useEffect(() => {
    if (!selectedVehicle || !stopsData) {
      setSnappedRoute([]);
      lastFetchedRouteKeyRef.current = '';
      return;
    }

    if (lastFetchedRouteKeyRef.current === routeKey) {
      // Already fetched and route hasn't changed
      return;
    }

    lastFetchedRouteKeyRef.current = routeKey;
    const previewRoute = buildLocalRoutePreview(routeStopIds, stopsData);
    setSnappedRoute(previewRoute);

    const tripId = String(selectedVehicle.tripId || '').trim();
    let cancelled = false;
    fetchRouteShapeClient(tripId, routeStopIds, stopsData)
      .then((points) => {
        if (cancelled || lastFetchedRouteKeyRef.current !== routeKey) return;
        if (points.length > 1) {
          setSnappedRoute(points);
          return;
        }
        setSnappedRoute(previewRoute);
      })
      .catch(() => {
        if (cancelled || lastFetchedRouteKeyRef.current !== routeKey) return;
        setSnappedRoute(previewRoute);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedVehicle?.tripId, routeKey, routeStopIdsKey, stopsData]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!initMapState) return null;

  return (
    <div ref={mapContainerRef} className={`h-full w-full relative z-0 style-map`}>
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
          filter: drop-shadow(0 0 6px rgba(255,255,255,0.55));
        }
      `}</style>
      <MapContainer
        center={initMapState.center}
        zoom={initMapState.zoom}
        scrollWheelZoom={true}
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
        {highlightedStopId && stopsData && stopsData[highlightedStopId] && (
          <Marker 
            position={[stopsData[highlightedStopId].lat, stopsData[highlightedStopId].lon]}
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
          {selectedVehicle && stopsData && (
            upcomingStopIds.map((stopId, idx) => {
              const stop = stopsData[String(stopId)];
              if (!stop) return null;
              const isHighlighted = String(stopId) === highlightedStopId;

              return (
                <CircleMarker
                  key={`stop-${stopId}-${idx}`}
                  center={[stop.lat, stop.lon]}
                  radius={isHighlighted ? 7.5 : 5.5}
                  color={isHighlighted ? themeColor : 'rgba(15,23,42,0.92)'}
                  fillColor={isHighlighted ? '#ffffff' : '#ffffff'}
                  fillOpacity={1}
                  weight={isHighlighted ? 4 : 3}
                  pathOptions={{ className: 'mks-route-stop-marker drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]' }}
                  eventHandlers={{
                    click: (e) => {
                      L.DomEvent.stopPropagation(e as any);
                      if (onStopClick) onStopClick(String(stopId));
                    }
                  }}
                />
              )
            })
          )}
        </Pane>

        {vehicles.map((vehicle) => {
          const delayInfo = formatDelay(vehicle.delay);
          // Highlight selected bus
          const isSelected = selectedVehicleId === vehicle.id;
          const isHighVolume = vehicles.length > 50;
          
          return (
            <Marker
              key={vehicle.id}
              position={[vehicle.lat, vehicle.lon]}
              icon={getCachedBusIcon(vehicle.routeShortName || '', vehicle.id, vehicle.delay, vehicle.speed, isSelected, themeColor, vehicle.dataAgeSec, isHighVolume)}
              zIndexOffset={isSelected ? 1000 : 0}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e as any);
                  if (onVehicleClick) onVehicleClick(vehicle);
                }
              }}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}
