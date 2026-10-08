import {getEffectiveMpkDelay, fetchMpkTripSchedule} from './providers/mpk-vehicles';
import {verifiedCachedPksStops} from './providers/pks-stops';
import {formatPksStops} from './providers/pks-stops';
import {writePersistentClientCache} from './transport/cache';
import {buildMarcelRouteStops} from './providers/marcel-client';
import {estimateMarcelDelaySeconds} from './providers/marcel-client';
import {readBusCoordinates} from './bus-coordinates';
import {measuredTransport} from './transport-diagnostics';

import type {MarcelRoute, MarcelCourse, MarcelCourseStopPublic} from './providers/marcel-timetable';
export type {MarcelRoute,MarcelCourse,MarcelCourseStopPublic} from './providers/marcel-timetable';
import {routeGeometryKey} from './route-geometry-key';
import {mpkSignalTime} from './mpk-vehicle-feed';
import {getTransportRuntime} from './transport-runtime';
import {officialBusStops} from './official-bus-routes';

import {busOperatingState, transitTimestamp} from './bus-operating-state';

import type {Vehicle} from '@/lib/transport/vehicle';
import {warsawDateIso, warsawTimeMs} from './transit-time';

import {type ShapePoint, type StopPointIndex, type TransportProviderId, type PkpQueryViewport, type RouteGeometryClientRequest, type RouteGeometryClientResponse, type TransportApiVehicle, type TransportApiVehiclesResponse} from './transport/types';
import {TRANSPORT_API_BASE_URL} from './transport/endpoints';
import {isNative, requestJson, transportApiUrl} from './transport/http';
import {distanceMeters, computeObservedSpeedKmh} from './transport/vehicle-speed';
import {mapTransportVehicleToClient} from './transport/vehicle-adapter';
import {fetchRoadRouteForStops} from './transport/road-routing';
import {isAbortLikeError, fetchPkpIntercityVehiclesDirect, fetchPkpIntercityPortalGpsVehicles, fetchPkpIntercityVehicleDetailsDirect} from './providers/pkp-client';
import {readMarcelTimestamp, warmMarcelBadgeCourses, fetchMarcelVehiclesDirect, fetchMarcelVehicleDetailsDirect, fetchMarcelPositionSnapshot} from './providers/marcel-client';
import {loadStopPointIndex} from './providers/pks-stops';
import {fetchMpkVehicleFeed, fetchMpkRzeszowVehiclesDirect, fetchMpkRzeszowVehicleDetailsDirect} from './providers/mpk-vehicles';

async function fetchPksVehiclesSnapshot(signal?: AbortSignal) {
  const panelFeedUrl = isNative() ? 'http://185.214.67.112/api/its/vehicles' : '/api/pks/vehicles';
  const panelRequest = requestJson<any>(panelFeedUrl, {
    signal,
    headers: isNative()
      ? {
          Host: 'einfo.zgpks.rzeszow.pl',
          Accept: 'application/json',
        }
      : { Accept: 'application/json' },
  }).then((feed) => Array.isArray(feed?.items) ? feed.items : Array.isArray(feed) ? feed : []);
  const directRequest = requestJson<any[]>('https://www.mpkrzeszow.pl/pks/get_vehicles.php', { signal });
  try {
    return await Promise.any([panelRequest, directRequest].map(async (request) => {
      const items = await request;
      if (!Array.isArray(items) || items.length === 0) throw new Error('Empty PKS snapshot');
      return items;
    }));
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
  }

  const wsItems = await fetchPksVehiclesFromPanelWebSocket(signal).catch(() => []);
  if (wsItems.length > 0) return wsItems;

  return [];
}

function fetchPksVehiclesFromPanelWebSocket(signal?: AbortSignal): Promise<any[]> {
  if (typeof WebSocket === 'undefined') return Promise.resolve([]);

  return new Promise((resolve) => {
    let settled = false;
    let ws: WebSocket | null = null;
    const finish = (items: any[]) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortHandler);
      try {
        ws?.close();
      } catch {}
      resolve(items);
    };
    const abortHandler = () => finish([]);
    const timeoutId = window.setTimeout(() => finish([]), 3500);

    signal?.addEventListener('abort', abortHandler, { once: true });
    try {
      ws = new WebSocket('ws://185.214.67.112:3000/rist');
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data || ''));
          const items = Array.isArray(payload?.items) ? payload.items : [];
          if (items.length > 0) finish(items);
        } catch {
          finish([]);
        }
      };
      ws.onerror = () => finish([]);
      ws.onclose = () => finish([]);
    } catch {
      finish([]);
    }
  });
}

