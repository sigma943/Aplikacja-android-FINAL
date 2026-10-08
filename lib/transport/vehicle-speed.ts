

import {type ShapePoint} from '../transport/types';

const vehicleSpeedHistory = new Map<string, { lat: number; lon: number; atMs: number; lastSeenMs: number }>();

function squaredMetersDistanceToSegment(point: ShapePoint, start: ShapePoint, end: ShapePoint) {
  const meanLat = ((point[0] + start[0] + end[0]) / 3) * Math.PI / 180;
  const metersPerLat = 111_320;
  const metersPerLon = Math.cos(meanLat) * 111_320;
  const px = point[1] * metersPerLon;
  const py = point[0] * metersPerLat;
  const ax = start[1] * metersPerLon;
  const ay = start[0] * metersPerLat;
  const bx = end[1] * metersPerLon;
  const by = end[0] * metersPerLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  const distanceSq = (px - cx) * (px - cx) + (py - cy) * (py - cy);
  return { distanceSq, t };
}

function distanceMeters(a: ShapePoint, b: ShapePoint) {
  const meanLat = ((a[0] + b[0]) / 2) * Math.PI / 180;
  const dLat = (a[0] - b[0]) * 111_320;
  const dLon = (a[1] - b[1]) * Math.cos(meanLat) * 111_320;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

function computeObservedSpeedKmh(vehicleKey: string, lat: number, lon: number, observedAtMs: number, rawSpeed?: number) {
  if (Number.isFinite(rawSpeed) && rawSpeed! > 0) {
    vehicleSpeedHistory.set(vehicleKey, { lat, lon, atMs: observedAtMs, lastSeenMs: Date.now() });
    return Math.max(0, rawSpeed!);
  }

  const previous = vehicleSpeedHistory.get(vehicleKey);
  vehicleSpeedHistory.set(vehicleKey, { lat, lon, atMs: observedAtMs, lastSeenMs: Date.now() });

  if (!previous) return Number.isFinite(rawSpeed) ? Math.max(0, rawSpeed!) : undefined;
  const elapsedSec = Math.max(0, (observedAtMs - previous.atMs) / 1000);
  const movedMeters = distanceMeters([lat, lon], [previous.lat, previous.lon]);
  if (elapsedSec < 3 || movedMeters < 8) return Number.isFinite(rawSpeed) ? Math.max(0, rawSpeed!) : 0;

  const speed = (movedMeters / elapsedSec) * 3.6;
  if (!Number.isFinite(speed) || speed > 140) return Number.isFinite(rawSpeed) ? Math.max(0, rawSpeed!) : undefined;

  if (vehicleSpeedHistory.size > 900) {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (const [key, value] of vehicleSpeedHistory) {
      if (value.lastSeenMs < cutoff) vehicleSpeedHistory.delete(key);
    }
  }

  return Math.round(speed);
}

export {vehicleSpeedHistory};
export {squaredMetersDistanceToSegment};
export {distanceMeters};
export {computeObservedSpeedKmh};
