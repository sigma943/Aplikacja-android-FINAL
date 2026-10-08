'use client';

import L from 'leaflet';

import {busFrontSvg} from '@/lib/bus-icon-svg';
import {busDelayMinutes} from '@/lib/bus-punctuality';

import {type Vehicle} from '@/lib/transport/vehicle';

const PKS_COLOR = '#14b8a6';

const MPK_RZESZOW_COLOR = '#ff7a00';

const MARCEL_COLOR = '#68c44a';

const PKP_INTERCITY_COLOR = '#1d4ed8';

function getVehicleColor(vehicle?: Pick<Vehicle, 'provider'> | null, fallback = PKS_COLOR) {
  if (vehicle?.provider === 'mpk_rzeszow') return MPK_RZESZOW_COLOR;
  if (vehicle?.provider === 'marcel') return MARCEL_COLOR;
  if (vehicle?.provider === 'pkp_intercity') return PKP_INTERCITY_COLOR;
  if (vehicle?.provider === 'pks') return PKS_COLOR;
  return fallback;
}

const formatDelay = (delaySec: number | undefined, provider?: string) => {
  if (delaySec === undefined) return null;
  if (!Number.isFinite(delaySec) || Math.abs(delaySec) > 18000) return null;
  const signedMinutes = busDelayMinutes(delaySec);
  const min = Math.abs(signedMinutes);
  
  if (signedMinutes < 0) {
    return { text: `Przed ${min}m`, textLong: `Przed czasem: ${min} min`, class: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' }; // Ahead of time
  } else if (signedMinutes > 0) {
    return { text: `Opóźn. ${min}m`, textLong: `Opóźniony: ${min} min`, class: 'text-rose-600', bg: 'bg-rose-50 border-rose-200' }; // Delayed
  }
  return { text: 'Punktualnie', textLong: 'Zgodnie z planem', class: 'text-slate-500', bg: 'bg-white border-slate-200' };
};

// Caching icons to prevent React-Leaflet from recreating DOM nodes unnecessarily

const iconCache = new Map<string, L.DivIcon>();

const clusterIconCache = new Map<string, L.DivIcon>();

const getMarkerAgeBucket = (dataAgeSec?: number) => {
  if (dataAgeSec === undefined) return 0;
  if (dataAgeSec > 180) return Math.floor(dataAgeSec / 60);
  if (dataAgeSec > 60) return dataAgeSec < 120 ? 1 : Math.floor(dataAgeSec / 60);
  return 0;
};

export const getCachedBusIcon = (
  routeShortName: string,
  vehicleId: string,
  delaySec?: number,
  isSelected?: boolean,
  themeColor: string = PKS_COLOR,
  dataAgeSec?: number,
  isHighVolume?: boolean,
  iconVariant?: string,
  vehicleLabel?: string,
  zoom: number = 14,
) => {
  const ageBucket = getMarkerAgeBucket(dataAgeSec);
  const delayBucket = delaySec === undefined ? 'na' : busDelayMinutes(delaySec);
  const zoomBucket = zoom <= 12 ? 12 : zoom <= 13 ? 13 : 14;
  const hash = `${routeShortName}_${vehicleId}_${vehicleLabel}_${delayBucket}_${isSelected}_${themeColor}_${ageBucket}_${isHighVolume}_${iconVariant}_${zoomBucket}`;
  
  if (iconCache.has(hash)) {
    return iconCache.get(hash)!;
  }
  
  const icon = createBusIcon(routeShortName, vehicleId, delaySec, isSelected, themeColor, dataAgeSec, isHighVolume, iconVariant, vehicleLabel, zoom);
  
  // keep cache size reasonable
  if (iconCache.size > 2000) {
    const keys = Array.from(iconCache.keys());
    for (let i = 0; i < 500; i++) iconCache.delete(keys[i]);
  }
  
  iconCache.set(hash, icon);
  return icon;
};

const createBusIcon = (
  routeShortName: string,
  vehicleId: string,
  delaySec?: number,
  isSelected?: boolean,
  themeColor: string = PKS_COLOR,
  dataAgeSec?: number,
  isHighVolume?: boolean,
  iconVariant?: string,
  vehicleLabel?: string,
  zoom: number = 14,
) => {
  const trainCategory = String(iconVariant || routeShortName || '').toUpperCase();
  if (trainCategory === 'IC' || trainCategory === 'EIC' || trainCategory === 'EIP') {
    return createTrainIcon(routeShortName, vehicleId, delaySec, isSelected, dataAgeSec, isHighVolume, trainCategory, vehicleLabel);
  }

  const display = routeShortName || '?';
  const numberLabel = String(vehicleLabel || '').trim();
  const delayInfo = formatDelay(delaySec, iconVariant);
  
  let opacityClass = 'opacity-90';
  let filterStyle = '';

  const isSelClass = isSelected 
    ? 'z-[2000] scale-125 saturate-110 drop-shadow-2xl' 
    : `z-[100] scale-100 ${opacityClass} ${isHighVolume ? '' : 'drop-shadow-md hover:scale-105'}`;

  let badgeHtml = '';
  if (delayInfo && delaySec !== undefined && busDelayMinutes(delaySec) !== 0) {
    const delayPositionClass = delaySec > 0 ? '-top-[18px] left-[34px]' : '-top-4 -right-3';
    badgeHtml = `
      <div class="absolute ${delayPositionClass} px-1.5 py-0.5 rounded ${delayInfo.bg} ${delayInfo.class} text-[9px] font-black border border-white ${isHighVolume?'':'shadow-sm'} z-50 whitespace-nowrap">
        ${delaySec > 0 ? '+' : '-'}${Math.abs(busDelayMinutes(delaySec))}
      </div>
    `;
  }

  const markerColor = iconVariant === 'mpk_rzeszow' ? MPK_RZESZOW_COLOR : iconVariant === 'marcel' ? MARCEL_COLOR : themeColor;

  const html = `
    <div class="mks-marker-inner relative flex flex-col items-center justify-start ${isSelClass}" style="width: 48px; height: 68px; ${filterStyle}">
      
      <div class="relative z-10 h-[48px] w-[34px] ${isHighVolume ? '' : 'drop-shadow-sm'}">
        ${busFrontSvg(display, markerColor, Boolean(isSelected))}
      </div>

      ${numberLabel ? `
        <!-- Minimal Vehicle ID -->
        <div class="mt-1 border border-slate-200 rounded px-1.5 py-[1px] text-[8px] tracking-wide font-bold max-w-[44px] truncate text-center ${isHighVolume?'':'shadow-sm'} flex items-center justify-center gap-1" style="background-color: rgba(255,255,255,0.95); color: #64748b;">
          <span>${numberLabel}</span>
        </div>
      ` : ''}

      ${badgeHtml}
    </div>
  `;

  return L.divIcon({
    className: 'mks-bus-marker !bg-transparent !border-0',
    html: html,
    iconSize: [48, 72],
    iconAnchor: [24, 46],
    popupAnchor: [0, -46],
  });
};

const createTrainIcon = (
  routeShortName: string,
  vehicleId: string,
  delaySec?: number,
  isSelected?: boolean,
  dataAgeSec?: number,
  isHighVolume?: boolean,
  iconVariant?: string,
  vehicleLabel?: string,
) => {
  const category = iconVariant === 'EIP' || iconVariant === 'EIC' || iconVariant === 'IC' ? iconVariant : 'IC';
  const display = routeShortName || category;
  const numberLabel = String(vehicleLabel || '').trim();
  const delayInfo = formatDelay(delaySec);
  const isSelClass = isSelected
    ? 'z-[2000] scale-125 saturate-110 drop-shadow-2xl'
    : `z-[100] scale-100 opacity-95 ${isHighVolume ? '' : 'drop-shadow-md hover:scale-105'}`;

  let badgeHtml = '';
  if (delayInfo && delaySec !== undefined && busDelayMinutes(delaySec) !== 0) {
    badgeHtml = `
      <div class="absolute -top-2 -right-2 px-1.5 py-0.5 rounded ${delayInfo.bg} ${delayInfo.class} text-[9px] font-black border border-white ${isHighVolume ? '' : 'shadow-sm'} z-50 whitespace-nowrap">
        ${delaySec > 0 ? '+' : '-'}${Math.abs(busDelayMinutes(delaySec))}
      </div>
    `;
  }

  const html = `
    <div class="mks-marker-inner relative flex flex-col items-center justify-start ${isSelClass}" style="width: 58px; height: 72px;">
      <div class="relative flex h-[45px] w-[45px] items-center justify-center rounded-[12px] border-2 border-white bg-white ${isHighVolume ? '' : 'shadow-lg'} overflow-hidden">
        <img src="/train-icons/${category}.svg" alt="" class="h-[38px] w-[38px] object-contain" />
        <div class="absolute left-1 top-1 rounded bg-[#1d4ed8] px-1 text-[8px] font-black leading-3 text-white">${display}</div>
        ${isSelected ? `<div class="absolute inset-0 bg-blue-400/10 pointer-events-none"></div>` : ''}
      </div>
      ${numberLabel ? `
        <div class="mt-1 border border-slate-200 rounded px-1.5 py-[1px] text-[8px] tracking-wide font-bold max-w-[54px] truncate text-center ${isHighVolume ? '' : 'shadow-sm'} flex items-center justify-center" style="background-color: rgba(255,255,255,0.96); color: #1e3a8a;">
          <span>${numberLabel}</span>
        </div>
      ` : ''}
      ${badgeHtml}
    </div>
  `;

  return L.divIcon({
    className: 'mks-bus-marker mks-train-marker !bg-transparent !border-0',
    html,
    iconSize: [58, 74],
    iconAnchor: [29, 50],
    popupAnchor: [0, -50],
  });
};

const getCachedClusterIcon = (count: number, size: number, clusterColor: string, visualOffset: number) => {
  const key = `${count}_${size}_${clusterColor}_${visualOffset}`;
  const cached = clusterIconCache.get(key);
  if (cached) return cached;

  const icon = L.divIcon({
    className: 'mks-bus-cluster !bg-transparent !border-0',
    html: `
      <div class="relative flex items-center justify-center" style="width:${size}px;height:${size}px;transform:translateX(${visualOffset}px)">
        <div class="absolute inset-0 rounded-full" style="background:${clusterColor};opacity:.20;box-shadow:0 0 28px ${clusterColor}66"></div>
        <div class="absolute inset-[5px] rounded-full border-2 border-white/90 shadow-xl" style="background:${clusterColor}"></div>
        <div class="relative z-10 text-white font-black text-[15px] tracking-tight">${count}</div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

  if (clusterIconCache.size > 300) {
    const firstKey = clusterIconCache.keys().next().value;
    if (firstKey) clusterIconCache.delete(firstKey);
  }
  clusterIconCache.set(key, icon);
  return icon;
};

export {PKS_COLOR};
export {MPK_RZESZOW_COLOR};
export {MARCEL_COLOR};
export {PKP_INTERCITY_COLOR};
export {getVehicleColor};
export {formatDelay};
export {iconCache};
export {clusterIconCache};
export {getMarkerAgeBucket};
export {createBusIcon};
export {createTrainIcon};
export {getCachedClusterIcon};
