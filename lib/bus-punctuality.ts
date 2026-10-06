/** Round symmetrically, keeping deviations below one minute on time. */
export function busDelayMinutes(delaySeconds: number) {
  const delay = Number.isFinite(delaySeconds) && Math.abs(delaySeconds) <= 18_000 ? delaySeconds : 0;
  if (Math.abs(delay) < 60) return 0;
  return Math.sign(delay) * Math.round(Math.abs(delay) / 60);
}

export function busPunctuality(delaySeconds: number, onTimeColor = 'text-white') {
  const signedMinutes = busDelayMinutes(delaySeconds);
  const minutes = Math.abs(signedMinutes);
  const status = minutes === 0 ? 'on_time' : signedMinutes < 0 ? 'early' : 'delayed';
  const colorClass = status === 'on_time' ? onTimeColor : status === 'early' ? 'text-emerald-500' : 'text-rose-500';
  return { minutes, status, colorClass };
}
