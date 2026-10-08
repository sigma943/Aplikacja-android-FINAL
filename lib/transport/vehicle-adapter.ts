

import type {Vehicle} from '@/lib/transport/vehicle';

import {type TransportApiVehicle} from '../transport/types';

function mapTransportVehicleToClient(vehicle: TransportApiVehicle): Vehicle {
  const rawDelay = vehicle.delaySeconds ?? (typeof vehicle.delayMinutes === 'number' ? vehicle.delayMinutes * 60 : 0);
  const statusText = String(vehicle.statusText || '').toLowerCase();
  const delay =
    vehicle.provider === 'mpk_rzeszow' &&
    (vehicle.status === 'break' || statusText.includes('petli') || statusText.includes('pętli') || statusText.includes('przystanku'))
      ? 0
      : rawDelay;

  return {
    id: vehicle.id,
    provider: vehicle.provider,
    operatorName: vehicle.operatorName,
    type: vehicle.type,
    iconVariant: vehicle.iconVariant,
    vehicleNumber: vehicle.vehicleNumber,
    name: vehicle.name || vehicle.displayName,
    routeId: vehicle.routeId,
    routeShortName: vehicle.line,
    lat: Number(vehicle.lat),
    lon: Number(vehicle.lng),
    speed: vehicle.speed,
    direction: vehicle.direction,
    delay,
    dataAgeSec: vehicle.dataAgeSec,
    scheduleSource: vehicle.scheduleSource,
    schedule: vehicle.schedule?.map((stop) => ({
      ...stop,
      lon: stop.lon ?? stop.lng,
    })),
    routeStops: vehicle.routeStops?.map((stop) => ({
      ...stop,
      lon: stop.lon ?? stop.lng,
    })),
    routePath: vehicle.routePath,
    model: vehicle.model,
    lastStopDistance: vehicle.lastStopDistance,
    lastStopId: vehicle.lastStopId,
    lastSignalTime: vehicle.lastUpdate,
    previousTripEndedAtMs: vehicle.previousTripEndedAtMs,
    nextTripStartAtMs: vehicle.nextTripStartAtMs,
    nextTripFirstStopId: vehicle.nextTripFirstStopId,
    computedSpeed: vehicle.computedSpeed,
    journeyId: vehicle.journeyId,
    serviceId: vehicle.serviceId,
    tripId: vehicle.tripId,
    brigadeName: vehicle.brigadeName,
    status: vehicle.status,
    statusText: vehicle.statusText,
    isHistorical: vehicle.isHistorical,
    bearing: vehicle.bearing,
    trainName: vehicle.trainName,
    positionQuality: vehicle.positionQuality,
  };
}

export {mapTransportVehicleToClient};
