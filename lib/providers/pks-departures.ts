

import pksSchoolCalendar from '@/public/data/mpk-service-calendar.json';

import {warsawDateIso, warsawTimeMs} from '../transit-time';

import {mpkServicesOnDate} from '../mpk-departures';

import {requestEinfoJson} from '../transport/http';

function isJourneyRunning(legends: string[], dateIso: string) {
  if (!legends || legends.length === 0) return true;
  const normalizedLegends = legends.map((legend) =>
    String(legend || '')
      .trim()
      .replace('6Ĺ›', '6ś'),
  );
  const dt = new Date(dateIso);
  const day = dt.getUTCDay();
  const month = dt.getUTCMonth() + 1;
  const date = dt.getUTCDate();
  const services = mpkServicesOnDate(pksSchoolCalendar, dateIso);
  if(normalizedLegends.includes('l') && month===12 && date===31) return false;
  const isHoliday = services.includes('4') ||
    (month === 1 && date === 1) || (month === 1 && date === 6) ||
    (month === 5 && date === 1) || (month === 5 && date === 3) ||
    (month === 8 && date === 15) || (month === 11 && date === 1) ||
    (month === 11 && date === 11) || (month === 12 && date === 25) ||
    (month === 12 && date === 26);
  const isSundayOrHoliday = day === 0 || isHoliday;
  const isWeekendOrHoliday = day === 0 || day === 6 || isHoliday;
  const effectiveLegends = normalizedLegends.map((legend) =>
    legend.startsWith('6') && legend !== '6' && legend !== '6/7' ? '6\u015b' : legend,
  );
  const saturdaySchool = '6\u015b';
  const effectiveBaseLegends = ['D', '(D)', 'S', 'E', 'C', '+', saturdaySchool, '6', '7', '1-4', '2-5', '5', '5/6', '6/7'];
  if (!effectiveLegends.some((legend) => effectiveBaseLegends.includes(legend))) return true;

  let effectiveRuns = false;
  for (const legend of effectiveLegends) {
    if ((legend === 'D' || legend === '(D)') && !isWeekendOrHoliday) effectiveRuns = true;
    if (legend === 'S' && !isWeekendOrHoliday && (services.length ? services.includes('2') : true)) effectiveRuns = true;
    if (legend === 'E' && !isSundayOrHoliday) effectiveRuns = true;
    if (legend === 'C' && isWeekendOrHoliday) effectiveRuns = true;
    if (legend === saturdaySchool && day === 6 && !isHoliday) effectiveRuns = true;
    if (legend === '6' && day === 6) effectiveRuns = true;
    if ((legend === '+' || legend === '7') && isSundayOrHoliday) effectiveRuns = true;
    if (legend === '5' && day === 5 && !isHoliday) effectiveRuns = true;
    if (legend === '1-4' && day >= 1 && day <= 4 && !isHoliday) effectiveRuns = true;
    if (legend === '2-5' && day >= 2 && day <= 5 && !isHoliday) effectiveRuns = true;
    if (legend === '5/6' && day === 5) effectiveRuns = true;
    if (legend === '6/7' && day === 6) effectiveRuns = true;
  }
  return effectiveRuns;
}

function processTimetable(ttData: any, dayIso: string, codeToCompare: string) {
  if (!ttData?.items) return [];
  const mapped: any[] = [];
  const normalizedCode = String(codeToCompare || '').trim();
  const normalizedCodeNumber = parseInt(normalizedCode, 10);
  ttData.items.forEach((item: any) => {
    item.journeys?.forEach((journey: any) => {
      const journeyCode = String(journey.stop_point_code || '').trim();
      const journeyCodeNumber = parseInt(journeyCode, 10);
      const isMatch =
        journeyCode === normalizedCode ||
        (!Number.isNaN(journeyCodeNumber) &&
          !Number.isNaN(normalizedCodeNumber) &&
          journeyCodeNumber === normalizedCodeNumber);

      if (isMatch && isJourneyRunning(journey.legends || [], dayIso)) {
        if (!Number.isFinite(warsawTimeMs(dayIso, journey.time))) return;
        mapped.push({
          journey_id: journey.journey_id,
          timetable_time: new Date(warsawTimeMs(dayIso, journey.time)).toISOString(),
          past: false,
          deviation: null,
          legends: journey.legends,
          route_description: item.description,
          line_name: item.line_name,
          vias: item.vias,
          operator_short_name: journey.operator,
        });
      }
    });
  });
  return mapped;
}

