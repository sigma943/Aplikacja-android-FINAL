import { getCachedValue } from './cache';
import type { GetVehiclesOptions, ProviderVehiclesResult, TransportProvider, TransportStopSchedule, TransportVehicle } from './types';

const VEHICLES_XML_URL = process.env.MPK_RZESZOW_VEHICLES_XML_URL || 'https://www.mpkrzeszow.pl/mpk/vehicles_proxy.php';
const VEHICLES_DETAILS_URL = process.env.MPK_RZESZOW_VEHICLES_DETAILS_URL || 'https://www.mpkrzeszow.pl/mpk/get_vehicles.php';
const STOPS_URL = 'http://einfo.zgpks.rzeszow.pl/api/stop-point';
const REQUEST_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'Accept-Language': 'pl,en;q=0.9',
  Referer: 'http://einfo.zgpks.rzeszow.pl/',
  Origin: 'http://einfo.zgpks.rzeszow.pl',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

type StopsDictionary = Record<string, string>;

function parseJsonDate(value: unknown, fallbackMs: number) {
  const raw = String(value || '').trim();
  if (!raw) return fallbackMs;
  const parsed = new Date(raw.replace(' ', 'T')).getTime();
  return Number.isFinite(parsed) ? parsed : fallbackMs;
}

async function fetchJsonWithRetry<T>(url: string, init?: RequestInit, retries = 1): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
      }

      return JSON.parse(text) as T;
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function fetchTextWithRetry(url: string, init?: RequestInit, retries = 1): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
      return text;
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function decodeXmlEntity(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseVehicleXml(xml: string) {
  const vehicles: Record<string, string>[] = [];
  const vehicleRegex = /<V\s+([\s\S]*?)\/>/g;
  let vehicleMatch: RegExpExecArray | null;

  while ((vehicleMatch = vehicleRegex.exec(xml))) {
    const attrs: Record<string, string> = {};
    const attrRegex = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
    let attrMatch: RegExpExecArray | null;

    while ((attrMatch = attrRegex.exec(vehicleMatch[1]))) {
      attrs[attrMatch[1]] = decodeXmlEntity(attrMatch[2]);
    }

    vehicles.push(attrs);
  }

  return vehicles;
}

async function loadRawVehicles() {
  return getCachedValue('mpk_rzeszow:raw_xml_vehicles', {
    ttlMs: 10_000,
    staleMs: 50_000,
    loader: async () => {
      const xml = await fetchTextWithRetry(VEHICLES_XML_URL, { headers: REQUEST_HEADERS });
      return parseVehicleXml(xml);
    },
  });
}

async function loadVehicleDetails() {
  return getCachedValue('mpk_rzeszow:vehicle_details', {
    ttlMs: 15_000,
    staleMs: 60_000,
    loader: async () => {
      const data = await fetchJsonWithRetry<unknown[]>(VEHICLES_DETAILS_URL, { headers: REQUEST_HEADERS });
      return Array.isArray(data) ? data : [];
    },
  });
}

async function loadStopsDictionary() {
  return getCachedValue('mpk_rzeszow:stops_dictionary', {
    ttlMs: 24 * 60 * 60 * 1000,
    staleMs: 24 * 60 * 60 * 1000,
    loader: async () => {
      const data = await fetchJsonWithRetry<{ items?: Array<Record<string, unknown>> }>(STOPS_URL, {
        headers: REQUEST_HEADERS,
      });
      const dictionary: StopsDictionary = {};

      for (const stop of data.items || []) {
        const stopId = String(stop.stop_point_id || '').trim();
        const stopName = String(stop.name || '').trim();
        if (!stopId || !stopName) continue;
        dictionary[stopId] = stopName;
      }

      return dictionary;
    },
  });
}

function buildSchedule(nextStopPoints: any[] | undefined, stopsDictionary: StopsDictionary): TransportStopSchedule[] {
  return (nextStopPoints || []).map((stopPoint: any) => {
    const stopId = Number(stopPoint.stop_point_id);
    return {
      id: stopId,
      name: stopsDictionary[String(stopId)] || `Przystanek ${stopId}`,
      planned: stopPoint.planned_departure_time ? String(stopPoint.planned_departure_time).replace(' ', 'T') : null,
      real: stopPoint.real_departure_time ? String(stopPoint.real_departure_time).replace(' ', 'T') : null,
    };
  });
}

function buildRoutePath(route: any): number[] {
  const fromStopPoints = Array.isArray(route?.stop_points)
    ? route.stop_points
        .map((stopPoint: any) => Number(typeof stopPoint === 'object' && stopPoint !== null ? stopPoint.stop_point_id : stopPoint))
        .filter((stopPointId: number) => Number.isFinite(stopPointId))
    : [];

  if (fromStopPoints.length > 1) return fromStopPoints;

  const links = Array.isArray(route?.route_links)
    ? [...route.route_links].sort((a: any, b: any) => Number(a?.index ?? 0) - Number(b?.index ?? 0))
    : [];
  const routePath: number[] = [];

  for (const link of links) {
    const from = Number(link?.from);
    const to = Number(link?.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    if (routePath.length === 0) routePath.push(from);
    if (routePath[routePath.length - 1] !== to) routePath.push(to);
  }

  return routePath;
}

function inferVehicleStatus(vehicle: any, ageSec: number, speed: number, now: number, hasLine: boolean) {
  const nextStops = Array.isArray(vehicle.next_stop_points) ? vehicle.next_stop_points : [];
  const firstNextStop = nextStops[0];
  const plannedMs = firstNextStop?.planned_departure_time
    ? new Date(String(firstNextStop.planned_departure_time).replace(' ', 'T')).getTime()
    : Number.NaN;
  const lastStopNumber = Number(vehicle.position?.last_stop_point_number);
  const lastStopDistance = Number(vehicle.position?.last_stop_point_distance);
  const isAtTripStart = lastStopNumber === 0 && (lastStopDistance === 0 || Number.isNaN(lastStopDistance));
  const waitMs = plannedMs - now;

  if (!hasLine) {
    return {
      status: 'inactive' as const,
      statusText: ageSec > 90 ? 'Ukryty pojazd z ostatnia pozycja' : 'Ukryty pojazd bez linii',
    };
  }

  if (vehicle.journey?.route?.is_technical) {
    return { status: 'technical' as const, statusText: 'Przejazd techniczny' };
  }

  if (isAtTripStart && Number.isFinite(waitMs) && waitMs > 120000 && speed <= 5) {
    const plannedClock = new Date(plannedMs).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    return {
      status: 'break' as const,
      statusText: `Przerwa do ${plannedClock}`,
    };
  }

  if (speed <= 1 && nextStops.length === 0) {
    return { status: 'inactive' as const, statusText: 'Postoj po kursie' };
  }

  if (speed <= 1) {
    return { status: 'active' as const, statusText: 'Postoj na trasie' };
  }

  return { status: 'active' as const, statusText: 'W trasie' };
}

function inBoundingBox(lat: number, lng: number, bbox?: [number, number, number, number] | null) {
  if (!bbox) return true;
  const [south, west, north, east] = bbox;
  return lat >= south && lat <= north && lng >= west && lng <= east;
}

function normalizeVehicleId(rawVehicleId: unknown) {
  return String(rawVehicleId ?? '').trim() || 'unknown';
}

function toCleanLine(value: unknown) {
  const raw = String(value || '').trim();
  return raw || '?';
}

function getMpkStatusText(status: string, speed: number) {
  if (status === '2') return 'Postoj na przystanku';
  if (status === '3' || status === '6' || status === '7' || status === '10') return 'Postoj na petli';
  if (speed <= 1) return 'Postoj na trasie';
  return 'W trasie';
}

function isMpkBreakStatus(status: string) {
  return status === '3' || status === '6' || status === '7' || status === '10';
}

function isMpkWaitingStatus(status: string) {
  return status === '2' || isMpkBreakStatus(status);
}

function getEffectiveMpkDelay(rawDelay: number, status: string) {
  if (!Number.isFinite(rawDelay) || Math.abs(rawDelay) > 18000) return 0;
  return isMpkWaitingStatus(status) ? 0 : rawDelay;
}

function toTransportVehicle(
  rawVehicle: Record<string, string>,
  now: number,
  includeInactive: boolean,
  stopsDictionary: StopsDictionary,
  details?: any,
): TransportVehicle | null {
  const lat = Number(rawVehicle.y);
  const lng = Number(rawVehicle.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const rawVehicleNumber = normalizeVehicleId(rawVehicle.nb || rawVehicle.id);
  const line = toCleanLine(rawVehicle.nr || rawVehicle.nnr || details?.nr);
  const hasLine = line !== '?';
  const secondsFromSignal = Number(rawVehicle.is || 0);
  const ageSec = Number.isFinite(secondsFromSignal) ? Math.max(0, secondsFromSignal) : 0;

  if (!includeInactive && !hasLine) return null;
  if (ageSec > 30 * 60) return null;

  const previousLat = Number(rawVehicle.py);
  const previousLng = Number(rawVehicle.px);
  const movedDistance = Number.isFinite(previousLat) && Number.isFinite(previousLng)
    ? Math.hypot(lat - previousLat, lng - previousLng)
    : 0;
  const speed = movedDistance > 0 ? Math.min(55, Math.round(movedDistance * 100000)) : 0;
  const statusCode = String(rawVehicle.s || details?.status || '');
  const statusText = getMpkStatusText(statusCode, speed);
  const direction = String(rawVehicle.op || details?.op || rawVehicle.nop || '').trim() || (speed > 3 ? 'W trasie' : 'Postoj');
  const delaySeconds = getEffectiveMpkDelay(Number(rawVehicle.o ?? details?.delay ?? 0), statusCode);
  const prefixedId = `mpk_rzeszow_${rawVehicleNumber}`;
  const nextStopId = Number(rawVehicle.nk || details?.end_stop_id);
  const nextStopName =
    String(rawVehicle.nop || details?.end_stop_name || '').trim() ||
    stopsDictionary[String(nextStopId)] ||
    (Number.isFinite(nextStopId) ? `Przystanek ${nextStopId}` : '');

  return {
    id: prefixedId,
    provider: 'mpk_rzeszow',
    operatorName: 'MPK Rzeszów',
    type: 'bus',
    iconVariant: 'mpk_rzeszow',
    vehicleNumber: rawVehicleNumber,
    line,
    displayName: line,
    name: `MPK ${line !== '?' ? line : rawVehicleNumber}`,
    routeId: line !== '?' ? line : undefined,
    lat,
    lng,
    bearing: undefined,
    speed,
    direction,
    delaySeconds,
    delayMinutes: Math.round(delaySeconds / 60),
    dataAgeSec: ageSec,
    schedule: Number.isFinite(nextStopId) && nextStopName
      ? [{
          id: nextStopId,
          name: nextStopName,
          planned: null,
          real: null,
        }]
      : [],
    routePath: [],
    model: details?.bus,
    lastStopDistance: Number.isFinite(Number(rawVehicle.dp)) ? Number(rawVehicle.dp) : undefined,
    lastStopId: Number.isFinite(Number(rawVehicle.ik)) ? Number(rawVehicle.ik) : undefined,
    lastUpdate: new Date(now - ageSec * 1000).toISOString(),
    journeyId: details?.rawBrygada ?? rawVehicle.kwi?.trim() ?? undefined,
    serviceId: rawVehicle.kwi?.trim() || details?.brygada,
    tripId: details?.trip_id ?? rawVehicle.ik ?? undefined,
    brigadeName: rawVehicle.kwi?.trim() || details?.brygada,
    status: isMpkBreakStatus(statusCode) ? 'break' : 'active',
    statusText,
  };
}

function parseLookupVehicleId(vehicleId: string) {
  const raw = String(vehicleId || '').trim();
  if (!raw) return '';
  return raw.startsWith('mpk_rzeszow_') ? raw.slice('mpk_rzeszow_'.length) : raw;
}

export const mpkRzeszowProvider: TransportProvider = {
  id: 'mpk_rzeszow',
  operatorName: 'MPK Rzeszów',
  implemented: true,

  async getVehicles(options: GetVehiclesOptions): Promise<ProviderVehiclesResult> {
    const [{ value: rawVehicles, cache }, { value: stopsDictionary }, { value: vehicleDetails }] = await Promise.all([
      loadRawVehicles(),
      loadStopsDictionary(),
      loadVehicleDetails(),
    ]);

    const now = Date.now();
    const detailsByVehicle = new Map(
      vehicleDetails.map((detail: any) => [normalizeVehicleId(detail?.nb), detail]),
    );
    const vehicles = rawVehicles
      .map((rawVehicle) =>
        toTransportVehicle(rawVehicle, now, options.includeInactive, stopsDictionary, detailsByVehicle.get(normalizeVehicleId(rawVehicle.nb || rawVehicle.id))),
      )
      .filter((vehicle): vehicle is TransportVehicle => Boolean(vehicle))
      .filter((vehicle) => inBoundingBox(vehicle.lat, vehicle.lng, options.bbox));

    return { vehicles, cache };
  },

  async getVehicleDetails(vehicleId: string, options?: Pick<GetVehiclesOptions, 'includeInactive'>): Promise<TransportVehicle | null> {
    const lookupVehicleId = parseLookupVehicleId(vehicleId);
    const [{ value: rawVehicles }, { value: stopsDictionary }, { value: vehicleDetails }] = await Promise.all([
      loadRawVehicles(),
      loadStopsDictionary(),
      loadVehicleDetails(),
    ]);

    const rawVehicle = rawVehicles.find((candidate) => normalizeVehicleId(candidate?.nb || candidate?.id) === lookupVehicleId);
    if (!rawVehicle) return null;
    const detail = vehicleDetails.find((candidate: any) => normalizeVehicleId(candidate?.nb) === lookupVehicleId);

    return toTransportVehicle(rawVehicle, Date.now(), options?.includeInactive ?? true, stopsDictionary, detail);
  },
};
