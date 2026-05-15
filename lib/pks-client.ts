import {Capacitor, CapacitorHttp} from '@capacitor/core';
import type {Vehicle} from '@/components/BusMap';

type StopsMap = Record<string, {n: string; lat?: number; lon?: number; areaId?: string; code?: string}>;
type ShapePoint = [number, number];

let stopsDictionaryPromise: Promise<Record<string, string>> | null = null;
let shapeIndexPromise: Promise<Record<string, string>> | null = null;
let routeStopShapeIndexPromise: Promise<Record<string, string>> | null = null;
const shapePointsCache = new Map<string, Promise<ShapePoint[]>>();

const isNative = () => Capacitor.isNativePlatform();
const EINFO_DIRECT = 'http://einfo.zgpks.rzeszow.pl/api';

function einfoFallbackUrl(pathAndOptionalQuery: string) {
  const trimmed = pathAndOptionalQuery.replace(/^\//, '');
  return `${EINFO_DIRECT}/${trimmed}`;
}

async function requestJson<T>(url: string, init?: RequestInit & {headers?: Record<string, string>}): Promise<T> {
  if (isNative()) {
    const response = await CapacitorHttp.request({
      url,
      method: init?.method || 'GET',
      headers: init?.headers,
      connectTimeout: 12000,
      readTimeout: 12000,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Request failed: ${response.status}`);
    }

    return response.data as T;
  }

  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
  });

  const text = await response.text();
  if (!response.ok) {
    const hint = text ? ` - ${text.slice(0, 240)}` : '';
    throw new Error(`Request failed: ${response.status}${hint}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON (HTTP ${response.status}): ${text.slice(0, 120)}`);
  }
}

async function requestEinfoJson<T>(pathAndOptionalQuery: string, init?: RequestInit & {headers?: Record<string, string>}): Promise<T> {
  return requestJson<T>(einfoFallbackUrl(pathAndOptionalQuery), init);
}

async function loadStopsDictionary() {
  if (!stopsDictionaryPromise) {
    stopsDictionaryPromise = fetch('/data/stops-dictionary.json', {cache: 'force-cache'}).then((res) => res.json());
  }
  return stopsDictionaryPromise;
}

async function loadShapeIndex() {
  if (!shapeIndexPromise) {
    shapeIndexPromise = fetch('/data/trip-shape-index.json', {cache: 'force-cache'}).then((res) => res.json());
  }
  return shapeIndexPromise;
}

async function loadRouteStopShapeIndex() {
  if (!routeStopShapeIndexPromise) {
    routeStopShapeIndexPromise = fetch('/data/route-stop-shape-index.json', {cache: 'force-cache'})
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}));
  }
  return routeStopShapeIndexPromise;
}

function safeShapeId(shapeId: string) {
  return String(shapeId || '').trim().replace(/[^a-zA-Z0-9_.+-]/g, '_');
}

async function loadShapePoints(shapeId: string) {
  const safeId = safeShapeId(shapeId);
  if (!safeId) return [];
  if (!shapePointsCache.has(safeId)) {
    shapePointsCache.set(
      safeId,
      fetch(`/data/route-shapes/${encodeURIComponent(safeId)}.json`, {cache: 'force-cache'})
        .then((res) => (res.ok ? res.json() : []))
        .catch(() => []),
    );
  }
  return shapePointsCache.get(safeId)!;
}

function toTitleCase(str: string) {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(?:^|[\s,\/.\-])\S/g, (match) => match.toUpperCase());
}

function getTripBase(tripId: unknown) {
  return String(tripId || '').trim().split('_')[0] || '';
}

function formatStopName(rawName: string | undefined) {
  if (!rawName) return 'Przystanek nieznany';
  return rawName.trim();
}

function buildSchedule(nextStopPoints: any[] | undefined, stopsDict: Record<string, string>) {
  return (nextStopPoints || []).map((sp: any) => ({
    id: Number(sp.stop_point_id),
    name: formatStopName(stopsDict[String(sp.stop_point_id)]),
    planned: sp.planned_departure_time ? String(sp.planned_departure_time).replace(' ', 'T') : null,
    real: sp.real_departure_time ? String(sp.real_departure_time).replace(' ', 'T') : null,
  }));
}

function buildRoutePath(route: any): number[] {
  const fromStopPoints = Array.isArray(route?.stop_points)
    ? route.stop_points
        .map((sp: any) => Number(typeof sp === 'object' && sp !== null ? sp.stop_point_id : sp))
        .filter((n: number) => Number.isFinite(n))
    : [];
  if (fromStopPoints.length > 1) return fromStopPoints;

  const links = Array.isArray(route?.route_links)
    ? [...route.route_links].sort((a: any, b: any) => Number(a?.index ?? 0) - Number(b?.index ?? 0))
    : [];
  const fromLinks: number[] = [];
  for (const link of links) {
    const from = Number(link?.from);
    const to = Number(link?.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    if (fromLinks.length === 0) fromLinks.push(from);
    if (fromLinks[fromLinks.length - 1] !== to) fromLinks.push(to);
  }
  return fromLinks;
}

function formatClock(ts: number) {
  if (!Number.isFinite(ts)) return '--:--';
  return new Date(ts).toLocaleTimeString('pl-PL', {hour: '2-digit', minute: '2-digit'});
}

function inferVehicleStatus(v: any, ageSec: number, speed: number, now: number, hasLine: boolean) {
  const nextStops = Array.isArray(v.next_stop_points) ? v.next_stop_points : [];
  const firstNext = nextStops[0];
  const plannedMs = firstNext?.planned_departure_time
    ? new Date(String(firstNext.planned_departure_time).replace(' ', 'T')).getTime()
    : NaN;
  const lastStopNumber = Number(v.position?.last_stop_point_number);
  const lastStopDistance = Number(v.position?.last_stop_point_distance);
  const isAtTripStart = lastStopNumber === 0 && (lastStopDistance === 0 || Number.isNaN(lastStopDistance));
  const waitMs = plannedMs - now;

  if (!hasLine) {
    return {
      status: 'inactive' as const,
      statusText: ageSec > 90 ? 'Ukryty pojazd z ostatnia pozycja' : 'Ukryty pojazd bez linii',
    };
  }

  if (v.journey?.route?.is_technical) {
    return {status: 'technical' as const, statusText: 'Przejazd techniczny'};
  }

  if (isAtTripStart && Number.isFinite(waitMs) && waitMs > 120000 && speed <= 5) {
    return {
      status: 'break' as const,
      statusText: `Przerwa do ${formatClock(plannedMs)}`,
    };
  }

  if (speed <= 1 && nextStops.length === 0) {
    return {status: 'inactive' as const, statusText: 'Postoj po kursie'};
  }

  if (speed <= 1) {
    return {status: 'active' as const, statusText: 'Postoj na trasie'};
  }

  return {status: 'active' as const, statusText: 'W trasie'};
}

function mapVehicle(v: any, now: number, includeInactive: boolean, stopsDict: Record<string, string>): Vehicle | null {
  if (!v.position || v.position.lat == null || v.position.long == null) return null;

  const signalRaw = v.position.position_date ? String(v.position.position_date).replace(' ', 'T') : '';
  const signalMs = signalRaw ? new Date(signalRaw).getTime() : now;
  const lineName = String(v.journey?.line?.line_name || v.journey?.line?.name || '').trim() || '---';
  const hasLine = lineName !== '---';
  const ageSec = Math.max(0, Math.floor((now - (Number.isNaN(signalMs) ? now : signalMs)) / 1000));
  if (!includeInactive && !hasLine) return null;
  if (ageSec > 7 * 60) return null;

  const speed = Number(v.position.speed || 0);
  let destination = v.journey?.route?.description || v.journey?.route?.name || (speed > 3 ? 'W trasie' : 'Postoj');
  const vehicleStatus = inferVehicleStatus(v, ageSec, speed, now, hasLine);

  return {
    id: String(v.vehicle_id ?? `json-${getTripBase(v.trip_id) || now}`),
    routeId: lineName,
    name: `PKS ${lineName !== '---' ? lineName : String(v.vehicle_id ?? '?')}`,
    routeShortName: lineName !== '---' ? lineName : '?',
    lat: Number(v.position.lat),
    lon: Number(v.position.long),
    speed,
    direction: destination,
    delay: typeof v.delay === 'number' ? v.delay : 0,
    dataAgeSec: ageSec,
    schedule: buildSchedule(v.next_stop_points, stopsDict),
    routePath: buildRoutePath(v.journey?.route),
    model: v.model,
    lastStopDistance: typeof v.position.last_stop_point_distance === 'number' ? v.position.last_stop_point_distance : undefined,
    lastStopId: typeof v.position.last_stop_point_number === 'number' ? v.position.last_stop_point_number : undefined,
    lastSignalTime: signalRaw || undefined,
    journeyId: v.journey?.journey_id ?? v.trip_id ?? undefined,
    tripId: v.trip_id ?? undefined,
    serviceId:
      typeof v.journey?.service === 'object'
        ? v.journey.service.service_code || v.journey.service.service_id || String(v.journey.service.timetable_id || '')
        : v.journey?.service,
    brigadeName:
      typeof v.brigade_name === 'string'
        ? v.brigade_name
        : v.journey?.service?.service_code,
    status: vehicleStatus.status,
    statusText: vehicleStatus.statusText,
  };
}

export async function fetchVehiclesClient(includeInactive: boolean) {
  const [rawVehicles, stopsDict] = await Promise.all([
    requestJson<any[]>('https://www.mpkrzeszow.pl/pks/get_vehicles.php'),
    loadStopsDictionary(),
  ]);
  const now = Date.now();

  return (Array.isArray(rawVehicles) ? rawVehicles : [])
    .map((vehicle) => mapVehicle(vehicle, now, includeInactive, stopsDict))
    .filter((vehicle): vehicle is Vehicle => Boolean(vehicle));
}

export async function fetchStopsClient(): Promise<StopsMap> {
  const data = await requestEinfoJson<any>('stop-point', {
    headers: {'Accept': 'application/json'},
  }).catch(async () => {
    const dict = await loadStopsDictionary();
    return {
      items: Object.entries(dict).map(([id, name]) => ({
        stop_point_id: id,
        name,
        stop_area_name: '',
        stop_area_id: '',
        stop_point_code: '',
        location: {},
      })),
    };
  });

  const compressedMap: StopsMap = {};
  for (const stop of data?.items || []) {
    const lat = Number(stop.location?.lat ?? stop.location?.latitude);
    const lon = Number(stop.location?.lon ?? stop.location?.lng ?? stop.location?.long ?? stop.location?.longitude);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
    const areaName = stop.stop_area_name ? stop.stop_area_name.trim() : '';
    const name = stop.name ? stop.name.trim() : '';
    const finalNameRaw = areaName || name;
    let formattedName = toTitleCase(finalNameRaw);

    if (stop.stop_point_code && stop.stop_point_code.trim()) {
      let code = stop.stop_point_code.trim();
      const isRzeszow = formattedName.includes('Rzeszow') || formattedName.includes('Rzeszów');
      const isRzeszowDA = isRzeszow && (formattedName.includes('D.A.') || formattedName.toLowerCase().includes('dworzec'));

      if (!isRzeszowDA && /^0\d$/.test(code)) code = code.substring(1);

      if (isRzeszow) {
        if (isRzeszowDA) {
          if (!formattedName.toLowerCase().includes('st.')) formattedName += ` st. ${code}`;
        } else {
          // Rzeszów: zawsze pokazujemy pełny kod z wiodącym zerem, jeśli istnieje w API.
          formattedName += ` ${stop.stop_point_code.trim()}`;
        }
      } else if (code) {
        // Poza Rzeszowem: zawsze dopinamy kod jako suffix, żeby np. 03/04 były widoczne osobno.
        formattedName += ` ${code}`;
      }
    }

    compressedMap[String(stop.stop_point_id)] = {
      n: formattedName,
      lat: hasCoords ? lat : undefined,
      lon: hasCoords ? lon : undefined,
      areaId: String(stop.stop_area_id),
      code: stop.stop_point_code ? String(stop.stop_point_code).trim() : '',
    };
  }

  return compressedMap;
}

function isJourneyRunning(legends: string[], dateIso: string) {
  if (!legends || legends.length === 0) return true;
  const dt = new Date(dateIso);
  const day = dt.getDay();
  const month = dt.getMonth() + 1;
  const date = dt.getDate();
  const isHoliday =
    (month === 1 && date === 1) || (month === 1 && date === 6) ||
    (month === 5 && date === 1) || (month === 5 && date === 3) ||
    (month === 8 && date === 15) || (month === 11 && date === 1) ||
    (month === 11 && date === 11) || (month === 12 && date === 25) ||
    (month === 12 && date === 26);
  const isSundayOrHoliday = day === 0 || isHoliday;
  const isWeekendOrHoliday = day === 0 || day === 6 || isHoliday;
  const baseLegends = ['D', '(D)', 'S', 'E', 'C', '+', '6ś', '6', '7', '1-4', '2-5', '5', '5/6', '6/7'];
  const hasBaseLegend = legends.some((legend) => baseLegends.includes(legend));
  if (!hasBaseLegend) return true;

  let runs = false;
  for (const legend of legends) {
    if ((legend === 'D' || legend === '(D)' || legend === 'S') && !isWeekendOrHoliday) runs = true;
    if (legend === 'E' && !isSundayOrHoliday) runs = true;
    if (legend === 'C' && isWeekendOrHoliday) runs = true;
    if (legend === '6ś' && day === 6 && !isHoliday) runs = true;
    if (legend === '6' && day === 6) runs = true;
    if ((legend === '+' || legend === '7') && isSundayOrHoliday) runs = true;
    if (legend === '5' && day === 5 && !isHoliday) runs = true;
    if (legend === '1-4' && day >= 1 && day <= 4 && !isHoliday) runs = true;
    if (legend === '2-5' && day >= 2 && day <= 5 && !isHoliday) runs = true;
    if (legend === '5/6' && day === 5) runs = true;
    if (legend === '6/7' && day === 6) runs = true;
  }

  return runs;
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
        mapped.push({
          timetable_time: `${dayIso}T${journey.time}:00`,
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

export async function fetchDeparturesClient(stopId: string, areaId?: string, code?: string) {
  const nearestData = await requestEinfoJson<any>(`its/infoboard/nearest-departures/${stopId}`, {
    headers: {Accept: 'application/json'},
  }).catch(() => ({journeys: []}));

  if (!areaId || !code) {
    const nowMs = Date.now();
    return {
      ...nearestData,
      journeys: (nearestData.journeys || [])
        .map((journey: any) => ({
          ...journey,
          timetable_time: String(journey.timetable_time || '').replace(' ', 'T'),
        }))
        .filter((journey: any) => {
          const t = new Date(journey.timetable_time).getTime();
          return Number.isFinite(t) && t >= nowMs - 15 * 60000 && t <= nowMs + 24 * 3600000;
        }),
    };
  }

  const now = new Date();
  const warsawSvc = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayIso = warsawSvc.format(now);
  const tomorrowIso = warsawSvc.format(new Date(now.getTime() + 86400000));

  const [ttDataT, ttDataN] = await Promise.all([
    requestEinfoJson<any>(`stop-point-timetable/${areaId}?day=${todayIso}`, {headers: {Accept: 'application/json'}}).catch(() => ({items: []})),
    requestEinfoJson<any>(`stop-point-timetable/${areaId}?day=${tomorrowIso}`, {headers: {Accept: 'application/json'}}).catch(() => ({items: []})),
  ]);

  const originalLiveJourneys = [...(nearestData.journeys || [])].map((journey: any) => ({
    ...journey,
    timetable_time: String(journey.timetable_time || '').replace(' ', 'T'),
  }));
  const combinedJourneys = [...originalLiveJourneys];
  const mapped = [
    ...processTimetable(ttDataT, todayIso, String(code).trim()),
    ...processTimetable(ttDataN, tomorrowIso, String(code).trim()),
  ];

  mapped.forEach((journey) => {
    const journeyTimeMs = new Date(journey.timetable_time).getTime();
    const isDuplicate = originalLiveJourneys.some((live: any) => {
      if (live.line_name !== journey.line_name) return false;
      const liveTimeMs = new Date(live.timetable_time).getTime();
      return Math.abs(liveTimeMs - journeyTimeMs) <= 2 * 60000;
    });

    if (!isDuplicate) combinedJourneys.push(journey);
  });

  combinedJourneys.sort(
    (a: any, b: any) => new Date(a.timetable_time).getTime() - new Date(b.timetable_time).getTime(),
  );
  const nowMs = Date.now();

  return {
    ...nearestData,
    journeys: combinedJourneys.filter((journey: any) => {
      const t = new Date(journey.timetable_time).getTime();
      return Number.isFinite(t) && t >= nowMs - 15 * 60000 && t <= nowMs + 24 * 3600000;
    }),
  };
}

export async function fetchRouteShapeClient(tripId: string, fallbackStops: number[], _stopsData?: Record<string, {lat: number; lon: number}> | null) {
  const tripIdBase = String(tripId || '').trim().split('_')[0];
  const normalizedStops = fallbackStops
    .map((id) => String(id || '').trim())
    .filter(Boolean);

  if (tripIdBase) {
    try {
      const shapeIndex = await loadShapeIndex();
      const shapeId = shapeIndex?.[tripIdBase];
      const points = shapeId ? await loadShapePoints(shapeId) : [];
      if (points.length > 1) return points;
    } catch {}
  }

  if (normalizedStops.length > 1) {
    try {
      const stopShapeIndex = await loadRouteStopShapeIndex();
      const shapeId = stopShapeIndex[normalizedStops.join('-')];
      const points = shapeId ? await loadShapePoints(shapeId) : [];
      if (points.length > 1) return points;
    } catch {}
  }
  return [];
}
