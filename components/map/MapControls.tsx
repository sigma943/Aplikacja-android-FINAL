'use client';

import {useEffect, useCallback} from 'react';
import {useMap, useMapEvents} from 'react-leaflet';
import L from 'leaflet';

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

export {deferMapStorageWrite};
export {MapStateTracker};
export {MapCenterer};
export {MapClickListener};
