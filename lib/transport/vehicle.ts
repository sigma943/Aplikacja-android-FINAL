
export interface StopSchedule {
  id: number;
  name: string;
  planned: string | null;
  real: string | null;
  lat?: number;
  lon?: number;
  isPast?: boolean;
  platform?: string;
  track?: string;
  stopDelayMinutes?: number;
  timeType?: 'arrival' | 'departure';
}

export interface Vehicle {
  id: string;
  provider?: string;
  operatorName?: string;
  type?: 'bus' | 'train';
  iconVariant?: string;
  vehicleNumber?: string;
  name: string;
  routeId?: string;
  routeShortName?: string;
  lat: number;
  lon: number;
  speed?: number;
  direction?: string;
  delay?: number;
  positionObservedAtMs?: number;
  dataAgeSec?: number;
  schedule?: StopSchedule[];
  routeStops?: StopSchedule[];
  routePath?: number[];
  model?: string;
  // Test fields
  lastStopDistance?: number;
  lastStopId?: number;
  lastSignalTime?: string;
  previousTripEndedAtMs?: number;
  nextTripStartAtMs?: number;
  nextTripFirstStopId?: number;
  computedSpeed?: number;
  journeyId?: string | number;
  serviceId?: string | number;
  tripId?: string | number;
  brigadeName?: string;
  bearing?: number;
  status?: 'active' | 'break' | 'inactive' | 'technical' | 'cached';
  statusText?: string;
  isHistorical?: boolean;
  trainName?: string;
  positionQuality?: 'known' | 'estimated';
}

export interface StopData {
  n: string;
  lat: number;
  lon: number;
}

