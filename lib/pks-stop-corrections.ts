import {readBusCoordinates} from './bus-coordinates';
import coordinateOverrides from './pks-coordinate-overrides.json';

type PksStopRecord = {name?: string; n?: string; areaId?: string; code?: string; lat?: number; lon?: number};

// EINFO retains the old D.A. name for ID 1017. It is the same roadside
// platform as ID 11124 / GTFS 71, not the terminal (ID 1018 / GTFS 47).
// Keep both timetable IDs; correct their physical identity before clustering.
const corrections: Record<string, {areaId: string; code: string; name: string; lat: number; lon: number; sourceName: RegExp}> = {
  '1017': {areaId: '650', code: '68', name: 'Boguchwała 68', lat: 49.984905, lon: 21.945443,
    sourceName: /^boguchwala(?: d a)?(?: 68)?$/},
};

export function correctPksStop<T extends PksStopRecord>(stop: T, id: string): T {
  const coordinate = (coordinateOverrides as Record<string, typeof coordinateOverrides['3801']>)[id];
  if (coordinate && stop.areaId === coordinate.areaId && stop.code === coordinate.code) {
    const normalize = (value: string) => value.toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, ' ').trim();
    const name = normalize(String(stop.name ?? stop.n ?? '')).replace(/\s+\d+[a-z]?$/, '');
    const origin = readBusCoordinates(stop.lat, stop.lon);
    const distance = (lat: number, lon: number) => origin ? Math.hypot(origin.lat - lat,
      (origin.lon - lon) * Math.cos(lat * Math.PI / 180)) * 111195 : 0;
    // Reviewed source error only: a reused ID or a newly relocated stop is not corrected.
    if (name === normalize(coordinate.name)
      && Math.min(distance(coordinate.erroneousLat, coordinate.erroneousLon), distance(coordinate.lat, coordinate.lon)) <= 120
      && (stop.lat !== coordinate.lat || stop.lon !== coordinate.lon)) {
      return {...stop, lat: coordinate.lat, lon: coordinate.lon};
    }
  }
  const correction = corrections[id];
  if (!correction || stop.areaId !== correction.areaId || stop.code !== correction.code) return stop;
  const name = String(stop.name ?? stop.n ?? '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, ' ').trim();
  if (!correction.sourceName.test(name)) return stop;
  const origin = readBusCoordinates(stop.lat, stop.lon);
  if (origin) {
    const meters = Math.hypot(origin.lat - correction.lat,
      (origin.lon - correction.lon) * Math.cos(correction.lat * Math.PI / 180)) * 111195;
    if (meters > 120) return stop; // A reused/moved technical ID is not an alias.
  }
  if (stop.lat === correction.lat && stop.lon === correction.lon
    && (!('name' in stop) || stop.name === correction.name)
    && (!('n' in stop) || stop.n === correction.name)) return stop;
  return {...stop, lat: correction.lat, lon: correction.lon,
    ...('name' in stop ? {name: correction.name} : {}),
    ...('n' in stop ? {n: correction.name} : {})};
}
