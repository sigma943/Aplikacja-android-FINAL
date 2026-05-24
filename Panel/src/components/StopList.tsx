import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, Bus, Train, Star, ChevronDown } from 'lucide-react';
import { Stop } from '../types';

import { getLineStyle } from '../utils/lineStyles';

const CARRIERS = {
  PKS: { id: 'pks', name: 'PKS Rzeszów', colorClass: 'text-teal-400', borderClass: 'border-teal-400/30', bgClass: 'bg-teal-400/10', dotClass: 'bg-teal-400' },
  MPK: { id: 'mpk', name: 'MPK Rzeszów', colorClass: 'text-orange-500', borderClass: 'border-orange-500/30', bgClass: 'bg-orange-500/10', dotClass: 'bg-orange-500' },
  MARCEL: { id: 'marcel', name: 'Marcel', colorClass: 'text-lime-400', borderClass: 'border-lime-400/30', bgClass: 'bg-lime-400/10', dotClass: 'bg-lime-400' },
  PKP_IC: { id: 'pkp_ic', name: 'PKP IC', colorClass: 'text-amber-500', borderClass: 'border-amber-500/30', bgClass: 'bg-amber-500/10', dotClass: 'bg-amber-500' },
  POLREGIO: { id: 'polregio', name: 'POLREGIO', colorClass: 'text-red-500', borderClass: 'border-red-500/30', bgClass: 'bg-red-500/10', dotClass: 'bg-red-500' },
};

const ENABLE_TRAINS = false;

interface StopListProps {
  onStopSelect: (stop: Stop) => void;
  onClose?: () => void;
  toggleFavorite: (stopId: string) => void;
  stops: Stop[];
  isFullScreen?: boolean;
  isLoading?: boolean;
}

type MainFilter = 'all' | 'bus' | 'train' | 'favorite';

const carriersArray = Object.values(CARRIERS);

