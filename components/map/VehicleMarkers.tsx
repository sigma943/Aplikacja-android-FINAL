'use client';

import {memo, useEffect, useState, useRef, useCallback, useMemo} from 'react';
import {Marker, useMap, useMapEvents} from 'react-leaflet';
import L from 'leaflet';

import {runFrameBatch} from '@/lib/map-frame-batch';

import {busDelayMinutes} from '@/lib/bus-punctuality';
import {subscribeMarcelCourseDelays, warmMarcelBadgeCourses, withCachedMarcelDelay} from '@/lib/pks-client';

import {type Vehicle} from '@/lib/transport/vehicle';
import {getVehicleColor, getMarkerAgeBucket, getCachedBusIcon, getCachedClusterIcon} from '@/components/map/vehicle-icons';

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
    (prevVehicle.delay === undefined) === (nextVehicle.delay === undefined) &&
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
  }, [map, visibleVehicles, viewTick]);

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

export type {BusMarkerProps};
export {BusMarker};
export {VehicleClusterMarker};
export {VehicleMarkerLayer};
