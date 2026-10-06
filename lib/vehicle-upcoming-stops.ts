type Stop = { id: number | string; planned?: string | null; real?: string | null; isPast?: boolean };
/** Keep the ordered suffix after the last passed stop, including repeated stops on loops. */
export function upcomingVehicleStops<T extends Stop>(stops: T[], nowMs: number, lastStopId?: number | string) {
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