export default function StopList({ onStopSelect, onClose, toggleFavorite, stops, isFullScreen = false, isLoading = false }: StopListProps) {
  const [inputValue, setInputValue] = useState('');
  const [mainFilter, setMainFilter] = useState<MainFilter>('all');
  const [selectedCarrier, setSelectedCarrier] = useState<string | null>(null);
  const [isFullListOpen, setIsFullListOpen] = useState(false);

  // Full list search & filter states
  const [fullInputValue, setFullInputValue] = useState('');
  const [fullMainFilter, setFullMainFilter] = useState<MainFilter>('all');
  const [fullSelectedCarrier, setFullSelectedCarrier] = useState<string | null>(null);

  // Pagination for full list rendering performance
  const [visibleFullCount, setVisibleFullCount] = useState(40);

  // Reset full list pagination whenever a filter is changed
  useEffect(() => {
    setVisibleFullCount(40);
  }, [fullInputValue, fullMainFilter, fullSelectedCarrier]);

  // Clean synchronizer that fully clears and resets all states when exiting full list
  const handleCloseFullList = () => {
    setInputValue('');
    setMainFilter('all');
    setSelectedCarrier(null);
    setFullInputValue('');
    setFullMainFilter('all');
    setFullSelectedCarrier(null);
    setIsFullListOpen(false);
  };

  // Sync full list states with main filters when opened
  useEffect(() => {
    if (isFullListOpen) {
      setFullInputValue(inputValue);
      setFullMainFilter(mainFilter);
      setFullSelectedCarrier(selectedCarrier);
    }
  }, [isFullListOpen]);

  // Ensure active carrier in full list is reset if filter mode changes and it disappears
  useEffect(() => {
    if (fullMainFilter === 'bus' && (fullSelectedCarrier === 'pkp_ic' || fullSelectedCarrier === 'polregio')) {
      setFullSelectedCarrier(null);
  } else if (ENABLE_TRAINS && fullMainFilter === 'train' && (fullSelectedCarrier === 'pks' || fullSelectedCarrier === 'mpk' || fullSelectedCarrier === 'marcel')) {
      setFullSelectedCarrier(null);
    }
  }, [fullMainFilter, fullSelectedCarrier]);

  // Ensure active carrier is reset if filter mode changes and it disappears
  useEffect(() => {
    if (mainFilter === 'bus' && (selectedCarrier === 'pkp_ic' || selectedCarrier === 'polregio')) {
      setSelectedCarrier(null);
  } else if (ENABLE_TRAINS && mainFilter === 'train' && (selectedCarrier === 'pks' || selectedCarrier === 'mpk' || selectedCarrier === 'marcel')) {
      setSelectedCarrier(null);
    }
  }, [mainFilter, selectedCarrier]);

  const toggleCarrier = (carrierId: string) => {
    setSelectedCarrier(prev => prev === carrierId ? null : carrierId);
  };

  const toggleFullCarrier = (carrierId: string) => {
    setFullSelectedCarrier(prev => prev === carrierId ? null : carrierId);
  };

  // Keep carriers relevant to currently selected category filter
  const visibleCarriers = useMemo(() => {
    if (mainFilter === 'bus') {
      return carriersArray.filter(c => c.id !== 'pkp_ic' && c.id !== 'polregio');
    }
    if (ENABLE_TRAINS && mainFilter === 'train') {
      return carriersArray.filter(c => c.id === 'pkp_ic' || c.id === 'polregio');
    }
    return ENABLE_TRAINS ? carriersArray : carriersArray.filter(c => c.id !== 'pkp_ic' && c.id !== 'polregio');
  }, [mainFilter]);

  // Keep carriers relevant to currently selected category filter in the full list
  const fullVisibleCarriers = useMemo(() => {
    if (fullMainFilter === 'bus') {
      return carriersArray.filter(c => c.id !== 'pkp_ic' && c.id !== 'polregio');
    }
    if (ENABLE_TRAINS && fullMainFilter === 'train') {
      return carriersArray.filter(c => c.id === 'pkp_ic' || c.id === 'polregio');
    }
    return ENABLE_TRAINS ? carriersArray : carriersArray.filter(c => c.id !== 'pkp_ic' && c.id !== 'polregio');
  }, [fullMainFilter]);

  const filteredStops = useMemo(() => {
    return stops.filter(stop => {
      // 1. Search Query
      if (inputValue && !stop.name.toLowerCase().includes(inputValue.toLowerCase())) {
        return false;
      }

      // 2. Main Filter
      if (mainFilter === 'bus' && stop.type !== 'bus') return false;
      if (ENABLE_TRAINS && mainFilter === 'train' && stop.type !== 'train') return false;
      if (!ENABLE_TRAINS && stop.type !== 'bus') return false;
      if (mainFilter === 'favorite' && !stop.isFavorite) return false;

      // 3. Carrier Filter
      if (selectedCarrier) {
        const hasMatchingCarrier = stop.carriers.some(c => c.id === selectedCarrier);
        if (!hasMatchingCarrier) return false;
      }

      return true;
    });
  }, [stops, inputValue, mainFilter, selectedCarrier]);

  const fullFilteredStops = useMemo(() => {
    return stops.filter(stop => {
      // 1. Search Query
      if (fullInputValue && !stop.name.toLowerCase().includes(fullInputValue.toLowerCase())) {
        return false;
      }

      // 2. Main Filter
      if (fullMainFilter === 'bus' && stop.type !== 'bus') return false;
      if (ENABLE_TRAINS && fullMainFilter === 'train' && stop.type !== 'train') return false;
      if (!ENABLE_TRAINS && stop.type !== 'bus') return false;
      if (fullMainFilter === 'favorite' && !stop.isFavorite) return false;

      // 3. Carrier Filter
      if (fullSelectedCarrier) {
        const hasMatchingCarrier = stop.carriers.some(c => c.id === fullSelectedCarrier);
        if (!hasMatchingCarrier) return false;
      }

      return true;
    });
  }, [stops, fullInputValue, fullMainFilter, fullSelectedCarrier]);

  const slicedFullStops = useMemo(() => {
    return fullFilteredStops.slice(0, visibleFullCount);
  }, [fullFilteredStops, visibleFullCount]);

  const displayStops = useMemo(() => filteredStops.slice(0, 30), [filteredStops]);

  const renderLineBadges = (lines: string[], expanded = false) => {
    const visibleCount = expanded ? lines.length : Math.min(lines.length, 5);
    const visible = lines.slice(0, visibleCount);
    const remaining = lines.length - visible.length;

    return (
      <div className="flex min-w-0 flex-wrap items-center gap-1 mt-1">
        {visible.map(line => (
          <span key={line} className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getLineStyle(line)}`}>
            {line}
          </span>
        ))}
        {remaining > 0 && (
          <span className="px-2 py-0.5 rounded border border-slate-500/20 bg-slate-500/10 text-[10px] font-black text-slate-300">
            +{remaining}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-transparent text-slate-200">
      {/* Header */}
      <div className="pt-6 lg:pt-8 pb-4 px-4 lg:px-10 sticky top-0 bg-[#07111d]/30 backdrop-blur-2xl backdrop-saturate-150 z-10 w-full border-b border-white/[0.08] shadow-[0_18px_60px_rgba(0,0,0,0.16)]">
        <div className="flex justify-between items-center mb-5 pl-1">
          <div>
            <h1 className={`font-black tracking-tight text-white bg-gradient-to-r from-teal-400 via-cyan-300 to-blue-500 bg-clip-text text-transparent ${isFullScreen ? 'text-2xl lg:text-3.5xl' : 'text-xl'}`}>
              Rozkład Jazdy
            </h1>
            <p className="text-slate-400 text-xs mt-1 font-medium">Znajdź najbliższe przystanki autobusowe</p>
          </div>
          <button onClick={onClose} className="hidden lg:flex p-2 -mr-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-full transition-all">
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-5 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-teal-400 transition-colors" size={18} />
          <input
            type="text"
            placeholder="Wpisz nazwę, np. Babica, Rejtana..."
            className="w-full bg-[#0e1622]/34 border border-white/12 text-white rounded-2xl py-3 lg:py-3.5 pl-11 pr-4 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/40 placeholder:text-slate-400/75 font-medium transition-all shadow-lg shadow-black/18 backdrop-blur-2xl text-[14px] lg:text-[15px]"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
        </div>

        {/* Filter Navigation Category */}
        <div className="mb-4 w-full">
          <div className={`grid ${ENABLE_TRAINS ? 'grid-cols-4' : 'grid-cols-3'} gap-1 p-1 bg-[#0d1622]/34 border border-white/[0.08] rounded-2xl w-full backdrop-blur-2xl`}>
            <button
              onClick={() => setMainFilter('all')}
              className={`py-2 px-1 text-center rounded-xl font-bold text-[11px] sm:text-[12px] lg:text-[13px] transition-all duration-300 border cursor-pointer ${
                mainFilter === 'all'
                  ? 'bg-gradient-to-r from-teal-500/20 to-teal-400/30 text-teal-300 border-teal-500/30 shadow-[0_2px_10px_rgba(20,184,166,0.15)] scale-[1.02]'
                  : 'bg-transparent text-slate-400 border-transparent hover:text-white'
              }`}
            >
              Wszystkie
            </button>
            <button
              onClick={() => setMainFilter('bus')}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-2 px-1 rounded-xl font-bold text-[11px] sm:text-[12px] lg:text-[13px] transition-all duration-300 border cursor-pointer ${
                mainFilter === 'bus'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-cyan-400/30 text-cyan-300 border-cyan-500/30 shadow-[0_2px_10px_rgba(6,182,212,0.15)] scale-[1.02]'
                  : 'bg-transparent text-slate-400 border-transparent hover:text-white'
              }`}
            >
              <Bus size={12} className={mainFilter === 'bus' ? 'text-cyan-400' : 'text-slate-500'} />
              <span className="truncate">Autobusy</span>
            </button>
            {ENABLE_TRAINS && (
              <button
                onClick={() => setMainFilter('train')}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-2 px-1 rounded-xl font-bold text-[11px] sm:text-[12px] lg:text-[13px] transition-all duration-300 border cursor-pointer ${
                  mainFilter === 'train'
                    ? 'bg-gradient-to-r from-blue-500/20 to-blue-400/30 text-blue-300 border-blue-500/30 shadow-[0_2px_10px_rgba(59,130,246,0.15)] scale-[1.02]'
                    : 'bg-transparent text-slate-400 border-transparent hover:text-white'
                }`}
              >
                <Train size={12} className={mainFilter === 'train' ? 'text-blue-400' : 'text-slate-500'} />
                <span className="truncate">Pociągi</span>
              </button>
            )}
            <button
              onClick={() => setMainFilter('favorite')}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-2 px-1 rounded-xl font-bold text-[11px] sm:text-[12px] lg:text-[13px] transition-all duration-300 border cursor-pointer ${
                mainFilter === 'favorite'
                  ? 'bg-gradient-to-r from-amber-500/20 to-amber-400/30 text-amber-300 border-amber-500/30 shadow-[0_2px_10px_rgba(245,158,11,0.15)] scale-[1.02]'
                  : 'bg-transparent text-slate-400 border-transparent hover:text-white'
              }`}
            >
              <Star size={12} className={mainFilter === 'favorite' ? 'fill-amber-450 text-amber-300' : 'text-slate-500'} />
              <span className="truncate">Ulubione</span>
            </button>
          </div>
        </div>

        {/* Carrier Filters */}
        <div className="pb-3 w-full border-b border-white/[0.04]">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-1 select-none pointer-events-auto flex-nowrap shrink-0">
            {visibleCarriers.map(carrier => {
              const isSelected = selectedCarrier === carrier.id;
              // Generate custom glow effects
              const glowClassMap: Record<string, string> = {
                pks: 'shadow-[0_2px_8px_rgba(20,184,166,0.2)] border-teal-500/50 bg-[#14b8a6]/15 text-teal-300 scale-[1.02]',
                mpk: 'shadow-[0_2px_8px_rgba(249,115,22,0.2)] border-orange-500/50 bg-[#f97316]/15 text-orange-400 scale-[1.02]',
                marcel: 'shadow-[0_2px_8px_rgba(132,204,22,0.2)] border-lime-500/50 bg-[#84cc16]/15 text-lime-400 scale-[1.02]',
                pkp_ic: 'shadow-[0_2px_8px_rgba(245,158,11,0.2)] border-amber-500/50 bg-[#f59e0b]/15 text-amber-400 scale-[1.02]',
                polregio: 'shadow-[0_2px_8px_rgba(239,68,68,0.2)] border-red-500/50 bg-[#ef4444]/15 text-red-400 scale-[1.02]',
              };

              return (
                <button
                  key={carrier.id}
                  onClick={() => toggleCarrier(carrier.id)}
                  data-selected={isSelected}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] md:text-[11px] font-bold transition-all duration-300 border cursor-pointer ${
                    isSelected 
                      ? glowClassMap[carrier.id] || 'bg-white/10 text-white border-white/25'
                      : 'bg-[#121f31]/45 border-white/[0.05] text-slate-400 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? carrier.dotClass : carrier.dotClass + ' opacity-50'}`}></span>
                  <span>{carrier.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* List */}
      <div className={`flex-1 overflow-y-auto px-4 lg:px-6 pb-8 pt-4 custom-scrollbar ${
          isFullScreen 
            ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6 w-full content-start max-w-[1540px] mx-auto px-0 lg:px-4 pt-5 lg:pt-10' 
            : 'flex flex-col gap-3 w-full'
      }`}>
        {isLoading ? (
          Array.from({ length: isFullScreen ? 6 : 4 }).map((_, i) => (
            <div 
              key={`stop-skeleton-${i}`} 
              className="flex items-[#080d14] p-4 rounded-[22px] bg-[#0d1622]/30 border border-white/[0.03] animate-pulse h-[89px] items-center"
            >
              <div className="w-11 h-11 rounded-xl bg-white/5 mr-4 shrink-0" />
              <div className="flex-1 space-y-2 py-1 min-w-0 pr-2">
                <div className="h-4 bg-white/10 rounded-md w-3/4" />
                <div className="h-3 bg-white/5 rounded-md w-1/2" />
                <div className="flex gap-1.5 pt-1">
                  <div className="h-3.5 bg-white/5 rounded-md w-8" />
                  <div className="h-3.5 bg-white/5 rounded-md w-12" />
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-white/5 shrink-0" />
            </div>
          ))
        ) : (
          <>
              {displayStops.map((stop, index) => {
                const isBus = stop.type === 'bus';

                return (
                  <div 
                    style={{ animationDelay: `${Math.min(index * 15, 200)}ms` }}
                    key={stop.id} 
                    className="flex items-center p-4 lg:p-5 rounded-[24px] bg-[#0d1622]/34 cursor-pointer border border-white/[0.08] group transition-all duration-200 backdrop-blur-2xl shadow-[0_18px_45px_rgba(0,0,0,0.14)] hover:-translate-y-0.5 hover:scale-[1.01] hover:bg-[#142238]/48 hover:shadow-[0_20px_45px_-10px_rgba(20,184,166,0.14)] hover:border-teal-400/35 active:scale-[0.99] animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards"
                    onClick={() => onStopSelect(stop)}
                  >
                    {/* Icon */}
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center mr-4 shrink-0 transition-all duration-300 ${
                      isBus 
                        ? 'bg-teal-500/10 text-teal-400 group-hover:bg-teal-500/20 group-hover:text-teal-300 border border-teal-500/10' 
                        : 'bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 group-hover:text-blue-300 border border-blue-500/10'
                    }`}>
                       {isBus ? <Bus size={20} strokeWidth={2.2} /> : <Train size={20} strokeWidth={2.2} />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-2">
                      <h3 className="font-bold text-[16px] lg:text-[17px] text-white truncate drop-shadow-sm group-hover:text-teal-200 transition-colors">
                        {stop.name}
                      </h3>
                      
                      <div className="flex flex-col gap-1 mt-1">
                        {/* Category & Carriers */}
                        <div className="flex flex-wrap items-center text-[12px] font-semibold text-slate-400">
                          <span className={isBus ? 'text-teal-400/90' : 'text-blue-400/90'}>
                            {isBus ? 'Przystanek autobusowy' : 'Stacja kolejowa'}
                          </span>
                        </div>

                        {/* Served Lines Micro-badges */}
                        {isBus && stop.lines && stop.lines.length > 0 && renderLineBadges(stop.lines)}
                      </div>
                    </div>

                    {/* Favorite Button */}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(stop.id);
                      }}
                      className="p-2.5 -mr-1 text-slate-500 hover:text-white rounded-xl hover:bg-white/5 transition-all duration-200 shrink-0 cursor-pointer"
                    >
                      <div className={`transition-all duration-300 ${stop.isFavorite ? 'scale-[1.15]' : 'scale-100 hover:scale-[1.1]'}`}>
                        <Star 
                          size={20} 
                          className={stop.isFavorite ? 'fill-[#f59e0b] text-[#f59e0b] filter drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'text-slate-500 group-hover:text-slate-400'} 
                        />
                      </div>
                    </button>
                  </div>
                );
              })}

            {filteredStops.length > 30 && (
              <div className="col-span-full flex justify-center mt-6 mb-8 w-full">
                <button 
                  onClick={() => setIsFullListOpen(true)}
                  className="px-6 py-3.5 rounded-2xl bg-teal-500/10 text-teal-300 hover:bg-teal-500/20 hover:text-white border border-teal-500/20 active:scale-95 transition-all text-xs font-extrabold tracking-wider uppercase cursor-pointer"
                >
                  Pokaż wszystkie ({filteredStops.length})
                </button>
              </div>
            )}

            {filteredStops.length === 0 && (
               <div className={`text-center text-slate-500 mt-16 px-4 text-[15px] ${isFullScreen ? 'col-span-full' : ''}`}>
                 <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center mx-auto mb-3 text-slate-600 border border-white/5">
                    <Search size={20} />
                 </div>
                 Brak wyników dla podanych kryteriów.
               </div>
            )}
          </>
        )}
      </div>

      {/* Full List Immersive Panel Overlay */}
      {isFullListOpen && (
        <div className="absolute inset-0 bg-[#080d14] z-50 flex flex-col animate-in fade-in slide-in-from-bottom duration-300">
          <div className="pt-6 pb-4 px-4 lg:px-6 border-b border-white/[0.04] flex justify-between items-center bg-[#0d1622]/90 backdrop-blur-md">
            <div>
              <h2 className="text-lg lg:text-xl font-black text-white">
                Pełna Lista Przystanków
              </h2>
              <p className="text-slate-400 text-xs mt-0.5 font-sans">Wszystkie pasujące punkty komunikacyjne ({fullFilteredStops.length})</p>
            </div>
            <button 
              onClick={handleCloseFullList}
              className="p-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-full transition-all cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Sticky Filtering Controls for Full List */}
          <div className="px-4 lg:px-6 py-4 bg-[#080d14] border-b border-white/[0.02] flex flex-col gap-3 shrink-0">
            {/* Search */}
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-teal-400 transition-colors" size={18} />
              <input
                type="text"
                placeholder="Wpisz nazwę, np. Babica, Rejtana..."
                className="w-full bg-[#0e1622]/90 border border-white/10 text-white rounded-2xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/40 placeholder:text-slate-500 font-medium transition-all shadow-lg shadow-black/40 text-[14px]"
                value={fullInputValue}
                onChange={(e) => setFullInputValue(e.target.value)}
              />
            </div>

            {/* Main Filter categories */}
            <div className="w-full">
              <div className={`grid ${ENABLE_TRAINS ? 'grid-cols-4' : 'grid-cols-3'} gap-1 p-1 bg-[#0d1622]/95 border border-white/[0.04] rounded-2xl w-full`}>
                <button
                  onClick={() => setFullMainFilter('all')}
                  className={`py-2 px-1 text-center rounded-xl font-bold text-[11px] sm:text-[12px] transition-all duration-300 border cursor-pointer ${
                    fullMainFilter === 'all'
                      ? 'bg-gradient-to-r from-teal-500/20 to-teal-400/30 text-teal-300 border-teal-500/30 shadow-[0_2px_10px_rgba(20,184,166,0.15)] scale-[1.02]'
                      : 'bg-transparent text-slate-400 border-transparent hover:text-white'
                  }`}
                >
                  Wszystkie
                </button>
                <button
                  onClick={() => setFullMainFilter('bus')}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 sm:py-2 px-1 rounded-xl font-bold text-[11px] sm:text-[12px] transition-all duration-300 border cursor-pointer ${
                    fullMainFilter === 'bus'
                      ? 'bg-gradient-to-r from-cyan-500/20 to-cyan-400/30 text-cyan-300 border-cyan-500/30 shadow-[0_2px_10px_rgba(6,182,212,0.15)] scale-[1.02]'
                      : 'bg-transparent text-slate-400 border-transparent hover:text-white'
                  }`}
                >
                  <Bus size={12} className={fullMainFilter === 'bus' ? 'text-cyan-400' : 'text-slate-500'} />
                  <span className="truncate">Autobusy</span>
                </button>
                {ENABLE_TRAINS && (
                  <button
                    onClick={() => setFullMainFilter('train')}
                    className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 sm:py-2 px-1 rounded-xl font-bold text-[11px] sm:text-[12px] transition-all duration-300 border cursor-pointer ${
                      fullMainFilter === 'train'
                        ? 'bg-gradient-to-r from-blue-500/20 to-blue-400/30 text-blue-300 border-blue-500/30 shadow-[0_2px_10px_rgba(59,130,246,0.15)] scale-[1.02]'
                        : 'bg-transparent text-slate-400 border-transparent hover:text-white'
                    }`}
                  >
                    <Train size={12} className={fullMainFilter === 'train' ? 'text-blue-400' : 'text-slate-500'} />
                    <span className="truncate">Pociągi</span>
                  </button>
                )}
                <button
                  onClick={() => setFullMainFilter('favorite')}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 sm:py-2 px-1 rounded-xl font-bold text-[11px] sm:text-[12px] transition-all duration-300 border cursor-pointer ${
                    fullMainFilter === 'favorite'
                      ? 'bg-gradient-to-r from-amber-500/20 to-amber-400/30 text-amber-300 border-amber-500/30 shadow-[0_2px_10px_rgba(245,158,11,0.15)] scale-[1.02]'
                      : 'bg-transparent text-slate-400 border-transparent hover:text-white'
                  }`}
                >
                  <Star size={12} className={fullMainFilter === 'favorite' ? 'fill-amber-450 text-amber-300' : 'text-slate-500'} />
                  <span className="truncate">Ulubione</span>
                </button>
              </div>
            </div>

            {/* Carrier Filter (One Row Scrollable) */}
            <div className="w-full">
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-1 select-none pointer-events-auto flex-nowrap shrink-0">
                {fullVisibleCarriers.map(carrier => {
                  const isSelected = fullSelectedCarrier === carrier.id;
                  const glowClassMap: Record<string, string> = {
                    pks: 'shadow-[0_2px_8px_rgba(20,184,166,0.2)] border-teal-500/50 bg-[#14b8a6]/15 text-teal-300 scale-[1.02]',
                    mpk: 'shadow-[0_2px_8px_rgba(249,115,22,0.2)] border-orange-500/50 bg-[#f97316]/15 text-orange-400 scale-[1.02]',
                    marcel: 'shadow-[0_2px_8px_rgba(132,204,22,0.2)] border-lime-500/50 bg-[#84cc16]/15 text-lime-400 scale-[1.02]',
                    pkp_ic: 'shadow-[0_2px_8px_rgba(245,158,11,0.2)] border-amber-500/50 bg-[#f59e0b]/15 text-amber-400 scale-[1.02]',
                    polregio: 'shadow-[0_2px_8px_rgba(239,68,68,0.2)] border-red-500/50 bg-[#ef4444]/15 text-red-400 scale-[1.02]',
                  };

                  return (
                    <button
                      key={`full-carrier-${carrier.id}`}
                      onClick={() => toggleFullCarrier(carrier.id)}
                      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] md:text-[11px] font-bold transition-all duration-300 border cursor-pointer ${
                        isSelected 
                          ? glowClassMap[carrier.id] || 'bg-white/10 text-white border-white/25'
                          : 'bg-[#121f31]/40 border-white/[0.03] text-slate-400 hover:bg-white/[0.04] hover:text-white'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? carrier.dotClass : carrier.dotClass + ' opacity-50'}`}></span>
                      <span>{carrier.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4 custom-scrollbar flex flex-col gap-3">
            {slicedFullStops.map((stop, index) => {
              const isBus = stop.type === 'bus';
              return (
                <div 
                  style={{ animationDelay: `${Math.min(index * 15, 150)}ms` }}
                  key={`full-${stop.id}`} 
                  className="flex items-center p-4 rounded-[22px] bg-[#0d1622]/50 cursor-pointer border border-white/[0.03] group transition-all duration-200 hover:bg-[#121f31]/80 hover:border-teal-500/30 active:scale-[0.99] animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards"
                  onClick={() => {
                    handleCloseFullList();
                    onStopSelect(stop);
                  }}
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center mr-4 shrink-0 transition-all duration-300 ${
                    isBus 
                      ? 'bg-teal-500/10 text-teal-400 border border-teal-500/10' 
                      : 'bg-blue-500/10 text-blue-400 border border-blue-500/10'
                  }`}>
                     {isBus ? <Bus size={20} /> : <Train size={20} />}
                  </div>
                  <div className="flex-1 min-w-0 pr-2">
                    <h3 className="font-bold text-[16px] text-white truncate group-hover:text-teal-200 transition-colors">
                      {stop.name}
                    </h3>
                    <div className="flex flex-wrap items-center text-[11px] font-semibold text-slate-400 mt-0.5">
                      <span className={isBus ? 'text-teal-400/90' : 'text-blue-400/90'}>
                        {isBus ? 'Przystanek autobusowy' : 'Stacja kolejowa'}
                      </span>
                    </div>
                    {isBus && stop.lines && stop.lines.length > 0 && renderLineBadges(stop.lines, true)}
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(stop.id);
                    }}
                    className="p-2.5 text-slate-500 hover:text-white rounded-xl hover:bg-white/5 transition-all shrink-0 cursor-pointer"
                  >
                    <div className={`transition-all duration-300 ${stop.isFavorite ? 'scale-[1.15]' : 'scale-100 hover:scale-[1.1]'}`}>
                      <Star 
                        size={18} 
                        className={stop.isFavorite ? 'fill-[#f59e0b] text-[#f59e0b] filter drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'text-slate-500'} 
                      />
                    </div>
                  </button>
                </div>
              );
            })}

            {fullFilteredStops.length > visibleFullCount && (
              <div className="flex justify-center mt-4 mb-6">
                <button 
                  onClick={() => setVisibleFullCount(prev => prev + 40)}
                  className="group flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-teal-500/10 text-teal-300 hover:bg-teal-500/15 border border-teal-500/20 active:scale-98 transition-all text-xs font-black tracking-wider uppercase cursor-pointer w-full text-center hover:shadow-[0_0_15px_rgba(20,184,166,0.15)] hover:border-teal-500/40"
                >
                  <span>Pokaż więcej (+{fullFilteredStops.length - visibleFullCount} pozostałych)</span>
                  <ChevronDown size={14} className="text-teal-400 group-hover:translate-y-0.5 transition-transform" />
                </button>
              </div>
            )}

            {fullFilteredStops.length === 0 && (
              <div className="text-center text-slate-500 mt-16 px-4 text-[15px]">
                <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center mx-auto mb-3 text-slate-600 border border-white/5">
                  <Search size={20} />
                </div>
                Brak pasujących przystanków dla tych kryteriów.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
