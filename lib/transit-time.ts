const WARSAW = 'Europe/Warsaw';
const wallFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: WARSAW, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const clockFormatter = new Intl.DateTimeFormat('pl-PL', {timeZone: WARSAW, hour: '2-digit', minute: '2-digit'});
const dateFormatter = new Intl.DateTimeFormat('en-CA', {timeZone: WARSAW});
export function warsawClock(ms: number) { return clockFormatter.format(ms); }
const wallTimeCache = new Map<string, number>();

export function warsawDateIso(dayOffset = 0, now = new Date()) {
  const today = dateFormatter.format(now);
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

/** GTFS hours can exceed 23: 25:10 belongs to the next calendar day. */
export function warsawTimeMs(dateIso: string, time: unknown): number {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(time ?? '').trim());
  if (!match || Number(match[2]) > 59 || Number(match[3] || 0) > 59) return NaN;
  const cacheKey = dateIso + ':' + match[0];
  if (wallTimeCache.has(cacheKey)) return wallTimeCache.get(cacheKey)!;
  const wall = new Date(`${dateIso}T00:00:00Z`);
  if (!Number.isFinite(wall.getTime())) return NaN;
  wall.setUTCHours(Number(match[1]), Number(match[2]), Number(match[3] || 0), 0);
  const target = wall.getTime();
  let result = target;
  for (let i = 0; i < 3; i++) {
    const parts = wallFormatter.formatToParts(new Date(result));
    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const rendered = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'), read('second'));
    const adjustment = target - rendered;
    result += adjustment;
    if (!adjustment) break;
  }
  if (wallTimeCache.size >= 4096) wallTimeCache.delete(wallTimeCache.keys().next().value!);
  wallTimeCache.set(cacheKey, result);
  return result;
}
