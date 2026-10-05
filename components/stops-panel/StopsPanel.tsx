'use client';
import { buildStopsCatalog } from '@/lib/stops-catalog';
import { loadStopDepartures } from '@/lib/stop-departures';


import { useCallback, useEffect, useMemo, useState } from 'react';
import StopList from '@/Panel/src/components/StopList';
import BusStopDetail from '@/Panel/src/components/BusStopDetail';
import type { Stop } from '@/Panel/src/types';
import { fetchPksTimetableClient, fetchMpkRzeszowStopsClient } from '@/lib/pks-client';
import pksLinesSnapshot from '@/public/data/pks-stop-lines.json';
import { limitTimetableRequest } from '@/lib/stop-timetable-store';


import { warsawDateIso } from '@/lib/transit-time';

import { StopsPanelProps, MarcelIndexedStop, StopsSearchState, MERGED_STOPS_RUNTIME_CACHE, stopCollectionSignature, ensureMpkCityPrefix, splitCsvValues, pksLinesForStop, getMarcelStopsIndex, sortedLines, selectedDateIso } from './stop-domain';

export default function StopsPanel({
  stops,
  isLoading,
  hasError,
  favorites,
  transparentUI,
  isDarkTheme,
  onRetry,
  onClose,
  onToggleFavorite,
  onShowOnMap,
}: StopsPanelProps) {
  const [catalogAttempt,setCatalogAttempt] = useState(0);
  const [catalogErrors,setCatalogErrors] = useState<Record<string,boolean>>({});
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [mpkStops, setMpkStops] = useState<Array<{ id: string; name: string; lat?: number; lon?: number; lines: string[] }>>([]);
  const [marcelStops, setMarcelStops] = useState<MarcelIndexedStop[]>([]);
  const [pksLinesByStopId, setPksLinesByStopId] = useState<Record<string, string[]>>(pksLinesSnapshot.lines);
  const [mergedStopsBase, setMergedStopsBase] = useState<Stop[]>([]);
  const [isPreparingStops, setIsPreparingStops] = useState(false);
  const [stopsSearchState, setStopsSearchState] = useState<StopsSearchState>({
    inputValue: '',
    fullInputValue: '',
    carrierFilter: 'all',
    visibleFullCount: 40,
  });
  const mergedStopsCacheKey = useMemo(
    () =>
      [
        stopCollectionSignature(stops),
        stopCollectionSignature(mpkStops),
        stopCollectionSignature(marcelStops),
      ].join('|'),
    [marcelStops, mpkStops, stops],
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const dateIso = selectedDateIso(0);
    const mapMpkStops = (data: Awaited<ReturnType<typeof fetchMpkRzeszowStopsClient>>) =>
      data
        .map((stop) => {
          const lat = Number.isFinite(Number(stop.stop_lat)) ? Number(stop.stop_lat) : undefined;
          const lon = Number.isFinite(Number(stop.stop_lon)) ? Number(stop.stop_lon) : undefined;
          return {
            id: String(stop.stop_id),
            name: ensureMpkCityPrefix(stop.stop_name || '', lat, lon),
            lat,
            lon,
            lines: sortedLines(String(stop.lines || '').split(',').map((line) => line.trim())),
          };
        })
        .filter((stop) => stop.id && stop.name);
    const mpkSignature = (items: typeof mpkStops) => stopCollectionSignature(items);

    const loadMpkStopsSnapshot = async () => {
      try {
        const cachedStops = await fetchMpkRzeszowStopsClient({ signal: controller.signal }).then(mapMpkStops);
        if (!active) return;
        setMpkStops((current) => (mpkSignature(current) === mpkSignature(cachedStops) ? current : cachedStops));
      } catch (error) {
        if ((error as { name?: string })?.name !== 'AbortError') {
          console.warn('[StopsPanel] MPK stops unavailable', error);
          if(active) setCatalogErrors(current=>({...current,MPK:true}));
        }
      }
    };

    const loadMarcelStopsSnapshot = async () => {
      try {
        const cachedStops = await getMarcelStopsIndex(dateIso);
        if (!active) return;
        setMarcelStops((current) => (stopCollectionSignature(current) === stopCollectionSignature(cachedStops) ? current : cachedStops));
      } catch (error) {
        console.warn('[StopsPanel] Marcel stops unavailable', error);
        if(active) setCatalogErrors(current=>({...current,Marcel:true}));
      }
    };

    loadMpkStopsSnapshot();
    loadMarcelStopsSnapshot();

    return () => {
      active = false;
      controller.abort();
    };
  }, [catalogAttempt]);

  const refreshVisibleLines = useCallback((visible: Stop[]) => {
    const points = visible.flatMap(stop => stop.pksStopPoints || []);
    const areas = [...new Set(points.map(point => point.areaId).filter((id): id is string => Boolean(id)))];
    areas.forEach(area => {
      void limitTimetableRequest(() => fetchPksTimetableClient(area, warsawDateIso())).then(data => {
        const next: Record<string,string[]> = {};
        for(const point of points.filter(point=>point.areaId===area)) {
          next[point.id] = sortedLines([
            ...((pksLinesSnapshot.lines as Record<string,string[]>)[point.id] || []),
            ...data.items.filter((item: any) => item.journeys?.some((journey: any)=>String(Number(journey.stop_point_code))===String(Number(point.code)))).map((item: any)=>String(item.line_name)),
          ]);
        }
        setPksLinesByStopId(current => Object.entries(next).every(([id,lines])=>JSON.stringify(current[id])===JSON.stringify(lines)) ? current : {...current,...next});
      }).catch(() => undefined); // The complete bundled index stays visible on refresh failure.
    });
  }, []);

  const buildMergedStopsBase = useCallback(()=>buildStopsCatalog(stops,mpkStops,marcelStops,mergedStopsCacheKey),[stops,mpkStops,marcelStops,mergedStopsCacheKey]);

  useEffect(() => {
    const cached = MERGED_STOPS_RUNTIME_CACHE.get(mergedStopsCacheKey);
    if (cached) {
      const timer = window.setTimeout(()=>{setMergedStopsBase(cached);setIsPreparingStops(false);},0);
      return ()=>window.clearTimeout(timer);
    }

    let cancelled = false;
    window.setTimeout(() => {
      if (!cancelled) setIsPreparingStops(true);
    }, 0);

    const applyMerge = () => {
      if (cancelled) return;
      const merged = buildMergedStopsBase();
      if (cancelled) return;
      setMergedStopsBase((current) => (stopCollectionSignature(current) === stopCollectionSignature(merged) ? current : merged));
      setIsPreparingStops(false);
    };

    let timeoutId: number | null = null;
    let idleId: number | null = null;
    if (typeof window !== 'undefined' && typeof (window as any).requestIdleCallback === 'function') {
      idleId = (window as any).requestIdleCallback(applyMerge, { timeout: 350 });
    } else {
      timeoutId = window.setTimeout(applyMerge, 0);
    }

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (idleId !== null && typeof (window as any).cancelIdleCallback === 'function') {
        (window as any).cancelIdleCallback(idleId);
      }
    };
  }, [buildMergedStopsBase, mergedStopsCacheKey]);

  const baseUiStops = useMemo<Stop[]>(() => {
    const mpkById = new Map(mpkStops.map(stop=>[stop.id,stop.lines]));
    return mergedStopsBase.map(stop=> {
      const lineProviders: Record<string,string[]> = {};
      const add = (line: string,provider: string) => { if(line) lineProviders[line] = [...new Set([...(lineProviders[line]||[]),provider])]; };
      const pksLines = pksLinesForStop(stop,pksLinesByStopId);
      pksLines.forEach(line=>add(line,'pks'));
      splitCsvValues(stop.providerStopIds?.mpk_rzeszow).forEach(id=>mpkById.get(id)?.forEach(line=>add(line,'mpk')));
      if(stop.sourceProviderIds?.includes('marcel')) add('M','marcel');
      return {...stop,lines:sortedLines(Object.keys(lineProviders)),lineProviders,providerStopIds:{...stop.providerStopIds,pksLines:pksLines.join(',')}};
    });
  }, [mergedStopsBase,pksLinesByStopId,mpkStops]);

  const uiStops = useMemo<Stop[]>(() => {
    if (!favorites.length) {
      return baseUiStops.every((stop) => !stop.isFavorite)
        ? baseUiStops
        : baseUiStops.map((stop) => (stop.isFavorite ? { ...stop, isFavorite: false } : stop));
    }
    const favoriteSet = new Set(favorites);
    return baseUiStops.map((stop) => {
      const isFavorite = favoriteSet.has(stop.id);
      return stop.isFavorite === isFavorite ? stop : { ...stop, isFavorite };
    });
  }, [baseUiStops, favorites]);

  const toggleFavorite = useCallback((stopId: string) => {
    onToggleFavorite(stopId);
    setSelectedStop((current) => (current?.id === stopId ? { ...current, isFavorite: !current.isFavorite } : current));
  }, [onToggleFavorite]);

  const handleSelectStop = useCallback((stop: Stop) => {
    setSelectedStop(stop);
  }, []);

  const currentSelectedStop = useMemo(() => {
    if (!selectedStop) return null;
    const latest = uiStops.find((stop) => stop.id === selectedStop.id);
    return latest || selectedStop;
  }, [selectedStop, uiStops]);

  if (hasError) {
    return (
      <div className={`flex h-full w-full items-center justify-center px-6 text-center backdrop-blur-2xl ${
        isDarkTheme ? 'bg-[#07111d]/70 text-slate-300' : 'bg-white/80 text-slate-700'
      }`}>
        <div className="flex max-w-sm flex-col items-center gap-4">
          <p className={`text-sm ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>Nie udalo sie pobrac przystankow.</p>
          <button
            type="button"
            onClick={onRetry}
            className={`rounded-2xl border px-5 py-3 text-xs font-black uppercase tracking-wider transition-colors ${
              isDarkTheme
                ? 'border-teal-400/30 bg-teal-400/10 text-teal-300 hover:bg-teal-400/20'
                : 'border-teal-500/35 bg-teal-500/10 text-teal-700 hover:bg-teal-500/15'
            }`}
          >
            Sprobuj ponownie
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        transparentUI
          ? `absolute inset-0 z-10 overflow-hidden backdrop-blur-2xl backdrop-saturate-150 ${
              isDarkTheme ? 'bg-slate-950/88' : 'bg-white/92'
            }`
          : `absolute inset-0 z-10 overflow-hidden ${isDarkTheme ? 'bg-[#03060a]' : 'bg-slate-50'}`
      }
    >
      {Object.keys(catalogErrors).length>0 && <div role="status" className="absolute bottom-3 left-3 right-3 z-50 rounded-xl border border-amber-500/30 bg-slate-900 p-3 text-sm text-amber-200">
        {Object.keys(catalogErrors).join(', ')}: nie udało się pobrać pełnej listy przystanków.
        <button onClick={()=>{setCatalogErrors({});setCatalogAttempt(value=>value+1);}} className="ml-3 underline">Ponów</button>
      </div>}
      <div className="h-full w-full">
        {currentSelectedStop ? (
          <BusStopDetail
            stop={currentSelectedStop}
            onBack={() => setSelectedStop(null)}
            toggleFavorite={toggleFavorite}
            loadDepartures={loadStopDepartures}
            onShowOnMap={onShowOnMap}
            isDarkTheme={isDarkTheme}
          />
        ) : (
          <StopList
            stops={uiStops}
            onVisibleStopsChange={refreshVisibleLines}
            isLoading={isLoading || isPreparingStops}
            onStopSelect={handleSelectStop}
            onClose={onClose}
            toggleFavorite={toggleFavorite}
            isFullScreen
            isDarkTheme={isDarkTheme}
            searchState={stopsSearchState}
            onSearchStateChange={(patch) => setStopsSearchState((current) => ({ ...current, ...patch }))}
          />
        )}
      </div>
    </div>
  );
}
