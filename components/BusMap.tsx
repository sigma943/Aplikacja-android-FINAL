'use client';
import {bundledMarcelRoute} from '@/lib/marcel-route-assets';

import {readBusCoordinates} from '@/lib/bus-coordinates';
import {loadStopPlatforms} from '@/lib/stop-platform-position';

import {startTransition, useEffect, useState, useRef, useCallback, useMemo} from 'react';
import {MapContainer, TileLayer, Polyline, ZoomControl, Pane} from 'react-leaflet';
import L from 'leaflet';
import {timedVehicleStops} from '@/lib/vehicle-stop-timing';
import type {Stop} from '@/Panel/src/types';
import {canonicalMapStopId} from '@/lib/map-stop-markers';

import {routeGeometryKey} from '@/lib/route-geometry-key';
import {officialBusRoute} from '@/lib/official-bus-routes';
import {roadRouteMatchesStops, cleanRoadJunctionLoops} from '@/lib/bus-road-geometry';
import {upcomingVehicleStops} from '@/lib/vehicle-upcoming-stops';

import {loadRouteWithRetry} from '@/lib/route-load-retry';

import {fetchRouteGeometryClient, type RouteGeometryStop} from '@/lib/pks-client';

import {type Vehicle, type StopData} from '@/lib/transport/vehicle';
import {readPersistentRouteGeometry, writePersistentRouteGeometry} from '@/lib/map/route-cache';
import {simplifyRouteForPaint, dedupeStableStopIds, normalizeRouteCachePart, hashRouteGeometryStops} from '@/lib/map/route-presentation';
import {getVehicleColor} from '@/components/map/vehicle-icons';
import {MapStateTracker, MapCenterer, MapClickListener} from '@/components/map/MapControls';
import {VehicleMarkerLayer} from '@/components/map/VehicleMarkers';
import {SelectedStopPin, CatalogStopsLayer, RouteStopsLayer} from '@/components/map/StopLayers';

const ROAD_ROUTE_GEOMETRY_CACHE_VERSION = 'road-v12-contiguous-stop-waypoints';

const RAIL_ROUTE_GEOMETRY_CACHE_VERSION = 'rail-v1';

