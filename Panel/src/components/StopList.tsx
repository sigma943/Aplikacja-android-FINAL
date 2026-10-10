import {displayStopLabel} from '@/lib/stop-label';
import {useAppBack} from '../../../lib/use-app-back';
import React, { useEffect, useDeferredValue, useMemo, useState, useLayoutEffect, useRef } from 'react';
import { Search, X, Bus, Train, Star, ChevronDown, MapPin } from 'lucide-react';
import { Stop } from '../types';
import { getLineStyle } from '../utils/lineStyles';
import { motion, useReducedMotion } from 'motion/react';
import VirtualStopCards from './VirtualStopCards';

interface StopListProps {
  initialFavoritesOnly?:boolean;
  notice?: React.ReactNode;
  backEnabled?: boolean;
  onVisibleStopsChange?: (stops: Stop[]) => void;
  onStopSelect: (stop: Stop) => void;
  onClose?: () => void;
  toggleFavorite: (stopId: string) => void;
  stops: Stop[];
  isFullScreen?: boolean;
  isLoading?: boolean;
  isDarkTheme?: boolean;
  searchState?: {
    favoritesOnly?:boolean;
    isFullListOpen?: boolean;
    previewScrollTop?: number;
    fullScrollTop?: number;
    inputValue: string;
    fullInputValue: string;
    carrierFilter: CarrierFilterId;
    visibleFullCount: number;
  };
  onSearchStateChange?: (state: {
    favoritesOnly?:boolean;
    isFullListOpen?: boolean;
    previewScrollTop?: number;
    fullScrollTop?: number;
    inputValue?: string;
    fullInputValue?: string;
    carrierFilter?: CarrierFilterId;
    visibleFullCount?: number;
  }) => void;
}

const ENABLE_TRAINS = false;
type CarrierFilterId = 'all' | 'pks' | 'mpk' | 'marcel';

const CARRIER_FILTERS: Array<{ id: CarrierFilterId; label: string; dotClass: string }> = [
  { id: 'all', label: 'Wszystkie', dotClass: 'bg-teal-400' },
  { id: 'pks', label: 'PKS Rzeszów', dotClass: 'bg-teal-400' },
  { id: 'mpk', label: 'MPK Rzeszów', dotClass: 'bg-orange-500' },
  { id: 'marcel', label: 'Marcel', dotClass: 'bg-lime-400' },
];

type SearchableStop = {
  stop: Stop;
  normalizedName: string;
  carrierIds: Set<string>;
};

