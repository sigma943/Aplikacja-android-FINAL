'use client';
import {bundledMarcelRoute} from '@/lib/marcel-route-assets';
import {correctMarcelNiebylecRoute} from '@/lib/marcel-niebylec-route';
import {correctPksStationJunction} from '@/lib/pks-station-junction';

import {readBusCoordinates} from '@/lib/bus-coordinates';
import {loadStopPlatforms} from '@/lib/stop-platform-position';

import {memo, startTransition, useEffect, useState, useRef, useCallback, useMemo} from 'react';
import {MapContainer, TileLayer, ZoomControl, Pane} from 'react-leaflet';
import RouteLines from './map/RouteLines';
import {timedVehicleStops,upcomingTimedVehicleStops} from '@/lib/vehicle-stop-timing';
import type {Stop} from '@/Panel/src/types';
import {canonicalMapStopId, mapStopColor, routeCatalogStopIds} from '@/lib/map-stop-markers';

import {routeGeometryKey} from '@/lib/route-geometry-key';
import {officialBusRoute,officialBusStopPoints} from '@/lib/official-bus-routes';
import {mpkRouteForPaint} from '@/lib/map/mpk-route-paint';
import {roadRouteMatchesStops, cleanRoadJunctionLoops, validRoadPoint} from '@/lib/bus-road-geometry';

import {withRequestDeadline} from '@/lib/request-deadline';
import {loadRouteWithRetry} from '@/lib/route-load-retry';

import {fetchRouteGeometryClient, type RouteGeometryStop} from '@/lib/pks-client';

import {type Vehicle, type StopData} from '@/lib/transport/vehicle';
import {readPersistentRouteGeometry, writePersistentRouteGeometry} from '@/lib/map/route-cache';
import {preferredLocalRoute} from '@/lib/map/preferred-route';
import {simplifyRouteForPaint, dedupeStableStopIds, normalizeRouteCachePart, hashRouteGeometryStops} from '@/lib/map/route-presentation';
import {getVehicleColor} from '@/components/map/vehicle-icons';
import {MapSizeSync, MapStateTracker, MapCenterer, MapClickListener} from '@/components/map/MapControls';
import {VehicleMarkerLayer} from '@/components/map/VehicleMarkers';
import {SelectedStopPin, CatalogStopsLayer, RouteStopsLayer} from '@/components/map/StopLayers';

const EMPTY_ROUTE_POINTS:[number,number][]=[];

const ROAD_ROUTE_GEOMETRY_CACHE_VERSION = 'road-v16-complete-course-recovery';

const RAIL_ROUTE_GEOMETRY_CACHE_VERSION = 'rail-v1';

