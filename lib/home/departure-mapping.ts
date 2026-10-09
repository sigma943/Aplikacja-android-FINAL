
import {warsawDateIso, warsawTimeMs} from '@/lib/transit-time';

const selectedWarsawDateIso = (dayOffset = 0) => {
  return warsawDateIso(dayOffset);
};

const parseTimeOnWarsawDate = (dateIso: string, timeValue: unknown) => {
  return warsawTimeMs(dateIso, timeValue);
};

const normalizeStopKey = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/ł/g, 'l')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*[-/]\s*/g, ' ')
    .replace(/\b(?:rzeszow|przystanek|przyst|autobusowy|autobusowa)\b/g, ' ')
    .replace(/\b\d{1,3}[a-z]?\b$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizePreciseStopKey = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/ł/g, 'l')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^\(\d+[a-z]?\)\s*/i, '')
    .replace(/\s*\((?:\+|-|\/|\s)+\)\s*$/g, '')
    .replace(/\s*[-/]\s*/g, ' ')
    .replace(/\b(?:rzeszow|przystanek|przyst|autobusowy|autobusowa)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const marcelCourseStopKeys = (stop: { nazMi?: unknown; nazPr?: unknown }) =>
  [
    normalizePreciseStopKey([stop.nazMi, stop.nazPr].filter(Boolean).join(' ')),
    normalizePreciseStopKey(stop.nazPr),
    normalizeStopKey([stop.nazMi, stop.nazPr].filter(Boolean).join(' ')),
  ].filter(Boolean);

const mapMpkDepartureToJourney = (entry: Record<string, unknown>, dateIso: string, index: number) => {
  const plannedMs = parseTimeOnWarsawDate(dateIso, entry.departure_time);
  const realMs = parseTimeOnWarsawDate(dateIso, entry.real_departure_time);
  return {
    line_name: String(entry.line || '').trim(),
    route_description: String(entry.trip_headsign || entry.end_stop_name || 'Nieznany kierunek').trim(),
    timetable_time: Number.isFinite(plannedMs) ? new Date(plannedMs).toISOString() : `${dateIso}T${entry.departure_time || '00:00'}`,
    provider_id: 'mpk_rzeszow',
    real_departure_time: Number.isFinite(realMs) ? new Date(realMs).toISOString() : undefined,
    deviation: Number.isFinite(realMs) && Number.isFinite(plannedMs) ? (realMs - plannedMs) / 60_000 : 0,
    vehicle_id: entry.realtime_source === 'stop-board' ? entry.vehicle : undefined,
    realtime_source: entry.realtime_source,
    trip_id: entry.trip_id || entry.block_id || `mpk-${index}`,
  };
};

const mapMarcelDepartureToJourney = (
  course: Record<string, unknown>,
  stop: Record<string, unknown>,
  dateIso: string,
  index: number,
) => {
  const plannedMs = parseTimeOnWarsawDate(dateIso, stop.godz || course.godz);
  const rawDirection = String(course.nazTr || stop.nazTr || 'Marcel').trim();
  const parts = rawDirection.split(/\s*(?:-|>)\s*/).map((part) => part.trim()).filter(Boolean);
  return {
    line_name: 'M',
    route_description: parts.length >= 2 ? parts[parts.length - 1] : rawDirection,
    timetable_time: Number.isFinite(plannedMs) ? new Date(plannedMs).toISOString() : `${dateIso}T${stop.godz || course.godz || '00:00'}`,
    provider_id: 'marcel',
    trip_id: course.idKu || `marcel-${index}`,
  };
};

export {selectedWarsawDateIso};
export {parseTimeOnWarsawDate};
export {normalizeStopKey};
export {normalizePreciseStopKey};
export {marcelCourseStopKeys};
export {mapMpkDepartureToJourney};
export {mapMarcelDepartureToJourney};