async function fetchPksVehiclesClient(includeInactive: boolean, signal?: AbortSignal) {
  const rawVehicles = await fetchPksVehiclesSnapshot(signal);
  const now = Date.now();

  return (Array.isArray(rawVehicles) ? rawVehicles : [])
    .map((vehicle) => mapVehicle(vehicle, now, includeInactive, {}, false))
    .filter((vehicle): vehicle is Vehicle => Boolean(vehicle))
    .map((vehicle) => ({
      ...vehicle,
      provider: 'pks' as const,
      operatorName: 'PKS Rzeszów',
      type: 'bus' as const,
    }));
}

async function fetchPksVehicleDetailsClient(vehicleId: string, includeInactive: boolean) {
  const [rawVehicles, stopsDict] = await Promise.all([
    fetchPksVehiclesSnapshot(),
    loadStopPointIndex(),
  ]);
  const rawVehicle = (Array.isArray(rawVehicles) ? rawVehicles : []).find((vehicle) =>
    String(vehicle?.vehicle_id ?? vehicle?.id ?? `json-${getTripBase(vehicle?.trip_id) || ''}`) === String(vehicleId),
  );
  if (!rawVehicle) return null;

  const mapped = mapVehicle(rawVehicle, Date.now(), includeInactive, stopsDict, true);
  if(mapped) {
    const officialStops=await officialBusStops('pks',rawVehicle.trip_id).catch(()=>[]);
    const full=mapped.routeStops||[];
    const aligned=officialStops.length===full.length && full.every((stop,index)=>!Number.isFinite(stop.lat)||!Number.isFinite(stop.lon)||distanceMeters([stop.lat!,stop.lon!],[officialStops[index].lat,officialStops[index].lon])<1200);
    if(aligned) {
      mapped.routeStops=full.map((stop,index)=>({...stop,lat:stop.lat??officialStops[index].lat,lon:stop.lon??officialStops[index].lon}));
      const byId=new Map(mapped.routeStops.map(stop=>[String(stop.id),stop]));
      mapped.schedule=mapped.schedule?.map(stop=>({...stop,lat:stop.lat??byId.get(String(stop.id))?.lat,lon:stop.lon??byId.get(String(stop.id))?.lon}));
    }
  }
  return mapped
    ? {
        ...mapped,
        provider: 'pks' as const,
        operatorName: 'PKS Rzeszów',
        type: 'bus' as const,
      }
    : null;
}

