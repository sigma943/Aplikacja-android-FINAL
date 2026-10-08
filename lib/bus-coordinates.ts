/** Coordinates from the local bus providers. Missing values must never become 0,0. */
export function readBusCoordinates(latitude: unknown, longitude: unknown): {lat: number; lon: number} | null {
  const number = (value: unknown) => {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string' || !value.trim()) return NaN;
    return Number(value.trim().replace(',', '.'));
  };
  const lat = number(latitude), lon = number(longitude);
  // Covers the service area and Poland, including border services. Do not use for rail.
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 48 && lat <= 56 && lon >= 14 && lon <= 25
    ? {lat, lon} : null;
}

export function sanitizeBusStop<T extends {lat?: number; lon?: number}>(stop: T): T {
  const point = readBusCoordinates(stop.lat, stop.lon);
  if (point) return {...stop, ...point};
  if (stop.lat === undefined && stop.lon === undefined) return stop;
  return {...stop, lat: undefined, lon: undefined};
}
