import type { Departure } from '@/Panel/src/types';
import type { Vehicle } from '@/components/BusMap';
import { busDelayMinutes } from './bus-punctuality';

/** Use the map's GPS estimate only for the same course and scheduled date. */
export function marcelDepartureFromVehicle(departure: Departure, vehicles: Vehicle[]): Departure {
  if (departure.carrier?.id !== 'marcel' || !departure.courseId || departure.plannedAtMs == null) return departure;
  // A freshly fetched stop estimate or operator prediction must not be replaced
  // by an older vehicle snapshot retained by the map.
  if (departure.realtimeSource && departure.realtimeSource !== 'position-estimate') return departure;
  const plannedAtMs = departure.plannedAtMs;
  const vehicle = vehicles.find(candidate =>
    candidate.provider === 'marcel' &&
    String(candidate.tripId ?? candidate.journeyId ?? '') === departure.courseId &&
    (candidate.status === undefined || candidate.status === 'active') &&
    !candidate.isHistorical &&
    (candidate.dataAgeSec ?? 0) <= 7 * 60 &&
    Number.isFinite(candidate.delay) && Math.abs(candidate.delay!) <= 18_000 &&
    (candidate.routeStops || candidate.schedule || []).some(stop =>
      stop.planned && Date.parse(stop.planned) === plannedAtMs),
  );
  if (!vehicle) return departure;
  const realAtMs = plannedAtMs + vehicle.delay! * 1000;
  const delayMins = busDelayMinutes(vehicle.delay!);
  return {
    ...departure,
    realAtMs,
    time: new Date(realAtMs).toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' }),
    delayMins,
    status: delayMins === 0 ? 'on_time' : 'delayed',
    realtimeSource: 'position-estimate',
  };
}
