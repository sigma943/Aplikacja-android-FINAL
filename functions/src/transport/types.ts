export type ProviderId = 'mpk_rzeszow' | 'marcel';

export type VehicleStatus = 'active' | 'break' | 'inactive' | 'technical' | 'cached';

export type CacheState = 'fresh' | 'stale' | 'miss';

export type ProviderRuntimeStatus = 'ok' | 'stale' | 'error' | 'unsupported' | 'unknown';

export interface TransportStopSchedule {
  id: number;
  name: string;
  planned: string | null;
  real: string | null;
  lat?: number;
  lng?: number;
  lon?: number;
  isPast?: boolean;
}

export interface TransportVehicle {
  id: string;
  provider: ProviderId;
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
  schedule?: TransportStopSchedule[];
  routeStops?: TransportStopSchedule[];
  routePath?: number[];
  model?: string;
  lastStopDistance?: number;
  lastStopId?: number;
  lastUpdate?: string;
  journeyId?: string | number;
  serviceId?: string | number;
  tripId?: string | number;
  brigadeName?: string;
  status?: VehicleStatus;
  statusText?: string;
  isHistorical?: boolean;
}

export interface ProviderVehiclesResult {
  vehicles: TransportVehicle[];
  cache: CacheState;
}

export interface GetVehiclesOptions {
  includeInactive: boolean;
  bbox?: [number, number, number, number] | null;
}

export interface ProviderHealthSnapshot {
  provider: ProviderId;
  status: ProviderRuntimeStatus;
  implemented: boolean;
  operatorName: string;
  lastSuccessAt?: string;
  lastErrorAt?: string;
  lastError?: string;
}

export interface TransportProvider {
  id: ProviderId;
  operatorName: string;
  implemented: boolean;
  getVehicles(options: GetVehiclesOptions): Promise<ProviderVehiclesResult>;
  getVehicleDetails(vehicleId: string, options?: Pick<GetVehiclesOptions, 'includeInactive'>): Promise<TransportVehicle | null>;
}
