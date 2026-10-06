/** Marcel GPS estimates use the same nearest-minute value in every view. */
export function vehicleDelayMinutes(seconds: number | undefined, provider?: string): number {
  if (!Number.isFinite(seconds)) return 0;
  const minutes = provider === 'marcel' ? Math.round(seconds! / 60) : Math.trunc(seconds! / 60);
  return minutes === 0 ? 0 : minutes;
}
