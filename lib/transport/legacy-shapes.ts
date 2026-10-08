

import {type ShapePoint, type ShapeMetadata} from '../transport/types';
import {distanceMeters} from '../transport/vehicle-speed';
import {fetchRoadRouteForStops} from '../transport/road-routing';

let shapeIndexPromise: Promise<Record<string, string>> | null = null;

let routeStopShapeIndexPromise: Promise<Record<string, string>> | null = null;

let routeShapeMetadataPromise: Promise<ShapeMetadata[]> | null = null;

const shapePointsCache = new Map<string, Promise<ShapePoint[]>>();

async function loadShapeIndex() {
  if (!shapeIndexPromise) {
    shapeIndexPromise = fetch('/data/trip-shape-index.json', {cache: 'force-cache'}).then((res) => res.json());
  }
  return shapeIndexPromise;
}

async function loadRouteStopShapeIndex() {
  if (!routeStopShapeIndexPromise) {
    routeStopShapeIndexPromise = fetch('/data/route-stop-shape-index.json', {cache: 'force-cache'})
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}));
  }
  return routeStopShapeIndexPromise;
}

async function loadRouteShapeMetadata() {
  if (!routeShapeMetadataPromise) {
    routeShapeMetadataPromise = fetch('/data/route-shape-metadata.json', {cache: 'force-cache'})
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => []);
  }
  return routeShapeMetadataPromise;
}

function safeShapeId(shapeId: string) {
  return String(shapeId || '').trim().replace(/[^a-zA-Z0-9_.+-]/g, '_');
}

async function loadShapePoints(shapeId: string) {
  const safeId = safeShapeId(shapeId);
  if (!safeId) return [];
  if (!shapePointsCache.has(safeId)) {
    shapePointsCache.set(
      safeId,
      fetch(`/data/route-shapes/${encodeURIComponent(safeId)}.json`, {cache: 'force-cache'})
        .then((res) => (res.ok ? res.json() : []))
        .catch(() => []),
    );
  }
  return shapePointsCache.get(safeId)!;
}

function nearestDistanceSq(point: ShapePoint, samples: ShapePoint[]) {
  let best = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    const dLat = point[0] - sample[0];
    const dLon = point[1] - sample[1];
    const d = dLat * dLat + dLon * dLon;
    if (d < best) best = d;
  }
  return best;
}

function findBestShapeByStops(stops: ShapePoint[], metadata: ShapeMetadata[]) {
  if (stops.length < 2 || metadata.length === 0) return '';
  const minStopLat = Math.min(...stops.map(([lat]) => lat));
  const maxStopLat = Math.max(...stops.map(([lat]) => lat));
  const minStopLon = Math.min(...stops.map(([, lon]) => lon));
  const maxStopLon = Math.max(...stops.map(([, lon]) => lon));
  const pad = 0.035;
  const maxAvgDistanceSq = 0.0000045; // roughly 200-250m around Rzeszow.

  let bestId = '';
  let bestScore = Number.POSITIVE_INFINITY;

  for (const shape of metadata) {
    const [minLat, minLon, maxLat, maxLon] = shape.bbox;
    if (maxLat + pad < minStopLat || minLat - pad > maxStopLat || maxLon + pad < minStopLon || minLon - pad > maxStopLon) {
      continue;
    }

    let total = 0;
    let worst = 0;
    for (const stop of stops) {
      const d = nearestDistanceSq(stop, shape.samples);
      total += d;
      if (d > worst) worst = d;
    }
    const avg = total / stops.length;
    const score = avg + worst * 0.45;
    if (avg <= maxAvgDistanceSq && score < bestScore) {
      bestScore = score;
      bestId = shape.id;
    }
  }

  return bestId;
}

function routeLengthMeters(points: ShapePoint[]) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distanceMeters(points[index - 1], points[index]);
  }
  return total;
}

function maxDeviationFromChordMeters(points: ShapePoint[], start: ShapePoint, end: ShapePoint) {
  if (points.length <= 2) return 0;
  const meanLat = ((start[0] + start[0] + end[0]) / 3) * Math.PI / 180;
  const metersPerLat = 111_320;
  const metersPerLon = Math.cos(meanLat) * 111_320;
  const ax = start[1] * metersPerLon;
  const ay = start[0] * metersPerLat;
  const bx = end[1] * metersPerLon;
  const by = end[0] * metersPerLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let maxDistanceSq = 0;

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const px = point[1] * metersPerLon;
    const py = point[0] * metersPerLat;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
    const cx = ax + dx * t;
    const cy = ay + dy * t;
    const distX = px - cx;
    const distY = py - cy;
    const distanceSq = distX * distX + distY * distY;
    if (distanceSq > maxDistanceSq) maxDistanceSq = distanceSq;
  }

  return Math.sqrt(maxDistanceSq);
}

function collapseHairpins(points: ShapePoint[], options?: { strict?: boolean }) {
  if (points.length < 3) return points;
  const strict = Boolean(options?.strict);
  const closeBacktrackMeters = strict ? 70 : 45;
  const detourRatio = strict ? 3.2 : 4.5;
  const minLegMeters = strict ? 30 : 18;
  const next: ShapePoint[] = [points[0]];

  for (let index = 1; index < points.length - 1; index += 1) {
    const a = next[next.length - 1];
    const b = points[index];
    const c = points[index + 1];
    const ab = distanceMeters(a, b);
    const bc = distanceMeters(b, c);
    const ac = distanceMeters(a, c);
    const via = ab + bc;

    if (ab >= minLegMeters && bc >= minLegMeters && ac <= closeBacktrackMeters && via > ac * detourRatio) {
      continue;
    }

    next.push(b);
  }

  next.push(points[points.length - 1]);
  return next;
}

