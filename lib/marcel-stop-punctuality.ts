import type { Departure } from '@/Panel/src/types';
import type { Vehicle } from '@/components/BusMap';
import { warsawClock, warsawDateIso } from './transit-time';
import { withCachedMarcelDelay } from './pks-client';
import { busDelayMinutes } from './bus-punctuality';

/** Use the map's GPS estimate only for the same course and scheduled date. */
export function marcelDepartureFromVehicle(departure: Departure, vehicles: Vehicle[]): Departure {
  if (departure.carrier?.id !== 'marcel' || !departure.courseId || departure.plannedAtMs == null) return departure;
  // A freshly fetched stop estimate or operator prediction must not be replaced
  // by an older vehicle snapshot retained by the map.
  if (departure.realtimeSource && departure.realtimeSource !== 'position-estimate') return departure;
  const plannedAtMs = departure.plannedAtMs;
  const matching = vehicles.find(candidate => candidate.provider === 'marcel' &&
    String(candidate.tripId ?? candidate.journeyId ?? '') === departure.courseId);
  const vehicle = matching ? withCachedMarcelDelay(matching) : undefined;
  if (!vehicle) return departure;
  const candidate = vehicle;
  const usable =
    candidate.provider === 'marcel' &&
    String(candidate.tripId ?? candidate.journeyId ?? '') === departure.courseId &&
    (candidate.status === undefined || candidate.status === 'active') &&
    !candidate.isHistorical &&
    (candidate.dataAgeSec ?? 0) <= 7 * 60 &&
    Number.isFinite(candidate.delay) && Math.abs(candidate.delay!) <= 18_000 &&
    (candidate.positionObservedAtMs ?? 0) >= (departure.realtimeObservedAtMs ?? 0) &&
    ((candidate.routeStops || candidate.schedule || []).some(stop =>
      stop.planned && Date.parse(stop.planned) === plannedAtMs) ||
      (candidate.positionObservedAtMs != null &&
       warsawDateIso(0, new Date(candidate.positionObservedAtMs)) === warsawDateIso(0, new Date(plannedAtMs))));
  if (!usable) return departure;
  const realAtMs = plannedAtMs + vehicle.delay! * 1000;
  const delayMins = busDelayMinutes(vehicle.delay!);
  return {
    ...departure,
    realAtMs,
    time: warsawClock(realAtMs),
    delayMins,
    status: delayMins === 0 ? 'on_time' : 'delayed',
    realtimeSource: 'position-estimate',
    delayEstimated: true,
    realtimeObservedAtMs: vehicle.positionObservedAtMs,
  };
}
