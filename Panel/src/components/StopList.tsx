import React, { useMemo, useState } from 'react';
import { Search, X, Bus, Train, Star, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Stop } from '../types';
import { getLineStyle } from '../utils/lineStyles';

interface StopListProps {
  onStopSelect: (stop: Stop) => void;
  onClose?: () => void;
  toggleFavorite: (stopId: string) => void;
  stops: Stop[];
  isFullScreen?: boolean;
  isLoading?: boolean;
}

const ENABLE_TRAINS = false;

function filterAndSortStops(stops: Stop[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  return stops
    .filter((stop) => {
      if (!ENABLE_TRAINS && stop.type !== 'bus') return false;
      if (!normalizedQuery) return true;
      return stop.name.toLowerCase().includes(normalizedQuery);
    })
    .sort((left, right) => {
      if (left.isFavorite !== right.isFavorite) return left.isFavorite ? -1 : 1;
      return left.name.localeCompare(right.name, 'pl');
    });
}

export default function StopList({
  onStopSelect,
  onClose,
  toggleFavorite,
  stops,
  isFullScreen = false,
  isLoading = false,
}: StopListProps) {
  const [inputValue, setInputValue] = useState('');
  const [isFullListOpen, setIsFullListOpen] = useState(false);
  const [fullInputValue, setFullInputValue] = useState('');
  const [visibleFullCount, setVisibleFullCount] = useState(40);

  const filteredStops = useMemo(() => filterAndSortStops(stops, inputValue), [stops, inputValue]);
  const fullFilteredStops = useMemo(() => filterAndSortStops(stops, fullInputValue), [stops, fullInputValue]);
  const displayStops = useMemo(() => filteredStops.slice(0, 30), [filteredStops]);
  const slicedFullStops = useMemo(() => fullFilteredStops.slice(0, visibleFullCount), [fullFilteredStops, visibleFullCount]);

  const handleCloseFullList = () => {
    setFullInputValue('');
    setVisibleFullCount(40);
    setIsFullListOpen(false);
  };

  const renderLineBadges = (lines: string[], expanded = false) => {
    const visibleCount = expanded ? lines.length : Math.min(lines.length, 5);
    const visible = lines.slice(0, visibleCount);
    const remaining = lines.length - visible.length;

    return (
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
        {visible.map((line) => (
          <span key={line} className={`rounded border px-2 py-0.5 text-[10px] font-bold ${getLineStyle(line)}`}>
            {line}
          </span>
        ))}
        {remaining > 0 && (
          <span className="rounded border border-slate-500/20 bg-slate-500/10 px-2 py-0.5 text-[10px] font-black text-slate-300">
            +{remaining}
          </span>
        )}
      </div>
    );
  };

  const renderStopCard = (stop: Stop, index: number, full = false) => {
    const isBus = stop.type === 'bus';
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.8, delay: Math.min(index * 0.012, 0.12) }}
        key={`${full ? 'full' : 'list'}-${stop.id}`}
        className={`group flex cursor-pointer items-center border border-white/[0.08] bg-[#0d1622]/34 shadow-[0_18px_45px_rgba(0,0,0,0.14)] backdrop-blur-2xl transition-colors duration-200 hover:border-teal-400/35 hover:bg-[#142238]/48 hover:shadow-[0_20px_45px_-10px_rgba(20,184,166,0.14)] active:scale-[0.99] ${
          full ? 'rounded-[22px] p-4' : 'rounded-[24px] p-4 lg:p-5'
        }`}
        onClick={() => {
          if (full) handleCloseFullList();
          onStopSelect(stop);
        }}
      >
        <div
          className={`mr-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all duration-300 ${
            isBus
              ? 'border-teal-500/10 bg-teal-500/10 text-teal-400 group-hover:bg-teal-500/20 group-hover:text-teal-300'
              : 'border-blue-500/10 bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 group-hover:text-blue-300'
          }`}
        >
          {isBus ? <Bus size={20} strokeWidth={2.2} /> : <Train size={20} strokeWidth={2.2} />}
        </div>

        <div className="min-w-0 flex-1 pr-2">
          <h3 className="truncate text-[16px] font-bold text-white drop-shadow-sm transition-colors group-hover:text-teal-200 lg:text-[17px]">
            {stop.name}
          </h3>
          <div className="mt-1 flex flex-col gap-1">
            <div className="flex flex-wrap items-center text-[12px] font-semibold text-slate-400">
              <span className={isBus ? 'text-teal-400/90' : 'text-blue-400/90'}>
                {isBus ? 'Przystanek autobusowy' : 'Stacja kolejowa'}
              </span>
            </div>
            {isBus && stop.lines.length > 0 && renderLineBadges(stop.lines, full)}
          </div>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toggleFavorite(stop.id);
          }}
          className="shrink-0 cursor-pointer rounded-xl p-2.5 text-slate-500 transition-all duration-200 hover:bg-white/5 hover:text-white"
          aria-label={stop.isFavorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
        >
          <motion.span
            layout
            animate={{ scale: stop.isFavorite ? 1.14 : 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 24 }}
            className="block"
          >
            <Star
              size={full ? 18 : 20}
              className={
                stop.isFavorite
                  ? 'fill-[#f59e0b] text-[#f59e0b] drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]'
                  : 'text-slate-500 group-hover:text-slate-400'
              }
            />
          </motion.span>
        </button>
      </motion.div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-transparent text-slate-200">
      <div className="sticky top-0 z-10 w-full border-b border-white/[0.08] bg-[#07111d]/30 px-4 pb-4 pt-6 shadow-[0_18px_60px_rgba(0,0,0,0.16)] backdrop-blur-2xl backdrop-saturate-150 lg:px-10 lg:pt-8">
        <div className="mb-5 flex items-center justify-between pl-1">
          <div>
            <h1 className={`bg-gradient-to-r from-teal-400 via-cyan-300 to-blue-500 bg-clip-text font-black tracking-tight text-transparent ${isFullScreen ? 'text-2xl lg:text-3.5xl' : 'text-xl'}`}>
              Rozkład Jazdy
            </h1>
            <p className="mt-1 text-xs font-medium text-slate-400">Znajdź najbliższe przystanki autobusowe</p>
          </div>
          <button type="button" onClick={onClose} className="hidden rounded-full p-2 text-slate-400 transition-all hover:bg-white/5 hover:text-white lg:flex">
            <X size={20} />
          </button>
        </div>

        <div className="group relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-teal-400" size={18} />
          <input
            type="text"
            placeholder="Wpisz nazwę, np. Babica, Rejtana..."
            className="w-full rounded-2xl border border-white/12 bg-[#0e1622]/34 py-3 pl-11 pr-4 text-[14px] font-medium text-white shadow-lg shadow-black/18 outline-none backdrop-blur-2xl transition-all placeholder:text-slate-400/75 focus:border-teal-500/40 focus:ring-2 focus:ring-teal-500/20 lg:py-3.5 lg:text-[15px]"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
          />
        </div>
      </div>

      <div
        className={`flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+9.5rem)] pt-4 custom-scrollbar lg:px-6 ${
          isFullScreen
            ? 'grid w-full max-w-[1540px] content-start gap-4 px-4 pt-5 md:grid-cols-2 lg:mx-auto lg:gap-6 lg:px-4 lg:pt-10 xl:grid-cols-3'
            : 'flex w-full flex-col gap-3'
        }`}
      >
        {isLoading ? (
          Array.from({ length: isFullScreen ? 6 : 4 }).map((_, index) => (
            <div key={`stop-skeleton-${index}`} className="flex h-[89px] items-center rounded-[22px] border border-white/[0.03] bg-[#0d1622]/30 p-4">
              <div className="mr-4 h-11 w-11 shrink-0 rounded-xl bg-white/5" />
              <div className="min-w-0 flex-1 space-y-2 py-1 pr-2">
                <div className="h-4 w-3/4 rounded-md bg-white/10" />
                <div className="h-3 w-1/2 rounded-md bg-white/5" />
              </div>
              <div className="h-9 w-9 shrink-0 rounded-xl bg-white/5" />
            </div>
          ))
        ) : (
          <>
            <AnimatePresence mode="popLayout">
              {displayStops.map((stop, index) => renderStopCard(stop, index))}
            </AnimatePresence>

            {filteredStops.length > 30 && (
              <div className="col-span-full mb-8 mt-6 flex w-full justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setFullInputValue(inputValue);
                    setVisibleFullCount(40);
                    setIsFullListOpen(true);
                  }}
                  className="cursor-pointer rounded-2xl border border-teal-500/20 bg-teal-500/10 px-6 py-3.5 text-xs font-extrabold uppercase tracking-wider text-teal-300 transition-all hover:bg-teal-500/20 hover:text-white active:scale-95"
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
                Brak wyników dla podanej nazwy.
              </div>
            )}
          </>
        )}
      </div>

      {isFullListOpen && (
        <div className="absolute inset-0 z-50 flex flex-col bg-[#080d14]">
          <div className="flex shrink-0 items-center justify-between border-b border-white/[0.04] bg-[#0d1622]/90 px-4 pb-4 pt-6 backdrop-blur-md lg:px-6">
            <div>
              <h2 className="text-lg font-black text-white lg:text-xl">Pełna Lista Przystanków</h2>
              <p className="mt-0.5 text-xs text-slate-400">Wszystkie pasujące punkty komunikacyjne ({fullFilteredStops.length})</p>
            </div>
            <button type="button" onClick={handleCloseFullList} className="cursor-pointer rounded-full p-2.5 text-slate-400 transition-all hover:bg-white/5 hover:text-white">
              <X size={20} />
            </button>
          </div>

          <div className="shrink-0 border-b border-white/[0.02] bg-[#080d14] px-4 py-4 lg:px-6">
            <div className="group relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-teal-400" size={18} />
              <input
                type="text"
                placeholder="Wpisz nazwę, np. Babica, Rejtana..."
                className="w-full rounded-2xl border border-white/10 bg-[#0e1622]/90 py-3 pl-11 pr-4 text-[14px] font-medium text-white shadow-lg shadow-black/40 outline-none transition-all placeholder:text-slate-500 focus:border-teal-500/40 focus:ring-2 focus:ring-teal-500/20"
                value={fullInputValue}
                onChange={(event) => {
                  setFullInputValue(event.target.value);
                  setVisibleFullCount(40);
                }}
              />
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+9.5rem)] py-4 custom-scrollbar lg:px-6">
            <AnimatePresence mode="popLayout">
              {slicedFullStops.map((stop, index) => renderStopCard(stop, index, true))}
            </AnimatePresence>

            {fullFilteredStops.length > visibleFullCount && (
              <div className="mb-6 mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleFullCount((count) => count + 40)}
                  className="group flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-teal-500/20 bg-teal-500/10 px-6 py-3.5 text-center text-xs font-black uppercase tracking-wider text-teal-300 transition-all hover:border-teal-500/40 hover:bg-teal-500/15 hover:shadow-[0_0_15px_rgba(20,184,166,0.15)] active:scale-98"
                >
                  <span>Pokaż więcej (+{fullFilteredStops.length - visibleFullCount} pozostałych)</span>
                  <ChevronDown size={14} className="text-teal-400 transition-transform group-hover:translate-y-0.5" />
                </button>
              </div>
            )}

            {fullFilteredStops.length === 0 && (
              <div className="mt-16 px-4 text-center text-[15px] text-slate-500">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/5 bg-slate-900 text-slate-600">
                  <Search size={20} />
                </div>
                Brak pasujących przystanków dla tej nazwy.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
