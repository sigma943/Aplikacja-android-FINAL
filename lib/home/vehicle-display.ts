
import type {Vehicle} from '@/components/BusMap';

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
  return [provider, vehicle.id, routeIdentity || 'current', includeInactive ? 'inactive' : 'active'].join(':');
};

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
