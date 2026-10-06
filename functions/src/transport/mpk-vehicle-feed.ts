/** Current MPK position feed is JSON keyed by fleet number; `is` is not GPS age. */
export function mpkFeedVehicles(payload: unknown): Record<string, string>[] {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid MPK vehicle feed');
  const rows = Array.isArray(payload) ? payload : Object.values(payload);
  return rows.filter(row => row && typeof row === 'object' && 'x' in row && 'y' in row)
    .map(row => Object.fromEntries(Object.entries(row).filter(([,value]) => value !== null && typeof value !== 'object')
      .map(([key,value]) => [key,String(value)])));
}

export function mpkSignalTime(raw: Record<string, string>, now: number) {
  const timestamp = Number(raw.timestamp);
  if (Number.isFinite(timestamp) && timestamp > 0) return timestamp > 1e12 ? timestamp : timestamp * 1000;
  const seconds = Number(raw.is);
  return now - (Number.isFinite(seconds) ? Math.max(0, seconds) : 0) * 1000;
}
