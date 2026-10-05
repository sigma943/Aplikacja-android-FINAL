export interface MpkCalendar {
  calendar: Array<Record<string, string>>;
  exceptions: Array<{ service_id: string; date: string; exception_type: string }>;
}

export function mpkServicesOnDate(calendar: MpkCalendar, dateIso: string): string[] {
  const date = dateIso.replace(/-/g, '');
  const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(`${dateIso}T12:00:00Z`).getUTCDay()];
  const active = new Set(calendar.calendar.filter((row) => row.start_date <= date && row.end_date >= date && row[weekday] === '1').map((row) => row.service_id));
  for (const exception of calendar.exceptions) {
    if (exception.date !== date) continue;
    if (exception.exception_type === '1') active.add(exception.service_id);
    if (exception.exception_type === '2') active.delete(exception.service_id);
  }
  return [...active];
}

export function mpkBoardEntries(payload: unknown) {
  if (!Array.isArray(payload)) throw new Error('Invalid MPK stop board response');
  return payload.filter((row) => row && !row.is_last_stop && row.linia && row.czas_odjazdu).map((row) => ({
    line: String(row.linia), trip_headsign: row.kierunek || row.przystanek_koncowy,
    departure_time: String(row.czas_odjazdu), real_departure_time: row.czas_odjazdu_real || undefined,
    trip_id: row.trip_id, vehicle: row.nb, realtime_source: 'stop-board' as const,
  }));
}
