import { warsawDateIso, warsawTimeMs } from './transit-time';
import { transitTimestamp } from './bus-operating-state';

export function finiteDelay(value: unknown): number | undefined {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return undefined;
  const number = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(number) && Math.abs(number) <= 300 ? number : undefined;
}

/** Explicit predicted time wins over a delay, so the delay is never applied twice. */
export function departureTiming(plannedAtMs: number | undefined, real: unknown, minutes: unknown) {
  const delay = finiteDelay(minutes);
  let actual = NaN;
  if (typeof real === 'string' && real.trim()) {
    if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(real.trim()) && Number.isFinite(plannedAtMs)) {
      const date = warsawDateIso(0, new Date(plannedAtMs!));
      actual = warsawTimeMs(date, real.trim());
      if (actual < plannedAtMs! - 12 * 3600_000) actual = warsawTimeMs(warsawDateIso(1, new Date(plannedAtMs!)), real.trim());
    } else actual = transitTimestamp(real);
  }
  const hasPrediction = Number.isFinite(actual);
  const realAtMs = hasPrediction ? actual : plannedAtMs != null && delay != null ? plannedAtMs + delay * 60_000 : plannedAtMs;
  const delayMins = plannedAtMs != null && realAtMs != null ? Math.round((realAtMs - plannedAtMs) / 60_000) : 0;
  return { realAtMs, delayMins, hasRealtime: hasPrediction || delay != null };
}
