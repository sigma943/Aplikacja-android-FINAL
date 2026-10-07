type Stop = { id: number | string; planned?: string | null; real?: string | null; isPast?: boolean; name?: string };
/** Deduplicate the same scheduled visit, retaining its chronological occurrence.
 * Different times (including a genuine return on a loop) remain distinct. */
export function orderedVehicleStops<T extends Stop>(stops: T[]): T[] {
  const time = (s: T) => Date.parse(s.planned || s.real || '');
  const key = (s: T) => `${s.name?.trim().toLocaleLowerCase('pl-PL').replace(/\s+/g,' ') || String(s.id)}|${time(s)}`;
  const groups = new Map<string, number[]>();
  stops.forEach((s, i) => {
    if (!Number.isFinite(time(s))) return;
    const k = key(s); groups.set(k, [...(groups.get(k) || []), i]);
  });
  const removed = new Set<number>();
  for (const [k, indices] of groups) {
    if (indices.length < 2) continue;
    const score = (i: number) => {
      let before = i - 1, after = i + 1;
      while (before >= 0 && (key(stops[before]) === k || !Number.isFinite(time(stops[before])))) before--;
      while (after < stops.length && (key(stops[after]) === k || !Number.isFinite(time(stops[after])))) after++;
      const t = time(stops[i]);
      return (before < 0 || time(stops[before]) <= t ? 1 : -2) +
        (after >= stops.length || t <= time(stops[after]) ? 1 : -2);
    };
    const best = indices.reduce((a, b) => score(b) > score(a) ? b : a);
    indices.forEach(i => { if (i !== best) removed.add(i); });
  }
  return stops.filter((_, i) => !removed.has(i));
}
/** Keep the ordered suffix after the last passed stop, including repeated stops on loops. */
export function upcomingVehicleStops<T extends Stop>(stops: T[], nowMs: number, lastStopId?: number | string) {
  stops = orderedVehicleStops(stops);
  let lastPassed = -1;
  for (let index = 0; index < stops.length; index++) {
    const stop = stops[index];
    const time = Date.parse(stop.real || stop.planned || '');
    if (stop.isPast || (Number.isFinite(time) && time < nowMs)) lastPassed = index;
  }
  if (lastStopId != null) {
    // The first occurrence is the passed one; a later return on a loop stays.
    const passed = stops.findIndex(stop => String(stop.id) === String(lastStopId));
    lastPassed = Math.max(lastPassed, passed);
  }
  return stops.slice(lastPassed + 1);
}
