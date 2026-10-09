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
  // In the SIP/myBus feed `is` is not GPS age (waiting rows carry departure countdowns).
  // With no GPS timestamp the position is dated by the successful feed observation.
  if (raw.feedSource === 'mybus') return now;
  const seconds = Number(raw.is);
  return now - (Number.isFinite(seconds) ? Math.max(0, seconds) : 0) * 1000;
}

/** Blank padded fields must not mask the next course at a terminus. */
export function mpkFirstText(...values: unknown[]): string {
  return values.map(value => String(value ?? '').trim()).find(Boolean) || '';
}

/** Only explicit waiting states can use the next-course countdown. Never use driving delay. */
export function mpkMybusDepartureTime(
  raw: Record<string, string>, now: number,
  stops: {isPast?: boolean; planned?: string | null; real?: string | null}[] = [],
): number | undefined {
  if (raw.feedSource !== 'mybus' || !['6', '7'].includes(raw.s)) return undefined;
  const countdown = Number(raw.is);
  if (Number(raw.nk) > 0 && countdown > 0 && countdown <= 48 * 3600 && countdown === Number(raw.o)) {
    return now + countdown * 1000;
  }
  // A live timetable can supply the first departure even when the compact feed cannot.
  const first = stops[0];
  if (!first || first.isPast) return undefined;
  const departure = Date.parse(first.real || first.planned || '');
  return Number.isFinite(departure) && departure > now && departure <= now + 48 * 3600_000 ? departure : undefined;
}

function mybusWaiting(raw: Record<string, string>): boolean {
  return raw.feedSource === 'mybus' && ['6', '7'].includes(raw.s) && Number(raw.nk) > 0;
}
export function mpkVehicleLine(raw: Record<string, string>, detailLine?: unknown): string {
  return mybusWaiting(raw) ? mpkFirstText(raw.nnr, raw.nr, detailLine) : mpkFirstText(raw.nr, raw.nnr, detailLine);
}
export function mpkVehicleDirection(raw: Record<string, string>, detailDirection?: unknown): string {
  return mybusWaiting(raw) ? mpkFirstText(raw.nop, raw.op, detailDirection) : mpkFirstText(raw.op, detailDirection, raw.nop);
}
/** SIP course identity changes at departure even when the brigade stays the same. */
export function mpkMybusCourseId(raw: Record<string, string>): string | undefined {
  if (raw.feedSource !== 'mybus') return undefined;
  const id = mybusWaiting(raw) ? raw.nk : raw.ik;
  return Number(id) > 0 ? id : undefined;
}
