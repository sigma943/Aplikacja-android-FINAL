'use client';
import BusDetailsPanel from '@/components/BusDetailsPanel';

import {toggleStopFavoriteIds} from '@/lib/stop-identity';
import {readBusCoordinates} from '@/lib/bus-coordinates';
import {onWidgetOpen} from '@/lib/stop-widget';

import {useMapStops} from '@/lib/use-map-stops';
import {useStopDepartures} from '@/Panel/src/components/useStopDepartures';
import {mapStopDepartureRows} from '@/lib/map-stop-departures';
import {useForegroundRefresh} from '@/lib/use-foreground-refresh';
import {useSheetGesture} from '@/lib/use-sheet-gesture';
import {BackScope, useAppBack} from '@/lib/use-app-back';
import {upcomingVehicleStops} from '@/lib/vehicle-upcoming-stops';

import {loadStopDepartures} from '@/lib/stop-departures';
import {uiAccentVariables} from '@/lib/ui-accent';
import {MapHeader,BottomNavigation,StopTabIcon} from '@/components/ApplicationChrome';
import {applyScheduledProfile} from '@/lib/personalization-profiles';
import {panelGlowStrength} from '@/lib/panel-glow';
import {DEFAULT_INTERFACE_APPEARANCE,INTERFACE_APPEARANCE_KEY,normalizeInterfaceAppearance,vehicleHeaderStyle,type InterfaceAppearance} from '@/lib/interface-appearance';
import {busOperatingState} from '@/lib/bus-operating-state';

import {timedVehicleStops} from '@/lib/vehicle-stop-timing';

import {startTransition, useState, useEffect, useMemo, useCallback, useRef, useDeferredValue} from 'react';
import dynamic from 'next/dynamic';
import {Capacitor} from '@capacitor/core';
import {Bus, Search, RefreshCw, X, Navigation, Map as MapIcon, Settings, CloudOff, Shield, Check} from 'lucide-react';
import {motion, AnimatePresence} from 'motion/react';
import type {Vehicle} from '@/components/BusMap';
import MapStopSheet from '@/components/MapStopSheet';
import OptionsSheet from '@/components/OptionsSheet';
import OptionsContent from '@/components/OptionsContent';
import TransportSelectorPanel, {type TransportOption} from '@/components/TransportSelectorPanel';
import TrainDetailsPanel from '@/components/TrainDetailsPanel';
import {warsawDateIso} from '@/lib/transit-time';
import type {Stop as StopsPanelStop} from '@/Panel/src/types';
import {fetchStopsClient, fetchVehicleDetailsClient, fetchVehiclesClient, type PkpQueryViewport, type TransportProviderId} from '@/lib/pks-client';
import {useFirebase} from '@/components/FirebaseProvider';
import {canAccessAdminDashboard} from '@/lib/admin/rbac';

import {formatGpsSignalClock, hasUsableRouteDetails, vehicleRouteDetailsCacheKey, withAlpha, getVehicleDisplayNumber} from '@/lib/home/vehicle-display';
import {AVAILABLE_TRANSPORT_PROVIDERS, PKP_INTERCITY_REFRESH_MS, hasInternetReachability, sanitizeProvidersWithVisibility, readStoredTransportProviders, sameTransportProviders, VEHICLE_PROVIDER_STALE_GRACE_MS} from '@/lib/home/provider-settings';

const PKS_COLOR = '#14b8a6';

const MPK_RZESZOW_COLOR = '#ff7a00';

const MARCEL_COLOR = '#68c44a';

const PKP_INTERCITY_COLOR = '#1d4ed8';

const StopsPanel = dynamic(() => import('@/components/stops-panel/StopsPanel'), { ssr: false });