function normalizeSearchText(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase().replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function filterStops(stops: SearchableStop[], query: string, carrierFilter: CarrierFilterId) {
  const normalizedQuery = normalizeSearchText(query);
  return stops
    .filter((entry) => {
      if (!ENABLE_TRAINS && entry.stop.type !== 'bus') return false;
      if (carrierFilter !== 'all' && !entry.carrierIds.has(carrierFilter)) return false;
      if (!normalizedQuery) return true;
      return entry.normalizedName.includes(normalizedQuery);
    })
    .map((entry) => entry.stop);
}

function StopLineBadges({lines,providerId,pksLineSet,providers}:{lines:string[];providerId?:string;pksLineSet:Set<string>;providers?:Record<string,string[]>}) {
  const row=useRef<HTMLDivElement>(null);
  const [visibleCount,setVisibleCount]=useState(Math.min(lines.length,5));
  const lineKey=lines.join(',');
  useLayoutEffect(()=>{
    const element=row.current;
    if(!element)return;
    let width=-1;
    const observer=new ResizeObserver(()=>{
      if(element.clientWidth!==width){width=element.clientWidth;setVisibleCount(Math.min(lines.length,5));}
    });
    observer.observe(element);
    setVisibleCount(Math.min(lines.length,5));
    return ()=>observer.disconnect();
  },[lineKey,lines.length]);
  useLayoutEffect(()=>{
    const element=row.current;
    if(element&&element.scrollWidth>element.clientWidth+1&&visibleCount>1)setVisibleCount(visibleCount-1);
  },[visibleCount,lineKey]);
  const visible=lines.slice(0,visibleCount),remaining=lines.length-visible.length;
  return <div ref={row} data-stop-line-badges data-line-total={lines.length} className="mt-1 flex min-w-0 max-w-full flex-nowrap items-center gap-1 overflow-hidden">
    {visible.map(line=><span key={line} className={`max-w-[5.5rem] shrink-0 truncate rounded-md border px-2 py-0.5 text-[10px] font-bold ${getLineStyle(line,providers?.[line]?.[0]||(pksLineSet.has(line)?'pks':providerId))}`}>{line}</span>)}
    {remaining>0&&<span data-stop-line-overflow className="shrink-0 rounded border border-slate-500/20 bg-slate-500/10 px-2 py-0.5 text-[10px] font-black text-slate-300">+{remaining}</span>}
  </div>;
}

export default function StopList({
  notice,
  backEnabled = true,
  onStopSelect,
  onVisibleStopsChange,
  onClose,
  toggleFavorite,
  stops,
  isFullScreen = false,
  isLoading = false,
  isDarkTheme = true,
  searchState,
  initialFavoritesOnly=false,
  onSearchStateChange,
}: StopListProps) {
  const favoritesOnly=searchState?.favoritesOnly??initialFavoritesOnly;
  const [localInputValue, setLocalInputValue] = useState('');
  const reduceMotion = useReducedMotion();
  const [localFullListOpen, setLocalFullListOpen] = useState(false);
  const isFullListOpen = searchState?.isFullListOpen ?? localFullListOpen;
  const setIsFullListOpen = (value: boolean) => {setLocalFullListOpen(value);onSearchStateChange?.({isFullListOpen:value});};
  useAppBack(backEnabled && isFullListOpen, () => {handleCloseFullList();return true;},40);
  const listScrollRef = React.useRef<HTMLDivElement>(null);
  const previewScrollRef = React.useRef(searchState?.previewScrollTop || 0);
  useEffect(() => { if (listScrollRef.current) listScrollRef.current.scrollTop = isFullListOpen ? (searchState?.fullScrollTop || 0) : previewScrollRef.current; }, [isFullListOpen]);
  const [localFullInputValue, setLocalFullInputValue] = useState('');
  const [localCarrierFilter, setLocalCarrierFilter] = useState<CarrierFilterId>('all');
  const [localVisibleFullCount, setLocalVisibleFullCount] = useState(40);
  const inputValue = searchState?.inputValue ?? localInputValue;
  const fullInputValue = searchState?.fullInputValue ?? localFullInputValue;
  const carrierFilter = searchState?.carrierFilter ?? localCarrierFilter;
  const visibleFullCount = searchState?.visibleFullCount ?? localVisibleFullCount;
  const setInputValue = (value: string) => {
    setLocalInputValue(value);
    onSearchStateChange?.({ inputValue: value });
  };
  const setFullInputValue = (value: string) => {
    setLocalFullInputValue(value);
    onSearchStateChange?.({ fullInputValue: value });
  };
  const setCarrierFilterValue = (value: CarrierFilterId) => {
    setLocalCarrierFilter(value);
    onSearchStateChange?.({ carrierFilter: value });
  };
  const setVisibleFullCountValue = (value: number | ((current: number) => number)) => {
    const next = typeof value === 'function' ? value(visibleFullCount) : value;
    setLocalVisibleFullCount(next);
    onSearchStateChange?.({ visibleFullCount: next });
  };
  const deferredInputValue = useDeferredValue(inputValue);
  const deferredFullInputValue = useDeferredValue(fullInputValue);
  const sortedStops = useMemo(() => {
    const favorites: Stop[] = [];
    const others: Stop[] = [];
    stops.forEach((stop) => {
      if (!ENABLE_TRAINS && stop.type !== 'bus') return;
      if (stop.isFavorite) favorites.push(stop);
      else others.push(stop);
    });
    return [...favorites, ...others];
  }, [stops]);
  const searchableStops = useMemo<SearchableStop[]>(
    () =>
      sortedStops.map((stop) => ({
        stop,
        normalizedName: normalizeSearchText(stop.name),
        carrierIds: new Set([
          ...stop.carriers.map((carrier) => carrier.id),
          ...((stop.sourceProviderIds || []).map((provider) => (provider === 'mpk_rzeszow' ? 'mpk' : provider))),
        ]),
      })),
    [sortedStops],
  );

  const filteredStops = useMemo(
    () => filterStops(searchableStops, deferredInputValue, carrierFilter).filter(stop=>!favoritesOnly||stop.isFavorite),
    [searchableStops, deferredInputValue, carrierFilter,favoritesOnly],
  );
  const fullFilteredStops = useMemo(
    () => (isFullListOpen ? filterStops(searchableStops, deferredFullInputValue, carrierFilter).filter(stop=>!favoritesOnly||stop.isFavorite) : []),
    [isFullListOpen, searchableStops, deferredFullInputValue, carrierFilter,favoritesOnly],
  );
  const displayStops = useMemo(() => filteredStops.slice(0, 30), [filteredStops]);
  const slicedFullStops = useMemo(() => fullFilteredStops.slice(0, visibleFullCount), [fullFilteredStops, visibleFullCount]);
  const visibleStops = isFullListOpen ? slicedFullStops : displayStops;
  const visibleKey = visibleStops.map(stop=>stop.id).join('|');
  const visibleRef = React.useRef(visibleStops);
  visibleRef.current = visibleStops;
  useEffect(() => { if(!isFullListOpen)onVisibleStopsChange?.(visibleRef.current); }, [visibleKey,onVisibleStopsChange,isFullListOpen]);
  const shellClass = isDarkTheme ? 'text-slate-200' : 'text-slate-800';
  const headerClass = 'transit-surface';
  const searchInputClass = isDarkTheme
    ? 'border-white/12 bg-[#0e1622]/34 text-white shadow-black/18 placeholder:text-slate-400/75 '
    : 'border-slate-300/90 bg-white/90 text-slate-900 placeholder:text-slate-500 ';
  const searchIconClass = isDarkTheme ? 'text-slate-500' : 'text-slate-400';
  const inactiveCarrierClass = isDarkTheme
    ? 'border-white/8 bg-white/[0.03] text-slate-400 hover:border-white/16 hover:bg-white/[0.06] hover:text-white'
    : 'border-slate-300/80 bg-white/88 text-slate-600 hover:border-slate-400/80 hover:bg-white hover:text-slate-900';
  const cardClass = 'transit-card transit-stop-card';
  const cardTitleClass = isDarkTheme ? 'text-white' : 'text-slate-900';
  const secondaryTextClass = isDarkTheme ? 'text-slate-400' : 'text-slate-600';

  const rememberScroll = () => {
    const top = listScrollRef.current?.scrollTop || 0;
    onSearchStateChange?.(isFullListOpen ? {fullScrollTop: top} : {previewScrollTop: top});
  };
  const handleCloseFullList = () => {
    setFullInputValue('');
    setVisibleFullCountValue(40);
    setIsFullListOpen(false);
  };

  const renderCarrierFilters = (compact = false) => (
    <div className={`flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1 no-scrollbar ${compact ? 'mt-3' : 'mt-4'}`}>
      {CARRIER_FILTERS.map((filter) => {
        const isActive = carrierFilter === filter.id;
        return (
          <button
            type="button"
            aria-pressed={isActive}
            key={filter.id}
            onClick={() => {
              setCarrierFilterValue(filter.id);
              setVisibleFullCountValue(40);
            }}
            className={`flex shrink-0 items-center gap-2 min-h-10 rounded-xl border px-3 py-2 text-[11px] font-semibold transition-colors ui-accent-focus ${
              isActive
                ? 'ui-accent-soft'
                : inactiveCarrierClass
            }`}
          >
            {filter.id !== 'all' && <span className={`h-2 w-2 rounded-full ${filter.dotClass}`} />}
            {filter.label}
          </button>
        );
      })}
    </div>
  );

  const renderStopCard = (stop: Stop, index: number, full = false) => {
    const isBus = stop.type === 'bus';
    const singleProviderId = stop.carriers.length === 1 ? stop.carriers[0].id : undefined;
    const pksLineSet = new Set(String(stop.providerStopIds?.pksLines || '').split(',').map((line) => line.trim()).filter(Boolean));
    return (
      <motion.div
        key={`${full ? 'full' : 'list'}-${stop.id}`}
        layout={full ? false : 'position'}
        data-stop-card-id={stop.id}
        transition={{layout: reduceMotion ? {duration: 0} : {type: 'spring', stiffness: 230, damping: 30}}}
        role="button"
        tabIndex={0}
        aria-label={`Rozkład: ${displayStopLabel(stop.name)}`}
        onKeyDown={event => {
          if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
          event.preventDefault();
          rememberScroll();
          onStopSelect(stop);
        }}
        className={`ui-accent-focus group flex w-full max-w-full min-w-0 shrink-0 cursor-pointer items-center border transition-colors duration-150 ${cardClass} ${
          full ? 'rounded-[20px] p-3.5' : 'rounded-[20px] p-3.5 lg:p-4'
        }`}
        onClick={() => {
          rememberScroll();
          onStopSelect(stop);
        }}
      >
        <div
          className={`mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors duration-150 ${
            isBus
              ? 'ui-accent-soft'
              : 'border-blue-500/10 bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 group-hover:text-blue-300'
          }`}
        >
          {isBus ? <Bus size={20} strokeWidth={2.2} /> : <Train size={20} strokeWidth={2.2} />}
        </div>

        <div className="min-w-0 flex-1 pr-2">
          <h3 className={`truncate text-[15px] font-semibold transition-colors lg:text-[17px] ${cardTitleClass}`}>
            {displayStopLabel(stop.name)}
          </h3>
          <div className="mt-1 flex flex-col gap-1">
            <div className={`flex min-w-0 flex-wrap items-center text-[12px] font-semibold ${secondaryTextClass}`}>
              <span className={`min-w-0 truncate ${isBus ? secondaryTextClass : 'text-blue-400/90'}`}>
                {isBus ? (stop.carriers.map(c => c.name.replace('Rzeszow', 'Rzeszów')).join(' · ') || 'Przystanek autobusowy') : 'Stacja kolejowa'}
              </span>
            </div>
            {isBus && stop.lines.length > 0 && <StopLineBadges lines={stop.lines} providerId={singleProviderId} pksLineSet={pksLineSet} providers={stop.lineProviders} />}
          </div>
        </div>

        <motion.button
          type="button"
          whileTap={reduceMotion ? undefined : {scale: 0.85}}
          onClick={(event) => {
            event.stopPropagation();
            toggleFavorite(stop.id);
          }}
          className={`shrink-0 cursor-pointer rounded-xl p-2.5 transition-all duration-200 ${
            isDarkTheme ? 'text-slate-500 hover:bg-white/5 hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-800'
          }`}
          aria-label={stop.isFavorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
        >
          <motion.span className="block" animate={reduceMotion ? undefined : {scale: stop.isFavorite ? [1, 1.3, 1] : 1, rotate: stop.isFavorite ? [0, -12, 8, 0] : 0}} transition={{duration: 0.35}}>
            <Star
              size={full ? 18 : 20}
              className={
                stop.isFavorite
                  ? 'ui-accent-fill'
                  : 'text-slate-500 group-hover:text-slate-400'
              }
            />
          </motion.span>
        </motion.button>
      </motion.div>
    );
  };

  return (
    <motion.div key={isFullListOpen ? "full" : "preview"} initial={reduceMotion ? false : {opacity: 0, y: isFullListOpen ? 18 : -10}} animate={{opacity: 1, y: 0}} transition={{duration: reduceMotion ? 0 : 0.52, ease: [0.25, 0.1, 0.25, 1]}} data-stop-list-mode={isFullListOpen ? "full" : "preview"} data-ui-mode={isDarkTheme ? "dark" : "light"} className={`transit-view relative flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-x-hidden ${shellClass}`}>
      {!isFullListOpen && <>
      <div className={`relative z-10 mx-3 mt-3 min-w-0 shrink-0 overflow-x-hidden rounded-[24px] border px-3.5 pb-3 pt-3.5 backdrop-blur-2xl backdrop-saturate-150 lg:mx-6 lg:px-5 lg:pt-5 ${headerClass}`}>
        <div className="mb-3.5 flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="ui-accent-soft flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border"><MapPin size={20} /></span>
            <div className="min-w-0">
              <h1 className={`font-semibold tracking-tight ${isFullScreen ? 'text-xl lg:text-2xl' : 'text-lg'} ${cardTitleClass}`}>Przystanki</h1>
              <p className={`mt-0.5 text-[11px] ${secondaryTextClass}`}>Rozkłady i odjazdy na żywo</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className={`hidden rounded-full p-2 transition-all lg:flex ${isDarkTheme ? 'text-slate-400 hover:bg-white/5 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>
            <X size={20} />
          </button>
        </div>

        <div className="ui-accent-search group relative">
          <Search className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${searchIconClass}`} size={18} />
          <input
            type="text"
            placeholder="Wpisz nazwę, np. Babica, Rejtana..."
            className={`ui-accent-input w-full rounded-2xl border py-3 pl-11 pr-4 text-[14px] font-medium shadow-lg outline-none backdrop-blur-2xl transition-all focus:ring-2 lg:py-3.5 lg:text-[15px] ${searchInputClass}`}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
          />
          {inputValue && (
            <button
              type="button"
              onClick={() => setInputValue('')}
              className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 transition-colors ${
                isDarkTheme ? 'text-slate-400 hover:bg-white/10 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
              aria-label="Wyczysc wyszukiwanie"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {renderCarrierFilters()}
      </div>

      <motion.div
        layoutScroll
        data-stop-list-scroll
        ref={listScrollRef}
        style={{overflowAnchor: 'none'}}
        className={`min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+9.5rem)] pt-3 custom-scrollbar lg:px-6 ${
          isFullScreen
            ? 'grid w-full max-w-[1540px] content-start gap-2.5 px-3 pt-3 md:grid-cols-2 lg:mx-auto lg:gap-3 lg:px-6 lg:pt-4 xl:grid-cols-3'
            : 'flex w-full flex-col gap-2.5'
        }`}
      >
        {notice}
        {isLoading ? (
          Array.from({ length: isFullScreen ? 6 : 4 }).map((_, index) => (
            <div key={`stop-skeleton-${index}`} className={`flex h-[89px] items-center rounded-[22px] border p-4 ${isDarkTheme ? 'border-white/[0.03] bg-[#0d1622]/30' : 'border-slate-200 bg-white/85'}`}>
              <div className={`mr-4 h-11 w-11 shrink-0 rounded-xl ${isDarkTheme ? 'bg-white/5' : 'bg-slate-100'}`} />
              <div className="min-w-0 flex-1 space-y-2 py-1 pr-2">
                <div className={`h-4 w-3/4 rounded-md ${isDarkTheme ? 'bg-white/10' : 'bg-slate-200'}`} />
                <div className={`h-3 w-1/2 rounded-md ${isDarkTheme ? 'bg-white/5' : 'bg-slate-100'}`} />
              </div>
              <div className={`h-9 w-9 shrink-0 rounded-xl ${isDarkTheme ? 'bg-white/5' : 'bg-slate-100'}`} />
            </div>
          ))
        ) : (
          <>
            {displayStops.map((stop, index) => renderStopCard(stop, index))}

            {filteredStops.length > 30 && (
              <div className="col-span-full mb-8 mt-6 flex w-full justify-center">
                <button
                  type="button"
                  onClick={() => {
                    previewScrollRef.current = listScrollRef.current?.scrollTop || 0;
                    onSearchStateChange?.({previewScrollTop: previewScrollRef.current, fullScrollTop: 0});
                    setFullInputValue(inputValue);
                    setVisibleFullCountValue(40);
                    setIsFullListOpen(true);
                  }}
                  className="cursor-pointer rounded-2xl border ui-accent-soft px-6 py-3.5 text-xs font-extrabold uppercase tracking-wider ui-accent-text transition-colors "
                >
                  Pokaż wszystkie ({filteredStops.length})
                </button>
              </div>
            )}

            {filteredStops.length === 0 && (
              <div className={`mt-16 px-4 text-center text-[15px] text-slate-500 ${isFullScreen ? 'col-span-full' : ''}`}>
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/5 bg-slate-900 text-slate-600">
                  <Search size={20} />
                </div>
                {favoritesOnly?'Brak ulubionych przystanków pasujących do filtrów.':'Brak wyników dla podanej nazwy.'}
              </div>
            )}
          </>
        )}
      </motion.div>
      </>}

      {isFullListOpen && (
        <div
          data-full-stop-list
          className={`flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden backdrop-blur-2xl backdrop-saturate-150 ${
            isDarkTheme ? 'bg-[#050b12]/96' : 'bg-white/96'
          }`}
        >
          <div className={`flex min-w-0 shrink-0 items-center justify-between border-b px-4 pb-4 pt-6 backdrop-blur-xl lg:px-6 ${isDarkTheme ? 'border-white/[0.06] bg-[#0d1622]/96' : 'border-slate-200/85 bg-white/98'}`}>
            <div className="min-w-0 pr-3">
              <h2 className={`text-lg font-black lg:text-xl ${isDarkTheme ? 'text-white' : 'text-slate-900'}` }>Pełna Lista Przystanków</h2>
              <p className={`mt-0.5 text-xs ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}` }>Wszystkie pasujące punkty komunikacyjne ({fullFilteredStops.length})</p>
            </div>
            <button
              type="button"
              onClick={handleCloseFullList}
              aria-label="Zamknij pełną listę przystanków"
              className={`cursor-pointer rounded-full p-2.5 transition-all ${
                isDarkTheme ? 'text-slate-400 hover:bg-white/5 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <X size={20} />
            </button>
          </div>

          <div className={`shrink-0 border-b px-4 py-4 backdrop-blur-xl lg:px-6 ${isDarkTheme ? 'border-white/[0.03] bg-[#08111c]/96' : 'border-slate-200/85 bg-white/96'}`}>
            <div className="ui-accent-search group relative">
              <Search className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${searchIconClass}`} size={18} />
              <input
                type="text"
                placeholder="Wpisz nazwę, np. Babica, Rejtana..."
                className={`ui-accent-input w-full rounded-2xl border py-3 pl-11 pr-4 text-[14px] font-medium shadow-lg outline-none transition-all focus:ring-2 ${
                  isDarkTheme
                    ? 'border-white/10 bg-[#0e1622]/90 text-white placeholder:text-slate-500 '
                    : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-500 '
                }`}
                value={fullInputValue}
                onChange={(event) => {
                  setFullInputValue(event.target.value);
                  setVisibleFullCountValue(40);
                }}
              />
              {fullInputValue && (
                <button
                  type="button"
                  onClick={() => {
                    setFullInputValue('');
                    setVisibleFullCountValue(40);
                  }}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 transition-colors ${
                    isDarkTheme ? 'text-slate-400 hover:bg-white/10 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                  aria-label="Wyczysc wyszukiwanie"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {renderCarrierFilters(true)}
          </div>

          <motion.div ref={listScrollRef} data-stop-list-scroll layoutScroll style={{overflowAnchor: 'none'}} className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+9.5rem)] py-4 custom-scrollbar lg:px-6">
            <VirtualStopCards stops={slicedFullStops} scroll={listScrollRef} render={(stop,index)=>renderStopCard(stop,index,true)} onVisible={onVisibleStopsChange}/>

            {fullFilteredStops.length > visibleFullCount && (
              <div className="mb-6 mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleFullCountValue((count) => count + 40)}
                  className="group flex w-full min-w-0 cursor-pointer items-center justify-center gap-2 rounded-2xl border ui-accent-soft px-6 py-3.5 text-center text-xs font-black uppercase tracking-wider ui-accent-text transition-colors "
                >
                  <span>Pokaż więcej (+{fullFilteredStops.length - visibleFullCount} pozostałych)</span>
                  <ChevronDown size={14} className="ui-accent-text transition-transform group-hover:translate-y-0.5" />
                </button>
              </div>
            )}

            {fullFilteredStops.length === 0 && (
              <div className="mt-16 px-4 text-center text-[15px] text-slate-500">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/5 bg-slate-900 text-slate-600">
                  <Search size={20} />
                </div>
                {favoritesOnly?'Brak ulubionych przystanków pasujących do filtrów.':'Brak pasujących przystanków dla tej nazwy.'}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
