

type StopsMap = Record<string, {n: string; lat?: number; lon?: number; areaId?: string; code?: string}>;

type FullStopRecord = { id?: string; name?: string; areaId?: string; code?: string };

type PersistentCacheEnvelope<T> = {
  version: number;
  savedAt: number;
  signature: string;
  data: T;
};

type ShapePoint = [number, number];

type ShapeMetadata = { id: string; bbox: [number, number, number, number]; samples: ShapePoint[] };

type StopPointIndex = Record<string, { n: string; lat?: number; lon?: number }>;

export type TransportProviderId = 'pks' | 'mpk_rzeszow' | 'marcel' | 'pkp_intercity';

export type RouteGeometryStop = {
  id?: string | number;
  name?: string;
  lat: number;
  lon: number;
  sequence?: number;
};

export type PkpQueryViewport = {
  bbox?: [number, number, number, number] | null;
  center?: [number, number] | null;
  zoom?: number;
};

export type RouteGeometryClientRequest = {
  carrier: string;
  line: string;
  direction: string;
  variant?: string;
  stops: RouteGeometryStop[];
  dataVersion?: string;
  mode?: 'road' | 'rail';
};

export type RouteGeometryClientResponse = {
  carrier: string;
  line: string;
  direction: string;
  variant: string;
  stopsHash: string;
  cacheKey: string;
  geometry?: {
    type: 'LineString';
    coordinates?: [number, number][];
  };
  source?: string;
  sourceQuality?: 'high' | 'fallback' | 'none';
  isSynthetic?: boolean;
  cached?: boolean;
  skippedSegments?: number;
};

type TransportApiVehicle = {
  id: string;
  provider: TransportProviderId;
  operatorName: string;
  type: 'bus' | 'train';
  iconVariant: string;
  vehicleNumber?: string;
  line: string;
  displayName: string;
  name: string;
  routeId?: string;
  lat: number;
  lng: number;
  bearing?: number;
  speed?: number;
  direction?: string;
  delaySeconds?: number;
  delayMinutes?: number;
  dataAgeSec?: number;
  scheduleSource?: 'mybus';
  schedule?: Array<{ id: number; name: string; planned: string | null; real: string | null; lat?: number; lon?: number; lng?: number; isPast?: boolean; platform?: string; track?: string; stopDelayMinutes?: number; timeType?: 'arrival' | 'departure' }>;
  routeStops?: Array<{ id: number; name: string; planned: string | null; real: string | null; lat?: number; lon?: number; lng?: number; isPast?: boolean; platform?: string; track?: string; stopDelayMinutes?: number; timeType?: 'arrival' | 'departure' }>;
  routePath?: number[];
  model?: string;
  lastStopDistance?: number;
  lastStopId?: number;
  lastUpdate?: string;
  previousTripEndedAtMs?: number;
  nextTripStartAtMs?: number;
  nextTripFirstStopId?: number;
  computedSpeed?: number;
  journeyId?: string | number;
  serviceId?: string | number;
  tripId?: string | number;
  brigadeName?: string;
  status?: 'active' | 'break' | 'inactive' | 'technical' | 'cached';
  statusText?: string;
  isHistorical?: boolean;
  trainName?: string;
  positionQuality?: 'known' | 'estimated';
};

type TransportApiVehiclesResponse = {
  vehicles?: TransportApiVehicle[];
  providers?: Record<string, string>;
  meta?: {
    generatedAt?: string;
    cache?: string;
  };
};

type MarcelCourseStop = {
  id: number;
  name: string;
  lat: number;
  lon: number;
  plannedMs: number;
  planned: string | null;
  km: number;
  order: number;
};

type PkpTrainMetadata = {
  trainNumber: string;
  category: string;
  trainName?: string;
};

export type MpkRzeszowStop = {
  stop_id: number | string;
  stop_name: string;
  stop_lat?: string | number;
  stop_lon?: string | number;
  zone_id?: string | number;
  lines?: string;
};

export type MpkRzeszowScheduleEntry = {
  line: string;
  trip_headsign?: string;
  departure_time: string;
  real_departure_time?: string;
  realtime_source?: 'stop-board';
  block_id?: string | number;
  private_code?: string;
  vehicle?: string | number | null;
  trip_id?: string | number;
  board_is_past?: boolean;
  board_at_stop?: boolean;
  board_observed_at_ms?: number;
  board_time_precision_ms?: number;
  is_last_stop?: boolean;
  start_stop_id?: string | number;
  start_stop_name?: string;
  end_stop_id?: string | number;
  end_stop_name?: string;
};

export type MarcelLivePosition = { tripId: string; lat: number; lon: number; observedAtMs: number };

type MarcelPositionSnapshot = { rows: any[]; observedAtMs: number; positions: MarcelLivePosition[] };

export type {StopsMap};
export type {FullStopRecord};
export type {PersistentCacheEnvelope};
export type {ShapePoint};
export type {ShapeMetadata};
export type {StopPointIndex};
export type {TransportApiVehicle};
export type {TransportApiVehiclesResponse};
export type {MarcelCourseStop};
export type {PkpTrainMetadata};
export type {MarcelPositionSnapshot};
