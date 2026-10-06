/** Use the same full-minute threshold for the punctuality card and stop times. */
export function busPunctuality(delaySeconds: number, onTimeColor = 'text-white') {
  const delay = Number.isFinite(delaySeconds) && Math.abs(delaySeconds) <= 18_000 ? delaySeconds : 0;
  const minutes = Math.floor(Math.abs(delay) / 60);
  const status = minutes === 0 ? 'on_time' : delay < 0 ? 'early' : 'delayed';
  const colorClass = status === 'on_time' ? onTimeColor : status === 'early' ? 'text-emerald-500' : 'text-rose-500';
  return { minutes, status, colorClass };
}
