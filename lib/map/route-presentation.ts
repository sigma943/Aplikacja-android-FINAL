
import {simplifyRoadRoute} from '@/lib/bus-road-geometry';

import {type RouteGeometryStop} from '@/lib/pks-client';

const ROUTE_POINT_LIMIT = 5000;

function simplifyRouteForPaint(points: [number, number][], maxPoints = ROUTE_POINT_LIMIT) {
  const cleaned = points.filter(([lat,lon])=>Number.isFinite(lat)&&Number.isFinite(lon));
  if (cleaned.length <= maxPoints) return cleaned;
  return simplifyRoadRoute(cleaned);
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

export {ROUTE_POINT_LIMIT};
export {simplifyRouteForPaint};
export {routePaintDistanceMeters};
export {removeRoutePaintSpikes};
export {dedupeStableStopIds};
export {normalizeRouteCachePart};
export {stableRouteHash};
export {hashRouteGeometryStops};
export {parseScheduleStopMs};
export {isUpcomingScheduleStop};