function collapseLocalLoops(points: ShapePoint[], options?: { strict?: boolean }) {
  if (points.length < 4) return points;
  const strict = Boolean(options?.strict);
  const joinDistanceMeters = strict ? 16 : 10;
  const maxLoopLengthMeters = strict ? 1400 : 800;
  const maxLoopChordMeters = strict ? 210 : 130;
  const result = [...points];

  let index = 0;
  while (index < result.length - 2) {
    let removed = false;
    for (let back = Math.max(0, index - 100); back < index - 1; back += 1) {
      const rejoin = distanceMeters(result[back], result[index]);
      if (rejoin > joinDistanceMeters) continue;

      const loop = result.slice(back, index + 1);
      const loopLength = routeLengthMeters(loop);
      const chord = distanceMeters(loop[0], loop[loop.length - 1]);
      if (loopLength <= maxLoopLengthMeters && chord <= maxLoopChordMeters) {
        result.splice(back + 1, index - back - 1);
        index = Math.max(0, back - 1);
        removed = true;
        break;
      }
    }
    if (!removed) index += 1;
  }

  return result;
}

function createQuickCurvedRoute(coords: ShapePoint[]) {
  const cleanCoords = coords.filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
  if (cleanCoords.length < 2) return [];

  const points: ShapePoint[] = [];
  for (let i = 0; i < cleanCoords.length - 1; i += 1) {
    const prev = cleanCoords[Math.max(0, i - 1)];
    const start = cleanCoords[i];
    const end = cleanCoords[i + 1];
    const next = cleanCoords[Math.min(cleanCoords.length - 1, i + 2)];
    const steps = i === 0 || i === cleanCoords.length - 2 ? 12 : 8;

    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const lat = 0.5 * (
        (2 * start[0]) +
        (-prev[0] + end[0]) * t +
        (2 * prev[0] - 5 * start[0] + 4 * end[0] - next[0]) * t2 +
        (-prev[0] + 3 * start[0] - 3 * end[0] + next[0]) * t3
      );
      const lon = 0.5 * (
        (2 * start[1]) +
        (-prev[1] + end[1]) * t +
        (2 * prev[1] - 5 * start[1] + 4 * end[1] - next[1]) * t2 +
        (-prev[1] + 3 * start[1] - 3 * end[1] + next[1]) * t3
      );
      points.push([lat, lon]);
    }
  }

  points.push(cleanCoords[cleanCoords.length - 1]);
  return points;
}

export async function fetchRouteShapeClient(
  tripId: string,
  fallbackStops: Array<number | string>,
  stopsData?: Record<string, {lat: number; lon: number}> | null,
  options?: {
    fastFallback?: boolean;
    startPoint?: ShapePoint;
    skipOfficialShape?: boolean;
    refineTimeoutMs?: number;
    disableSyntheticFallback?: boolean;
  },
) {
  const tripIdBase = String(tripId || '').trim().split('_')[0];
  const normalizedStops = fallbackStops
    .map((id) => String(id || '').trim())
    .filter(Boolean);

  if (!options?.skipOfficialShape && tripIdBase) {
    try {
      const shapeIndex = await loadShapeIndex();
      const shapeId = shapeIndex?.[tripIdBase];
      const points = shapeId ? await loadShapePoints(shapeId) : [];
      if (points.length > 1) return points;
    } catch {}
  }

  if (!options?.skipOfficialShape && normalizedStops.length > 1) {
    try {
      const stopShapeIndex = await loadRouteStopShapeIndex();
      const shapeId = stopShapeIndex[normalizedStops.join('-')];
      const points = shapeId ? await loadShapePoints(shapeId) : [];
      if (points.length > 1) return points;
    } catch {}
  }

  const stopCoords = normalizedStops
    .map((id) => stopsData?.[id])
    .filter((stop): stop is { lat: number; lon: number } => {
      if (!stop) return false;
      return Number.isFinite(stop.lat) && Number.isFinite(stop.lon);
    })
    .map((stop) => [stop.lat, stop.lon] as ShapePoint);
  const routeCoords = options?.startPoint
    ? [options.startPoint, ...stopCoords].filter(
        ([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon),
      )
    : stopCoords;

  if (options?.fastFallback) {
    const quickRoute = createQuickCurvedRoute(routeCoords);
    if (quickRoute.length > 1) return quickRoute;
  }

  if (stopCoords.length > 1) {
    try {
      const roadRoute = await fetchRoadRouteForStops(stopCoords, normalizedStops.join('-'));
      if (roadRoute.length > 1) return roadRoute;
    } catch {}

    if (!options?.skipOfficialShape) {
      try {
        const shapeId = findBestShapeByStops(stopCoords, await loadRouteShapeMetadata());
        const points = shapeId ? await loadShapePoints(shapeId) : [];
        if (points.length > 1) return points;
      } catch {}
    }

  }
  if (!options?.disableSyntheticFallback) {
    const quickRoute = createQuickCurvedRoute(routeCoords);
    if (quickRoute.length > 1) return quickRoute;
  }
  return [];
}

/** Public adapter stays stable while diagnostics record the final accepted geometry. */

export {shapeIndexPromise};
export {routeStopShapeIndexPromise};
export {routeShapeMetadataPromise};
export {shapePointsCache};
export {loadShapeIndex};
export {loadRouteStopShapeIndex};
export {loadRouteShapeMetadata};
export {safeShapeId};
export {loadShapePoints};
export {nearestDistanceSq};
export {findBestShapeByStops};
export {routeLengthMeters};
export {maxDeviationFromChordMeters};
export {collapseHairpins};
export {collapseLocalLoops};
export {createQuickCurvedRoute};