interface BusMapProps {
  mapStops?: Stop[];
  onMapStopClick?: (stop:Stop)=>void;
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

export default function BusMap({ 
  mapStops = [],
  onMapStopClick,
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
  const selectedCatalogStopId=canonicalMapStopId(mapStops,highlightedStopId,selectedVehicle?.provider);
  const [,setPlatformRevision]=useState(0);
  const needsPlatforms=mapStops.length>0||Boolean((selectedVehicle||highlightedStopId)&&selectedVehicle?.provider!=='pkp_intercity');
  useEffect(()=>{
    if(!needsPlatforms)return;
    let active=true;
    void loadStopPlatforms().then(()=>{if(active)setPlatformRevision(v=>v+1);});
    return()=>{active=false;};
  },[needsPlatforms]);
  const [snappedRoute, setSnappedRoute] = useState<[number, number][]>([]);
  const refinedRouteCacheRef = useRef(new Map<string, [number, number][]>());
  const refinedRouteByVehicleRef = useRef(new Map<string, [number, number][]>());
  const selectedVehicleIdentityRef = useRef<string>('');
  const routeAbortRef = useRef<AbortController | null>(null);
  const activeRouteRequestIdRef = useRef(0);
  const routeStopsSource = useMemo(() => {
    return selectedVehicle ? timedVehicleStops(selectedVehicle) : [];
  }, [selectedVehicle?.routeStops, selectedVehicle?.schedule, selectedVehicle?.delay, selectedVehicle?.status, selectedVehicle?.provider]);
  const routeStopsData = useMemo(() => {
    const next: Record<string, StopData> = selectedVehicle?.provider && selectedVehicle.provider !== 'pks'
      ? {}
      : { ...(stopsData || {}) };
    for (const stop of routeStopsSource) {
      if (selectedVehicle?.provider === 'pkp_intercity' ? Number.isFinite(stop.lat) && Number.isFinite(stop.lon) : readBusCoordinates(stop.lat,stop.lon)) {
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
      if (!stop || (selectedVehicle?.provider === 'pkp_intercity' ? !Number.isFinite(stop.lat) || !Number.isFinite(stop.lon) : !readBusCoordinates(stop.lat,stop.lon))) continue;
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
  const routeHaloOpts = useMemo<L.PolylineOptions>(() => ({ pane: 'routeLinePane', color: '#f8fafc', weight: 11, opacity: 0.5, lineCap: 'round', lineJoin: 'round', noClip: false, smoothFactor: 0 }), []);
  const routeGlowOpts = useMemo<L.PolylineOptions>(() => ({ pane: 'routeLinePane', color: '#020617', weight: 7.5, opacity: 0.58, lineCap: 'round', lineJoin: 'round', noClip: false, smoothFactor: 0 }), []);
  const routePolylineOpts = useMemo<L.PolylineOptions>(() => ({ className: 'mks-route-line', pane: 'routeLinePane', color: selectedRouteColor, weight: 5.5, opacity: 0.98, lineCap: 'round', lineJoin: 'round', noClip: false, smoothFactor: 0 }), [selectedRouteColor]);
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
    ? routeGeometryKey(routeMode, selectedVehicle.provider || 'pks', routeLine, routeDirection, routeGeometryStops)
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

    const suppliedGeometry = selectedVehicle.routeGeometry;
    if (suppliedGeometry && suppliedGeometry.length > 1 && roadRouteMatchesStops(suppliedGeometry, routeGeometryStops.map(stop => [stop.lat, stop.lon]), 180)) {
      setSnappedRoute(simplifyRouteForPaint(suppliedGeometry));
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
      if (localRoute.length > 1 && (routeMode === 'rail' || roadRouteMatchesStops(localRoute, routeGeometryStops.map(stop => [stop.lat,stop.lon]), 180))) {
        const refinedLocalRoute = simplifyRouteForPaint(routeMode === 'road' ? cleanRoadJunctionLoops(localRoute,routeGeometryStops.map(stop=>[stop.lat,stop.lon])) : localRoute);
        refinedRouteCacheRef.current.set(routeKey, refinedLocalRoute);
        refinedRouteByVehicleRef.current.set(currentIdentity, refinedLocalRoute);
        setSnappedRoute(refinedLocalRoute);
        return;
      }

      const officialRoute = routeMode === 'road'
        ? selectedVehicle.provider==='marcel'
          ? await bundledMarcelRoute(routeGeometryStops.map(stop=>[stop.lat,stop.lon]))
          : await officialBusRoute(selectedVehicle.provider||'pks',selectedVehicle.tripId||selectedVehicle.journeyId,routeStopIds,routeGeometryStops.map(stop => [stop.lat,stop.lon])).catch(()=>[])
        : [];
      if (cancelled || requestId !== activeRouteRequestIdRef.current || controller.signal.aborted) return;
      if (officialRoute.length > 1) {
        const refinedOfficialRoute = simplifyRouteForPaint(cleanRoadJunctionLoops(officialRoute,routeGeometryStops.map(stop=>[stop.lat,stop.lon])));
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
          const refinedRoute = simplifyRouteForPaint(routeMode === 'road' ? cleanRoadJunctionLoops(points,routeGeometryStops.map(stop=>[stop.lat,stop.lon])) : points);
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
  }, [routeKey, routeStopsHash, selectedVehicle?.provider, selectedVehicle?.id, selectedVehicle?.routeGeometry]); // eslint-disable-line react-hooks/exhaustive-deps

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

        .map-catalog-stop {background:transparent;border:0;display:flex;align-items:center;justify-content:center;}
        .map-stop-ring {display:flex;align-items:center;justify-content:center;width:26px;height:26px;border:2px solid var(--stop-color);border-radius:50%;color:#fff;background:var(--stop-color);box-shadow:0 1px 5px #0006;transition:transform .24s ease,box-shadow .24s ease,background .24s ease;}
        .map-stop-ring.is-selected {transform:scale(1.28);background:var(--stop-color);box-shadow:0 0 0 5px color-mix(in srgb,var(--stop-color) 22%,transparent),0 0 18px var(--stop-color);animation:map-stop-select .42s ease-out;}
        @keyframes map-stop-select {from {transform:scale(.9);box-shadow:0 0 0 0 transparent;}to {transform:scale(1.28);}}
        @media(prefers-reduced-motion:reduce){.map-stop-ring,.map-stop-ring.is-selected{transition:none;animation:none;}}
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
          attribution='Map tiles by Google · Stop platforms © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
          url="https://mt1.google.com/vt/lyrs=m&hl=pl&gl=PL&x={x}&y={y}&z={z}"
          maxZoom={19}
        />

        <SelectedStopPin rail={selectedVehicle?.provider==='pkp_intercity'} id={highlightedStopId} catalogId={selectedCatalogStopId} point={highlightedStopId?routeStopsData[highlightedStopId]:undefined} stops={mapStops} color={themeColor}/>
        {mapStops.length>0 && <CatalogStopsLayer stops={mapStops} selected={selectedCatalogStopId} onSelect={onMapStopClick}/>}

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

import 'leaflet/dist/leaflet.css';

export type {StopSchedule} from '@/lib/transport/vehicle';
export type {Vehicle} from '@/lib/transport/vehicle';
export type {StopData} from '@/lib/transport/vehicle';

export {getCachedBusIcon} from '@/components/map/vehicle-icons';
import {BusMarker} from '@/components/map/VehicleMarkers';
