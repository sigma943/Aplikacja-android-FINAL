import type { Departure } from '@/Panel/src/types';

export function departureIsPast(departure: Departure, nowMs: number, fallbackMs: number) {
  const time = departure.realAtMs ?? departure.plannedAtMs ?? fallbackMs;
  if (departure.realtimeSource === 'stop-board') {
    if (departure.boardIsPast === true) return true;
    if (departure.boardAtStop && nowMs - (departure.boardObservedAtMs ?? 0) < 45_000) return false;
  }
  // HH:mm does not mean the bus has left at HH:mm:00.
  const precision = departure.realtimeSource === 'stop-board' ? departure.boardTimePrecisionMs ?? 0 : 0;
  return time + precision < nowMs;
}

export function departureCountdown(departure: Departure, nowMs: number) {
  const time = departure.realAtMs ?? departure.plannedAtMs;
  if (!Number.isFinite(time)) return departure.time;
  const diffMs = time! - nowMs;
  if (diffMs >= 30 * 60_000 || departureIsPast(departure, nowMs, time!)) return departure.time;
  if (diffMs < 60_000) return '<1 min';
  return `${Math.floor(diffMs / 60_000)} min`;
}
