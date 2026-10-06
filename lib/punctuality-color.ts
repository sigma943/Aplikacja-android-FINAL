/** Delay, not remaining waiting time, determines the timetable colour. */
export function punctualityTimeClass(delayMinutes: unknown, onTimeClass = 'text-white'): string {
  const delay = typeof delayMinutes === 'number' ? delayMinutes : Number.NaN;
  return Number.isFinite(delay) && delay > 0 ? 'text-rose-500'
    : Number.isFinite(delay) && delay < 0 ? 'text-emerald-500' : onTimeClass;
}
