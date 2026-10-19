import {roadRouteMatchesStops} from '../bus-road-geometry';

type Point = [number, number];

/** A router can visit every stop and still take the wrong streets between them.
 * Always check the operator's shape before reusing a previously routed fallback.
 * Keep that fallback available when bundled assets cannot be read offline.
 */
export async function preferredLocalRoute(options: {
  mode: 'road' | 'rail';
  stops: Point[];
  bundled: () => Promise<Point[]>;
  cached: () => Promise<Point[]>;
}): Promise<Point[]> {
  const usable = (points: Point[]) => points.length > 1 &&
    (options.mode === 'rail' || roadRouteMatchesStops(points, options.stops, 180));
  const bundled = await options.bundled().catch(() => []);
  if (usable(bundled)) return bundled;
  const cached = await options.cached().catch(() => []);
  return usable(cached) ? cached : [];
}