interface BusMapProps {
  onReady?:()=>void;
  active?:boolean;
  clockMs?:number;
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

function BusMap({
  onReady,
  active=true,
  clockMs,
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
  const [platformRevision,setPlatformRevision]=useState(0);
  const needsPlatforms=mapStops.length>0||Boolean((selectedVehicle||highlightedStopId)&&selectedVehicle?.provider!=='pkp_intercity');
  useEffect(()=>{
    if(!needsPlatforms)return;
    let active=true;
    void loadStopPlatforms().then(()=>{if(active)setPlatformRevision(v=>v+1);});
    return()=>{active=false;};
  },[needsPlatforms]);
  const [routeError,setRouteError]=useState(''),[routeAttempt,setRouteAttempt]=useState(0);
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
          ...next[String(stop.id)],
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
  }, [selectedVehicle?.routePath,selectedVehicle?.routeStops,selectedVehicle?.schedule]);
  const visibleRouteStopIds = selectedVehicle?.type === 'train' || selectedVehicle?.provider === 'pkp_intercity'
    ? routeStopIds
    : selectedVehicle ? upcomingTimedVehicleStops(selectedVehicle, clockMs||Date.now()).map(stop => String(stop.id)) : [];
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
  // Selected details contain punctuality before the background fleet cache warms.
  const markerVehicles = useMemo(() => vehicles.map(vehicle =>
    selectedVehicle?.provider === vehicle.provider && selectedVehicle?.id === vehicle.id &&
    vehicle.delay === undefined && Number.isFinite(selectedVehicle.delay)
      ? { ...vehicle, delay: selectedVehicle.delay } : vehicle),
  [vehicles, selectedVehicle?.provider, selectedVehicle?.id, selectedVehicle?.delay]);
  const routeStopsHash = useMemo(() => hashRouteGeometryStops(routeGeometryStops), [routeGeometryStops]);
  const routeCoordinatesKey=useMemo(()=>JSON.stringify(routeGeometryStops.map(stop=>[stop.id,stop.lat,stop.lon])),[routeGeometryStops]);
  const selectedRouteColor = getVehicleColor(selectedVehicle);
  const highlightedStop = highlightedStopId ? routeStopsData[highlightedStopId] : undefined;
  const selectedCatalogStopId=canonicalMapStopId(mapStops,highlightedStopId,selectedVehicle?.provider,highlightedStop);
  const routeCatalogIds=useMemo(()=>selectedVehicle?routeCatalogStopIds(mapStops,visibleRouteStopIds,routeStopsData,selectedVehicle.provider):new Set<string>(),[mapStops,visibleRouteStopIdsKey,routeStopsData,selectedVehicle?.provider,Boolean(selectedVehicle),platformRevision]);
  const selectedStopColor = selectedVehicle?.provider === 'pkp_intercity' ? themeColor
    : selectedVehicle ? selectedRouteColor
    : highlightedStop ? mapStopColor({name: highlightedStop.n}) : themeColor;
  const routeLine = normalizeRouteCachePart(selectedVehicle?.routeShortName || selectedVehicle?.routeId || selectedVehicle?.name || '');
  const routeDirection = normalizeRouteCachePart(
    selectedVehicle?.direction ||
    routeGeometryStops[routeGeometryStops.length - 1]?.name ||
    selectedVehicle?.routeId ||
    '',
  );
  const routeMode = selectedVehicle?.provider === 'pkp_intercity' ? 'rail' : 'road';
  const routeGeometryVersion = routeMode === 'rail' ? RAIL_ROUTE_GEOMETRY_CACHE_VERSION : ROAD_ROUTE_GEOMETRY_CACHE_VERSION;
  const routeVariant=String(selectedVehicle?.tripId || selectedVehicle?.journeyId || selectedVehicle?.serviceId || selectedVehicle?.brigadeName || selectedVehicle?.routeId || 'default');
  const routeKey = useMemo(()=>selectedVehicle
    ? routeGeometryKey(routeMode, selectedVehicle.provider || 'pks', routeLine, routeDirection, routeGeometryStops,routeVariant)
    : '',[Boolean(selectedVehicle),routeMode,selectedVehicle?.provider,routeLine,routeDirection,routeCoordinatesKey,routeVariant]);
  // Both the rendered identity and persisted geometry distinguish courses.
  const routeCourse = String(selectedVehicle?.tripId || selectedVehicle?.journeyId || '');
  const routeIdentity=selectedVehicle?`${selectedVehicle.provider||'pks'}:${selectedVehicle.id}:${routeKey}:${routeCourse}`:'';
  const suppliedRouteKey=useMemo(()=>JSON.stringify(selectedVehicle?.routeGeometry||[]),[selectedVehicle?.routeGeometry]);
  const currentGeometry=selectedVehicle&&selectedVehicleIdentityRef.current===routeIdentity?snappedRoute:EMPTY_ROUTE_POINTS;
  const [mpkShapePins,setMpkShapePins]=useState<Array<[number,number]>>([]);
  useEffect(()=>{
    if(selectedVehicle?.provider!=='mpk_rzeszow')return;
    let active=true;
    void officialBusStopPoints('mpk_rzeszow').then(pins=>{if(active)setMpkShapePins(pins);}).catch(()=>{});
    return()=>{active=false;};
  },[selectedVehicle?.provider]);
  const paintedGeometry=useMemo(()=>mpkRouteForPaint(currentGeometry,selectedVehicle?.provider,[...mpkShapePins,...routeGeometryStops.map(stop=>[stop.lat,stop.lon] as [number,number])]),[currentGeometry,selectedVehicle?.provider,mpkShapePins,routeCoordinatesKey]);


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