async function fetchMpkRzeszowVehiclesClient(includeInactive: boolean, signal?: AbortSignal) {
  const searchParams = new URLSearchParams();
  searchParams.set('providers', 'mpk_rzeszow');
  if (includeInactive) searchParams.set('includeInactive', 'true');

  try {
    const direct = await fetchMpkRzeszowVehiclesDirect(includeInactive, signal);
    if (direct.length > 0) return direct;
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  try {
    const response = await requestJson<TransportApiVehiclesResponse>(transportApiUrl('/vehicles', searchParams), { signal });
    const vehicles = (response.vehicles || []).map(mapTransportVehicleToClient);
      if (vehicles.length > 0) return vehicles;
    return fetchMpkRzeszowVehiclesDirect(includeInactive, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    console.warn('MPK Rzeszów backend unavailable, using direct MPK feed:', error);
    return fetchMpkRzeszowVehiclesDirect(includeInactive, signal);
  }
}

async function fetchMarcelVehiclesClient(includeInactive: boolean, signal?: AbortSignal, viewport?: PkpQueryViewport) {
  const vehicles = await fetchMarcelVehiclesDirect(includeInactive, signal);
  if (!signal?.aborted && viewport?.bbox) warmMarcelBadgeCourses(vehicles, viewport.bbox);
  return vehicles;
}

function getTripBase(tripId: unknown) {
  return String(tripId || '').trim().split('_')[0] || '';
}

function formatStopName(rawName: string | undefined) {
  if (!rawName) return 'Przystanek nieznany';
  return rawName.trim();
}

function buildSchedule(nextStopPoints: any[] | undefined, stopsDict: StopPointIndex) {
  return (nextStopPoints || []).map((sp: any) => {
    const stopId = Number(sp.stop_point_id ?? sp.stopPointId ?? sp.id);
    const plannedRaw = sp.planned_departure_time ?? sp.timetable_time ?? sp.planned;
    const realRaw = sp.real_departure_time ?? sp.real;
    const lat = Number(sp.location?.lat ?? sp.lat ?? sp.latitude);
    const lon = Number(sp.location?.lon ?? sp.location?.lng ?? sp.lon ?? sp.lng ?? sp.long ?? sp.longitude);
    return {
      id: stopId,
      name: formatStopName(sp.name || stopsDict[String(stopId)]?.n || `Przystanek ${stopId}`),
      planned: Number.isFinite(transitTimestamp(plannedRaw)) ? new Date(transitTimestamp(plannedRaw)).toISOString() : null,
      real: Number.isFinite(transitTimestamp(realRaw)) ? new Date(transitTimestamp(realRaw)).toISOString() : null,
      lat: Number.isFinite(lat) ? lat : stopsDict[String(stopId)]?.lat,
      lon: Number.isFinite(lon) ? lon : stopsDict[String(stopId)]?.lon,
    };
  });
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

function inferVehicleStatus(v: any,ageSec: number,speed: number,now: number,hasLine: boolean,schedule: ReturnType<typeof buildSchedule>) {
  if(!hasLine)return {status:'inactive' as const,statusText:'Pojazd bez przypisanej linii',nextTripStartAtMs:undefined,nextTripFirstStopId:undefined};
  if(v.journey?.route?.is_technical)return {status:'technical' as const,statusText:'Przejazd techniczny',nextTripStartAtMs:undefined,nextTripFirstStopId:undefined};
  const path=buildRoutePath(v.journey?.route);
  const firstId=path[0];
  const pointNumber=Number(v.position?.last_stop_point_number);
  const distance=Number(v.position?.last_stop_point_distance);
  const atFirst=pointNumber===0 && distance<=150;
  const atLast=path.length>1 && pointNumber>=path.length-1 && distance<=150;
  const firstDepartureMs=v.journey?.departure_time ? warsawTimeMs(v.journey.vehicle_journey_date||warsawDateIso(),v.journey.departure_time) : transitTimestamp(schedule.find(stop=>stop.id===firstId)?.planned);
  const operating=busOperatingState({lat:Number(v.position?.lat),lon:Number(v.position?.long??v.position?.lon),speed,nowMs:now,stops:schedule,firstDepartureMs,firstStopId:firstId,atFirstStop:atFirst,atLastStop:atLast});
  return {...operating,nextTripStartAtMs:'nextTripStartAtMs' in operating ? operating.nextTripStartAtMs : undefined,nextTripFirstStopId:'nextTripFirstStopId' in operating ? Number(operating.nextTripFirstStopId) : undefined};
}

function mapVehicle(
  v: any,
  now: number,
  includeInactive: boolean,
  stopsDict: StopPointIndex,
  includeDetails = true,
): Vehicle | null {
  const position = v.position || v.location || {};
  const lat = Number(position.lat ?? position.latitude);
  const lon = Number(position.long ?? position.lon ?? position.lng ?? position.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const signalRaw = (position.position_date || position.timestamp || v.lastUpdate || v.updatedAt)
    ? String(position.position_date || position.timestamp || v.lastUpdate || v.updatedAt).replace(' ', 'T')
    : '';
  const signalMs = signalRaw ? transitTimestamp(signalRaw) : now;
  const lineName = String(v.journey?.line?.line_name || v.journey?.line?.name || '').trim() || '---';
  const fallbackLineName = String(v.line_name || v.line || '').trim();
  const effectiveLineName = lineName !== '---' ? lineName : (fallbackLineName || '---');
  const hasLine = effectiveLineName !== '---' && effectiveLineName !== '?';
  const ageSec = Math.max(0, Math.floor((now - (Number.isNaN(signalMs) ? now : signalMs)) / 1000));
  if (!includeInactive && !hasLine) return null;
  if (ageSec > 7 * 60) return null;

  const vehicleId = String(v.vehicle_id ?? v.id ?? `json-${getTripBase(v.trip_id) || now}`);
  const rawSpeed = Number(position.speed);
  const speed = computeObservedSpeedKmh(`pks:${vehicleId}`, lat, lon, Number.isNaN(signalMs) ? now : signalMs, rawSpeed);
  const destination = v.journey?.route?.description || v.journey?.route?.name || v.route_description || v.direction || 'W trasie';
  const schedule = includeDetails ? buildSchedule(v.next_stop_points, stopsDict) : [];
  const statusSchedule = includeDetails ? schedule : buildSchedule((v.next_stop_points || []).slice(0,1), {});
  const vehicleStatus = inferVehicleStatus(v, ageSec, speed ?? 0, now, hasLine, statusSchedule);
  const routePath = includeDetails ? buildRoutePath(v.journey?.route) : [];
  const routeStops = routePath.map(id => {const timed=schedule.find(stop=>stop.id===id);const point=stopsDict[String(id)];return {...timed,id,name:point?.n||timed?.name||`Przystanek ${id}`,lat:point?.lat??timed?.lat,lon:point?.lon??timed?.lon,planned:timed?.planned||null,real:timed?.real||null};});

  return {
    id: vehicleId,
    routeId: effectiveLineName,
    name: `PKS ${effectiveLineName !== '---' ? effectiveLineName : vehicleId}`,
    routeShortName: effectiveLineName !== '---' ? effectiveLineName : '?',
    lat,
    lon,
    speed,
    computedSpeed: speed,
    direction: destination,
    delay: typeof v.delay === 'number' ? v.delay : typeof v.deviation === 'number' ? v.deviation * 60 : undefined,
    dataAgeSec: ageSec,
    schedule,
    routePath,
    routeStops,
    model: v.model,
    lastStopDistance: typeof position.last_stop_point_distance === 'number' ? position.last_stop_point_distance : undefined,
    lastStopId: Number(position.last_stop_point_number)>0 ? buildRoutePath(v.journey?.route)[Number(position.last_stop_point_number)-1] : undefined,
    lastSignalTime: Number.isFinite(signalMs) ? new Date(signalMs).toISOString() : undefined,
    previousTripEndedAtMs: Number.isFinite(vehicleStatus.nextTripStartAtMs) ? now : undefined,
    nextTripStartAtMs: vehicleStatus.nextTripStartAtMs,
    nextTripFirstStopId: vehicleStatus.nextTripFirstStopId,
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

export async function fetchVehiclesClient(
  includeInactive: boolean,
  providers: TransportProviderId[] = ['pks'],
  options?: { signal?: AbortSignal; pkpViewport?: PkpQueryViewport; onProviderLoaded?: (provider: TransportProviderId, vehicles: Vehicle[]) => void },
) {
  const activeProviders = providers.filter(Boolean);
  if (activeProviders.length === 0) return [];

  const requests = activeProviders.map(async (provider) => {
    const runtime = getTransportRuntime();
    if (runtime && runtime.endpointUrl !== TRANSPORT_API_BASE_URL) {
      const params = new URLSearchParams({ providers: provider, includeInactive: String(includeInactive) });
      if (options?.pkpViewport?.bbox) params.set('bbox', options.pkpViewport.bbox.join(','));
      try {
        const response = await requestJson<TransportApiVehiclesResponse>(transportApiUrl('/vehicles', params), { signal: options?.signal });
        if (!Array.isArray(response.vehicles)) throw new Error('API nie zwróciło listy pojazdów.');
        const status = response.providers?.[provider];
        if (status === 'error' || status === 'unsupported' || (response.providers && status == null && response.vehicles.length === 0)) {
          throw new Error(`Wybrane API nie udostępnia danych przewoźnika: ${provider}.`);
        }
        return response.vehicles.map(mapTransportVehicleToClient);
      } catch (error) {
        if (options?.signal?.aborted || !runtime.fallbackEnabled) throw error;
      }
    }
    if (provider === 'pks') return fetchPksVehiclesClient(includeInactive, options?.signal);
    if (provider === 'mpk_rzeszow') {
      return fetchMpkRzeszowVehiclesClient(includeInactive, options?.signal).catch((error) => {
        if ((error as any)?.name === 'AbortError') throw error;
        console.warn('MPK Rzeszów provider unavailable:', error);
        return [];
      });
    }
    if (provider === 'marcel') {
      return fetchMarcelVehiclesClient(includeInactive, options?.signal, options?.pkpViewport).catch((error) => {
        if ((error as any)?.name === 'AbortError') throw error;
        console.warn('Marcel provider unavailable:', error);
        return [];
      });
    }
    if (provider === 'pkp_intercity') {
      const fetchBackendVehicles = async () => {
        const searchParams = new URLSearchParams();
        searchParams.set('providers', 'pkp_intercity');
        if (includeInactive) searchParams.set('includeInactive', 'true');
        const bbox = options?.pkpViewport?.bbox;
        if (bbox && bbox.length === 4 && bbox.every((value) => Number.isFinite(Number(value)))) {
          searchParams.set('bbox', bbox.join(','));
        }
        const response = await requestJson<TransportApiVehiclesResponse>(transportApiUrl('/vehicles', searchParams), {
          signal: options?.signal,
        });
        return (response.vehicles || []).map(mapTransportVehicleToClient);
      };

      const fallbackVehicles = async () => {
        if (!isNative()) {
          try {
            const gps = await fetchPkpIntercityPortalGpsVehicles(options?.signal, options?.pkpViewport);
            if (gps.length > 0) return gps;
          } catch (gpsError) {
            if (isAbortLikeError(gpsError)) throw gpsError;
            console.warn('PKP Intercity portal GPS fallback unavailable:', gpsError);
          }
        }

        try {
          const backend = await fetchBackendVehicles();
          if (backend.length > 0) return backend;
        } catch (backendError) {
          if (isAbortLikeError(backendError)) throw backendError;
          console.warn('PKP Intercity backend fallback unavailable:', backendError);
        }

        try {
          const direct = await fetchPkpIntercityVehiclesDirect(options?.signal, options?.pkpViewport);
          if (direct.length > 0) return direct;
        } catch (fallbackError) {
          if (isAbortLikeError(fallbackError)) throw fallbackError;
          console.warn('PKP Intercity direct fallback unavailable:', fallbackError);
        }

        return [];
      };

      return fallbackVehicles()
        .catch((error) => {
          if (isAbortLikeError(error)) throw error;
          console.warn('PKP Intercity provider unavailable:', error);
          return [];
        })
        .then((vehicles) => vehicles.filter((vehicle) => Number.isFinite(vehicle.lat) && Number.isFinite(vehicle.lon)))
        .catch((error) => {
          if (isAbortLikeError(error)) throw error;
          console.warn('PKP Intercity provider unavailable:', error);
          return [];
        });
    }
    return [];
  });

  const results = await Promise.all(requests.map(async (request, index) => {
    const vehicles = await request;
    if (!options?.signal?.aborted) options?.onProviderLoaded?.(activeProviders[index], vehicles);
    return vehicles;
  }));
  return results.flat();
}

export async function fetchVehicleDetailsClient(provider: TransportProviderId, vehicleId: string, includeInactive = true) {
  const runtime = getTransportRuntime();
  if (runtime && runtime.endpointUrl !== TRANSPORT_API_BASE_URL) {
    try {
      const response = await requestJson<{ vehicle?: TransportApiVehicle }>(transportApiUrl(`/vehicle/${encodeURIComponent(provider)}/${encodeURIComponent(vehicleId)}`, new URLSearchParams({ includeInactive: String(includeInactive) })));
      return response.vehicle ? mapTransportVehicleToClient(response.vehicle) : null;
    } catch (error) { if (!runtime.fallbackEnabled) throw error; }
  }
  if (provider === 'marcel') {
    return fetchMarcelVehicleDetailsDirect(vehicleId, includeInactive).catch((error) => {
      console.warn('Marcel direct details unavailable:', error);
      return null;
    });
  }

  if (provider === 'mpk_rzeszow') {
    const directVehicle = await fetchMpkRzeszowVehicleDetailsDirect(vehicleId, includeInactive).catch((error) => {
      console.warn('MPK Rzeszów direct details unavailable, using backend:', error);
      return null;
    });
    if (directVehicle && (directVehicle.schedule?.length || 0) > 1) return directVehicle;

    try {
      const searchParams = new URLSearchParams();
      if (includeInactive) searchParams.set('includeInactive', 'true');
      const response = await requestJson<{ vehicle?: TransportApiVehicle }>(
        transportApiUrl(`/vehicle/${encodeURIComponent(provider)}/${encodeURIComponent(vehicleId)}`, searchParams),
      );
      const vehicle = response.vehicle ? mapTransportVehicleToClient(response.vehicle) : null;
      if (vehicle && (vehicle.schedule?.length || 0) > 1) return vehicle;
    } catch (error) {
      console.warn('MPK Rzeszów details backend unavailable:', error);
    }

    return directVehicle;
  }

  if (provider === 'pks') {
    const directVehicle = await fetchPksVehicleDetailsClient(vehicleId, includeInactive).catch((error) => {
      console.warn('PKS details unavailable:', error);
      return null;
    });
    if (directVehicle) return directVehicle;
  }

  if (provider === 'pkp_intercity') {
    try {
      const searchParams = new URLSearchParams();
      if (includeInactive) searchParams.set('includeInactive', 'true');
      const response = await requestJson<{ vehicle?: TransportApiVehicle }>(
        transportApiUrl(`/vehicle/${encodeURIComponent(provider)}/${encodeURIComponent(vehicleId)}`, searchParams),
      );
      const vehicle = response.vehicle ? mapTransportVehicleToClient(response.vehicle) : null;
      if (vehicle) return vehicle;
    } catch (error) {
      console.warn('PKP Intercity details backend unavailable, using direct fallback:', error);
    }

    return fetchPkpIntercityVehicleDetailsDirect(vehicleId).catch((error) => {
      console.warn('PKP Intercity direct details unavailable:', error);
      return null;
    });
  }

  const searchParams = new URLSearchParams();
  if (includeInactive) searchParams.set('includeInactive', 'true');

  const response = await requestJson<{ vehicle?: TransportApiVehicle }>(
    transportApiUrl(`/vehicle/${encodeURIComponent(provider)}/${encodeURIComponent(vehicleId)}`, searchParams),
  );

  if (!response.vehicle) return null;
  return mapTransportVehicleToClient(response.vehicle);
}

async function fetchRouteGeometryClientImpl(
  request: RouteGeometryClientRequest,
  options?: { signal?: AbortSignal },
): Promise<RouteGeometryClientResponse> {
  const isRail = request.mode === 'rail';
  const fetchClientFallback = async (): Promise<RouteGeometryClientResponse> => {
    if (isRail) {
      return {
        carrier: request.carrier,
        line: request.line,
        direction: request.direction,
        variant: request.variant || 'default',
        stopsHash: '',
        cacheKey: '',
        geometry: {
          type: 'LineString',
          coordinates: [],
        },
        source: 'rail-empty-fallback',
        sourceQuality: 'none',
        isSynthetic: false,
        cached: false,
        skippedSegments: 0,
      };
    }

    const stopCoords = request.stops
      .filter((stop) => readBusCoordinates(stop.lat,stop.lon))
      .map((stop) => [Number(stop.lat), Number(stop.lon)] as ShapePoint);
    const persist = (points: ShapePoint[]) => {
    if (points.length > 1 && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('routeGeometry:' + routeGeometryKey(request.mode || 'road', request.carrier,
          request.line, request.direction, request.stops), JSON.stringify({version: request.dataVersion,
          expiresAt: Date.now()+30*24*60*60*1000, points: points}));
      } catch { /* Memory caching remains available when storage is full. */ }
    }
    };
    const fallbackPoints = await fetchRoadRouteForStops(
      stopCoords,
      [
        request.carrier,
        request.line,
        request.direction,
        stopCoords.map(([lat, lon]) => `${lat.toFixed(6)},${lon.toFixed(6)}`).join('|'),
      ].join(':'),
      { strictShortSegments: request.carrier === 'mpk_rzeszow',stopWaypoints:true,signal:options?.signal,onResolved:persist },
    );
    if (fallbackPoints.length <= 1) {
      return {
        carrier: request.carrier,
        line: request.line,
        direction: request.direction,
        variant: request.variant || 'default',
        stopsHash: '',
        cacheKey: '',
        geometry: {
          type: 'LineString',
          coordinates: [],
        },
        source: 'road-empty-fallback',
        sourceQuality: 'none',
        isSynthetic: false,
        cached: false,
        skippedSegments: 0,
      };
    }

    return {
      carrier: request.carrier,
      line: request.line,
      direction: request.direction,
      variant: request.variant || 'default',
      stopsHash: '',
      cacheKey: '',
      geometry: {
        type: 'LineString',
        coordinates: fallbackPoints.map(([lat, lon]) => [lon, lat]),
      },
      source: 'bus-road-routing',
      sourceQuality: 'fallback',
      isSynthetic: false,
      cached: false,
      skippedSegments: 0,
    };
  };

  if(!isRail) return fetchClientFallback();

  let response: RouteGeometryClientResponse | null = null;
  try {
    response = await requestJson<RouteGeometryClientResponse>(transportApiUrl('/routes/geometry'), {
      method: 'POST',
      signal: options?.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
  } catch (error) {
    if ((error as any)?.name === 'AbortError' || options?.signal?.aborted) throw error;
    return fetchClientFallback();
  }

  const coordinates = response.geometry?.coordinates || [];
  const source = String(response.source || '').toLowerCase();
  const isSynthetic = response.isSynthetic === true || source.includes('synthetic');
  if (isSynthetic) {
    return fetchClientFallback();
  }
  if (response.geometry?.type !== 'LineString' || coordinates.length <= 1) {
    return fetchClientFallback();
  }

  const sourceQuality = response.sourceQuality
    || (source.includes('fallback') ? 'fallback' : 'high');
  return {
    ...response,
    sourceQuality,
    isSynthetic: false,
  };
}

export function fetchRouteGeometryClient(request:RouteGeometryClientRequest,options?:{signal?:AbortSignal}):Promise<RouteGeometryClientResponse>{
  const load=()=>fetchRouteGeometryClientImpl(request,options);
  const provider=request.carrier==='pks'?'pks':request.carrier==='mpk_rzeszow'?'mpk_rzeszow':request.carrier==='marcel'?'marcel':null;
  return provider?measuredTransport(provider,'geometry',load,value=>value.geometry?.coordinates?.length??0):load();
}

export async function diagnoseBuiltinProviders(){
  return Promise.allSettled([
    measuredTransport('pks','vehicles',()=>fetchPksVehiclesSnapshot(),value=>value.length,value=>diagnosticSignalAge(value.map(row=>transitTimestamp(row.position?.position_date||row.lastUpdate)))),
    measuredTransport('mpk_rzeszow','vehicles',()=>fetchMpkVehicleFeed(),value=>value.length,value=>diagnosticSignalAge(value.map(row=>row.timestamp?mpkSignalTime(row,Date.now()):NaN))),
    measuredTransport('marcel','vehicles',()=>fetchMarcelPositionSnapshot(),value=>value.rows.length,value=>diagnosticSignalAge(value.rows.map(readMarcelTimestamp))),
  ]);
}

function diagnosticSignalAge(times:number[]){const valid=times.filter(time=>Number.isFinite(time)&&time>0&&time<=Date.now()+60_000);return valid.length?Math.max(0,Math.floor((Date.now()-Math.max(...valid))/1000)):undefined;}

export type {TransportProviderId} from './transport/types';
export type {RouteGeometryStop} from './transport/types';
export type {PkpQueryViewport} from './transport/types';
export type {RouteGeometryClientRequest} from './transport/types';
export type {RouteGeometryClientResponse} from './transport/types';
export {subscribeMarcelCourseDelays} from './providers/marcel-client';
export {withCachedMarcelDelay} from './providers/marcel-client';
export {warmMarcelBadgeCourses} from './providers/marcel-client';
export {fetchStopsClient} from './providers/pks-stops';
export {fetchPksTimetableClient} from './providers/pks-departures';
export {fetchDeparturesClient} from './providers/pks-departures';
export type {MpkRzeszowStop} from './transport/types';
export type {MpkRzeszowScheduleEntry} from './transport/types';
export {fetchMpkRzeszowStopsClient} from './providers/mpk-departures-client';
export {fetchMpkRzeszowDeparturesClient} from './providers/mpk-departures-client';
export type {MarcelLivePosition} from './transport/types';
export {fetchMarcelLivePositionsClient} from './providers/marcel-client';
export {estimateMarcelCourseDelay} from './providers/marcel-client';
export {fetchMarcelRoutesClient,fetchMarcelCoursesClient} from './providers/marcel-client';
export {fetchMarcelPublicCourseStopsClient} from './providers/marcel-client';
export {fetchRouteShapeClient} from './transport/legacy-shapes';