const BusMap = dynamic(() => import('@/components/BusMap'), {
  ssr: false,
  loading: () => (
    <div className="pks-map-loading-screen h-full w-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="pks-map-loading-spinner h-10 w-10 rounded-full border-4 animate-spin"></div>
        <p className="pks-map-loading-label text-sm font-black tracking-tight">Trwa wczytywanie mapy...</p>
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


export default function Home() {
  const { device, loading, hiddenProviderIds } = useFirebase();
  const isOwnerDevice = device?.role === 'owner';
  const hiddenProvidersSet = useMemo(
    () => new Set(
      (isOwnerDevice ? [] : hiddenProviderIds)
        .filter((providerId): providerId is TransportProviderId => AVAILABLE_TRANSPORT_PROVIDERS.has(providerId as TransportProviderId))
        .map((providerId) => providerId as TransportProviderId),
    ),
    [hiddenProviderIds, isOwnerDevice],
  );

  const lastVehiclesRef = useRef<string>('');
  const lastVehiclesEtagRef = useRef<string>('');
  const activeProvidersRef = useRef<TransportProviderId[]>([]);
  const vehiclesFetchAbortRef = useRef<AbortController | null>(null);
  const lastProviderNonEmptyAtRef = useRef<Map<TransportProviderId, number>>(new Map());
  const vehicleDetailsCacheRef = useRef<Map<string, { vehicle: Vehicle; expiresAt: number }>>(new Map());
  const vehicleDetailsRequestSeqRef = useRef(0);
  const vehiclesRef = useRef<Vehicle[]>([]);
  const lastPkpIntercityFetchAtRef = useRef(0);
  const isAppForegroundRef = useRef<boolean>(typeof document === 'undefined' ? true : document.visibilityState === 'visible');
  const mapViewportRef = useRef<PkpQueryViewport | null>(null);
  const lastViewportFetchAtRef = useRef(0);

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
  const [isBusPanelExpanded, setIsBusPanelExpanded] = useState(false);
  const busHeaderRef=useRef<HTMLDivElement>(null);
  const [busSizes,setBusSizes]=useState({compact:180,full:480});
  const busDrag=useSheetGesture(isBusPanelExpanded,setIsBusPanelExpanded,busSizes.compact,busSizes.full);
  useEffect(()=>{
    const header=busHeaderRef.current;if(!header)return;
    const measure=()=>{const compact=header.getBoundingClientRect().height;const full=Math.max(compact,innerWidth>=768?innerHeight*.85:innerHeight*.60-32);setBusSizes(current=>Math.abs(current.compact-compact)<1&&Math.abs(current.full-full)<1?current:{compact,full});};
    const observer=new ResizeObserver(measure);observer.observe(header);window.addEventListener('resize',measure);measure();
    return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
  },[selectedBus?.id]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isOptionsExpanded, setIsOptionsExpanded] = useState(true);
  const openOptions = () => { setIsOptionsExpanded(true); setIsSettingsOpen(true); };
  useEffect(() => {
    if (!isSettingsOpen) setIsOptionsExpanded(false);
  }, [isSettingsOpen]);
  const [isOffline, setIsOffline] = useState(false);
  const [isAppForeground, setIsAppForeground] = useState<boolean>(
    typeof document === 'undefined' ? true : document.visibilityState === 'visible',
  );
  
  // Customization States
  const [themeColor, setThemeColor] = useState('#00A3A2');
  const [showInactive, setShowInactive] = useState(false);
  const [showMapStops,setShowMapStops]=useState(false);
  // Match the exported HTML first; restore preferences after hydration so React
  // updates theme classes rather than retaining mismatched server attributes.
  const [appTheme, setAppTheme] = useState<'system'|'light'|'light-warm'|'dark'|'dark-oled'|'dark-aurora'>('dark-oled');
  const [systemIsDark, setSystemIsDark] = useState(false);
  const [transparentUI, setTransparentUI] = useState(true);
  const [lightEffects,setLightEffects]=useState(false);
  const [panelGlow,setPanelGlow]=useState(false);
  const [glowStrength,setGlowStrength]=useState(40);
  const [interfaceAppearance,setInterfaceAppearance]=useState<InterfaceAppearance>(()=>({...DEFAULT_INTERFACE_APPEARANCE}));

  // Stops States
  const [activeTab, setActiveTab] = useState<'map' | 'stops' | 'admin'>('map');
  const [initialFavoritesOnly,setInitialFavoritesOnly]=useState(false);
  const startScreenApplied=useRef(false);
  const [widgetStop,setWidgetStop]=useState<StopsPanelStop|null>(null);
  useEffect(()=>onWidgetOpen(stop=>{startScreenApplied.current=true;setWidgetStop(stop);setActiveTab('stops');}),[]);
  const [hasOpenedStops, setHasOpenedStops] = useState(false);
  useEffect(() => {
    if (activeTab === 'stops') setHasOpenedStops(true);
  }, [activeTab]);
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
  const mapStops=useMapStops(showMapStops,stopsList);
  const [stopsLoadError, setStopsLoadError] = useState(false);
  const stopsLoadPendingRef = useRef(false);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [selectedExternalStop, setSelectedExternalStop] = useState<StopsPanelStop | null>(null);
  const [isStopPanelExpanded, setIsStopPanelExpanded] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(7000);
  const [favsState, setFavsState] = useState<string[]>([]);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);

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
      setSelectedExternalStop(null);
    }
  }, [selectedBus, selectedStopId]);

  useEffect(() => {
    activeProvidersRef.current = activeProviders;
  }, [activeProviders]);
  useEffect(() => {
    vehiclesRef.current = vehicles;
  }, [vehicles]);
  useEffect(() => {
    isAppForegroundRef.current = isAppForeground;
  }, [isAppForeground]);

  const formatScheduleStopName = useCallback((name?: string | null) => {
    const raw = String(name || '').trim();
    if (!raw) return 'Przystanek nieznany';
    return raw.replace(/^Rzeszów\s+D\.A\.\s+st\.\s*0*\d+$/i, 'Rzeszów D.A.');
  }, []);

  const adminReturnTab = useRef<'map' | 'stops'>('map');
  const mapStopReturnTab = useRef<'stops' | null>(null);
  useAppBack(isSettingsOpen, () => {setIsSettingsOpen(false);return true;},100);
  useAppBack(isTransportPanelOpen, () => {setIsTransportPanelOpen(false);return true;},90);
  useAppBack(activeTab === 'map' && Boolean(selectedBus || selectedStopId), () => {
    if(!selectedStopId) {setSelectedBus(null);return true;}
    setSelectedStopId(null);setSelectedExternalStop(null);
    if(selectedBus)return true;
    if(mapStopReturnTab.current) {setActiveTab(mapStopReturnTab.current);mapStopReturnTab.current=null;}
    return true;
  },60);
  useAppBack(activeTab === 'stops' && !isMapTabDisabled, () => {setActiveTab('map');return true;},10);

  useEffect(() => {
    let cancelled = false;
    let nativeListenerPromise: Promise<{ remove: () => Promise<void> }> | null = null;
    let nativeActive = true;

    const updateForeground = () => {
      const visible = typeof document === 'undefined' ? true : document.visibilityState === 'visible';
      if (!cancelled) setIsAppForeground(visible && nativeActive);
    };

    updateForeground();

    const handleVisibilityChange = () => {
      updateForeground();
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    if (Capacitor.isNativePlatform()) {
      nativeListenerPromise = import('@capacitor/app').then(({ App }) =>
        App.addListener('appStateChange', ({ isActive }) => {
          nativeActive = Boolean(isActive);
          updateForeground();
        }),
      );
    }

    return () => {
      cancelled = true;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      nativeListenerPromise?.then((listener) => listener.remove()).catch(() => {});
    };
  }, []);

  const toggleFavoriteStop = useCallback((stopId: string, aliases: string[] = []) => {
    setFavsState((current) => {
      const next = toggleStopFavoriteIds(current,stopId,aliases);
      const persist = () => {
        try {
          localStorage.setItem('mks_fav_stops', JSON.stringify(next));
        } catch {
          // ignore storage quota failures
        }
      };
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (window as Window & { requestIdleCallback?: (cb: IdleRequestCallback) => number }).requestIdleCallback?.(() => persist());
      } else {
        setTimeout(persist, 0);
      }
      return next;
    });
  }, []);

  const [now, setNow] = useState(0);
  useForegroundRefresh('home-clock',async()=>{setNow(Date.now());},1000);

  const mapStopSource = useMemo<StopsPanelStop>(() => {
    const known=stopsList.find(stop=>stop.id===selectedStopId);
    return selectedExternalStop||{id:selectedStopId||'no-selection',name:known?.name||selectedStopId||'',type:'bus',carriers:[],lines:[],isFavorite:false,areaId:known?.areaId,code:known?.code,sourceProviderIds:['pks'],providerStopIds:{pks:selectedStopId||''},pksStopPoints:[{id:selectedStopId||'',areaId:known?.areaId,code:known?.code}]};
  },[selectedExternalStop,selectedStopId,stopsList]);
  const mapStopActive=activeTab==='map'&&Boolean(selectedStopId)&&!selectedBus;
  const mapToday=useStopDepartures(mapStopSource,0,warsawDateIso(),loadStopDepartures,mapStopActive);
  const mapTomorrow=useStopDepartures(mapStopSource,1,warsawDateIso(1),loadStopDepartures,mapStopActive);
  const mapDepartures=useMemo(()=>mapStopDepartureRows([...mapToday.departures,...mapTomorrow.departures],vehicles,now),[mapToday.departures,mapTomorrow.departures,vehicles,now]);
  const mapDepartureError=[...new Set([...mapToday.warnings,...mapTomorrow.warnings])].join(' ')||null;

  useEffect(() => {
    applyScheduledProfile();
    const storedProviders = sanitizeProvidersWithVisibility(readStoredTransportProviders(), hiddenProvidersSet);
    activeProvidersRef.current = storedProviders;
    setActiveProviders(storedProviders);
    setDraftProviders(storedProviders);
    setHasLoadedTransportProviders(true);

    const sTheme = localStorage.getItem('mks_theme');
    if (sTheme && sTheme !== themeColor) setTimeout(() => setThemeColor(sTheme), 0);
    setShowMapStops(localStorage.getItem('mks_show_map_stops')==='true');
    const sInactive = localStorage.getItem('mks_show_inactive');
    if (sInactive !== null) setTimeout(() => setShowInactive(sInactive === 'true'), 0);
    const sAppTheme = (localStorage.getItem('mks_app_theme') || 'dark-oled').trim().toLowerCase();
    if (['amoled', 'oled', 'dark_oled', 'darkoled'].includes(sAppTheme)) setAppTheme('dark-oled');
    else if (sAppTheme === 'system') setAppTheme('system');
    else if (sAppTheme === 'light' || sAppTheme === 'light-warm' || sAppTheme === 'dark' || sAppTheme === 'dark-oled' || sAppTheme === 'dark-aurora') setAppTheme(sAppTheme);
    const sTrans = localStorage.getItem('mks_transparent');
    setPanelGlow(localStorage.getItem('mks_panel_glow')==='true');
    setGlowStrength(panelGlowStrength(localStorage.getItem('mks_panel_glow_strength')));
    try{const savedAppearance=normalizeInterfaceAppearance(JSON.parse(localStorage.getItem(INTERFACE_APPEARANCE_KEY)||'{}'));setInterfaceAppearance(savedAppearance);
      if(!startScreenApplied.current){startScreenApplied.current=true;if(savedAppearance.startScreen!=='map'){setInitialFavoritesOnly(savedAppearance.startScreen==='favorites');setActiveTab('stops');}}
    }catch{setInterfaceAppearance({...DEFAULT_INTERFACE_APPEARANCE});}
    setTimeout(()=>setLightEffects(localStorage.getItem('mks_light_effects')==='true'),0);
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

  useEffect(()=>{
    const update=()=>{
      try{setInterfaceAppearance(normalizeInterfaceAppearance(JSON.parse(localStorage.getItem(INTERFACE_APPEARANCE_KEY)||'{}')));}catch{setInterfaceAppearance({...DEFAULT_INTERFACE_APPEARANCE});}
      const theme=localStorage.getItem('mks_app_theme')||'dark-oled';if(['light','light-warm','dark','dark-oled','dark-aurora','system'].includes(theme))setAppTheme(theme as typeof appTheme);setThemeColor(localStorage.getItem('mks_theme')||'#00a3a2');
      setTransparentUI(localStorage.getItem('mks_transparent')!=='false');setPanelGlow(localStorage.getItem('mks_panel_glow')==='true');setGlowStrength(panelGlowStrength(localStorage.getItem('mks_panel_glow_strength')));
    };
    window.addEventListener('pks-profile-applied',update);return()=>window.removeEventListener('pks-profile-applied',update);
  },[]);

  const saveThemeColor = (hex: string) => { setThemeColor(hex); localStorage.setItem('mks_theme', hex);window.dispatchEvent(new Event('pks-interface-appearance')); };
  const saveMapStops=(value:boolean)=>{setShowMapStops(value);localStorage.setItem('mks_show_map_stops',String(value));};
  const saveInactive = (val: boolean) => { setShowInactive(val); localStorage.setItem('mks_show_inactive', String(val)); fetchVehicles(val); };
  const saveAppTheme = (val: any) => {
    setAppTheme(val);
    localStorage.setItem('mks_app_theme', val);window.dispatchEvent(new Event('pks-interface-appearance'));
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
    const text = actual === 'light'
      ? '#020617'
      : actual === 'light-warm'
        ? '#272116'
        : '#ffffff';
    document.documentElement.style.setProperty('--pks-initial-bg', bg);
    document.documentElement.style.setProperty('--pks-loading-text', text);
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
  };
  const saveLightEffects=(value:boolean)=>{setLightEffects(value);localStorage.setItem('mks_light_effects',String(value));window.dispatchEvent(new Event('pks-interface-appearance'));};
  const saveInterfaceAppearance=(value:InterfaceAppearance)=>{const normalized=normalizeInterfaceAppearance(value);setInterfaceAppearance(normalized);localStorage.setItem(INTERFACE_APPEARANCE_KEY,JSON.stringify(normalized));window.dispatchEvent(new Event('pks-interface-appearance'));};
  const savePanelGlow=(value:boolean)=>{setPanelGlow(value);localStorage.setItem('mks_panel_glow',String(value));window.dispatchEvent(new Event('pks-interface-appearance'));};
  const saveGlowStrength=(value:number)=>{const strength=panelGlowStrength(value);setGlowStrength(strength);localStorage.setItem('mks_panel_glow_strength',String(strength));window.dispatchEvent(new Event('pks-interface-appearance'));};
  const saveTransparentUI = (val: boolean) => { setTransparentUI(val); localStorage.setItem('mks_transparent', String(val));window.dispatchEvent(new Event('pks-interface-appearance')); };

  const deferredFilterRoute = useDeferredValue(filterRoute);
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
    const baseTrip=base.tripId||base.journeyId;
    const detailTrip=details.tripId||details.journeyId;
    if(baseTrip && detailTrip && String(baseTrip)!==String(detailTrip)) return base;

    const baseSchedule = base.schedule || [];
    const detailsSchedule = details.schedule || [];
    const baseRouteStops = base.routeStops || [];
    const detailsRouteStops = details.routeStops || [];
    const baseRoutePath = base.routePath || [];
    const detailsRoutePath = details.routePath || [];

    const scheduleScore = (schedule: Vehicle['schedule']) => {
      const list = schedule || [];
      if (list.length === 0) return 0;
      let withTime = 0;
      let withCoords = 0;
      for (const stop of list) {
        if (stop?.planned || stop?.real) withTime += 1;
        if (Number.isFinite(stop?.lat) && Number.isFinite(stop?.lon)) withCoords += 1;
      }
      return list.length + withTime * 4 + withCoords * 2;
    };

    const routeStopsScore = (stops: Vehicle['routeStops']) => {
      const list = stops || [];
      if (list.length === 0) return 0;
      let withCoords = 0;
      for (const stop of list) {
        if (Number.isFinite(stop?.lat) && Number.isFinite(stop?.lon)) withCoords += 1;
      }
      return list.length + withCoords * 3;
    };

    const baseScheduleScore = scheduleScore(baseSchedule);
    const detailsScheduleScore = scheduleScore(detailsSchedule);
    const baseRouteStopsScore = routeStopsScore(baseRouteStops);
    const detailsRouteStopsScore = routeStopsScore(detailsRouteStops);
    const hasLiveSchedule = details.scheduleSource !== 'mybus' &&
      !(base.scheduleSource === 'mybus' && detailsSchedule.some(stop => stop.planned || stop.real)) &&
      baseScheduleScore >= detailsScheduleScore + 2;
    const hasLiveRouteStops = baseRouteStopsScore >= detailsRouteStopsScore + 2;
    const hasLiveRoutePath = baseRoutePath.length > 1 && baseRoutePath.length >= detailsRoutePath.length;

    const provider = (base.provider || details.provider) as TransportProviderId;
    const isPkpIntercity = provider === 'pkp_intercity';

    const merged = {
      ...details,
      ...base,
      // Keep live telemetry authoritative to avoid stale detail cache snapping UI backward.
      lat: base.lat,
      lon: base.lon,
      delay: base.delay ?? details.delay,
      nextTripStartAtMs: base.provider === 'mpk_rzeszow' && base.status !== 'break' ? undefined : base.nextTripStartAtMs ?? details.nextTripStartAtMs,
      nextTripFirstStopId: base.provider === 'mpk_rzeszow' && base.status !== 'break' ? undefined : base.nextTripFirstStopId ?? details.nextTripFirstStopId,
      status: base.status,
      statusText: base.statusText,
      dataAgeSec: base.dataAgeSec,
      lastSignalTime: base.lastSignalTime,
      scheduleSource: hasLiveSchedule || !detailsSchedule.length ? base.scheduleSource : details.scheduleSource,
      schedule: hasLiveSchedule ? baseSchedule : (detailsSchedule.length > 0 ? detailsSchedule : baseSchedule),
      routeStops: details.scheduleSource === 'mybus' ? detailsRouteStops : hasLiveRouteStops ? baseRouteStops : (detailsRouteStops.length > 0 ? detailsRouteStops : baseRouteStops),
      routeGeometry: details.scheduleSource === 'mybus' ? details.routeGeometry : (details.routeGeometry?.length ? details.routeGeometry : base.routeGeometry),
      routePath: details.scheduleSource === 'mybus' ? detailsRoutePath : hasLiveRoutePath ? baseRoutePath : (detailsRoutePath.length > 0 ? detailsRoutePath : baseRoutePath),
      // Preserve details-only metadata if polling payload does not carry it.
      model: base.model || details.model,
      journeyId: base.journeyId ?? details.journeyId,
      serviceId: base.serviceId ?? details.serviceId,
      tripId: base.tripId ?? details.tripId,
      brigadeName: base.brigadeName ?? details.brigadeName,
      bearing: base.bearing ?? details.bearing,
      isHistorical: base.isHistorical ?? details.isHistorical,
      speed: Number.isFinite(base.speed) ? base.speed : details.speed,
      vehicleNumber: isPkpIntercity ? (details.vehicleNumber || base.vehicleNumber) : (base.vehicleNumber || details.vehicleNumber),
      name: isPkpIntercity ? (details.name || base.name) : (base.name || details.name),
      routeShortName: isPkpIntercity ? (details.routeShortName || base.routeShortName) : (base.routeShortName || details.routeShortName),
      iconVariant: isPkpIntercity ? (details.iconVariant || base.iconVariant) : (base.iconVariant || details.iconVariant),
      trainName: isPkpIntercity ? (details.trainName || base.trainName) : (base.trainName || details.trainName),
      positionQuality: isPkpIntercity ? (details.positionQuality || base.positionQuality) : (base.positionQuality || details.positionQuality),
    };
    if(!isPkpIntercity && merged.status!=='technical' && merged.status!=='inactive' && merged.status!=='cached') {
      const operating=busOperatingState({lat:merged.lat,lon:merged.lon,speed:merged.speed,nowMs:Date.now(),stops:merged.routeStops||[],firstDepartureMs:merged.nextTripStartAtMs,firstStopId:merged.nextTripFirstStopId,reportedBreak:base.status==='break'});
      return {...merged,...operating,nextTripStartAtMs:'nextTripStartAtMs' in operating ? operating.nextTripStartAtMs : undefined,nextTripFirstStopId:'nextTripFirstStopId' in operating ? Number(operating.nextTripFirstStopId) : undefined};
    }
    return merged;
  }, []);

  useEffect(() => {
    if (!hasLoadedTransportProviders) return;
    const nextProviders = sanitizeProvidersWithVisibility(activeProvidersRef.current, hiddenProvidersSet);
    if (sameTransportProviders(nextProviders, activeProvidersRef.current)) return;

    const nextProviderSet = new Set(nextProviders);
    activeProvidersRef.current = nextProviders;
    setActiveProviders(nextProviders);
    setDraftProviders((current) => sanitizeProvidersWithVisibility(current, hiddenProvidersSet));
    setVehicles((currentVehicles) => currentVehicles.filter((vehicle) =>
      nextProviderSet.has((vehicle.provider || 'pks') as TransportProviderId),
    ));
    localStorage.setItem('mks_transport_providers', JSON.stringify(nextProviders));
    setSelectedBus((currentSelected) => {
      if (!currentSelected) return currentSelected;
      const providerId = (currentSelected.provider || 'pks') as TransportProviderId;
      return nextProviderSet.has(providerId) ? currentSelected : null;
    });
  }, [hasLoadedTransportProviders, hiddenProvidersSet]);

  const loadVehicleDetails = useCallback(async (
    vehicle: Vehicle,
    options?: { force?: boolean; silent?: boolean },
  ) => {
    const force = Boolean(options?.force);
    const silent = Boolean(options?.silent);
    const provider = (vehicle.provider || 'pks') as TransportProviderId;
    const cacheKey = vehicleRouteDetailsCacheKey(vehicle, provider, showInactive);
    const cached = vehicleDetailsCacheRef.current.get(cacheKey);
    if (!force && cached && cached.expiresAt > Date.now() && hasUsableRouteDetails(cached.vehicle)) {
      setSelectedBus((current) => current?.id === vehicle.id ? mergeVehicleDetails(current, cached.vehicle) : current);
      return cached.vehicle;
    }

    const requestSeq = vehicleDetailsRequestSeqRef.current + 1;
    vehicleDetailsRequestSeqRef.current = requestSeq;
    if (!silent) setSelectedBusDetailsLoading(true);
    try {
      const details = await fetchVehicleDetailsClient(provider, vehicle.id, showInactive);
      if (details) {
        vehicleDetailsCacheRef.current.set(
          cacheKey,
          {
            vehicle: details,
            expiresAt: Date.now() + (details.scheduleSource === 'mybus' ? 8_000 : hasUsableRouteDetails(details) ? 30 * 60_000 : 8_000),
          },
        );
        setSelectedBus((current) => current?.id === vehicle.id ? mergeVehicleDetails(current, details) : current);
      }
      return details;
    } catch (error) {
      console.warn('Vehicle details unavailable:', error);
      return null;
    } finally {
      if (!silent && vehicleDetailsRequestSeqRef.current === requestSeq) setSelectedBusDetailsLoading(false);
    }
  }, [mergeVehicleDetails, showInactive]);

  useForegroundRefresh(`${selectedBus?.provider}:${selectedBus?.id}:details`,async()=>{
    if(!selectedBus)return;
    const latest=vehiclesRef.current.find(vehicle=>vehicle.id===selectedBus.id&&vehicle.provider===selectedBus.provider)||selectedBus;
    await loadVehicleDetails(latest,{silent:true});
  },7000,Boolean(selectedBus)&&activeTab==='map');

  const fetchVehicles = async (inactive = showInactive, force = false) => {
    if (!hasLoadedTransportProviders) {
      setIsLoading(false);
      return;
    }

    if (!isAppForegroundRef.current) {
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
      const nowMs = Date.now();
      const shouldFetchPkpIntercity = requestProviders.includes('pkp_intercity')
        ? force || nowMs - lastPkpIntercityFetchAtRef.current >= PKP_INTERCITY_REFRESH_MS
        : false;
      const providersToRequest = requestProviders.filter(
        (provider) => provider !== 'pkp_intercity' || shouldFetchPkpIntercity,
      );
      if (providersToRequest.length === 0) {
        setIsLoading(false);
        return;
      }

      vehiclesFetchAbortRef.current?.abort();
      const controller = new AbortController();
      vehiclesFetchAbortRef.current = controller;
      timeoutId = setTimeout(() => controller.abort(), 30000);
      const data = await fetchVehiclesClient(inactive, providersToRequest, {
        signal: controller.signal,
        pkpViewport: mapViewportRef.current || undefined,
        onProviderLoaded: (provider, loaded) => {
          if (controller.signal.aborted || vehiclesFetchAbortRef.current !== controller) return;
          if (!activeProvidersRef.current.includes(provider) || loaded.length === 0) return;
          lastProviderNonEmptyAtRef.current.set(provider, Date.now());
          const next = [...vehiclesRef.current.filter((vehicle) => (vehicle.provider || 'pks') !== provider), ...loaded];
          vehiclesRef.current = next;
          startTransition(() => setVehicles(next));
          setIsLoading(false);
          setError(null);
        },
      }) as any;
      if (timeoutId) clearTimeout(timeoutId);
      if (controller.signal.aborted || vehiclesFetchAbortRef.current !== controller) return;
      if (vehiclesFetchAbortRef.current === controller) vehiclesFetchAbortRef.current = null;
      if (!sameTransportProviders(requestProviders, activeProvidersRef.current)) return;
      const loadedVehicles = Array.isArray(data) ? data : (data.vehicles || []);
      const requestProviderSet = new Set(requestProviders);
      const requestedProviderSet = new Set(providersToRequest);
      const freshVehicles = loadedVehicles.filter((vehicle: Vehicle) =>
        requestProviderSet.has((vehicle.provider || 'pks') as TransportProviderId),
      );
      const previousVehicles = vehiclesRef.current;
      const nowAfterFetch = Date.now();
      const stableFreshVehicles = [...freshVehicles];
      providersToRequest.forEach((provider) => {
        const freshForProvider = freshVehicles.filter((vehicle: Vehicle) => (vehicle.provider || 'pks') === provider);
        if (freshForProvider.length > 0) {
          lastProviderNonEmptyAtRef.current.set(provider, nowAfterFetch);
          return;
        }

        const previousForProvider = previousVehicles.filter((vehicle) => (vehicle.provider || 'pks') === provider);
        const lastNonEmptyAt = lastProviderNonEmptyAtRef.current.get(provider) || 0;
        const canKeepStale =
          previousForProvider.length > 0 &&
          lastNonEmptyAt > 0 &&
          nowAfterFetch - lastNonEmptyAt <= VEHICLE_PROVIDER_STALE_GRACE_MS;
        if (canKeepStale) stableFreshVehicles.push(...previousForProvider);
      });
      const carriedVehicles = vehiclesRef.current.filter((vehicle) => {
        const providerId = (vehicle.provider || 'pks') as TransportProviderId;
        return requestProviderSet.has(providerId) && !requestedProviderSet.has(providerId);
      });
      const visibleVehicles = [...carriedVehicles, ...stableFreshVehicles];
      const newDataStr = JSON.stringify(visibleVehicles);
      if (newDataStr !== lastVehiclesRef.current) {
        setVehicles(visibleVehicles);
        lastVehiclesRef.current = newDataStr;
      }
      if (providersToRequest.includes('pkp_intercity')) {
        lastPkpIntercityFetchAtRef.current = Date.now();
      }
      setError(null);
      if (isOffline) setIsOffline(false);
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);
      if (vehiclesFetchAbortRef.current?.signal.aborted) vehiclesFetchAbortRef.current = null;
      if (err.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('abort')) {
        return;
      }
      const errorMessage = String(err?.message || '');
      const isPkpIntercityProviderError = errorMessage.toLowerCase().includes('pkp intercity niedostepne');
      console.error('Fetch vehicles error:', err);
      if (
        !isPkpIntercityProviderError &&
        (err.message === 'Failed to fetch' ||
        err.name === 'AbortError' ||
        String(err.message || '').toLowerCase().includes('network') ||
        (typeof navigator !== 'undefined' && !navigator.onLine))
      ) {
        setIsOffline(true);
      }
      if (vehicles.length === 0 || force) {
        if (isPkpIntercityProviderError) {
          setError(errorMessage);
        } else if (err.message === 'Failed to fetch') {
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
    const shouldPollVehicles = activeTab === 'map' || activeTab === 'stops';
    let disposed = false;
    const pollingInterval = activeTab === 'map' ? refreshInterval : 20_000;
    
    const tick = async () => {
      if (shouldPollVehicles && isAppForegroundRef.current && !isOffline) {
        await fetchVehicles();
      }
      if (!disposed) timer = setTimeout(tick, pollingInterval);
    };

    if (!disposed) timer = setTimeout(tick, pollingInterval);

    const handleVisibility = () => {
      if (shouldPollVehicles && isAppForegroundRef.current && !isOffline) {
        fetchVehicles(showInactive, true);
      }
    };
    
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      disposed = true;
      clearTimeout(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshInterval, showInactive, isOffline, activeProviders, hasLoadedTransportProviders, activeTab]);

  useEffect(() => {
    if (!hasLoadedTransportProviders) return;

    let cancelled = false;
    let nativeListenerPromise: Promise<{ remove: () => Promise<void> }> | null = null;

    const readOfflineState = async () => {
      let offline = !(await hasInternetReachability());

      if (Capacitor.isNativePlatform()) {
        try {
          const { Network } = await import('@capacitor/network');
          const status = await Network.getStatus();
          if (!status.connected) offline = true;
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
          if (status.connected && isAppForegroundRef.current) fetchVehicles(showInactive, true);
        }),
      );
    }

    const handleOffline = () => {
      setIsOffline(true);
      applyOnlineState();
    };
    const handleOnline = () => {
      applyOnlineState().then((offline) => {
        if (!offline && isAppForegroundRef.current) fetchVehicles(showInactive, true);
      });
    };
    const syncOnlineState = async () => {
      const offline = await readOfflineState();
      if (cancelled) return;
      setIsOffline((wasOffline) => {
        if (wasOffline && !offline && isAppForegroundRef.current) {
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
    if (stopsLoadPendingRef.current) return;
    stopsLoadPendingRef.current = true;
    setStopsLoadError(false);
    const mapStops = (d: Awaited<ReturnType<typeof fetchStopsClient>>) =>
      Object.entries(d).map(([id, val]: any) => ({
           id, 
           name: val.n, 
           areaId: val.areaId, 
           code: val.code,
           lat: val.lat,
           lon: val.lon
      })).sort((a,b) => a.name.localeCompare(b.name));
    fetchStopsClient()
      .then(d => {
        const cachedStops = mapStops(d);
        setStopsList(cachedStops);
      })
      .catch(e => {
        console.error('Fetch stops fail:', e);
        setStopsLoadError(true);
      }).finally(() => { stopsLoadPendingRef.current = false; });
  };

  useEffect(() => {
    if ((activeTab === 'stops' || selectedBus || selectedStopId || showMapStops) && stopsList.length === 0 && !stopsLoadError) loadStops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedBus?.id, selectedStopId, showMapStops]);

  useEffect(() => {
    const update = () => loadStops();
    window.addEventListener('pks-live:stops-updated', update);
    return () => window.removeEventListener('pks-live:stops-updated', update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedBus) {
      const updated = vehicles.find(v => v.id === selectedBus.id && v.provider === selectedBus.provider);
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

  const handleMapViewportChange = useCallback((payload: { bbox: [number, number, number, number]; center: [number, number]; zoom: number }) => {
    mapViewportRef.current = payload;

    if (!isAppForegroundRef.current) return;
    if (isOffline) return;
    if (!activeProvidersRef.current.includes('pkp_intercity')) return;

    const nowMs = Date.now();
    if (nowMs - lastViewportFetchAtRef.current < PKP_INTERCITY_REFRESH_MS) return;
    lastViewportFetchAtRef.current = nowMs;
    fetchVehicles(showInactive, true);
  }, [fetchVehicles, isOffline, showInactive]);

  const stopsDataMap = useMemo(() => {
    const map: Record<string, any> = {};
    stopsList.forEach(s => {
      if (s.lat !== undefined && s.lon !== undefined) {
         map[String(s.id)] = { n: s.name, lat: s.lat, lon: s.lon };
      }
    });
    if (selectedExternalStop?.lat !== undefined && selectedExternalStop.lon !== undefined) {
      map[String(selectedExternalStop.id)] = {
        n: selectedExternalStop.name,
        lat: selectedExternalStop.lat,
        lon: selectedExternalStop.lon,
      };
    }
    return map;
  }, [selectedExternalStop, stopsList]);

  // Keep live polling predictable and light. Details are fetched on demand after clicking a bus.
  useEffect(() => {
    if (refreshInterval !== 7000) setTimeout(() => setRefreshInterval(7000), 0);
  }, [refreshInterval]);

  // Theme Helpers
  const actualTheme = appTheme === 'system' ? (systemIsDark ? 'dark' : 'light') : appTheme;
  const isDark = actualTheme.startsWith('dark');
  const isOled = actualTheme === 'dark-oled';
  const isAurora = actualTheme === 'dark-aurora';
  const isWarm = actualTheme === 'light-warm';

  const bgMain = isDark ? (isOled ? 'bg-black' : isAurora ? 'bg-[#120f24]' : 'bg-slate-900') : (isWarm ? 'bg-[#f8f5f0]' : 'bg-slate-50');
  const bgCard = transparentUI 
     ? (isDark ? (isOled ? 'bg-[#18232f]/60 backdrop-blur-xl border-white/12' : isAurora ? 'bg-[#1a1430]/84 backdrop-blur-xl border-fuchsia-400/20' : 'bg-slate-900/80 backdrop-blur-xl border-slate-700/50') : 'bg-white/90 backdrop-blur-md border-slate-100/50')
     : (isDark ? (isOled ? 'bg-[#18232f] border-slate-700' : isAurora ? 'bg-[#1f1736] border-fuchsia-400/20' : 'bg-slate-900 border-slate-700') : 'bg-white border-slate-200');
  const mapGlassPanel = `pks-map-surface ${transparentUI ? 'pks-glass' : ''}`;
  const mapGlassInput = transparentUI
     ? (isDark
        ? 'bg-white/[0.045] text-white placeholder-slate-300/75 border border-white/12 backdrop-blur-xl'
        : isWarm
          ? 'bg-[#fffaf0]/36 text-[#272116] placeholder-[#746a58]/75 border border-[#8a7b5f]/16 backdrop-blur-xl'
          : 'bg-white/36 text-slate-950 placeholder-slate-500 border border-slate-900/12 backdrop-blur-xl')
     : (isDark ? 'bg-slate-800 text-white placeholder-slate-400' : 'bg-slate-100/50 text-slate-900 placeholder-slate-500');
  const mapDetailPanel = 'map-detail-shell';
  const mapDetailContent = 'map-detail-body';
  const mapDetailCard = 'map-detail-row';
  const mapDetailDivider = transparentUI
     ? (isDark ? 'border-white/10' : isWarm ? 'border-[#8a7b5f]/16' : 'border-white/55')
     : (isDark ? 'border-slate-700' : 'border-slate-100');
  const mapDetailLine = transparentUI
     ? (isDark ? 'bg-white/14' : isWarm ? 'bg-[#8a7b5f]/22' : 'bg-slate-900/12')
     : (isDark ? 'bg-slate-700' : 'bg-slate-200');
  const bottomGlassShell = `pks-navigation ${transparentUI ? 'pks-glass' : ''}`;
  const optionsOverlay = transparentUI
     ? (isDark ? 'bg-black/16 backdrop-blur-sm' : 'bg-slate-950/8 backdrop-blur-sm')
     : (isDark ? 'bg-black/48' : 'bg-slate-950/20');
  const optionsSheet = `pks-options-sheet ${transparentUI ? 'pks-glass' : ''}`;
  const optionsCard = 'pks-option-card';
  const optionsButton = 'pks-option-control';
  useEffect(() => {
    for (const [key, value] of Object.entries(uiAccentVariables(themeColor, isDark))) {
      document.documentElement.style.setProperty(key, value);
    }
  }, [themeColor, isDark]);
  const textMain = isDark ? 'text-white' : 'text-slate-900';
  const textSub = isDark ? (isAurora ? 'text-violet-200/70' : 'text-slate-400') : 'text-slate-500';
  const selectedBusBreakUntil =
    selectedBus?.status === 'break'
      ? (Number.isFinite(selectedBus.nextTripStartAtMs)
          ? Number(selectedBus.nextTripStartAtMs)
          : selectedBus.schedule?.[0]?.planned
            ? new Date(selectedBus.schedule[0].planned).getTime()
            : NaN)
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
  const selectedVehicleColor =
    selectedBus?.provider === 'mpk_rzeszow'
      ? MPK_RZESZOW_COLOR
      : selectedBus?.provider === 'marcel'
        ? MARCEL_COLOR
        : selectedBus?.provider === 'pkp_intercity'
          ? PKP_INTERCITY_COLOR
          : PKS_COLOR;
  const selectedVehicleIsTrain = selectedBus?.type === 'train' || selectedBus?.provider === 'pkp_intercity';
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
  const selectedBusTimedStops = useMemo(() => selectedBus ? timedVehicleStops(selectedBus) : [],
    [selectedBus?.routeStops, selectedBus?.schedule, selectedBus?.delay, selectedBus?.status, selectedBus?.provider]);
  const selectedBusDisplayedStops = useMemo(() => selectedVehicleIsTrain ? selectedBusTimedStops
    : upcomingVehicleStops(selectedBusTimedStops, now, selectedBus?.lastStopId),
    [selectedBusTimedStops, now, selectedBus?.lastStopId, selectedVehicleIsTrain]);

  const openVehicleRouteStop = (stopId:string) => {
    const point=(selectedBus?.routeStops||selectedBus?.schedule||[]).find(stop=>String(stop.id)===stopId);
    const provider=selectedBus?.provider||'pks';
    const known=provider==='pks'?stopsList.find(stop=>stop.id===stopId):undefined;
    const name=known?.name||point?.name||('Przystanek '+stopId);
    const external: StopsPanelStop = {id:stopId,name,type:'bus',carriers:[],lines:selectedBus?.routeShortName?[selectedBus.routeShortName]:[],isFavorite:false,lat:point?.lat??known?.lat,lon:point?.lon??known?.lon,areaId:known?.areaId,code:known?.code,sourceProviderIds:[provider],providerStopIds:{[provider]:stopId}};
    if(provider==='pks')external.pksStopPoints=[{id:stopId,areaId:known?.areaId,code:known?.code}];
    if(provider==='marcel') {
      const [city,...place]=name.split(' - ');
      const normalize=(text:string)=>text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\u0142/g,'l').trim().replace(/\s+/g,' ');
      const match=normalize(place.join(' - ')||city);
      external.providerStopIds={marcelMatchKeys:match,marcelCityMatchKeys:normalize(city)+'|'+match};
    }
    setSelectedExternalStop(external);setSelectedStopId(stopId);setIsStopPanelExpanded(false);setIsTransportPanelOpen(false);
  };
  const selectedBusHeaderStyle=vehicleHeaderStyle(selectedVehicleColor,transparentUI);
  const showAlertDot = Boolean(error || isOffline);

  const transportOptions = useMemo<TransportOption[]>(() => {
    const options: TransportOption[] = [
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
      {
        id: 'marcel',
        label: 'Autobusy Marcel',
        color: MARCEL_COLOR,
        enabled: true,
        type: 'bus',
        iconVariant: 'marcel',
      },
    ];
    return options.filter((option) => !hiddenProvidersSet.has(option.id));
  }, [hiddenProvidersSet]);

  const openTransportPanel = useCallback(() => {
    setDraftProviders(activeProviders);
    setIsSettingsOpen(false);
    setIsTransportPanelOpen(true);
  }, [activeProviders]);

  const toggleDraftProvider = useCallback((providerId: TransportProviderId) => {
    if (hiddenProvidersSet.has(providerId)) return;
    setDraftProviders((current) =>
      current.includes(providerId)
        ? current.filter((value) => value !== providerId)
        : [...current, providerId],
    );
  }, [hiddenProvidersSet]);

  const applyDraftProviders = useCallback(() => {
    const nextProviders = sanitizeProvidersWithVisibility(draftProviders, hiddenProvidersSet);
    const nextProviderSet = new Set(nextProviders);
    setActiveProviders(nextProviders);
    activeProvidersRef.current = nextProviders;
    setVehicles((currentVehicles) => {
      const remainingVehicles = currentVehicles.filter((vehicle) =>
        nextProviderSet.has((vehicle.provider || 'pks') as TransportProviderId),
      );
      lastVehiclesRef.current = JSON.stringify(remainingVehicles);
      return remainingVehicles;
    });
    localStorage.setItem('mks_transport_providers', JSON.stringify(nextProviders));
    setIsTransportPanelOpen(false);
    if (selectedBus && !nextProviderSet.has((selectedBus.provider || 'pks') as TransportProviderId)) {
      setSelectedBus(null);
      setSelectedStopId(null);
      setSelectedExternalStop(null);
    }
  }, [draftProviders, hiddenProvidersSet, selectedBus]);

  const handleVehicleClick = useCallback((v: Vehicle) => {
    if (!v) return;
    if (selectedBus?.id !== v.id || selectedBus?.provider !== v.provider) {
      setSelectedStopId(null);
      setSelectedExternalStop(null);
    }
    setSelectedBus(v);
    setIsBusPanelExpanded(false);
    setIsSettingsOpen(false);
    setIsTransportPanelOpen(false);
    loadVehicleDetails(v);
  }, [loadVehicleDetails, selectedBus?.id, selectedBus?.provider]);
  
  // We force Google map Style, but we will apply a CSS invert filter for dark mode in the JSX if isDark

  return (
    <div data-ui-theme={actualTheme} style={uiAccentVariables(themeColor, isDark) as React.CSSProperties} className={`pks-theme-root ${lightEffects && transparentUI ? 'pks-light-effects' : ''} fixed inset-0 w-full ${bgMain} ${textMain} font-sans overflow-hidden flex flex-col ${isOled ? 'theme-oled' : ''} ${isWarm ? 'theme-warm' : ''} ${isAurora ? 'theme-aurora' : ''}`}>
      <style>{`
        .dark-mode-map .leaflet-layer,
        .dark-mode-map .leaflet-control-zoom-in,
        .dark-mode-map .leaflet-control-zoom-out,
        .dark-mode-map .leaflet-control-attribution {
          filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%);
        }
        
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
              <p className="hidden">
                Aplikacja ładuje dane zbyt długo. Sprawdź internet albo spróbuj ponownie.
              </p>
              <p className="mt-5 font-mono text-base font-bold text-rose-500">ConnectionTimeoutError</p>
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
      <AnimatePresence>
        {isOffline && (
          <motion.div
            initial={{ opacity: 0, y: -18, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -18, x: '-50%' }}
            className={`fixed left-1/2 top-[calc(env(safe-area-inset-top)+5rem)] z-[11000] flex items-center gap-3 rounded-2xl border px-5 py-3 shadow-2xl pointer-events-auto backdrop-blur-2xl ${isDark ? 'border-rose-400/20 bg-slate-950/88 text-white' : 'border-rose-200 bg-white/92 text-slate-950'}`}
          >
            <CloudOff className="h-5 w-5 shrink-0 text-rose-500" />
            <span className="whitespace-nowrap text-sm font-black tracking-tight">Jesteś obecnie offline</span>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Main Content Area */}
      <div className={`flex-1 relative min-h-0 overflow-hidden ${isDark ? 'dark-mode-map' : ''}`}>
         
         <BackScope enabled={activeTab === 'admin'}>
         <AnimatePresence mode="wait">
            {activeTab === 'admin' && canOpenAdminEmbed && (
               <motion.div
                  key="admin-embed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`absolute inset-0 z-[25] flex min-h-0 flex-col ${transparentUI ? 'pks-glass-frame' : isDark ? 'bg-[#040609]' : isWarm ? 'bg-[#f2ede1]' : 'bg-slate-50'}`}
                  data-panel-theme={isDark ? 'dark' : 'light'}
               >
                  <AdminDashboard embedded transparentUI={transparentUI} themeColor={themeColor} isDarkTheme={isDark} onExit={() => setActiveTab(isMapTabDisabled ? 'stops' : adminReturnTab.current)} />
               </motion.div>
            )}
         </AnimatePresence>
         </BackScope>

         {/* ============== MAP VIEW ============== */}
         <div className="absolute inset-0 z-0" inert={activeTab !== 'map'}>
            <BusMap 
               vehicles={filteredVehicles} 
               onVehicleClick={handleVehicleClick}
               selectedVehicleId={selectedBus?.id}
               selectedVehicle={selectedBus}
               stopsData={stopsDataMap}
               mapStops={mapStops}
               onMapStopClick={(stop)=>{mapStopReturnTab.current=null;setSelectedBus(null);setSelectedExternalStop(stop);setSelectedStopId(stop.id);setIsStopPanelExpanded(false);setIsTransportPanelOpen(false);}}
               themeColor={themeColor}
               refreshInterval={refreshInterval}
               forcedCenter={mapCenter}
               onCenterComplete={() => setMapCenter(null)}
               highlightedStopId={selectedStopId}
               onStopClick={openVehicleRouteStop}
               onMapClick={() => {
                   setSelectedBus(null);
                   setSelectedBusDetailsLoading(false);
                   setSelectedStopId(null);
                   setSelectedExternalStop(null);
                   setIsTransportPanelOpen(false);
                }}
                onViewportChange={handleMapViewportChange}
             />

            {/* Overlays for Map */}
            <div data-map-toolbar data-map-detail={Boolean(selectedBus||selectedStopId)} className={`absolute top-0 left-0 right-0 z-10 p-2 md:p-4 pointer-events-none ${activeTab === 'map' ? 'flex' : 'hidden'} flex-col md:flex-row justify-between items-start md:items-center gap-4`}>
              
              {/* Top Box Mobile / Desktop */}
              <MapHeader mapGlassPanel={mapGlassPanel} mapGlassInput={mapGlassInput} themeColor={themeColor} transparentUI={transparentUI} isDark={isDark} isManualRefreshing={isManualRefreshing} showAlertDot={showAlertDot} error={error} isOffline={isOffline} textSub={textSub} filterRoute={filterRoute} setFilterRoute={setFilterRoute} handleManualRefresh={handleManualRefresh} closeMapPanelsForSearch={closeMapPanelsForSearch}/>


              <div data-map-carriers className="flex w-full justify-end md:hidden pointer-events-auto -mt-2 pr-1">
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
                             setSelectedExternalStop(null);
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
                    onClick={openOptions}
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
              themeMode={actualTheme}
              transparentUI={transparentUI}
            />

            <AnimatePresence>
              {selectedBus && selectedVehicleIsTrain ? (
                <TrainDetailsPanel
                  vehicle={selectedBus}
                  expanded={isBusPanelExpanded}
                  loading={selectedBusScheduleLoading}
                  highlightedStopId={selectedStopId}
                  onToggleExpanded={() => setIsBusPanelExpanded(!isBusPanelExpanded)}
                  onClose={() => {
                    setSelectedBus(null);
                    setSelectedStopId(null);
                    setSelectedExternalStop(null);
                  }}
                  onStopSelect={(stopId) => {
                    setSelectedExternalStop(null);
                    setSelectedStopId(stopId);
                  }}
                />
              ) : selectedBus && (
                <BusDetailsPanel
                  key="bus-panel-map"
                  selectedBus={selectedBus}
                  busDrag={busDrag}
                  busHeaderRef={busHeaderRef}
                  isBusPanelExpanded={isBusPanelExpanded}
                  setIsBusPanelExpanded={setIsBusPanelExpanded}
                  transparentUI={transparentUI}
                  isDark={isDark}
                  mapDetailPanel={mapDetailPanel}
                  mapDetailContent={mapDetailContent}
                  mapDetailCard={mapDetailCard}
                  mapDetailDivider={mapDetailDivider}
                  mapDetailLine={mapDetailLine}
                  selectedBusHeaderStyle={selectedBusHeaderStyle}
                  selectedVehicleIsTrain={selectedVehicleIsTrain}
                  selectedBusStatusLabel={selectedBusStatusLabel}
                  selectedBusGpsSignalClock={selectedBusGpsSignalClock}
                  breakCountdownLabel={breakCountdownLabel}
                  selectedBusIsWaitingForDeparture={selectedBusIsWaitingForDeparture}
                  selectedBusScheduleLoading={selectedBusScheduleLoading}
                  selectedBusDisplayedStops={selectedBusDisplayedStops}
                  selectedStopId={selectedStopId}
                  selectedVehicleColor={selectedVehicleColor}
                  textSub={textSub}
                  textMain={textMain}
                  themeColor={themeColor}
                  openVehicleRouteStop={openVehicleRouteStop}
                  formatScheduleStopName={formatScheduleStopName}
                />
          )}
        </AnimatePresence>

              {/* New Stop Overlay on Map */}
              <AnimatePresence>
                {activeTab === 'map' && selectedStopId && !selectedBus && (
                  <MapStopSheet
                    key="stop-panel-map"
                    name={selectedExternalStop?.name || stopsList.find(s => s.id === selectedStopId)?.name || 'Przystanek'}
                    expanded={isStopPanelExpanded}
                    onExpandedChange={setIsStopPanelExpanded}
                    transparent={transparentUI}
                    dark={isDark}
                    loading={mapToday.isLoading && mapTomorrow.isLoading}
                    error={mapDepartureError}
                    departures={mapDepartures}
                  />
                )}
              </AnimatePresence>

            </div>
         {/* ============== NEW STOPS VIEW ============== */}
         <motion.div
            key="new-stops-panel"
            initial={false}
            animate={activeTab === 'stops' ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 14, scale: 0.985 }}
            transition={{duration: 0.5, ease: [0.25, 0.1, 0.25, 1]}}
            className={`absolute inset-0 z-10 overflow-hidden ${activeTab === 'stops' ? 'pointer-events-auto' : 'pointer-events-none'} ${
               transparentUI
                 ? 'pks-glass-frame'
                 : ''
            }`}
            data-panel-theme={isDark ? 'dark' : 'light'}
            aria-hidden={activeTab !== 'stops'}
         >
            {hasOpenedStops && <StopsPanel
               initialFavoritesOnly={initialFavoritesOnly}
               initialStop={widgetStop}
               active={activeTab === 'stops'}
               stops={stopsList}
               isLoading={stopsList.length === 0 && !stopsLoadError}
               hasError={stopsLoadError}
               favorites={favsState}
               vehicles={vehicles}
               transparentUI={transparentUI}
               isDarkTheme={isDark}
               onRetry={loadStops}
               onClose={() => { if (!isMapTabDisabled) setActiveTab('map'); }}
               onToggleFavorite={toggleFavoriteStop}
               onShowOnMap={(stop) => {
                  if (stop.type !== 'train' && !readBusCoordinates(stop.lat,stop.lon)) return;
                  mapStopReturnTab.current = 'stops';
                  if (isMapTabDisabled) return;
                  if (stop.lat !== undefined && stop.lon !== undefined) {
                     setMapCenter([stop.lat, stop.lon]);
                  }
                  setSelectedBus(null);
                  setSelectedExternalStop(stop);
                  setSelectedStopId(stop.id);
                  setIsStopPanelExpanded(false);
                  setActiveTab('map');
               }}
            />}
         </motion.div>

      </div>

         {/* Bottom Navigation for Mobile */}
      <div className={`pointer-events-none absolute bottom-0 left-0 right-0 z-[5000] ${activeTab === 'map' ? 'md:hidden' : ''}`}>
         <BottomNavigation order={interfaceAppearance.navOrder} activeTab={isSettingsOpen?'options':activeTab} className={bottomGlassShell} themeColor={themeColor} isMapTabDisabled={isMapTabDisabled} isStopsTabDisabled={isStopsTabDisabled} canOpenAdminEmbed={canOpenAdminEmbed}
            onMap={()=>{if(!isMapTabDisabled){setActiveTab('map');setSelectedBus(null);setSelectedStopId(null);setSelectedExternalStop(null);}}}
            onStops={()=>{if(!isStopsTabDisabled){setActiveTab('stops');setSelectedBus(null);}}}
            onAdmin={()=>{if(activeTab!=='admin')adminReturnTab.current=activeTab==='stops'?'stops':'map';setActiveTab('admin');setSelectedBus(null);setSelectedStopId(null);setSelectedExternalStop(null);setIsSettingsOpen(false);}}
            onOptions={openOptions}/>

      </div>

      {/* Settings Modal (Overlay) */}
      <AnimatePresence>
        {isSettingsOpen && (
          <OptionsSheet
            expanded={isOptionsExpanded}
            onExpandedChange={setIsOptionsExpanded}
            onClose={() => setIsSettingsOpen(false)}
            overlayClassName={`absolute inset-0 z-[6000] flex items-end justify-center backdrop-blur-sm px-2 pb-2 md:items-center md:p-6 ${optionsOverlay}`}
            className={`flex w-full max-w-2xl flex-col pointer-events-auto overflow-hidden rounded-[1.5rem] border px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-3xl md:max-w-[500px] md:p-5 ${optionsSheet}`}
          >
            <OptionsContent chrome={{mapGlassPanel,mapGlassInput,textSub,bottomGlassShell}} appearance={interfaceAppearance} saveAppearance={saveInterfaceAppearance} onOpenPersonalization={()=>setIsOptionsExpanded(true)} panelGlow={panelGlow} glowStrength={glowStrength} savePanelGlow={savePanelGlow} saveGlowStrength={saveGlowStrength} showMapStops={showMapStops} saveMapStops={saveMapStops} themeColor={themeColor} textSub={textSub} optionsCard={optionsCard} isDark={isDark} isWarm={isWarm} appTheme={appTheme} optionsButton={optionsButton} isOptionsExpanded={isOptionsExpanded} saveAppTheme={saveAppTheme} saveThemeColor={saveThemeColor} transparentUI={transparentUI} saveTransparentUI={saveTransparentUI} showInactive={showInactive} saveInactive={saveInactive} lightEffects={lightEffects} saveLightEffects={saveLightEffects}/>
          </OptionsSheet>
        )}
      </AnimatePresence>

    </div>
  );
}