const pksTimetables = new Map<string, { expires: number; promise: Promise<any> }>();

export function fetchPksTimetableClient(areaId: string, day: string) {
  const key = areaId + ':' + day;
  const cached = pksTimetables.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = requestEinfoJson<any>('stop-point-timetable/' + encodeURIComponent(areaId) + '?day=' + day, {headers:{Accept:'application/json'}})
    .then(data => { if (data.success === false || !Array.isArray(data.items)) throw new Error('Nieprawidłowy rozkład PKS'); return data; })
    .catch(error => { pksTimetables.delete(key); throw error; });
  if (pksTimetables.size > 200) pksTimetables.delete(pksTimetables.keys().next().value!);
  pksTimetables.set(key, {expires:Date.now()+300_000,promise});
  return promise;
}

export async function fetchDeparturesClient(stopId: string, areaId?: string, code?: string, dateIso?: string) {
  const today = warsawDateIso();
  const days = dateIso ? [dateIso] : [today, warsawDateIso(1)];
  const wantsBoard = days.includes(today);
  const hasTimetable = Boolean(areaId && code);
  const [board, ...tables] = await Promise.allSettled([
    wantsBoard ? requestEinfoJson<any>('its/infoboard/nearest-departures/' + encodeURIComponent(stopId), {headers:{Accept:'application/json'}})
      .then(data => { if (!Array.isArray(data.journeys)) throw new Error('Nieprawidłowa tablica PKS'); return data; }) : Promise.resolve({journeys:[]}),
    ...(hasTimetable ? days.map(day => fetchPksTimetableClient(areaId!, day)) : []),
  ]);
  if (!hasTimetable && !wantsBoard) throw new Error('Brak identyfikatora rozkładu PKS dla tego dnia');
  const failedTables = tables.some(result => result.status === 'rejected');
  if ((board.status === 'rejected' || !wantsBoard) && (!hasTimetable || failedTables)) throw new Error('Nie udało się pobrać rozkładu PKS');
  const live = board.status === 'fulfilled' ? board.value.journeys.map((journey: any) => {
    const raw = String(journey.timetable_time || '');
    const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(raw);
    const ms = match ? warsawTimeMs(match[1], match[2]) : Date.parse(raw);
    return {...journey, provider_id:'pks', timetable_time: Number.isFinite(ms) ? new Date(ms).toISOString() : ''};
  }) : [];
  const scheduled = tables.flatMap((result,index) => result.status === 'fulfilled' ? processTimetable(result.value, days[index], code!) : []);
  const journeys = [...live];
  for (const journey of scheduled) {
    const duplicate = live.some((row: any) => row.line_name === journey.line_name && row.route_description === journey.route_description && row.timetable_time === journey.timetable_time);
    if (!duplicate) journeys.push(journey);
  }
  return {journeys: journeys.filter((journey: any) => {
    const ms = Date.parse(journey.timetable_time);
    return Number.isFinite(ms) && (dateIso ? warsawDateIso(0,new Date(ms)) === dateIso : ms >= Date.now()-900_000 && ms <= Date.now()+86400_000);
  }).sort((a: any,b: any) => Date.parse(a.timetable_time)-Date.parse(b.timetable_time)),
  warning: failedTables || (hasTimetable && board.status === 'rejected') ? 'PKS: część danych niedostępna; pokazano dostępny rozkład.' : undefined};
}

export {isJourneyRunning};
export {processTimetable};
export {pksTimetables};
