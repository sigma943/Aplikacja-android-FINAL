
import type {Vehicle} from '@/components/BusMap';
import {warsawDateIso} from '@/lib/transit-time';
import {transitTimestamp} from '@/lib/bus-operating-state';

import {type TransportProviderId} from '@/lib/pks-client';

const normalizeVehicleText = (value?: string | null) =>
  String(value || '')
    .replace(/\[Brak sygna\?u\]/g, '[Brak sygna\u0142u]')
    .replace(/\[Brak sygna\u0142u\]/g, '[Brak sygna\u0142u]')
    .replace(/Post\?j/g, 'Post\u00f3j')
    .replace(/Post\u00f3j/g, 'Post\u00f3j')
    .replace(/ostatni\? pozycj\?/gi, 'ostatni\u0105 pozycj\u0119');

const parseJourneyMs = (raw: unknown): number => {
  const value = String(raw || '').trim();
  if (!value) return NaN;
  const normalized = value.replace(' ', 'T');
  const parsed = new Date(normalized).getTime();
  if (Number.isFinite(parsed)) return parsed;

  const timeOnly = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!timeOnly) return NaN;
  const now = new Date();
  now.setHours(Number(timeOnly[1]), Number(timeOnly[2]), Number(timeOnly[3] || '0'), 0);
  return now.getTime();
};

const formatGpsSignalClock = (value?: string | null) => {
  const ms = parseJourneyMs(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
};

const isScheduleStopUpcoming = (
  stop: Pick<NonNullable<Vehicle['schedule']>[number], 'planned' | 'real' | 'isPast'> | null | undefined,
  nowMs: number,
) => {
  if (!stop) return false;
  if (stop.isPast) return false;
  const timeRaw = String(stop.real || stop.planned || '').trim();
  if (!timeRaw) return true;
  const timeMs = parseJourneyMs(timeRaw);
  if (!Number.isFinite(timeMs)) return true;
  return timeMs >= nowMs - 30 * 1000;
};

const hasUsableRouteDetails = (vehicle?: Vehicle | null) => {
  if (!vehicle) return false;
  if ((vehicle.routePath?.length || 0) > 1) return true;
  if ((vehicle.routeStops?.length || 0) > 1) return true;
  if ((vehicle.schedule?.length || 0) > 1) return true;
  return false;
};

/** Course IDs are separate namespaces; a matching trip pattern does not permit
 * details from a different journey, direction or service day. */
export function sameVehicleCourse(base:Vehicle,details:Vehicle){
  for(const key of ['provider','id','tripId','journeyId','serviceId','direction'] as const){
    const a=base[key],b=details[key];
    if(a!=null&&b!=null&&String(a).trim()&&String(b).trim()&&String(a).trim()!==String(b).trim())return false;
  }
  // GPS dates in ISO UTC can straddle a service midnight without a new course;
  // compare the provider schedule day instead when both are available.
  const day=(v:Vehicle)=>{const at=transitTimestamp((v.routeStops?.length?v.routeStops:v.schedule||[]).find(s=>s.planned)?.planned);return Number.isFinite(at)?warsawDateIso(0,new Date(at)):'';};
  const x=day(base),y=day(details);
  return !(x&&y&&x!==y);
}

const vehicleRouteDetailsCacheKey = (vehicle: Vehicle, provider: TransportProviderId, includeInactive: boolean) => {
  const routeIdentity = String(
    vehicle.journeyId ??
    vehicle.tripId ??
    vehicle.serviceId ??
    vehicle.routeId ??
    vehicle.direction ??
    vehicle.routeShortName ??
    'current',
  ).trim();
  const identity = [provider, vehicle.id, routeIdentity || 'current', includeInactive ? 'inactive' : 'active'];
  if(provider==='pks'){
    const at=Date.parse(vehicle.lastSignalTime||'');
    identity.push(String(vehicle.tripId??''),String(vehicle.journeyId??''),vehicle.direction||'',Number.isFinite(at)?warsawDateIso(0,new Date(at)):'');
  }
  // PKS details contain next_stop_points as well as the static route. Refresh
  // the remaining sequence when live telemetry reports another stop passage.
  if (provider === 'pks') identity.push(String(vehicle.lastStopId ?? 'before-first-stop'));
  return identity.join(':');
};

/** A shorter PKS next_stop_points list means progress, not poorer route data. */
export function latestPksRemainingSchedule(base: Vehicle, details: Vehicle) {
  const hasSchedule = (vehicle: Vehicle) => Boolean(vehicle.schedule?.length || vehicle.routeStops?.length);
  if (!hasSchedule(details)) return base.schedule || [];
  if (!hasSchedule(base)) return details.schedule || [];
  const baseSignal = Date.parse(base.lastSignalTime || '');
  const detailSignal = Date.parse(details.lastSignalTime || '');
  return Number.isFinite(baseSignal) && Number.isFinite(detailSignal) && baseSignal > detailSignal
    ? base.schedule || [] : details.schedule || [];
}

const withAlpha = (hex: string, alpha: number) => {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const value = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
  return `#${clean}${value}`;
};

const getVehicleDisplayNumber = (vehicle?: Pick<Vehicle, 'vehicleNumber' | 'id' | 'provider' | 'routeShortName'> | null) => {
  if (vehicle?.provider === 'pkp_intercity') {
    const rawNumber = String(vehicle.vehicleNumber || '').trim();
    const category = String(vehicle.routeShortName || '').trim().toUpperCase();
    if (!rawNumber) return '';
    if (category && rawNumber.toUpperCase().startsWith(`${category} `)) return rawNumber;
    return category ? `${category} ${rawNumber}` : rawNumber;
  }
  if (vehicle?.provider === 'marcel') return String(vehicle.vehicleNumber || '').trim();
  return String(vehicle?.vehicleNumber || vehicle?.id || '').replace(/^(mpk_rzeszow|marcel)_/, '');
};

export {normalizeVehicleText};
export {parseJourneyMs};
export {formatGpsSignalClock};
export {isScheduleStopUpcoming};
export {hasUsableRouteDetails};
export {vehicleRouteDetailsCacheKey};
export {withAlpha};
export {getVehicleDisplayNumber};