    setRouteError('');
    const currentIdentity = routeIdentity;
    if (selectedVehicleIdentityRef.current && selectedVehicleIdentityRef.current !== currentIdentity) {
      startTransition(() => setSnappedRoute([]));
    }
    selectedVehicleIdentityRef.current = currentIdentity;
    // Preserve a previously validated course while a refresh recovers offline.
    const previousCourse=refinedRouteByVehicleRef.current.get(currentIdentity);
    if(previousCourse?.length)startTransition(()=>setSnappedRoute(previousCourse));

    const suppliedGeometry=selectedVehicle.routeGeometry;
    if(suppliedGeometry&&suppliedGeometry.length>1&&suppliedGeometry.every(validRoadPoint)&&(routeGeometryStops.length<2||roadRouteMatchesStops(suppliedGeometry,routeGeometryStops.map(s=>[s.lat,s.lon]),180))){
      setSnappedRoute(simplifyRouteForPaint(correctPksStationJunction(correctMarcelNiebylecRoute(suppliedGeometry,selectedVehicle.provider),selectedVehicle.provider)));return;
    }
    if(routeGeometryStops.length<2){startTransition(()=>setSnappedRoute([]));return;}

    let cancelled = false;
    const controller = new AbortController();
    routeAbortRef.current = controller;

