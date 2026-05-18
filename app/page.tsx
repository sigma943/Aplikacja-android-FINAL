'use client';

import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from 'react';
import dynamic from 'next/dynamic';
import { Capacitor } from '@capacitor/core';
import { Bus, Search, RefreshCw, AlertCircle, X, Clock, Navigation, MapPin, Map as MapIcon, Settings, ChevronRight, Eye, Palette, ArrowLeft, Star, Monitor, Sun, Moon, Sparkles, CloudOff, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Vehicle } from '@/components/BusMap';
import TransportSelectorPanel, { type TransportOption } from '@/components/TransportSelectorPanel';
import {fetchDeparturesClient, fetchStopsClient, fetchVehicleDetailsClient, fetchVehiclesClient, type TransportProviderId} from '@/lib/pks-client';
import { useFirebase } from '@/components/FirebaseProvider';
import { canAccessAdminDashboard } from '@/lib/admin/rbac';

const BusMap = dynamic(() => import('@/components/BusMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-slate-100 flex items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-slate-500">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
        <p className="font-medium tracking-tight">Trwa wczytywanie mapy...</p>
      </div>
    </div>
  ),
});

const AdminDashboard = dynamic(() => import('@/app/admin/AdminDashboard'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-[#040609] flex items-center justify-center text-slate-400 text-sm font-medium">
      Ładowanie panelu administratora…
    </div>
  ),
});

function StopTabIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M11 7.5h11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M11 14h11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M11 20.5h11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M6 7.5h.01M6 14h.01M6 20.5h.01" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

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

const withAlpha = (hex: string, alpha: number) => {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const value = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
  return `#${clean}${value}`;
};

const DEFAULT_ACTIVE_PROVIDERS: TransportProviderId[] = ['mpk_rzeszow'];
const AVAILABLE_TRANSPORT_PROVIDERS = new Set<TransportProviderId>(['pks', 'mpk_rzeszow']);

const readStoredTransportProviders = (): TransportProviderId[] => {
  if (typeof window === 'undefined') return DEFAULT_ACTIVE_PROVIDERS;
  try {
    const parsed = JSON.parse(localStorage.getItem('mks_transport_providers') || 'null');
    if (!Array.isArray(parsed)) return DEFAULT_ACTIVE_PROVIDERS;
    return parsed.filter(
      (provider): provider is TransportProviderId =>
        typeof provider === 'string' && AVAILABLE_TRANSPORT_PROVIDERS.has(provider as TransportProviderId),
    );
  } catch {
    return DEFAULT_ACTIVE_PROVIDERS;
  }
};

const sameTransportProviders = (left: TransportProviderId[], right: TransportProviderId[]) => {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((provider) => rightSet.has(provider));
};

const getVehicleDisplayNumber = (vehicle?: Pick<Vehicle, 'vehicleNumber' | 'id'> | null) =>
  String(vehicle?.vehicleNumber || vehicle?.id || '').replace(/^mpk_rzeszow_/, '');