    const loadRoute = async () => {
      const loadBundledRoute = async()=>routeMode === 'road'
        ? selectedVehicle.provider==='marcel'
          ? await bundledMarcelRoute(routeGeometryStops.map(stop=>[stop.lat,stop.lon])).catch(()=>[])
          : await officialBusRoute(selectedVehicle.provider||'pks',selectedVehicle.tripId||selectedVehicle.journeyId,routeStopIds,routeGeometryStops.map(stop => [stop.lat,stop.lon]),{completePattern:!!selectedVehicle.routePath?.length,coordinateStopIds:routeGeometryStops.map(stop=>stop.id!)}).catch(()=>[])
        : [];
      const localRoute = await preferredLocalRoute({
        mode: routeMode,
        stops: routeGeometryStops.map(stop => [stop.lat, stop.lon]),
        bundled: loadBundledRoute,
        cached: async () => refinedRouteCacheRef.current.get(routeKey) ||
          await readPersistentRouteGeometry(routeKey, routeGeometryVersion),
      });
      if (cancelled || requestId !== activeRouteRequestIdRef.current || controller.signal.aborted) return;
      if (localRoute.length > 1) {
        const refinedLocalRoute = simplifyRouteForPaint(routeMode === 'road' ? cleanRoadJunctionLoops(correctPksStationJunction(correctMarcelNiebylecRoute(localRoute,selectedVehicle.provider),selectedVehicle.provider),routeGeometryStops.map(stop=>[stop.lat,stop.lon])) : localRoute);
        refinedRouteCacheRef.current.set(routeKey, refinedLocalRoute);
        refinedRouteByVehicleRef.current.set(currentIdentity, refinedLocalRoute);
        writePersistentRouteGeometry(routeKey, refinedLocalRoute, routeGeometryVersion);
        startTransition(() => setSnappedRoute(refinedLocalRoute));
        return;
      }

      const response = await loadRouteWithRetry(async() => {
        // A temporary local asset read failure must not permanently lock us into remote routing.
        const recovered=await loadBundledRoute();
        if(recovered.length>1)return {geometry:{type:'LineString' as const,coordinates:recovered.map(([lat,lon])=>[lon,lat] as [number,number])},cacheKey:''};
        return fetchRouteGeometryClient({
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
      }, { signal: controller.signal });}, controller.signal, [1000, 3000], {
        keepRetrying: false,
        isUsable: response => (response.geometry?.coordinates || [])
          .filter(([lon, lat]) => Number.isFinite(lat) && Number.isFinite(lon)).length > 1,
      });
      if (cancelled || requestId !== activeRouteRequestIdRef.current || controller.signal.aborted) return;
        const points = (response.geometry?.coordinates || [])
          .map(([lon, lat]) => [lat, lon] as [number, number])
          .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
        if (points.length > 1) {
          const refinedRoute = simplifyRouteForPaint(routeMode === 'road' ? cleanRoadJunctionLoops(correctPksStationJunction(correctMarcelNiebylecRoute(points,selectedVehicle.provider),selectedVehicle.provider),routeGeometryStops.map(stop=>[stop.lat,stop.lon])) : points);
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

    withRequestDeadline(()=>loadRoute(),controller.signal,75000).catch((error) => {
      if (requestId !== activeRouteRequestIdRef.current || controller.signal.aborted) return;
      // Keep any valid geometry and make failure recoverable without reselection.
      setRouteError(currentIdentity);controller.abort();
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [routeAttempt,routeKey, routeStopsHash, routeCourse, selectedVehicle?.provider, selectedVehicle?.id, suppliedRouteKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>{
    if(routeError!==routeIdentity||!selectedVehicle||currentGeometry.length>1)return;
    const retry=()=>setRouteAttempt(value=>value+1);
    const timer=setTimeout(retry,15000);window.addEventListener('online',retry);
    return()=>{clearTimeout(timer);window.removeEventListener('online',retry);};
  },[routeError,routeIdentity,routeAttempt,currentGeometry.length,Boolean(selectedVehicle)]);

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
        whenReady={onReady}
        center={initMapState.center}
        zoom={initMapState.zoom}
        scrollWheelZoom={true}
        preferCanvas={true}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <MapSizeSync active={active}/>
        <MapStateTracker onInteraction={handleInteraction} onViewportChange={onViewportChange} />
        <MapClickListener onClick={onMapClick} />
        <MapCenterer center={forcedCenter} onComplete={onCenterComplete} />
        <ZoomControl position="bottomright" />
        <TileLayer
          attribution='Map tiles by Google · Stop platforms © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
          url="https://mt1.google.com/vt/lyrs=m&hl=pl&gl=PL&x={x}&y={y}&z={z}"
          maxZoom={19}
        />

        <SelectedStopPin rail={selectedVehicle?.provider==='pkp_intercity'} id={highlightedStopId} catalogId={selectedCatalogStopId} point={highlightedStop} alignToCatalog={selectedVehicle?.provider!=='pkp_intercity'} stops={mapStops} color={selectedStopColor}/>
        {mapStops.length>0 && <CatalogStopsLayer stops={mapStops} routeStopIds={routeCatalogIds} selected={selectedCatalogStopId} selectedColor={selectedVehicle?selectedStopColor:undefined} onSelect={onMapStopClick}/>}

        {/* Draw Route Line */}
        <Pane name="routeLinePane" style={{ zIndex: 430 }}>
          <RouteLines positions={paintedGeometry} identity={`${selectedVehicleId}:${routeKey}`} color={selectedRouteColor}/>
        </Pane>

        {/* Draw Route Stops */}
        <Pane name="routeStopsPane" style={{ zIndex: 470 }}>
          {selectedVehicle && (
            <RouteStopsLayer
              selectedVehicle={selectedVehicle}
              stopsData={routeStopsData}
              catalogStops={mapStops}
              stopIds={visibleRouteStopIds}
              highlightedStopId={highlightedStopId}
              catalogSelected={selectedCatalogStopId}
              selectedRouteColor={themeColor}
              onStopClick={onStopClick}
            />
          )}
        </Pane>

        <VehicleMarkerLayer
          active={active}
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

export default memo(BusMap);