export default function Home() {
  const { device, loading } = useFirebase();

  const lastVehiclesRef = useRef<string>('');
  const lastVehiclesEtagRef = useRef<string>('');
  const activeProvidersRef = useRef<TransportProviderId[]>([]);
  const vehiclesFetchAbortRef = useRef<AbortController | null>(null);
  const vehicleDetailsCacheRef = useRef<Map<string, { vehicle: Vehicle; expiresAt: number }>>(new Map());
  const vehicleDetailsRequestSeqRef = useRef(0);

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [appLoadTimedOut, setAppLoadTimedOut] = useState(false);
  const [filterRoute, setFilterRoute] = useState('');
  const [activeProviders, setActiveProviders] = useState<TransportProviderId[]>([]);
  const [draftProviders, setDraftProviders] = useState<TransportProviderId[]>([]);
  const [hasLoadedTransportProviders, setHasLoadedTransportProviders] = useState(false);
  const [isTransportPanelOpen, setIsTransportPanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBus, setSelectedBus] = useState<Vehicle | null>(null);
  const [selectedBusDetailsLoading, setSelectedBusDetailsLoading] = useState(false);
  const [isBusPanelExpanded, setIsBusPanelExpanded] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  
  // Customization States
  const [themeColor, setThemeColor] = useState('#00A3A2');
  const [showInactive, setShowInactive] = useState(false);
  const [appTheme, setAppTheme] = useState<'system'|'light'|'light-warm'|'dark'|'dark-oled'|'dark-aurora'>(() => {
    if (typeof window === 'undefined') return 'system';
    const raw = (localStorage.getItem('mks_app_theme') || 'system').trim().toLowerCase();
    if (raw === 'amoled' || raw === 'oled' || raw === 'dark_oled' || raw === 'darkoled') return 'dark-oled';
    if (raw === 'light' || raw === 'light-warm' || raw === 'dark' || raw === 'dark-oled' || raw === 'dark-aurora') return raw;
    return 'system';
  });
  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });
  const [transparentUI, setTransparentUI] = useState(true);

  // Stops States
  const [activeTab, setActiveTab] = useState<'map' | 'stops' | 'admin'>('map');
  const canOpenAdminEmbed = Boolean(
    device && canAccessAdminDashboard(device.role, device.permissions),
  );
  const isMapTabDisabled = Boolean(device?.permissions?.disableMap);
  const isStopsTabDisabled = Boolean(device?.permissions?.disableStops) && !isMapTabDisabled;
  useEffect(() => {
    if (activeTab === 'admin' && !canOpenAdminEmbed) setActiveTab('map');
    if (activeTab === 'map' && isMapTabDisabled) setActiveTab('stops');
    if (activeTab === 'stops' && isStopsTabDisabled) setActiveTab('map');
  }, [activeTab, canOpenAdminEmbed, isMapTabDisabled, isStopsTabDisabled]);
  const [stopsList, setStopsList] = useState<{id: string, name: string, areaId?: string, code?: string, lat?: number, lon?: number}[]>([]);
  const [stopsLoadError, setStopsLoadError] = useState(false);
  const [stopsFilter, setStopsFilter] = useState('');
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [isStopPanelExpanded, setIsStopPanelExpanded] = useState(true);
  const [stopDepartures, setStopDepartures] = useState<any[]>([]);
  const [isFetchingDepartures, setIsFetchingDepartures] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(7000);
  const [favsState, setFavsState] = useState<string[]>([]);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [departuresLineFilter, setDeparturesLineFilter] = useState('');

  useEffect(() => {
    if (!isLoading) {
      setAppLoadTimedOut(false);
      return;
    }

    const timer = window.setTimeout(() => setAppLoadTimedOut(true), 30_000);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  const closeMapPanelsForSearch = useCallback(() => {
    if (selectedBus || selectedStopId) {
      setSelectedBus(null);
      setSelectedStopId(null);
    }
  }, [selectedBus, selectedStopId]);

  useEffect(() => {
    activeProvidersRef.current = activeProviders;
  }, [activeProviders]);

  const formatScheduleStopName = useCallback((name?: string | null) => {
    const raw = String(name || '').trim();
    if (!raw) return 'Przystanek nieznany';
    return raw.replace(/^Rzeszów\s+D\.A\.\s+st\.\s*0*\d+$/i, 'Rzeszów D.A.');
  }, []);

  // Handle hardware back button to prevent accidental app exits when viewing a panel
  useEffect(() => {
     if (selectedBus || selectedStopId) {
        window.history.pushState({ panelOpen: true }, '');
     }
  }, [selectedBus, selectedStopId]);

  useEffect(() => {
     const handlePopState = (e: PopStateEvent) => {
        if (isTransportPanelOpen) {
           setIsTransportPanelOpen(false);
           return;
        }
        if (selectedBus || selectedStopId) {
           setSelectedBus(null);
           setSelectedStopId(null);
        }
     };
     window.addEventListener('popstate', handlePopState);
     return () => window.removeEventListener('popstate', handlePopState);
  }, [isTransportPanelOpen, selectedBus, selectedStopId]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    let listenerPromise: Promise<{ remove: () => Promise<void> }> | null = null;

    listenerPromise = import('@capacitor/app').then(({ App }) =>
      App.addListener('backButton', () => {
        if (cancelled) return;

        if (isSettingsOpen) {
          setIsSettingsOpen(false);
          return;
        }
        if (isTransportPanelOpen) {
          setIsTransportPanelOpen(false);
          return;
        }
        if (selectedBus) {
          setSelectedBus(null);
          return;
        }
        if (selectedStopId) {
          setSelectedStopId(null);
          setDeparturesLineFilter('');
          return;
        }
        if (activeTab === 'admin') {
          return;
        }
        if (activeTab === 'stops' && !isMapTabDisabled) {
          setActiveTab('map');
          return;
        }

        App.exitApp();
      }),
    );

    return () => {
      cancelled = true;
      listenerPromise?.then((listener) => listener.remove()).catch(() => {});
    };
  }, [activeTab, isMapTabDisabled, isSettingsOpen, isTransportPanelOpen, selectedBus, selectedStopId]);

  const toggleFavoriteStop = (stopId: string, e: React.MouseEvent) => {
     e.stopPropagation();
     const next = favsState.includes(stopId) ? favsState.filter(s => s !== stopId) : [...favsState, stopId];
     setFavsState(next);
     localStorage.setItem('mks_fav_stops', JSON.stringify(next));
  };

  const [now, setNow] = useState(0);
  useEffect(() => {
    const initTimer = setTimeout(() => setNow(Date.now()), 0);
    const tickMs = selectedBus?.status === 'break' ? 1000 : 5000;
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => {
       clearTimeout(initTimer);
       clearInterval(id);
    };
  }, [selectedBus?.status]);

  const processedDepartures = useMemo(() => {
    if (!stopDepartures || stopDepartures.length === 0) return [];
    
    const results = Object.values(stopDepartures.reduce((acc: any, journey: any) => {
        const journeyPlannedMs = parseJourneyMs(journey.timetable_time);
        let actualTimeStr = Number.isFinite(journeyPlannedMs) ? new Date(journeyPlannedMs).toTimeString().substring(0, 5) : '--:--';
        let diffMin = Number.isFinite(journeyPlannedMs) ? Math.floor((journeyPlannedMs - now) / 60000) : Number.POSITIVE_INFINITY;
        let isRealtime = false;
        let vehicleNum = '';
        let isDelayed = false;
        let actualDepTimeMs = journeyPlannedMs;
        
        const normLine = (s: any) => String(s || '').trim().toUpperCase().replace(/^MKS\s+/, '');
        const journeyLineNorm = normLine(journey.line_name);
        
        let liveMatch: any = null;
        let stopInfo: any = null;
        let minDiff = Infinity;
        let sameLineCandidates = 0;
        const normalizeDirection = (value: unknown) =>
          String(value || '')
            .trim()
            .toLowerCase()
            .replace(/^mks\s+/, '')
            .replace(/\s+/g, ' ');
        
        vehicles.forEach(v => {
            if (normLine(v.routeShortName) === journeyLineNorm) {
                sameLineCandidates += 1;
                const s = v.schedule?.find((x: any) => String(x.id) === String(selectedStopId));
                if (s && s.planned) {
                    const diff = Math.abs(new Date(s.planned).getTime() - journeyPlannedMs);
                    if (diff < 600000 && diff < minDiff) {
                        minDiff = diff;
                        liveMatch = v;
                        stopInfo = s;
                    }
                }
            }
        });

        if (liveMatch) {
            const liveDelaySec = Number(liveMatch.delay);
            const canUseLiveDelay =
              liveMatch.status !== 'break' &&
              liveMatch.status !== 'inactive' &&
              Number.isFinite(liveDelaySec) &&
              liveDelaySec !== 0 &&
              Math.abs(liveDelaySec) <= 18000;
            const stopPlannedMs = stopInfo?.planned ? new Date(stopInfo.planned).getTime() : NaN;
            const basePlannedMs = Number.isFinite(stopPlannedMs) ? stopPlannedMs : journeyPlannedMs;
            const realT = stopInfo?.real
              ? new Date((stopInfo.real || '').replace(' ', 'T'))
              : (Number.isFinite(basePlannedMs) && canUseLiveDelay ? new Date(basePlannedMs + liveDelaySec * 1000) : null);
            
            if (realT && !isNaN(realT.getTime())) {
                isRealtime = true;
                isDelayed = Math.abs(realT.getTime() - journeyPlannedMs) > 60_000;
                vehicleNum = getVehicleDisplayNumber(liveMatch);
                actualDepTimeMs = realT.getTime();
                diffMin = Math.floor((actualDepTimeMs - now) / 60000);
                actualTimeStr = realT.toTimeString().substring(0, 5);
            }
        } else if (journey.deviation !== null && journey.deviation !== undefined) {
            isRealtime = true;
            isDelayed = !!(Math.abs(journey.deviation) > 1);
            if (!isNaN(journeyPlannedMs)) {
               const realD = new Date(journeyPlannedMs + journey.deviation * 60000);
               actualDepTimeMs = realD.getTime();
               diffMin = Math.floor((actualDepTimeMs - now) / 60000);
               actualTimeStr = realD.toTimeString().substring(0, 5);
            }
        }

        if (!vehicleNum && (journey.vehicle_id || journey.veh_id || journey.vehicle_number)) {
           vehicleNum = journey.vehicle_id || journey.veh_id || journey.vehicle_number;
        }

        if (!Number.isFinite(journeyPlannedMs)) return acc;
        const plannedMinuteBucket = Math.round(journeyPlannedMs / 60000);
        const uniqKey = [
          journeyLineNorm,
          String(journey.route_description || '').trim().toUpperCase(),
          `min:${plannedMinuteBucket}`,
        ].join('|');
        const depDate = new Date(journeyPlannedMs);
        const todayDate = new Date(now);
        const isTomorrow = depDate.getDate() !== todayDate.getDate() || 
                          depDate.getMonth() !== todayDate.getMonth() || 
                          depDate.getFullYear() !== todayDate.getFullYear();
        const dateStr = `${depDate.getDate()}.${(depDate.getMonth() + 1).toString().padStart(2, '0')}`;

        if(!acc[uniqKey]) {
           acc[uniqKey] = {
               bus: {
                   routeShortName: journey.line_name,
                   direction: journey.route_description,
                    id: isRealtime ? 'LIVE' : 'ROZKŁAD',
                   model: liveMatch ? liveMatch.model : null
               },
                vehicleNum,
               actualTimeStr,
               diffMin,
               isRealtime,
               isTomorrow,
               dateStr,
               isDelayed,
               plannedTimeMs: journeyPlannedMs,
               depTimeMs: Number.isFinite(actualDepTimeMs) ? actualDepTimeMs : journeyPlannedMs
           };
        } else if (liveMatch) {
           acc[uniqKey].isRealtime = true;
           acc[uniqKey].isDelayed = isDelayed;
           acc[uniqKey].actualTimeStr = actualTimeStr;
           acc[uniqKey].diffMin = diffMin;
           acc[uniqKey].isTomorrow = isTomorrow;
           acc[uniqKey].dateStr = dateStr;
           acc[uniqKey].vehicleNum = vehicleNum;
           acc[uniqKey].plannedTimeMs = journeyPlannedMs;
           acc[uniqKey].bus.model = liveMatch.model;
           acc[uniqKey].bus.id = 'LIVE';
        }
        return acc;
    }, {})).filter((a: any) => Number.isFinite(a.diffMin) && a.diffMin >= -15 && a.diffMin <= 2880).sort((a: any, b: any) => {
      const aPlanned = Number.isFinite(a.plannedTimeMs) ? a.plannedTimeMs : a.depTimeMs;
      const bPlanned = Number.isFinite(b.plannedTimeMs) ? b.plannedTimeMs : b.depTimeMs;
      return aPlanned - bPlanned;
    });

    return results;
  }, [stopDepartures, vehicles, selectedStopId, now]);

  useEffect(() => {
    if (selectedStopId) {
      setTimeout(() => {
         setIsFetchingDepartures(true);
         setStopDepartures([]);
         setDeparturesLineFilter('');
      }, 0);
      const stopInfo = stopsList.find(s => s.id === selectedStopId);
      fetchDeparturesClient(selectedStopId, stopInfo?.areaId, stopInfo?.code || '')
        .then(data => {
            if (data && data.journeys) {
               setStopDepartures(data.journeys);
            } else {
               setStopDepartures([]);
            }
            setIsFetchingDepartures(false);
        })
        .catch(err => {
            console.error('Fetch departures error:', err);
            setStopDepartures([]);
            setIsFetchingDepartures(false);
        });
    } else {
      setTimeout(() => setStopDepartures([]), 0);
    }
  }, [selectedStopId, stopsList]);

  useEffect(() => {
    const storedProviders = readStoredTransportProviders();
    activeProvidersRef.current = storedProviders;
    setActiveProviders(storedProviders);
    setDraftProviders(storedProviders);
    setHasLoadedTransportProviders(true);

    const sTheme = localStorage.getItem('mks_theme');
    if (sTheme && sTheme !== themeColor) setTimeout(() => setThemeColor(sTheme), 0);
    const sInactive = localStorage.getItem('mks_show_inactive');
    if (sInactive !== null) setTimeout(() => setShowInactive(sInactive === 'true'), 0);
    const sAppTheme = localStorage.getItem('mks_app_theme') as any;
    if (sAppTheme) setAppTheme(sAppTheme);
    const sTrans = localStorage.getItem('mks_transparent');
    if (sTrans !== null) setTimeout(() => setTransparentUI(sTrans === 'true'), 0);
    const favs = localStorage.getItem('mks_fav_stops');
    if (favs) setTimeout(() => setFavsState(JSON.parse(favs)), 0);
    
    // Check system preference
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemIsDark(mediaQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveThemeColor = (hex: string) => { setThemeColor(hex); localStorage.setItem('mks_theme', hex); };
  const saveInactive = (val: boolean) => { setShowInactive(val); localStorage.setItem('mks_show_inactive', String(val)); fetchVehicles(val); };
  const saveAppTheme = (val: any) => {
    setAppTheme(val);
    localStorage.setItem('mks_app_theme', val);
    const actual = val === 'system' ? (systemIsDark ? 'dark' : 'light') : val;
    const bg =
      actual === 'light'
        ? '#f8fafc'
        : actual === 'light-warm'
          ? '#f2ede1'
          : actual === 'dark-oled'
            ? '#000000'
            : actual === 'dark-aurora'
              ? '#06130f'
              : '#111027';
    document.documentElement.style.setProperty('--pks-initial-bg', bg);
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
  };
  const saveTransparentUI = (val: boolean) => { setTransparentUI(val); localStorage.setItem('mks_transparent', String(val)); };

  const deferredFilterRoute = useDeferredValue(filterRoute);
  const deferredStopsFilter = useDeferredValue(stopsFilter);

  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    // eslint-disable-next-line react-hooks/purity
    const start = Date.now();
    try {
      await fetchVehicles(showInactive, true);
    } catch {
      // Ignored
    } finally {
      const elapsed = Date.now() - start;
      const finish = () => {
        setIsManualRefreshing(false);
      };
      if (elapsed < 800) {
        setTimeout(finish, 800 - elapsed);
      } else {
        finish();
      }
    }
  };

  const mergeVehicleDetails = useCallback((base: Vehicle, details?: Vehicle | null) => {
    if (!details) return base;
    return {
      ...base,
      ...details,
      schedule: (details.schedule?.length || 0) > 0 ? details.schedule : base.schedule,
      routePath: (details.routePath?.length || 0) > 0 ? details.routePath : base.routePath,
    };
  }, []);

  const loadVehicleDetails = useCallback(async (vehicle: Vehicle) => {
    const provider = (vehicle.provider || 'pks') as TransportProviderId;
    const cacheKey = `${provider}:${vehicle.id}`;
    const cached = vehicleDetailsCacheRef.current.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setSelectedBus((current) => current?.id === vehicle.id ? mergeVehicleDetails(current, cached.vehicle) : current);
      return cached.vehicle;
    }

    const requestSeq = vehicleDetailsRequestSeqRef.current + 1;
    vehicleDetailsRequestSeqRef.current = requestSeq;
    setSelectedBusDetailsLoading(true);
    try {
      const details = await fetchVehicleDetailsClient(provider, vehicle.id, showInactive);
      if (details) {
        vehicleDetailsCacheRef.current.set(cacheKey, { vehicle: details, expiresAt: Date.now() + 45_000 });
        setSelectedBus((current) => current?.id === vehicle.id ? mergeVehicleDetails(current, details) : current);
      }
      return details;
    } catch (error) {
      console.warn('Vehicle details unavailable:', error);
      return null;
    } finally {
      if (vehicleDetailsRequestSeqRef.current === requestSeq) setSelectedBusDetailsLoading(false);
    }
  }, [mergeVehicleDetails, showInactive]);

  const fetchVehicles = async (inactive = showInactive, force = false) => {
    if (!hasLoadedTransportProviders) {
      setIsLoading(false);
      return;
    }

    const requestProviders = activeProvidersRef.current;

    if (requestProviders.length === 0) {
      setVehicles([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      vehiclesFetchAbortRef.current?.abort();
      const controller = new AbortController();
      vehiclesFetchAbortRef.current = controller;
      timeoutId = setTimeout(() => controller.abort(), 15000);
      const data = await fetchVehiclesClient(inactive, requestProviders, { signal: controller.signal }) as any;
      if (timeoutId) clearTimeout(timeoutId);
      if (vehiclesFetchAbortRef.current === controller) vehiclesFetchAbortRef.current = null;
      if (!sameTransportProviders(requestProviders, activeProvidersRef.current)) return;
      const loadedVehicles = Array.isArray(data) ? data : (data.vehicles || []);
      const requestProviderSet = new Set(requestProviders);
      const visibleVehicles = loadedVehicles.filter((vehicle: Vehicle) =>
        requestProviderSet.has((vehicle.provider || 'pks') as TransportProviderId),
      );
      const newDataStr = JSON.stringify(visibleVehicles);
      if (newDataStr !== lastVehiclesRef.current) {
        setVehicles(visibleVehicles);
        lastVehiclesRef.current = newDataStr;
      }
      setError(null);
      if (isOffline) setIsOffline(false);
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);
      if (vehiclesFetchAbortRef.current?.signal.aborted) vehiclesFetchAbortRef.current = null;
      if (err.name === 'AbortError') {
        return;
      }
      console.error('Fetch vehicles error:', err);
      if (
        err.message === 'Failed to fetch' ||
        err.name === 'AbortError' ||
        String(err.message || '').toLowerCase().includes('network') ||
        (typeof navigator !== 'undefined' && !navigator.onLine)
      ) {
        setIsOffline(true);
      }
      if (vehicles.length === 0 || force) {
        if (err.message === 'Failed to fetch') {
          setError('Brak połączenia z internetem lub serwerem');
        } else {
          setError(err.message || 'Wystąpił nieoczekiwany błąd');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!hasLoadedTransportProviders) return;

    if (activeProviders.length === 0) {
      setVehicles([]);
      setSelectedBus(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    fetchVehicles(showInactive, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProviders, hasLoadedTransportProviders]);

  useEffect(() => {
    if (!hasLoadedTransportProviders) return;

    let timer: NodeJS.Timeout;
    
    const tick = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'hidden' && !isOffline) {
        await fetchVehicles();
      }
      timer = setTimeout(tick, refreshInterval);
    };

    timer = setTimeout(tick, refreshInterval);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !isOffline) {
        fetchVehicles(showInactive, true);
      }
    };
    
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      clearTimeout(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshInterval, showInactive, isOffline, activeProviders, hasLoadedTransportProviders]);

  useEffect(() => {
    if (!hasLoadedTransportProviders) return;

    let cancelled = false;
    let nativeListenerPromise: Promise<{ remove: () => Promise<void> }> | null = null;

    const readOfflineState = async () => {
      let offline = typeof navigator !== 'undefined' ? !navigator.onLine : false;

      if (Capacitor.isNativePlatform()) {
        try {
          const { Network } = await import('@capacitor/network');
          const status = await Network.getStatus();
          offline = !status.connected;
        } catch (err) {
          console.warn('Native network status unavailable', err);
        }
      }

      return offline;
    };

    const applyOnlineState = async () => {
      const offline = await readOfflineState();
      if (!cancelled) setIsOffline(offline);
      return offline;
    };

    applyOnlineState();

    if (Capacitor.isNativePlatform()) {
      nativeListenerPromise = import('@capacitor/network').then(({ Network }) =>
        Network.addListener('networkStatusChange', (status) => {
          setIsOffline(!status.connected);
          if (status.connected) fetchVehicles(showInactive, true);
        }),
      );
    }

    const handleOffline = () => {
      setIsOffline(true);
      applyOnlineState();
    };
    const handleOnline = () => {
      setIsOffline(false);
      fetchVehicles(showInactive, true);
      applyOnlineState().then((offline) => {
        if (!offline) fetchVehicles(showInactive, true);
      });
    };
    const syncOnlineState = async () => {
      const offline = await readOfflineState();
      if (cancelled) return;
      setIsOffline((wasOffline) => {
        if (wasOffline && !offline) {
          fetchVehicles(showInactive, true);
        }
        return offline;
      });
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', syncOnlineState);
    document.addEventListener('visibilitychange', syncOnlineState);
    const onlineStateTimer = window.setInterval(syncOnlineState, 2500);
    return () => {
      cancelled = true;
      nativeListenerPromise?.then((listener) => listener.remove()).catch(() => {});
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', syncOnlineState);
      document.removeEventListener('visibilitychange', syncOnlineState);
      window.clearInterval(onlineStateTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive, activeProviders, hasLoadedTransportProviders]);

  const loadStops = () => {
    setStopsLoadError(false);
    fetchStopsClient()
      .then(d => {
        setStopsList(Object.entries(d).map(([id, val]: any) => ({ 
           id, 
           name: val.n, 
           areaId: val.areaId, 
           code: val.code,
           lat: val.lat,
           lon: val.lon
        })).sort((a,b) => a.name.localeCompare(b.name)));
      })
      .catch(e => {
        console.error('Fetch stops fail:', e);
        setStopsLoadError(true);
      });
  };

  useEffect(() => {
    loadStops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedBus) {
      const updated = vehicles.find(v => v.id === selectedBus.id);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (updated && updated !== selectedBus) {
        setSelectedBus(mergeVehicleDetails(updated, selectedBus));
      }
      if (!updated && activeProviders.length > 0) setSelectedBus(null);
    }
  }, [vehicles, selectedBus?.id, activeProviders.length, mergeVehicleDetails]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredVehicles = useMemo(() => {
    if (!deferredFilterRoute) return vehicles;
    const f = deferredFilterRoute.toLowerCase();
    return vehicles.filter(v => 
      (v.routeShortName || '').toLowerCase().includes(f) || 
      (v.id || '').toLowerCase().includes(f) ||
      getVehicleDisplayNumber(v).toLowerCase().includes(f)
    );
  }, [vehicles, deferredFilterRoute]);

  const filteredStopsList = useMemo(() => {
    const normalizedFilter = deferredStopsFilter.trim().toLowerCase();
    const filtered = stopsList.filter((stop) =>
      normalizedFilter ? stop.name.toLowerCase().includes(normalizedFilter) : true,
    );
    // Nie deduplikujemy po nazwie: przystanki z różnymi kodami (np. 03/04) mają być widoczne osobno.
    return filtered;
  }, [stopsList, deferredStopsFilter]);

  const stopsDataMap = useMemo(() => {
    const map: Record<string, any> = {};
    stopsList.forEach(s => {
      if (s.lat !== undefined && s.lon !== undefined) {
         map[String(s.id)] = { n: s.name, lat: s.lat, lon: s.lon };
      }
    });
    return map;
  }, [stopsList]);

  // Keep live polling predictable and light. Details are fetched on demand after clicking a bus.
  useEffect(() => {
    if (refreshInterval !== 7000) setTimeout(() => setRefreshInterval(7000), 0);
  }, [refreshInterval]);

  const incomingToStop = (stopId: string) => {
    const now = new Date().getTime();
    const incoming: any[] = [];
    for (const v of vehicles) {
       if (!v.schedule) continue;
       const stopInfo = v.schedule.find((s: any) => String(s.id) === String(stopId));
       if (stopInfo) {
          const timeStr = stopInfo.real || stopInfo.planned;
          if (!timeStr) continue;
          const d = new Date(timeStr.replace(' ', 'T'));
          if (!isNaN(d.getTime())) {
             const diffMin = Math.floor((d.getTime() - now) / 60000);
             if (diffMin >= -2 && diffMin <= 1440) { // Check up to 24 hours
                 incoming.push({ bus: v, timeStr, diffMin, depTimeMs: d.getTime(), actualTimeStr: timeStr.substring(11, 16) });
             }
          }
       }
    }
    return incoming.sort((a,b) => a.depTimeMs - b.depTimeMs);
  };

  // Theme Helpers
  const actualTheme = appTheme === 'system' ? (systemIsDark ? 'dark' : 'light') : appTheme;
  const isDark = actualTheme.startsWith('dark');
  const isOled = actualTheme === 'dark-oled';
  const isAurora = actualTheme === 'dark-aurora';
  const isWarm = actualTheme === 'light-warm';

  const bgMain = isDark ? (isOled ? 'bg-black' : isAurora ? 'bg-[#120f24]' : 'bg-slate-900') : (isWarm ? 'bg-[#f8f5f0]' : 'bg-slate-50');
  const bgCard = transparentUI 
     ? (isDark ? (isOled ? 'bg-black/80 backdrop-blur-xl border-slate-800/50' : isAurora ? 'bg-[#1a1430]/84 backdrop-blur-xl border-fuchsia-400/20' : 'bg-slate-900/80 backdrop-blur-xl border-slate-700/50') : 'bg-white/90 backdrop-blur-md border-slate-100/50')
     : (isDark ? (isOled ? 'bg-[#0a0a0a] border-slate-800' : isAurora ? 'bg-[#1f1736] border-fuchsia-400/20' : 'bg-slate-900 border-slate-700') : 'bg-white border-slate-200');
  const mapGlassPanel = transparentUI
     ? (isDark
        ? isOled
          ? 'bg-black/45 backdrop-blur-2xl border-white/10 shadow-[0_18px_60px_rgba(0,0,0,0.35)]'
          : isAurora
            ? 'bg-[#120f24]/48 backdrop-blur-2xl border-fuchsia-300/15 shadow-[0_18px_60px_rgba(12,8,28,0.28)]'
            : 'bg-[#07131a]/45 backdrop-blur-2xl border-white/10 shadow-[0_18px_60px_rgba(0,0,0,0.28)]'
        : isWarm
          ? 'bg-[#faf7ef]/58 backdrop-blur-2xl border-[#8a7b5f]/18 shadow-[0_18px_55px_rgba(93,79,50,0.16)]'
          : 'bg-white/58 backdrop-blur-2xl border-slate-900/10 shadow-[0_18px_55px_rgba(15,23,42,0.13)]')
     : bgCard;
  const mapGlassInput = transparentUI
     ? (isDark
        ? 'bg-white/[0.075] text-white placeholder-slate-300/70 border border-white/10'
        : isWarm
          ? 'bg-[#fffaf0]/58 text-[#272116] placeholder-[#746a58]/70 border border-[#8a7b5f]/14'
          : 'bg-white/58 text-slate-950 placeholder-slate-500 border border-slate-900/10')
     : (isDark ? 'bg-slate-800 text-white placeholder-slate-400' : 'bg-slate-100/50 text-slate-900 placeholder-slate-500');
  const mapDetailPanel = transparentUI
     ? (isDark
        ? isOled
          ? 'bg-black/46 backdrop-blur-3xl backdrop-saturate-150 border-white/12 shadow-[0_-28px_90px_rgba(0,0,0,0.72)]'
          : isAurora
            ? 'bg-[#151029]/52 backdrop-blur-3xl backdrop-saturate-150 border-fuchsia-300/18 shadow-[0_-28px_90px_rgba(10,6,26,0.66)]'
            : 'bg-[#07131a]/50 backdrop-blur-3xl backdrop-saturate-150 border-white/12 shadow-[0_-28px_90px_rgba(0,0,0,0.56)]'
        : isWarm
          ? 'bg-[#f7f0df]/58 backdrop-blur-3xl backdrop-saturate-150 border-[#8a7b5f]/18 shadow-[0_-24px_75px_rgba(93,79,50,0.24)]'
          : 'bg-white/54 backdrop-blur-3xl backdrop-saturate-150 border-white/70 shadow-[0_-24px_75px_rgba(15,23,42,0.18)]')
     : (isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100');
  const mapDetailContent = transparentUI
     ? (isDark
        ? isAurora
          ? 'bg-[#100d24]/38 backdrop-blur-3xl'
          : isOled
            ? 'bg-black/34 backdrop-blur-3xl'
            : 'bg-[#061017]/36 backdrop-blur-3xl'
        : isWarm
          ? 'bg-[#fff7e8]/38 backdrop-blur-3xl'
          : 'bg-white/36 backdrop-blur-3xl')
     : bgMain;
  const mapDetailCard = transparentUI
     ? (isDark
        ? 'bg-white/[0.055] border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.16)]'
        : isWarm
          ? 'bg-[#fffaf0]/48 border-[#8a7b5f]/18 shadow-[0_8px_24px_rgba(93,79,50,0.12)]'
          : 'bg-white/52 border-white/65 shadow-[0_8px_24px_rgba(15,23,42,0.10)]')
     : (isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100');
  const mapDetailDivider = transparentUI
     ? (isDark ? 'border-white/10' : isWarm ? 'border-[#8a7b5f]/16' : 'border-white/55')
     : (isDark ? 'border-slate-700' : 'border-slate-100');
  const mapDetailLine = transparentUI
     ? (isDark ? 'bg-white/14' : isWarm ? 'bg-[#8a7b5f]/22' : 'bg-slate-900/12')
     : (isDark ? 'bg-slate-700' : 'bg-slate-200');
  const bottomGlassShell = transparentUI
     ? (isDark
        ? isOled
          ? 'border-white/10 bg-black/28 text-slate-300 shadow-[0_-18px_70px_rgba(0,0,0,0.34)] backdrop-blur-2xl'
          : isAurora
            ? 'border-fuchsia-300/16 bg-[#120f24]/32 text-violet-100/75 shadow-[0_-18px_70px_rgba(12,8,28,0.30)] backdrop-blur-2xl'
            : 'border-white/10 bg-[#07131a]/30 text-slate-300 shadow-[0_-18px_70px_rgba(0,0,0,0.30)] backdrop-blur-2xl'
        : isWarm
          ? 'border-[#8a7b5f]/18 bg-[#f2ede1]/42 text-[#746a58] shadow-[0_-18px_60px_rgba(93,79,50,0.14)] backdrop-blur-2xl'
          : 'border-slate-900/10 bg-white/44 text-slate-500 shadow-[0_-18px_60px_rgba(15,23,42,0.12)] backdrop-blur-2xl')
     : (isDark ? 'border-slate-800 bg-slate-900 text-slate-400 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]' : 'border-slate-200 bg-white text-slate-500 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]');
  const optionsOverlay = isDark ? 'bg-black/48 backdrop-blur-md' : 'bg-slate-950/20 backdrop-blur-md';
  const optionsSheet = transparentUI
     ? (isDark
        ? isAurora
          ? 'border-fuchsia-300/16 bg-[#111026]/88 text-white shadow-[0_-34px_100px_rgba(5,3,20,0.68)] backdrop-saturate-150'
          : isOled
            ? 'border-white/10 bg-black/88 text-white shadow-[0_-34px_100px_rgba(0,0,0,0.76)] backdrop-saturate-150'
            : 'border-white/10 bg-[#0d1425]/88 text-white shadow-[0_-34px_100px_rgba(4,8,18,0.68)] backdrop-saturate-150'
        : isWarm
          ? 'border-[#8a7b5f]/18 bg-[#f7f0df]/86 text-[#272116] shadow-[0_-30px_90px_rgba(93,79,50,0.24)] backdrop-saturate-150'
          : 'border-white/70 bg-white/86 text-slate-950 shadow-[0_-30px_90px_rgba(15,23,42,0.18)] backdrop-saturate-150')
     : (isDark ? 'border-slate-700/60 bg-slate-900 text-white shadow-2xl' : 'border-slate-200 bg-white text-slate-950 shadow-2xl');
  const optionsCard = transparentUI
     ? (isDark ? 'border-white/10 bg-white/[0.06]' : isWarm ? 'border-[#8a7b5f]/14 bg-white/38' : 'border-slate-900/10 bg-white/54')
     : (isDark ? 'border-slate-700/70 bg-slate-800/55' : 'border-slate-200 bg-slate-50');
  const optionsButton = transparentUI
     ? (isDark ? 'bg-white/[0.075] hover:bg-white/[0.11]' : isWarm ? 'bg-white/48 hover:bg-white/64' : 'bg-white/68 hover:bg-white/88')
     : (isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-white hover:bg-slate-100 shadow-sm border border-slate-200/60');
  const textMain = isDark ? 'text-white' : 'text-slate-900';
  const textSub = isDark ? (isAurora ? 'text-violet-200/70' : 'text-slate-400') : 'text-slate-500';
  const selectedBusBreakUntil =
    selectedBus?.status === 'break'
      ? (selectedBus.schedule?.[0]?.planned ? new Date(selectedBus.schedule[0].planned).getTime() : NaN)
      : NaN;
  const breakCountdown =
    Number.isFinite(selectedBusBreakUntil)
      ? Math.max(0, Math.floor((selectedBusBreakUntil - now) / 1000))
      : null;
  const breakCountdownLabel = breakCountdown === null
    ? null
    : `${Math.floor(breakCountdown / 60)}:${String(breakCountdown % 60).padStart(2, '0')}`;
  const selectedBusStatusLabel =
    selectedBus?.status === 'break'
      ? 'Przerwa'
      : selectedBus?.status === 'cached'
        ? 'Ostatnia pozycja'
        : selectedBus?.statusText || null;
  const selectedBusGpsSignalClock = formatGpsSignalClock(selectedBus?.lastSignalTime);
  const selectedVehicleColor = selectedBus?.provider === 'mpk_rzeszow' ? '#ff7a00' : themeColor;
  const selectedBusIsWaitingForDeparture = Boolean(
    selectedBus?.status === 'break' ||
    selectedBus?.statusText?.toLowerCase().includes('przerwa do') ||
    selectedBus?.statusText?.toLowerCase().includes('odjazd za') ||
    selectedBusStatusLabel === 'Przerwa',
  );
  const selectedBusScheduleLoading =
    Boolean(selectedBus) &&
    selectedBusDetailsLoading &&
    ((selectedBus?.schedule?.length || 0) <= 1 || !(selectedBus?.schedule || []).some((stop) => stop.planned || stop.real));
  const selectedBusHeaderStyle = {
    background: transparentUI
      ? `linear-gradient(135deg, ${withAlpha(selectedVehicleColor, 0.9)}, ${withAlpha(selectedVehicleColor, 0.68)})`
      : selectedVehicleColor,
  } as React.CSSProperties;

  const transportOptions = useMemo<TransportOption[]>(() => {
    return [
      {
        id: 'pks',
        label: 'Autobusy PKS Rzeszów',
        color: '#14b8a6',
        enabled: true,
        type: 'bus',
        iconVariant: 'default_bus',
      },
      {
        id: 'mpk_rzeszow',
        label: 'Autobusy MPK Rzeszów',
        color: '#ff7a00',
        enabled: true,
        type: 'bus',
        iconVariant: 'mpk_rzeszow',
      },
    ];
  }, []);

  const openTransportPanel = useCallback(() => {
    setDraftProviders(activeProviders);
    setIsSettingsOpen(false);
    setIsTransportPanelOpen(true);
  }, [activeProviders]);

  const toggleDraftProvider = useCallback((providerId: TransportProviderId) => {
    setDraftProviders((current) =>
      current.includes(providerId)
        ? current.filter((value) => value !== providerId)
        : [...current, providerId],
    );
  }, []);

  const applyDraftProviders = useCallback(() => {
    const nextProviders = draftProviders
      .filter((providerId, index, values) => values.indexOf(providerId) === index)
      .filter((providerId) => AVAILABLE_TRANSPORT_PROVIDERS.has(providerId));
    setActiveProviders(nextProviders);
    activeProvidersRef.current = nextProviders;
    setVehicles([]);
    lastVehiclesRef.current = '';
    localStorage.setItem('mks_transport_providers', JSON.stringify(nextProviders));
    setIsTransportPanelOpen(false);
    setSelectedBus(null);
    setSelectedStopId(null);
  }, [draftProviders]);

  const handleVehicleClick = useCallback((v: Vehicle) => {
    if (!v) return;
    if (selectedBus?.id !== v.id || selectedBus?.provider !== v.provider) {
      setSelectedStopId(null);
    }
    setSelectedBus(v);
    setIsBusPanelExpanded(true);
    setIsSettingsOpen(false);
    setIsTransportPanelOpen(false);
    loadVehicleDetails(v);
  }, [loadVehicleDetails, selectedBus?.id, selectedBus?.provider]);
  
  // We force Google map Style, but we will apply a CSS invert filter for dark mode in the JSX if isDark

  return (
    <div className={`fixed inset-0 w-full ${bgMain} ${textMain} font-sans overflow-hidden flex flex-col ${isOled ? 'theme-oled' : ''} ${isWarm ? 'theme-warm' : ''} ${isAurora ? 'theme-aurora' : ''}`}>
      <style>{`
        .dark-mode-map .leaflet-layer,
        .dark-mode-map .leaflet-control-zoom-in,
        .dark-mode-map .leaflet-control-zoom-out,
        .dark-mode-map .leaflet-control-attribution {
          filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%);
        }
        
        /* OLED Theme Overrides */
        .theme-oled .bg-slate-900:not(.mks-bus-marker *) { background-color: #000000 !important; }
        .theme-oled .bg-slate-800:not(.mks-bus-marker *) { background-color: #050505 !important; }
        .theme-oled .bg-slate-700:not(.mks-bus-marker *) { background-color: #0a0a0a !important; }
        .theme-oled .border-slate-800:not(.mks-bus-marker *) { border-color: transparent !important; }
        .theme-oled .border-slate-700:not(.mks-bus-marker *) { border-color: transparent !important; }
        .theme-oled .border-slate-700\\/50 { border-color: transparent !important; }
        .theme-oled .border-b { border-bottom-color: transparent !important; }
        .theme-oled .border-t { border-top-color: transparent !important; }
        .theme-oled .bg-slate-900\\/60:not(.mks-bus-marker *) { background-color: rgba(0,0,0,0.6) !important; }
        .theme-oled .bg-slate-900\\/80:not(.mks-bus-marker *) { background-color: rgba(0,0,0,0.8) !important; }
        .theme-oled .bg-slate-900\\/85:not(.mks-bus-marker *) { background-color: rgba(0,0,0,0.85) !important; }
        .theme-oled .bg-slate-800\\/40:not(.mks-bus-marker *) { background-color: rgba(5,5,5,0.4) !important; }

        /* Aurora Theme Overrides */
        .theme-aurora .bg-slate-900:not(.mks-bus-marker *) { background-color: #120f24 !important; }
        .theme-aurora .bg-slate-800:not(.mks-bus-marker *) { background-color: #1b1630 !important; }
        .theme-aurora .bg-slate-700:not(.mks-bus-marker *) { background-color: #2a2146 !important; }
        .theme-aurora .bg-slate-900\\/80:not(.mks-bus-marker *) { background-color: rgba(26,20,48,0.84) !important; }
        .theme-aurora .bg-slate-900\\/85:not(.mks-bus-marker *) { background-color: rgba(26,20,48,0.9) !important; }
        .theme-aurora .bg-slate-800\\/40:not(.mks-bus-marker *) { background-color: rgba(31,23,54,0.48) !important; }
        .theme-aurora .border-slate-700\\/50 { border-color: rgba(232,121,249,0.18) !important; }
        .theme-aurora .border-slate-700:not(.mks-bus-marker *) { border-color: rgba(167,139,250,0.26) !important; }
        .theme-aurora .text-slate-400:not(.mks-bus-marker *) { color: #c4b5fd !important; }

        /* Warm (Piaskowy) Theme Overrides */
        .theme-warm .bg-slate-50:not(.mks-bus-marker *) { background-color: #f2ede1 !important; }
        .theme-warm .bg-white:not(.mks-bus-marker *) { background-color: #faf7ef !important; }
        .theme-warm .bg-slate-100:not(.mks-bus-marker *) { background-color: #e6e0cc !important; }
        .theme-warm .bg-slate-200:not(.mks-bus-marker *) { background-color: #dad4b6 !important; }
        .theme-warm .bg-slate-900:not(.mks-bus-marker *) { background-color: #f2ede1 !important; }
        .theme-warm .border-slate-50:not(.mks-bus-marker *) { border-color: #f2ede1 !important; }
        .theme-warm .border-slate-100:not(.mks-bus-marker *) { border-color: #dcd6ba !important; }
        .theme-warm .border-slate-200:not(.mks-bus-marker *) { border-color: #cfc89f !important; }
        .theme-warm .bg-white\\/90:not(.mks-bus-marker *) { background-color: rgba(250,247,239,0.9) !important; }
        .theme-warm .bg-white\\/85:not(.mks-bus-marker *) { background-color: rgba(250,247,239,0.85) !important; }
        .theme-warm .bg-white\\/80:not(.mks-bus-marker *) { background-color: rgba(250,247,239,0.8) !important; }
        .theme-warm .bg-white\\/50:not(.mks-bus-marker *) { background-color: rgba(250,247,239,0.5) !important; }
        .theme-warm .bg-slate-900\\/80:not(.mks-bus-marker *) { background-color: rgba(242,237,225,0.8) !important; }
        .theme-warm .bg-slate-900\\/60:not(.mks-bus-marker *) { background-color: rgba(242,237,225,0.6) !important; }
        .theme-warm .text-slate-900:not(.mks-bus-marker *) { color: #3d3a2e !important; }
        .theme-warm .text-slate-500:not(.mks-bus-marker *) { color: #736e56 !important; }
        .theme-warm .bg-slate-200\\/60:not(.mks-bus-marker *) { background-color: rgba(218,212,182,0.6) !important; }
        .theme-warm .bg-slate-100\\/50:not(.mks-bus-marker *) { background-color: rgba(230,224,204,0.5) !important; }
        .theme-warm *:not(.text-rose-500):not(.text-emerald-500):not(.text-amber-500):not(.mks-bus-marker *) > .text-slate-900 { color: #3d3a2e !important; }
        .theme-warm *:not(.text-rose-500):not(.text-emerald-500):not(.text-amber-500):not(.mks-bus-marker *) > .text-slate-500 { color: #736e56 !important; }
        .theme-warm *:not(.text-rose-500):not(.text-emerald-500):not(.text-amber-500):not(.mks-bus-marker *) > .text-slate-400 { color: #918b74 !important; }
        .theme-warm .border-slate-800:not(.mks-bus-marker *) { border-color: #cfc89f !important; }
        .theme-warm .bg-slate-800:not(.mks-bus-marker *) { background-color: #dad4b6 !important; }
        .theme-warm .bg-slate-800\\/80:not(.mks-bus-marker *) { background-color: rgba(218,212,182,0.8) !important; }
        .theme-warm .bg-slate-800\\/50:not(.mks-bus-marker *) { background-color: rgba(218,212,182,0.5) !important; }
        .theme-warm .bg-slate-800\\/40:not(.mks-bus-marker *) { background-color: rgba(218,212,182,0.4) !important; }
      `}</style>
      <AnimatePresence>
        {appLoadTimedOut && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-[10000] flex items-center justify-center p-6 ${isDark ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-950'}`}
          >
            <div className={`w-full max-w-md rounded-3xl border p-8 text-center shadow-2xl ${isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-rose-400/20 bg-rose-500/12 text-rose-500">
                <CloudOff size={38} strokeWidth={2.4} />
              </div>
              <h1 className="text-2xl font-black tracking-tight">Przekroczono czas połączenia</h1>
              <p className={`mx-auto mt-4 max-w-xs text-sm leading-6 ${textSub}`}>
                Aplikacja ładuje dane zbyt długo. Sprawdź internet albo spróbuj ponownie.
              </p>
              <p className="mt-5 font-mono text-base font-bold text-rose-500">Interval Time Error</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mx-auto mt-7 inline-flex h-12 min-w-56 items-center justify-center gap-3 rounded-2xl bg-emerald-500 px-6 text-sm font-black text-white shadow-lg transition-all active:scale-95"
              >
                <RefreshCw size={20} />
                Załaduj ponownie
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Main Content Area */}
      <div className={`flex-1 relative min-h-0 overflow-hidden ${isDark ? 'dark-mode-map' : ''}`}>
         
         <AnimatePresence>
            {isOffline && (
               <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className={`absolute top-20 left-1/2 z-[9999] flex -translate-x-1/2 items-center gap-3 rounded-2xl border px-5 py-3 shadow-xl pointer-events-auto ${isDark ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-900'}`}
               >
                  <CloudOff className="h-5 w-5 shrink-0 text-rose-500" />
                  <span className="whitespace-nowrap text-sm font-bold tracking-tight">Jesteś obecnie offline</span>
               </motion.div>
            )}
         </AnimatePresence>

         <AnimatePresence mode="wait">
            {activeTab === 'admin' && canOpenAdminEmbed && (
               <motion.div
                  key="admin-embed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`absolute inset-0 z-[25] flex min-h-0 flex-col ${isDark ? 'bg-[#040609]' : isWarm ? 'bg-[#f2ede1]' : 'bg-slate-50'}`}
               >
                  <AdminDashboard embedded themeColor={themeColor} isDarkTheme={isDark} onExit={() => setActiveTab(isMapTabDisabled ? 'stops' : 'map')} />
               </motion.div>
            )}
         </AnimatePresence>

         {/* ============== MAP VIEW ============== */}
         <div className="absolute inset-0 z-0">
            <BusMap 
               vehicles={filteredVehicles} 
               onVehicleClick={handleVehicleClick}
               selectedVehicleId={selectedBus?.id}
               stopsData={stopsDataMap}
               themeColor={themeColor}
               refreshInterval={refreshInterval}
               forcedCenter={mapCenter}
               onCenterComplete={() => setMapCenter(null)}
               highlightedStopId={selectedStopId}
               onStopClick={(stopId) => {
                  setSelectedStopId(stopId);
                  setIsStopPanelExpanded(true);
                  setIsTransportPanelOpen(false);
               }}
               onMapClick={() => {
                  setSelectedBus(null);
                  setSelectedBusDetailsLoading(false);
                  setSelectedStopId(null);
                  setIsTransportPanelOpen(false);
               }}
            />

            {/* Overlays for Map */}
            <div className="absolute top-0 left-0 right-0 z-10 p-2 md:p-4 pointer-events-none flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              
              {/* Top Box Mobile / Desktop */}
              <div className={`${mapGlassPanel} rounded-[1.4rem] border p-3 md:p-4 flex flex-col gap-3 pointer-events-auto w-full md:w-96 transition-all`}>
                <div className="flex items-center justify-between font-extrabold text-xl tracking-tight" style={{ color: themeColor }}>
                  <div className="flex items-center gap-2">
                     <Bus className="w-5 h-5 md:w-6 md:h-6" />
                     <span className="text-lg md:text-xl">PKS Live</span>
                  </div>
                  <div className="flex items-center gap-2">
                     <button 
                        onClick={handleManualRefresh}
                        className={`p-1.5 rounded-xl transition-all active:scale-90 relative ${transparentUI ? 'hover:bg-white/10' : (isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100')} ${isManualRefreshing ? 'text-blue-500' : (isDark ? 'text-slate-400' : 'text-slate-500')}`}
                        title="Odśwież ręcznie"
                     >
                        <RefreshCw className={`w-4 h-4 ${isManualRefreshing ? 'animate-spin' : ''}`} />
                     </button>
                     {error ? (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                     ) : (
                        <span className="relative flex h-2.5 w-2.5" title="LIVE">
                           <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                           <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </span>
                     )}
                  </div>
                </div>
                
                <div className="relative shrink-0">
                  <Search className={`absolute left-3 top-2.5 h-4 w-4 opacity-60 ${textSub}`} />
                  <input
                    type="text"
                    className={`w-full py-2 pl-10 pr-10 rounded-xl text-sm focus:outline-none focus:ring-2 transition-all font-medium placeholder-opacity-60 ${mapGlassInput}`}
                    style={{ '--tw-ring-color': themeColor + '80' } as React.CSSProperties}
                    placeholder="Filtruj linię (np. 108)..."
                    value={filterRoute}
                    onPointerDown={closeMapPanelsForSearch}
                    onFocus={closeMapPanelsForSearch}
                    onChange={(e) => setFilterRoute(e.target.value)}
                  />
                  {filterRoute && (
                     <button onClick={() => setFilterRoute('')} className={`absolute right-3 top-2.5 opacity-60 hover:opacity-100 ${textSub}`}>
                        <X className="w-4 h-4" />
                     </button>
                  )}
                </div>

              </div>

              <div className="flex w-full justify-end md:hidden pointer-events-auto -mt-2 pr-1">
                <button
                  type="button"
                  onClick={openTransportPanel}
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border shadow-lg transition-all active:scale-95 ${mapGlassPanel}`}
                  title="Przewoźnicy"
                  aria-label="Przewoźnicy"
                >
                  <Bus className="h-5 w-5" />
                </button>
              </div>

              {/* Desktop Settings & Refresh Pill (Hidden on Mobile) */}
              <div className={`hidden md:flex ${mapGlassPanel} rounded-full border px-4 py-2 pointer-events-auto items-center gap-4 transition-all`}>
                 <button
                    type="button"
                    onClick={openTransportPanel}
                    className={`flex items-center gap-2 text-sm font-bold transition-colors mr-2 ${isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                 >
                    <Bus className="h-5 w-5" /> Przewoźnicy
                 </button>
                 <div className={`w-px h-4 ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}></div>
                 <button 
                    disabled={isStopsTabDisabled}
                    onClick={() => { if (!isStopsTabDisabled) setActiveTab('stops'); }}
                    className={`flex items-center gap-2 text-sm font-bold transition-colors mr-2 ${isStopsTabDisabled ? 'cursor-not-allowed opacity-40 grayscale' : (isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}
                 >
                    <StopTabIcon className="h-5 w-5" /> Przystanki
                 </button>
                 {canOpenAdminEmbed && (
                    <>
                       <div className={`w-px h-4 ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}></div>
                       <button
                          type="button"
                          onClick={() => {
                             setActiveTab('admin');
                             setSelectedBus(null);
                             setSelectedStopId(null);
                             setIsSettingsOpen(false);
                          }}
                          className={`flex items-center gap-2 text-sm font-bold transition-colors mr-2 ${activeTab === 'admin' ? '' : (isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}
                          style={activeTab === 'admin' ? { color: themeColor } : {}}
                       >
                          <Shield className="w-4 h-4" /> Admin
                       </button>
                    </>
                 )}
                 <div className={`w-px h-4 ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}></div>
                 <button 
                    onClick={() => setIsSettingsOpen(true)}
                    className={`p-2 -mr-2 rounded-full transition-colors border ${isDark ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-400' : 'bg-slate-50 hover:bg-slate-100 border-slate-100 text-slate-500'}`}
                    title="Ustawienia"
                 >
                    <Settings className="w-4 h-4" />
                 </button>
              </div>
            </div>

            <TransportSelectorPanel
              open={isTransportPanelOpen}
              options={transportOptions}
              selectedIds={draftProviders}
              onClose={() => setIsTransportPanelOpen(false)}
              onToggle={toggleDraftProvider}
              onApply={applyDraftProviders}
              isDark={isDark}
            />

            <AnimatePresence>
              {selectedBus && (
                <motion.div
                  key="bus-panel-map"
                  initial={{ y: "100%", opacity: 0.5 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: "100%", opacity: 0.5 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className={`absolute bottom-[calc(64px+env(safe-area-inset-bottom))] left-0 right-0 md:bottom-4 md:left-4 md:right-auto md:w-[400px] rounded-t-3xl md:rounded-3xl border-t border-l border-r md:border z-50 overflow-hidden flex flex-col max-h-[calc(60vh-32px)] md:max-h-[85vh] md:mb-0 ${mapDetailPanel}`}
                >
                  <motion.div 
                     className="p-3 pb-5 md:p-6 md:pb-8 text-white relative shrink-0 cursor-pointer touch-none overflow-hidden" 
                     style={selectedBusHeaderStyle}
                     onClick={() => setIsBusPanelExpanded(!isBusPanelExpanded)}
                     drag="y"
                     dragConstraints={{ top: 0, bottom: 0 }}
                     dragElastic={0.1}
                     onDragEnd={(e, info) => {
                        if (info.offset.y > 20) setIsBusPanelExpanded(false);
                        else if (info.offset.y < -20) setIsBusPanelExpanded(true);
                     }}
                  >
                     <div 
                        className="w-12 h-1.5 rounded-full bg-white/40 hover:bg-white/60 mx-auto mb-3 transition-colors"
                     />
                     
                     <div className="flex items-baseline gap-2 mb-1 md:mb-1.5">
                        <span className="text-3xl md:text-5xl font-black tracking-tighter drop-shadow-sm">{selectedBus.routeShortName || '-'}</span>
                        <span className="uppercase tracking-widest text-[10px] md:text-xs font-bold text-white/90">Linia</span>
                     </div>
                     <h2 className="text-sm md:text-[17px] font-medium leading-tight opacity-100 drop-shadow-sm pr-12 relative z-20">
                       Kierunek: <span className="font-bold">{normalizeVehicleText(selectedBus.direction) || 'Nieustalony'}</span>
                     </h2>
                     <h3 className="text-[10px] md:text-xs font-medium leading-tight opacity-90 drop-shadow-sm mt-0.5 md:mt-1 relative z-20 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-white/80 uppercase tracking-[0.18em] font-semibold">{getVehicleDisplayNumber(selectedBus) && `Nr pojazdu: ${getVehicleDisplayNumber(selectedBus)}`}</span>
                        {selectedBusStatusLabel && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${selectedBus.status === 'break' ? 'bg-amber-400 text-slate-950' : selectedBus.status === 'cached' ? 'bg-white/20 text-white' : selectedBus.status === 'technical' ? 'bg-indigo-500/80 text-white' : 'bg-white/15 text-white'}`}>
                            {normalizeVehicleText(selectedBusStatusLabel)}
                          </span>
                        )}
                        {selectedBus.model && (
                          <span className="basis-full text-[12px] md:text-sm font-semibold leading-tight text-white/95">Model: {selectedBus.model}</span>
                        )}
                        {(selectedBusGpsSignalClock || (selectedBus.status === 'break' && breakCountdownLabel)) && (
                          <span className="basis-full flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] md:text-xs font-semibold leading-tight text-white/85">
                            {selectedBusGpsSignalClock && (
                              <span>Ostatni sygnał GPS: <span className="font-black text-white">{selectedBusGpsSignalClock}</span></span>
                            )}
                            {selectedBus.status === 'break' && breakCountdownLabel && (
                              <span className="inline-flex items-center rounded bg-black/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tight text-white">
                                Odjazd za: {breakCountdownLabel}
                              </span>
                            )}
                          </span>
                        )}
                     </h3>
                  </motion.div>
                  
                  <AnimatePresence initial={false}>
                    {isBusPanelExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 35 }}
                        className="flex flex-col min-h-0 overflow-hidden"
                      >
                        <div className={`p-2.5 md:p-4 flex flex-col gap-2.5 md:gap-4 overflow-y-auto mt-1.5 md:mt-2 rounded-t-xl md:rounded-t-2xl relative z-10 ${mapDetailContent}`}>
                        <div className="grid grid-cols-2 gap-2 md:gap-4 shrink-0">
                        <div className={`flex flex-col justify-center p-2.5 md:p-3 rounded-xl md:rounded-2xl border ${mapDetailCard} ${selectedBusIsWaitingForDeparture ? 'col-span-2' : ''}`}>
                           <div className={`flex items-center gap-1.5 md:gap-2 text-[9px] md:text-[10px] font-bold uppercase tracking-wider mb-0.5 md:mb-1 ${textSub}`}>
                              <Navigation className="w-3 h-3 md:w-3.5 md:h-3.5" /> Prędkość
                           </div>
                           <span className={`text-base md:text-lg font-medium tracking-tight ${textMain}`}>
                              {selectedBus.status === 'break' ||
                              selectedBus.statusText?.toLowerCase().includes('postoj') ||
                              selectedBus.statusText?.toLowerCase().includes('przerwa') ||
                              selectedBus.speed === 0 ||
                              !selectedBus.speed
                                ? '0 km/h'
                                : `${Math.round(selectedBus.speed)} km/h`}
                           </span>
                        </div>
                        
                        {!selectedBusIsWaitingForDeparture && (
                        <div className={`flex flex-col justify-center p-2.5 md:p-3 rounded-xl md:rounded-2xl border ${mapDetailCard}`}>
                              <div className={`flex items-center gap-1.5 md:gap-2 text-[9px] md:text-[10px] font-bold uppercase tracking-wider mb-0.5 md:mb-1 ${textSub}`}>
                                 <Clock className="w-3 h-3 md:w-3.5 md:h-3.5" /> Punktualność
                              </div>
                              {(() => {
                                 let d = selectedBus.delay || 0;
                                 if (Math.abs(d) > 18000) d = 0; // Ignore absurd delays (e.g. > 5 hours) to prevent UI breakage
                                 const m = Math.floor(Math.abs(d) / 60);
                                 if (m === 0) return (
                                   <div className={`flex flex-col items-start ${textMain}`}>
                                     <span className="text-sm md:text-base font-bold leading-tight">Zgodnie z planem</span>
                                   </div>
                                 );
                                 if (d < 0) return (
                                   <div className="flex flex-col text-emerald-500 items-start">
                                     <div className="flex items-baseline gap-1">
                                       <span className="text-xl font-bold leading-none">{m}</span>
                                       <span className="text-sm font-medium">min</span>
                                     </div>
                                     <span className="text-[10px] font-bold uppercase tracking-wider mt-1 opacity-90">Przed czasem</span>
                                   </div>
                                 );
                                 return (
                                   <div className="flex flex-col text-rose-500 items-start">
                                     <div className="flex items-baseline gap-1">
                                       <span className="text-xl font-bold leading-none">{m}</span>
                                       <span className="text-sm font-medium">min</span>
                                     </div>
                                     <span className="text-[10px] font-bold uppercase tracking-wider mt-1 opacity-90">Opóźniony</span>
                                   </div>
                                 );
                              })()}
                           </div>
                        )}
                      </div>
                      
                      {(selectedBusScheduleLoading || (selectedBus.schedule && selectedBus.schedule.length > 0)) && (
                       <div className={`flex flex-col gap-2 mt-1 border-t pt-4 ${mapDetailDivider}`}>
                          <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${textSub}`}>
                            <MapPin className="w-4 h-4" /> Nadchodzące przystanki
                          </h3>
                          <div className="flex flex-col gap-0 relative">
                             <div className={`absolute left-[9px] top-4 bottom-4 w-0.5 ${mapDetailLine}`}></div>
                             {selectedBusScheduleLoading ? (
                                [0, 1, 2].map((idx) => (
                                  <div key={`mpk-stops-loading-${idx}`} className="flex items-start gap-4 py-2 relative z-10 px-2 -mx-2">
                                     <div className="w-5 h-5 rounded-full border-4 shrink-0 mt-0.5 shadow-sm animate-pulse" style={{ backgroundColor: selectedVehicleColor, borderColor: isDark ? 'rgba(15,23,42,0.8)' : 'rgba(255,255,255,0.85)' }}></div>
                                     <div className={`flex flex-col flex-1 pb-2 border-b ${mapDetailDivider}`}>
                                        <div className={`h-3.5 w-36 rounded-full animate-pulse ${isDark ? 'bg-white/12' : 'bg-slate-200'}`}></div>
                                        <div className={`mt-2 h-2.5 w-16 rounded-full animate-pulse ${isDark ? 'bg-white/8' : 'bg-slate-100'}`}></div>
                                     </div>
                                  </div>
                                ))
                             ) : selectedBus.schedule?.map((sch: any, idx: number) => {
                                const parsedRealTime = sch.real ? new Date(sch.real) : null;
                                const realTimeRaw = parsedRealTime && !Number.isNaN(parsedRealTime.getTime()) ? parsedRealTime : null;
                                const parsedPlannedTime = sch.planned ? new Date(sch.planned) : null;
                                const plannedTime = parsedPlannedTime && !Number.isNaN(parsedPlannedTime.getTime()) ? parsedPlannedTime : null;
                                const busDelaySec = Number(selectedBus.delay);
                                const canUseBusDelay =
                                   selectedBus.status !== 'break' &&
                                   selectedBus.status !== 'inactive' &&
                                   Number.isFinite(busDelaySec) &&
                                   Math.abs(busDelaySec) <= 18000;
                                const computedDelayTime = plannedTime && canUseBusDelay && busDelaySec !== 0 ? new Date(plannedTime.getTime() + (busDelaySec * 1000)) : null;
                                const rawLooksPlanned = Boolean(realTimeRaw && plannedTime && Math.abs(realTimeRaw.getTime() - plannedTime.getTime()) < 60_000);
                                const realTime = rawLooksPlanned ? (computedDelayTime || realTimeRaw) : (realTimeRaw || computedDelayTime);
                                const displayTime = realTime || plannedTime;
                                let delayMin = 0;
                                if (realTime && plannedTime) delayMin = Math.round((realTime.getTime() - plannedTime.getTime()) / 60000);
                                const busDelayMin = canUseBusDelay ? Math.round(busDelaySec / 60) : delayMin;
                                const formatTime = (time: Date) => {
                                   const isTomorrow = time.getDate() !== new Date().getDate();
                                   const mm = time.getMinutes().toString().padStart(2, '0');
                                   const hh = time.getHours().toString().padStart(2, '0');
                                   if (isTomorrow) {
                                      const dd = time.getDate().toString().padStart(2, '0');
                                      const mo = (time.getMonth() + 1).toString().padStart(2, '0');
                                      return `${dd}.${mo} ${hh}:${mm}`;
                                   }
                                   return `${hh}:${mm}`;
                                };
                                const timeStr = displayTime ? formatTime(displayTime) : '';
                                const timeClass = busDelayMin > 0 ? 'text-rose-500' : busDelayMin < 0 ? 'text-emerald-500' : textMain;
                                const isHighlighted = sch.id?.toString() === selectedStopId;
                                const isPastStop = selectedBus.lastStopId && sch.id === selectedBus.lastStopId;
                                return (
                                  <div 
                                     key={`${sch.id || idx}-${idx}`} 
                                     onClick={() => { if (sch.id) setSelectedStopId(sch.id.toString()); }}
                                     className={`flex items-start gap-4 py-2 relative z-10 cursor-pointer transition-colors hover:bg-slate-500/10 rounded-xl px-2 -mx-2 ${isHighlighted ? (isDark ? 'bg-amber-500/20' : 'bg-amber-100') : ''} ${isPastStop ? 'opacity-50' : ''}`}
                                  >
                                     <div className={`w-5 h-5 rounded-full border-4 shrink-0 mt-0.5 shadow-sm leading-none transition-colors ${isHighlighted ? 'border-red-500' : (isDark ? 'border-slate-800/80' : 'border-white/85')}`} style={{ backgroundColor: isHighlighted ? selectedVehicleColor : (isPastStop ? '#94a3b8' : selectedVehicleColor) }}></div>
                                     <div className={`flex flex-col flex-1 pb-2 border-b ${mapDetailDivider} ${isHighlighted ? 'border-transparent' : ''}`}>
                                        <span className={`text-[13px] font-semibold leading-tight pr-2 ${textMain}`}>{formatScheduleStopName(sch.name)}</span>
                                        {timeStr && (
                                          <div className="flex items-center gap-2 mt-1">
                                             <span className={`text-xs font-bold font-mono ${timeClass}`}>{timeStr}</span>
                                          </div>
                                        )}
                                     </div>
                                  </div>
                                );
                              })}
                          </div>
                       </div>
                     )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

              {/* New Stop Overlay on Map */}
              <AnimatePresence>
                {activeTab === 'map' && selectedStopId && !selectedBus && (
                  <motion.div
                    key="stop-panel-map"
                    initial={{ y: "100%", opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: "100%", opacity: 0 }}
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    drag="y"
                    dragConstraints={{ top: 0, bottom: 0 }}
                    dragElastic={0.2}
                    onDragEnd={(e, info) => {
                       const swipeThreshold = 50;
                       if (info.offset.y > swipeThreshold) {
                          if (isStopPanelExpanded) setIsStopPanelExpanded(false);
                          else setSelectedStopId(null);
                       } else if (info.offset.y < -swipeThreshold) {
                          if (!isStopPanelExpanded) setIsStopPanelExpanded(true);
                       }
                    }}
                    className={`absolute bottom-[calc(64px+env(safe-area-inset-bottom))] left-0 right-0 md:bottom-4 md:left-4 md:right-auto md:w-[380px] rounded-t-[32px] md:rounded-[32px] border-t border-l border-r md:border z-40 overflow-hidden flex flex-col max-h-[calc(55vh-32px)] md:max-h-[85vh] ${mapDetailPanel}`}
                  >
                     {/* Header */}
                     <motion.div 
                        className="p-4 pb-6 text-white relative shrink-0 cursor-pointer" 
                        style={{
                          background: transparentUI
                            ? `linear-gradient(135deg, ${withAlpha(themeColor, 0.9)}, ${withAlpha(themeColor, 0.68)})`
                            : themeColor,
                        }}
                        onClick={() => setIsStopPanelExpanded(!isStopPanelExpanded)}
                     >
                        <div 
                           className="w-12 h-1.5 rounded-full bg-white/30 hover:bg-white/50 mx-auto mb-4 transition-colors relative z-[51]"
                        />
                        <div className="flex justify-between items-start mt-2 px-1">
                           <h2 className="text-2xl md:text-3xl font-black leading-tight drop-shadow-md pr-4">
                              {stopsList.find(s => s.id === selectedStopId)?.name}
                           </h2>

                           <div className="flex items-center gap-2 relative z-[51]"></div>
                        </div>
                     </motion.div>

                     {/* Content */}
                     <AnimatePresence initial={false}>
                       {isStopPanelExpanded && (
                         <motion.div
                           initial={{ height: 0, opacity: 0 }}
                           animate={{ height: 'auto', opacity: 1 }}
                           exit={{ height: 0, opacity: 0 }}
                           transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                           className="flex flex-col min-h-0 overflow-hidden"
                         >
                            <div className={`flex flex-col overflow-hidden mt-3 rounded-[28px] relative z-10 shadow-2xl ${mapDetailContent}`}>
                               <div 
                                  className="overflow-y-auto custom-scrollbar px-4 md:px-5"
                                  onPointerDown={(e) => e.stopPropagation()}
                               >
                                  <div className="flex flex-col gap-2 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-5 md:pb-12">
                                     <div className={`mb-1 flex items-center gap-2 px-1 text-xs font-black uppercase tracking-[0.14em] ${textSub}`}>
                                       <Clock className="h-4 w-4" />
                                       Najbliższe odjazdy
                                     </div>
                                     {isFetchingDepartures ? (
                                        <div className="p-12 text-center flex flex-col items-center">
                                           <div className="w-10 h-10 mb-5 border-3 rounded-full animate-spin" style={{ borderColor: `${themeColor}20`, borderTopColor: themeColor }}></div>
                                           <p className={`text-sm font-bold tracking-tight ${textMain}`}>Pobieranie rozkładu...</p>
                                           <p className={`text-xs mt-1 ${textSub}`}>To może chwilę potrwać</p>
                                        </div>
                                     ) : processedDepartures.length === 0 ? (
                                        <div className={`p-10 rounded-[32px] border-2 border-dashed text-center ${transparentUI ? (isDark ? 'border-white/10 bg-white/[0.035]' : 'border-slate-900/10 bg-white/30') : (isDark ? 'border-slate-800' : 'border-slate-200')}`}>
                                           <p className={`text-base font-bold ${textMain}`}>Brak odjazdów</p>
                                           <p className={`text-xs mt-1 ${textSub}`}>Sprawdź inne godziny lub dni</p>
                                         </div>
                                       ) : (
                                          (() => {
                                             const elements: any[] = [];
                                             let lastDayStr = '';
                                             const todayStr = new Date(now).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
                                             
                                             processedDepartures.slice(0, 40).forEach((inc: any, idx: number) => {
                                                const d = new Date(Number.isFinite(inc.plannedTimeMs) ? inc.plannedTimeMs : inc.depTimeMs);
                                                const dayStr = d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
                                                
                                                if (dayStr !== lastDayStr && dayStr !== todayStr.toUpperCase()) {
                                                   elements.push(
                                                      <div key={`day-marker-${idx}`} className={`mt-8 mb-5 text-[11px] font-black uppercase tracking-[0.15em] opacity-40 ml-1 ${textSub}`}>
                                                         {dayStr}
                                                      </div>
                                                   );
                                                }
                                                lastDayStr = dayStr;
                                                
                                                elements.push(
                                                   <div key={idx} className={`flex items-center justify-between p-4 rounded-2xl border transition-all active:scale-[0.97] ${mapDetailCard} ${transparentUI ? 'hover:bg-white/10' : (isDark ? 'hover:bg-slate-800/60' : 'hover:bg-white hover:shadow-md')}`}>
                                                      <div className="flex items-center gap-4">
                                                         <div className="min-w-[50px] px-3 py-1.5 rounded-xl text-white font-black text-sm text-center shadow-md grow-0" style={{ backgroundColor: themeColor }}>
                                                            {String(inc.bus.routeShortName || '').trim().replace(/^MKS\s+/, '')}
                                                         </div>
                                                         <div className="flex flex-col">
                                                            <span className={`text-[15px] font-bold leading-tight ${textMain} max-w-[190px] md:max-w-none truncate`}>{inc.bus.direction}</span>
                                                         </div>
                                                      </div>
                                                      <div className="flex flex-col items-end">
                                                         <span className={`text-base font-black ${inc.diffMin <= 5 && inc.diffMin >= -1 ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : textMain}`}>
                                                            {inc.diffMin <= 0 && inc.diffMin >= -1 ? 'Teraz' : (inc.diffMin > 0 && inc.diffMin <= 30 ? `${inc.diffMin} min` : inc.actualTimeStr)}
                                                         </span>
                                                      </div>
                                                   </div>
                                                );
                                             });
                                             return elements;
                                          })()
                                       )}
                                   </div>
                               </div>
                            </div>
                         </motion.div>
                       )}
                     </AnimatePresence>

                  </motion.div>
                )}
              </AnimatePresence>

            </div>
         {/* ============== STOPS VIEW ============== */}
         <AnimatePresence mode="wait">
         {activeTab === 'stops' && (
         <motion.div 
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 700, damping: 35 }}
            className={`absolute inset-0 overflow-y-auto z-10 ${transparentUI ? (isDark ? 'bg-slate-900/60 backdrop-blur-md' : 'bg-slate-200/60 backdrop-blur-md') : bgMain}`}
         >
            <AnimatePresence mode="wait">
            {!selectedStopId ? (
               <motion.div 
                  key="stop-list"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ type: "spring", stiffness: 700, damping: 35 }}
                  className={`flex flex-col h-full w-full max-w-2xl mx-auto shadow-sm ${transparentUI ? 'bg-transparent' : (isDark ? 'bg-slate-900' : 'bg-white')}`}
               >
                  <div className={`p-4 border-b sticky top-0 z-20 shadow-sm ${transparentUI ? (isDark ? 'bg-slate-900/80 backdrop-blur border-slate-800/50' : 'bg-white/80 backdrop-blur border-slate-200/50') : (isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100')}`}>
                     <div className="flex justify-between items-center mb-4">
                       <h2 className="text-xl font-black" style={{ color: themeColor }}>Znajdź Przystanek</h2>
                       <button disabled={isMapTabDisabled} className={`p-1 rounded ${textSub} ${isMapTabDisabled ? 'cursor-not-allowed opacity-40' : (isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100')}`} onClick={() => { if (!isMapTabDisabled) setActiveTab('map'); }}><X className="w-5 h-5"/></button>
                     </div>
                     <div className="relative">
                       <Search className={`absolute left-3 top-3 h-4 w-4 ${textSub}`} />
                       <input
                         type="text"
                         className={`w-full py-2.5 pl-10 pr-10 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 transition-all font-medium ${isDark ? 'bg-slate-800 text-white placeholder-slate-500' : 'bg-slate-100 placeholder-slate-400'}`}
                         style={{ '--tw-ring-color': themeColor + '80' } as React.CSSProperties}
                         placeholder="Wpisz nazwę (np. Rejtana)..."
                         value={stopsFilter}
                         onChange={(e) => setStopsFilter(e.target.value)}
                       />
                       {stopsFilter && (
                          <button onClick={() => setStopsFilter('')} className={`absolute right-3 top-3 opacity-60 hover:opacity-100 ${textSub}`}>
                             <X className="w-4 h-4" />
                          </button>
                       )}
                     </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 pb-24">
                     {(() => {
                        const uniqueStops = [...filteredStopsList];
                        // Sort so that favorites are at the top
                        uniqueStops.sort((a, b) => {
                           const aFav = favsState.includes(a.id);
                           const bFav = favsState.includes(b.id);
                           if (aFav && !bFav) return -1;
                           if (!aFav && bFav) return 1;
                           // Alphabetical fallback
                           if (aFav && bFav) return a.name.localeCompare(b.name);
                           return 0; // Don't sort the rest if we don't have to, to keep original order which is somewhat alphabetical
                        });

                        return uniqueStops.slice(0, 150).map(stop => {
                           const isFav = favsState.includes(stop.id);
                           return (
                           <div key={stop.id} className={`w-full flex items-center justify-between group py-1 border-b ${transparentUI ? (isDark ? 'border-slate-700/30' : 'border-slate-300/30') : (isDark ? 'border-slate-800' : 'border-slate-50')}`}>
                              <button 
                                 onClick={() => setSelectedStopId(stop.id)}
                                 className={`flex-1 text-left py-2 px-4 flex items-center justify-between transition-colors rounded-l-lg ${transparentUI ? (isDark ? 'hover:bg-slate-800/50' : 'hover:bg-white/50') : (isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50')}`}
                              >
                                 <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${transparentUI ? (isDark ? 'bg-slate-800/80' : 'bg-white/80') : (isDark ? 'bg-slate-800' : 'bg-slate-100')}`} style={{ color: themeColor }}>
                                       <MapPin className="w-4 h-4" />
                                    </div>
                        <span className={`font-semibold ${textMain}`}>{stop.name}</span>
                                 </div>
                              </button>
                              <motion.button
                                 whileTap={{ scale: 0.8 }}
                                 onClick={(e) => toggleFavoriteStop(stop.id, e)}
                                 className="p-3 mr-1"
                              >
                                 <motion.div
                                    animate={isFav ? { scale: [1, 1.4, 1] } : {}}
                                    transition={{ duration: 0.3 }}
                                 >
                                    <Star className={`w-5 h-5 transition-colors ${isFav ? 'fill-amber-400 text-amber-400' : 'text-slate-300 hover:text-amber-300'}`} />
                                 </motion.div>
                              </motion.button>
                           </div>
                           );
                        });
                     })()}
                     {stopsList.length === 0 && !stopsLoadError && (
                        <div className={`p-8 text-center text-sm ${textSub}`}>Wczytywanie bazy przystanków...</div>
                     )}
                     {stopsLoadError && (
                        <div className="p-8 text-center flex flex-col items-center gap-3">
                           <p className={`text-sm ${textSub}`}>Nie udało się pobrać przystanków.</p>
                           <button
                              onClick={loadStops}
                              className="px-4 py-2 rounded-full text-sm font-bold text-white transition-all"
                              style={{ backgroundColor: themeColor }}
                           >
                              Spróbuj ponownie
                           </button>
                        </div>
                     )}
                  </div>
               </motion.div>
            ) : (
               <motion.div 
                  key="stop-details"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ type: "spring", stiffness: 700, damping: 35 }}
                  className={`flex flex-col h-full w-full max-w-2xl mx-auto shadow-sm ${transparentUI ? 'bg-transparent' : (isDark ? 'bg-slate-900' : 'bg-white')}`}
               >
                  <div className="p-4 pb-8 relative z-[30] text-white transition-colors shrink-0" style={{ backgroundColor: themeColor }}>
                     <div className="flex justify-between items-start mb-2">
                        <button 
                           onClick={() => setSelectedStopId(null)}
                           className="p-2 hover:bg-white/20 rounded-full transition-colors inline-flex items-center justify-center relative z-20"
                           title="Wróć do listy"
                        >
                           <ArrowLeft className="w-6 h-6" />
                        </button>
                        
                         <div className="flex gap-2">
                            <button 
                               disabled={isMapTabDisabled}
                               onClick={() => {
                                  if (isMapTabDisabled) return;
                                  const stop = stopsList.find(s => s.id === selectedStopId);
                                  if (stop && stop.lat !== undefined && stop.lon !== undefined) {
                                     setMapCenter([stop.lat, stop.lon]);
                                      setSelectedBus(null);
                                     setActiveTab('map');
                                  }
                               }}
                               className={`px-3 py-1.5 rounded-full transition-all flex items-center gap-2 text-xs font-bold ${isMapTabDisabled ? 'cursor-not-allowed bg-white/10 opacity-40 grayscale' : 'bg-white/20 hover:bg-white/30'}`}
                            >
                               <MapIcon className="w-3.5 h-3.5" /> Pokaż na mapie
                            </button>
                         </div>
                     </div>
                     <h2 className="text-2xl font-black leading-tight drop-shadow-sm pr-12 relative z-20">
                        {stopsList.find(s => s.id === selectedStopId)?.name}
                     </h2>
                  </div>
                  <div className={`flex-1 p-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] md:pb-4 -mt-4 rounded-t-2xl relative z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] overflow-y-auto ${transparentUI ? (isDark ? 'bg-slate-900/80 backdrop-blur' : 'bg-slate-50/80 backdrop-blur') : bgMain}`}>
                     <div className="flex justify-between items-center mt-2 mb-4 pl-1">
                        <h3 className={`text-[11px] font-bold uppercase tracking-widest flex items-center gap-2 ${textSub}`}>
                           <Clock className="w-4 h-4" /> Najbliższe odjazdy
                        </h3>
                        {stopDepartures && stopDepartures.length > 0 && (
                           <div className="relative ml-auto">
                               <select 
                                  className={`appearance-none text-xs pl-3 pr-8 py-1.5 rounded-full font-bold outline-none cursor-pointer border shadow-sm transition-colors ${isDark ? 'bg-slate-800 border-slate-700 text-slate-200 hover:border-slate-600' : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'}`}
                                  value={departuresLineFilter}
                                  onChange={(e) => setDeparturesLineFilter(e.target.value)}
                               >
                                  <option value="">Wszystkie linie</option>
                                  {Array.from(new Set(stopDepartures.map(d => String(d.line_name || '').trim().replace(/^MKS\s+/, '')).filter(Boolean))).sort().map(line => (
                                     <option key={line} value={line}>{line}</option>
                                  ))}
                               </select>
                               <div className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                   <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                               </div>
                           </div>
                        )}
                     </div>
                     <div className="flex flex-col gap-3">
                        {(() => {
                           if (isFetchingDepartures) {
                              return (
                                 <div className="p-8 pb-12 rounded-2xl text-center flex flex-col items-center justify-center h-full">
                                    <div className="w-8 h-8 mb-4 border-4 rounded-full animate-spin" style={{ borderColor: `${themeColor}40`, borderTopColor: themeColor }}></div>
                                    <p className={`font-medium ${textSub}`}>Ładowanie rozkładu...</p>
                                 </div>
                              );
                           }

                           let incoming = processedDepartures;
                           
                           if (departuresLineFilter) {
                              incoming = incoming.filter((inc: any) => String(inc.bus.routeShortName || '').trim().replace(/^MKS\s+/, '') === departuresLineFilter);
                           }

                           if (incoming.length === 0) {
                              return (
                                 <div className={`p-8 rounded-2xl border-2 border-dashed text-center flex flex-col items-center ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                    <Bus className={`w-8 h-8 mb-2 ${isDark ? 'text-slate-700' : 'text-slate-300'}`} />
                                    <p className={`font-medium ${textSub}`}>Brak odjazdów w najbliższym czasie</p>
                                    <p className={`text-xs mt-1 opacity-70 ${textSub}`}>Oczekuje na kolejne pojazdy na żywo...</p>
                                 </div>
                              );
                           }
                           let elements: any[] = [];
                           let currentDayStr = '';
                           
                           incoming.forEach((inc: any, i: number) => {
                               const d = new Date(Number.isFinite(inc.plannedTimeMs) ? inc.plannedTimeMs : inc.depTimeMs);
                               const dayStr = d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
                               
                               if (dayStr !== currentDayStr) {
                                  elements.push(
                                     <div key={`day-${i}`} className={`mt-4 mb-2 md:mt-6 first:mt-0 text-[11px] font-bold uppercase tracking-widest pl-1 opacity-70 ${textSub}`}>
                                        {dayStr}
                                     </div>
                                  );
                                  currentDayStr = dayStr;
                               }
                               
                               elements.push(
                                  <div key={`inc-${i}`} className={`flex items-center justify-between p-4 rounded-2xl border w-full shadow-sm transition-colors relative overflow-hidden ${isDark ? 'bg-slate-900 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200/60 hover:border-slate-300'}`}>
                                     <div className="flex flex-col gap-1.5 z-20">
                                        <div className="flex items-center gap-2">
                                           <span className="text-base font-black px-2 py-0.5 rounded shadow-sm text-white" style={{ backgroundColor: themeColor }}>
                                              {inc.bus.routeShortName}
                                           </span>
                                           <span className={`font-bold text-sm md:text-base leading-tight max-w-[140px] md:max-w-[200px] truncate ${textMain}`}>{inc.bus.direction || 'Zjazd'}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                           <span className={`text-[10px] items-center flex font-bold uppercase tracking-wider ${textSub}`}>
                                              {inc.vehicleNum ? `Nr: ${inc.vehicleNum}` : ''}
                                           </span>
                                        </div>
                                     </div>
                                     <div className="text-right flex flex-col items-end justify-center h-full z-20 pr-1">
                                        <span className={`text-xl md:text-2xl font-black tracking-tight leading-none ${inc.diffMin < 30 ? (inc.diffMin <= 0 ? 'text-rose-500' : (isDark ? 'text-emerald-400' : 'text-emerald-600')) : textMain}`}>
                                           {inc.diffMin < 0 ? 'Odjechał' : (inc.diffMin === 0 ? 'Teraz' : (inc.diffMin < 30 ? `${inc.diffMin} min` : inc.actualTimeStr))}
                                        </span>
                                     </div>
                                  </div>
                               );
                           });
                           return elements;
                        })()}
                     </div>
                  </div>
               </motion.div>
            )}
            </AnimatePresence>
         </motion.div>
         )}
         </AnimatePresence>

      </div>

      {/* Bottom Navigation for Mobile */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[5000] md:hidden">
         <div className={`pointer-events-auto flex h-[calc(64px+env(safe-area-inset-bottom))] w-full items-center justify-around border-t pb-[env(safe-area-inset-bottom)] transition-colors ${bottomGlassShell}`}>
            <button 
               disabled={isMapTabDisabled}
               onClick={() => { if (!isMapTabDisabled) { setActiveTab('map'); setSelectedBus(null); setSelectedStopId(null); } }}
               className={`relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1.5 transition-colors ${isMapTabDisabled ? 'cursor-not-allowed opacity-35 grayscale' : activeTab === 'map' ? '' : 'hover:text-current/90'}`}
               style={activeTab === 'map' ? { color: themeColor } : {}}
            >
               <MapIcon className="h-6 w-6" />
               <span className="text-[11px] font-semibold leading-none">Mapa</span>
               {activeTab === 'map' && <span className="absolute top-0 h-0.5 w-10 rounded-full" style={{ backgroundColor: themeColor }} />}
            </button>
            <button 
               disabled={isStopsTabDisabled}
               onClick={() => { if (!isStopsTabDisabled) { setActiveTab('stops'); setSelectedBus(null); } }}
               className={`relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1.5 transition-colors ${isStopsTabDisabled ? 'cursor-not-allowed opacity-35 grayscale' : activeTab === 'stops' ? '' : 'hover:text-current/90'}`}
               style={activeTab === 'stops' ? { color: themeColor } : {}}
            >
               <StopTabIcon className="h-6 w-6" />
               <span className="text-[11px] font-semibold leading-none">Przystanki</span>
               {activeTab === 'stops' && <span className="absolute top-0 h-0.5 w-10 rounded-full" style={{ backgroundColor: themeColor }} />}
            </button>
            {canOpenAdminEmbed && (
               <button 
                  type="button"
                  onClick={() => { setActiveTab('admin'); setSelectedBus(null); setSelectedStopId(null); setIsSettingsOpen(false); }}
                  className={`relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1.5 transition-colors ${activeTab === 'admin' ? '' : 'hover:text-current/90'}`}
                  style={activeTab === 'admin' ? { color: themeColor } : {}}
               >
                  <Shield className="h-6 w-6" />
                  <span className="text-[11px] font-semibold leading-none">Admin</span>
                  {activeTab === 'admin' && <span className="absolute top-0 h-0.5 w-10 rounded-full" style={{ backgroundColor: themeColor }} />}
               </button>
            )}
            <button 
               onClick={() => setIsSettingsOpen(true)}
               className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1.5 transition-colors hover:text-current/90"
            >
               <Settings className="h-6 w-6" />
               <span className="text-[11px] font-semibold leading-none">Opcje</span>
            </button>
         </div>
      </div>

      {/* Settings Modal (Overlay) */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={`absolute inset-0 z-[6000] flex items-end justify-center backdrop-blur-sm md:items-center md:p-6 ${optionsOverlay}`}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div 
               initial={{ y: "100%", opacity: 0, scale: 0.98 }}
               animate={{ y: 0, opacity: 1, scale: 1 }}
               exit={{ y: "100%", opacity: 0, scale: 0.96 }}
               transition={{ type: "spring", stiffness: 700, damping: 35 }}
               className={`w-full max-w-2xl max-h-[92vh] pointer-events-auto overflow-hidden rounded-t-[2rem] border-t px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4 backdrop-blur-3xl md:max-w-[560px] md:rounded-[1.75rem] md:border md:p-6 ${optionsSheet}`}
            >
               <div className="mb-5 flex items-center justify-between md:mb-6">
                  <h2 className="text-2xl font-light tracking-tight md:text-2xl">Opcje aplikacji</h2>
                  <button onClick={() => setIsSettingsOpen(false)} className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-colors md:h-11 md:w-11 ${isDark ? 'bg-white/10 hover:bg-white/15' : 'bg-slate-900/8 hover:bg-slate-900/12'}`}>
                     <X className="h-6 w-6" />
                  </button>
               </div>
               
               <div className="flex max-h-[calc(92vh-7rem)] w-full flex-col gap-4 overflow-y-auto relative z-0 pr-1 md:max-h-[70vh]">
                  
                  {/* Appearance Bento Box */}
                  <div className={`rounded-[1.45rem] border p-4 md:p-5 ${optionsCard}`}>
                     <h3 className={`mb-4 px-1 text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-violet-200' : isWarm ? 'text-[#746a58]' : 'text-slate-500'}`}>Wygląd i kolory</h3>
                     
                     <div className="mb-4 grid grid-cols-2 gap-3">
                        {[
                           { id: 'system', name: 'Systemowy', icon: <Monitor className="w-4 h-4 mr-1.5" /> },
                           { id: 'light', name: 'Jasny', icon: <Sun className="w-4 h-4 mr-1.5" /> },
                           { id: 'light-warm', name: 'Piaskowy', icon: <Sun className="w-4 h-4 mr-1.5" /> },
                           { id: 'dark', name: 'Ciemny', icon: <Moon className="w-4 h-4 mr-1.5" /> },
                           { id: 'dark-oled', name: 'AMOLED', icon: <Moon className="w-4 h-4 mr-1.5" /> },
                           { id: 'dark-aurora', name: 'Aurora', icon: <Sparkles className="w-4 h-4 mr-1.5" /> }
                        ].map(mode => (
                           <button
                              key={mode.id}
                              onClick={() => saveAppTheme(mode.id)}
                              className={`flex h-14 items-center justify-center rounded-2xl text-base font-semibold transition-all border md:h-12 md:text-sm ${appTheme === mode.id ? 'shadow-[0_0_24px_rgba(0,163,162,0.16)]' : 'border-transparent'} ${optionsButton}`}
                              style={appTheme === mode.id ? { borderColor: themeColor, color: themeColor } as React.CSSProperties : {}}
                           >
                              {mode.icon}
                              {mode.name}
                           </button>
                        ))}
                     </div>

                     <div className={`flex items-center justify-between rounded-3xl p-3 ${isDark ? 'bg-white/[0.04]' : 'bg-slate-900/[0.045]'}`}>
                        {[
                           { name: 'Teal', hex: '#00A3A2' },
                           { name: 'Blue', hex: '#3b82f6' },
                           { name: 'Purple', hex: '#8b5cf6' },
                           { name: 'Rose', hex: '#f43f5e' },
                           { name: 'Amber', hex: '#f59e0b' }
                        ].map(color => (
                           <button
                              key={color.name}
                              onClick={() => saveThemeColor(color.hex)}
                              className={`h-12 w-12 rounded-2xl transition-all md:h-10 md:w-10 ${themeColor === color.hex ? 'ring-4 ring-white scale-105 shadow-lg' : 'hover:scale-105'}`}
                              style={{ backgroundColor: color.hex, '--tw-ring-color': isDark ? '#ffffff' : color.hex, '--tw-ring-offset-color': isDark ? '#1e293b' : '#ffffff' } as React.CSSProperties}
                              title={color.name}
                           />
                        ))}
                     </div>
                  </div>

                  {/* Settings Bento Box */}
                  <div className="flex flex-col gap-5">
                     <label className={`flex cursor-pointer items-center justify-between rounded-[1.45rem] border p-4 transition-colors md:p-5 ${optionsCard}`}>
                        <div className="flex min-w-0 items-center gap-4 pr-4">
                           <Sparkles className="h-7 w-7 shrink-0" style={{ color: themeColor }} />
                           <div className="flex flex-col">
                              <span className="text-base font-semibold md:text-base">Efekt przezroczystości UI</span>
                              <span className={`mt-1.5 text-xs leading-relaxed ${textSub}`}>Rozmycie tła interfejsu (starsze urządzenia mogą zwolnić)</span>
                           </div>
                        </div>
                        <div className={`relative h-9 w-16 flex-shrink-0 rounded-full transition-colors ${transparentUI ? '' : (isDark ? 'bg-white/12' : 'bg-slate-300')}`} style={{ backgroundColor: transparentUI ? themeColor : '' }}>
                           <div className={`absolute left-1 top-1 h-7 w-7 rounded-full bg-white shadow-md transition-transform ${transparentUI ? 'translate-x-7' : ''}`}></div>
                        </div>
                        <input type="checkbox" className="hidden" checked={transparentUI} onChange={(e) => saveTransparentUI(e.target.checked)} />
                     </label>
                     
                     <label className={`flex cursor-pointer items-center justify-between rounded-[1.45rem] border p-4 transition-colors md:p-5 ${optionsCard}`}>
                        <div className="flex min-w-0 items-center gap-4 pr-4">
                           <Bus className={`h-7 w-7 shrink-0 ${isDark ? 'text-white/90' : 'text-slate-700'}`} />
                           <div className="flex flex-col">
                              <span className="text-base font-semibold md:text-base">Pokaż autobusy bez przypisanej linii</span>
                              <span className={`mt-1.5 text-xs leading-relaxed ${textSub}`}>Pojazdy bez aktywnego kursu oraz ich ostatnia zapisana pozycja</span>
                           </div>
                        </div>
                        <div className={`relative h-9 w-16 flex-shrink-0 rounded-full transition-colors ${showInactive ? '' : (isDark ? 'bg-white/12' : 'bg-slate-300')}`} style={{ backgroundColor: showInactive ? themeColor : '' }}>
                           <div className={`absolute left-1 top-1 h-7 w-7 rounded-full bg-white shadow-md transition-transform ${showInactive ? 'translate-x-7' : ''}`}></div>
                        </div>
                        <input type="checkbox" className="hidden" checked={showInactive} onChange={(e) => saveInactive(e.target.checked)} />
                     </label>
                  </div>

               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
