import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, MapPin, Star, Navigation, ChevronDown, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Stop, Departure } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { getLineStyle } from '../utils/lineStyles';

interface BusStopDetailProps {
  stop: Stop;
  onBack: () => void;
  toggleFavorite: (stopId: string) => void;
  loadDepartures: (stop: Stop, dayIndex?: number) => Promise<Departure[]>;
  onShowOnMap?: (stop: Stop) => void;
}

function getDynamicDays() {
  const weekdaysPl = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
  const labelsPl = ['Nie', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'];
  
  const days = [];
  const now = new Date();
  
  for (let i = 0; i < 7; i++) {
    const futureDate = new Date(now);
    futureDate.setDate(now.getDate() + i);
    
    const dayName = weekdaysPl[futureDate.getDay()];
    let label = labelsPl[futureDate.getDay()];
    if (i === 0) label = 'Dziś';
    if (i === 1) label = 'Jutro';
    
    const weekdayKeys: Record<number, string> = {
      0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat'
    };
    const key = i === 0 ? 'today' : i === 1 ? 'tomorrow' : weekdayKeys[futureDate.getDay()];
    
    days.push({
      label,
      dayNum: String(futureDate.getDate()),
      weekday: dayName,
      key,
      monthName: futureDate.toLocaleDateString('pl-PL', { month: 'long' }),
      monthYear: futureDate.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })
    });
  }
  return days;
}

export default function BusStopDetail({ stop, onBack, toggleFavorite, loadDepartures, onShowOnMap }: BusStopDetailProps) {
  const [days] = useState(getDynamicDays);
  const [selectedLine, setSelectedLine] = useState<string>('all');
  const [showAllDepartures, setShowAllDepartures] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>('today');
  const [showPastDepartures, setShowPastDepartures] = useState<boolean>(false);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isLive, setIsLive] = useState<boolean>(false);
  const [isFetchingLive, setIsFetchingLive] = useState<boolean>(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const departuresRequestStop = useMemo(() => ({
    id: stop.id,
    name: stop.name,
    type: stop.type,
    carriers: [],
    lines: [],
    isFavorite: false,
    areaId: stop.areaId,
    code: stop.code,
    lat: stop.lat,
    lon: stop.lon,
    sourceProviderIds: stop.sourceProviderIds,
    providerStopIds: stop.providerStopIds,
  }), [stop.areaId, stop.code, stop.id, stop.lat, stop.lon, stop.name, stop.providerStopIds, stop.sourceProviderIds, stop.type]);

  useEffect(() => {
    const updateTime = () => {
      setCurrentTimeMs(Date.now());
    };
    updateTime();
    const interval = setInterval(updateTime, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollContainerRef.current) {
      const activeEl = scrollContainerRef.current.querySelector('[data-selected="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    }
  }, [selectedDay]);

  useEffect(() => {
    let active = true;
    const resetTimer = window.setTimeout(() => {
      if (!active) return;
      setIsLive(false);
      setIsFetchingLive(true);
      setIsLoading(true);
    }, 0);
    const selectedDayIndex = Math.max(0, days.findIndex(d => d.key === selectedDay));
    loadDepartures(departuresRequestStop, selectedDayIndex)
      .then(loadedDepartures => {
        if (active) {
          setDepartures(loadedDepartures);
          setIsLive(loadedDepartures.length > 0);
          setIsLoading(false);
          setIsFetchingLive(false);
        }
      })
      .catch(err => {
        console.error("Error keeping departures in sync:", err);
        if (active) {
          setDepartures([]);
          setIsLive(false);
          setIsLoading(false);
          setIsFetchingLive(false);
        }
      });

    return () => {
      active = false;
      window.clearTimeout(resetTimer);
    };
  }, [days, departuresRequestStop, selectedDay, loadDepartures]);

  const refreshLiveDepartures = () => {
    setIsFetchingLive(true);
    
    const selectedDayIndex = Math.max(0, days.findIndex(d => d.key === selectedDay));
    loadDepartures(departuresRequestStop, selectedDayIndex)
      .then(loadedDepartures => {
        setDepartures(loadedDepartures);
        setIsLive(loadedDepartures.length > 0);
        setIsFetchingLive(false);
      })
      .catch(err => {
        console.error("Manual refresh error:", err);
        setIsLive(false);
        setIsFetchingLive(false);
      });
  };

  const stopLines = stop.lines || [];
  const uniqueLinesFromDeps = Array.from(new Set(departures.map(d => d.line))).filter(Boolean);
  const combinedLines = Array.from(new Set([...stopLines, ...uniqueLinesFromDeps])).filter(Boolean);
  const lines = ['Wszystkie', ...combinedLines.filter(l => l !== 'Wszystkie')];

  const isPastDeparture = (timeStr: string) => {
    if (selectedDay !== 'today') return false;
    const byTimestamp = processedTimeForDeparture(timeStr);
    if (!currentTimeMs) return false;
    if (Number.isFinite(byTimestamp)) return byTimestamp < currentTimeMs;
    const now = new Date(currentTimeMs);
    const currentH = now.getHours();
    const currentM = now.getMinutes();
    const [h, m] = timeStr.split(':').map(Number);
    return (h * 60 + m) < (currentH * 60 + currentM);
  };

  const selectedDayIndex = Math.max(0, days.findIndex(d => d.key === selectedDay));
  const selectedDateKey = (() => {
    const day = new Date();
    day.setDate(day.getDate() + selectedDayIndex);
    return day.toLocaleDateString('en-CA', { timeZone: 'Europe/Warsaw' });
  })();

  const processedTimeForDeparture = (timeStr: string, plannedAtMs?: number) => {
    if (Number.isFinite(plannedAtMs)) return plannedAtMs as number;
    const [h, m] = timeStr.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
    const day = new Date();
    day.setDate(day.getDate() + selectedDayIndex);
    day.setHours(h, m, 0, 0);
    return day.getTime();
  };

  const processedDepartures = departures.map(d => ({
    ...d,
    isPast: (d as any).isPast !== undefined ? (d as any).isPast : isPastDeparture(d.time)
  })).filter(d => {
    if (!Number.isFinite(d.plannedAtMs)) return selectedDayIndex === 0;
    return new Date(d.plannedAtMs as number).toLocaleDateString('en-CA', { timeZone: 'Europe/Warsaw' }) === selectedDateKey;
  });

  const filteredDeparturesByLine = processedDepartures.filter(d => {
    if (!selectedLine || selectedLine === 'all') return true;
    return d.line === selectedLine;
  });

  const activeDepartures = filteredDeparturesByLine.filter(d => showPastDepartures ? true : !d.isPast);
  const displayedDepartures = showAllDepartures ? activeDepartures : activeDepartures.slice(0, 5);
  const formatDepartureTime = (departure: Departure) => {
    if (selectedDay !== 'today') return departure.time;
    if (!currentTimeMs) return departure.time;
    const departureMs = Number(departure.realAtMs || departure.plannedAtMs);
    if (!Number.isFinite(departureMs)) return departure.time;
    const diffMs = departureMs - currentTimeMs;
    if (diffMs < 0 || diffMs >= 30 * 60_000) return departure.time;
    if (diffMs < 60_000) return '<1 min';
    return `${Math.floor(diffMs / 60_000)} min`;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 15 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 15 }}
      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
      className="h-full min-h-0 overflow-y-auto overscroll-contain bg-[#05080c]/18 text-slate-200 font-sans pb-[calc(env(safe-area-inset-bottom)+9.5rem)] md:pb-8 backdrop-blur-2xl backdrop-saturate-150"
    >
      <div className="w-full max-w-3xl min-w-0 mx-auto">
        {/* Header */}
        <div className="relative pt-3 sm:pt-4 lg:pt-8 pb-4 px-3.5 sm:px-4 lg:px-8 bg-slate-900/28 border-b border-white/10 overflow-hidden backdrop-blur-2xl shadow-[0_20px_70px_rgba(0,0,0,0.20)]">
          {/* Subtle background gradient */}
          <div className="absolute inset-0 bg-[#05080c]/20"></div>
          <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-teal-900/24 via-[#05080c]/22 to-[#05080c]/30"></div>
          
          {/* Top bar */}
          <div className="flex justify-between items-center mb-3 lg:mb-6 relative z-10 w-full">
            <button onClick={onBack} className="p-1.5 -ml-1 text-white hover:bg-white/10 rounded-full transition-colors flex-shrink-0">
              <ArrowLeft size={22} />
            </button>
            
            <div className="flex items-center ml-auto gap-2">
              <button
                onClick={() => onShowOnMap?.(stop)}
                disabled={!onShowOnMap}
                className="flex flex-shrink-0 items-center justify-center gap-1.5 h-8.5 px-2.5 sm:px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-[11px] font-bold transition-all duration-300 cursor-pointer shadow-md active:scale-95 leading-none hover:border-teal-500/40 font-sans backdrop-blur-xl disabled:cursor-not-allowed disabled:opacity-40"
              >
                <MapPin size={13} className="text-teal-400 animate-pulse" />
                <span>Pokaż na mapie</span>
              </button>
              <button 
                onClick={() => toggleFavorite(stop.id)} 
                className="w-8.5 h-8.5 flex items-center justify-center text-white hover:bg-white/10 border border-white/5 hover:border-white/10 rounded-xl transition-all duration-200 flex-shrink-0 cursor-pointer active:scale-90"
              >
                <Star size={16} className={stop.isFavorite ? 'fill-[#f59e0b] text-[#f59e0b]' : 'text-slate-400'} />
              </button>
            </div>
          </div>

          {/* Stop Info */}
          <div className="relative z-10">
            <h1 className="text-lg sm:text-2xl lg:text-3xl font-black text-white mb-2 tracking-tight leading-tight break-words">{stop.name}</h1>
            
            <div className="flex flex-wrap gap-1">
              {[...stop.carriers].sort((a, b) => {
                const order = ['pks', 'mpk', 'marcel'];
                const idxA = order.indexOf(a.id);
                const idxB = order.indexOf(b.id);
                if (idxA === -1 && idxB === -1) return 0;
                if (idxA === -1) return 1;
                if (idxB === -1) return -1;
                return idxA - idxB;
              }).map((c) => (
                <div key={c.id} className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold tracking-wider uppercase border ${c.bgClass} ${c.colorClass} ${c.borderClass}`}>
                  {c.name}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-3.5 sm:px-4 lg:px-8 mt-3 sm:mt-4 space-y-4 relative z-10">
          
          {/* Calendar Picker Swipable 7-Day Row */}
          <div className="relative bg-[#0d1622]/28 rounded-2xl p-2.5 sm:p-3 border border-white/[0.08] shadow-md backdrop-blur-2xl">
            <div className="flex justify-between items-center mb-2 px-1">
              <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-widest font-sans">Wybierz Dzień</h3>
              <span className="text-[9px] font-bold text-teal-400 bg-teal-400/10 px-2 py-0.5 rounded-full border border-teal-500/15 capitalize">
                {days.find(d => d.key === selectedDay)?.monthYear}
              </span>
            </div>
            
            <div
              ref={scrollContainerRef}
              className="flex gap-1.5 overflow-x-auto no-scrollbar py-1 snap-x select-none pointer-events-auto px-0 lg:justify-center"
            >
              {days.map((day) => {
                const isSelected = selectedDay === day.key;
                return (
                  <button
                    key={day.key}
                    onClick={() => setSelectedDay(day.key)}
                    data-selected={isSelected}
                    className={`flex-shrink-0 snap-start flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-full text-xs font-bold transition-all duration-300 cursor-pointer border ${
                      isSelected
                        ? 'bg-[#14b8a6]/15 text-teal-300 border-[#14b8a6]'
                        : 'bg-[#121f31]/40 text-slate-400 border-white/[0.03] hover:bg-white/[0.04] hover:text-slate-200'
                    }`}
                  >
                    <span className={`text-[10px] uppercase font-extrabold ${isSelected ? 'text-teal-400' : 'text-slate-400'}`}>
                      {day.label}
                    </span>
                    <span className="opacity-30 text-[9px]">•</span>
                    <span className={`text-[12px] font-black ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                      {day.dayNum}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Line Filter */}
          <div className="relative">
            <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3 ml-1">Linie</h3>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 px-1 snap-x">
               {lines.map(line => {
                 const value = (line === 'Wszystkie' ? 'all' : line) as string;
                 const isActive = selectedLine === value;
                 
                 // Default to a generic teal active state if it's "Wszystkie" or unknown
                 let activeClass = 'bg-gradient-to-r from-teal-400 to-cyan-500 text-teal-950 border-transparent shadow-[0_0_12px_rgba(20,184,166,0.25)]';
                 let inactiveClass = 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10';
                 
                 if (value !== 'all') {
                   if (value.startsWith('M') || value.toLowerCase().includes('marcel')) {
                     activeClass = 'bg-lime-400 text-lime-950 border-transparent shadow-[0_0_12px_rgba(163,230,53,0.3)]';
                     inactiveClass = `${getLineStyle(value)} hover:opacity-80`;
                   } else {
                     const numericVal = parseInt(value, 10);
                     if (!isNaN(numericVal) && numericVal >= 100) {
                        activeClass = 'bg-teal-400 text-teal-950 border-transparent shadow-[0_0_12px_rgba(45,212,191,0.3)]';
                        inactiveClass = `${getLineStyle(value)} hover:opacity-80`;
                     } else {
                        // MPK
                        if (value !== 'Wszystkie') {
                          activeClass = 'bg-orange-400 text-orange-950 border-transparent shadow-[0_0_12px_rgba(251,146,60,0.3)]';
                          inactiveClass = `${getLineStyle(value)} hover:opacity-80`;
                        }
                     }
                   }
                 }

                 return (
                   <button
                     key={line}
                     onClick={() => setSelectedLine(value)}
                     className={`flex-shrink-0 snap-start px-3.5 sm:px-4.5 py-2.5 rounded-xl text-[12px] font-extrabold transition-all duration-300 border cursor-pointer ${
                       isActive ? activeClass : inactiveClass
                     }`}
                   >
                     {line}
                   </button>
                 )
               })}
            </div>
          </div>

          {/* Departures List */}
          <div>
             {/* Clean simple day header */}
             <div className="flex justify-between items-center mb-3 px-1">
               <div className="text-xs font-extrabold text-slate-400 tracking-wider uppercase">
                 {days.find(d => d.key === selectedDay)?.weekday}, {days.find(d => d.key === selectedDay)?.dayNum} {days.find(d => d.key === selectedDay)?.monthName}
               </div>
             </div>

             <div className="hidden flex-col gap-2.5 mb-3 px-1">
               <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                 <div className="text-xs font-extrabold text-slate-400 tracking-wider uppercase">
                   {days.find(d => d.key === selectedDay)?.weekday}, {days.find(d => d.key === selectedDay)?.dayNum} {days.find(d => d.key === selectedDay)?.monthName}
                 </div>
                 
                 <div className="flex items-center gap-2">
                   {/* Live/Offline Status Badge */}
                   <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-300 border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.15)]">
                     <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                     <span>Dane Rzeczywiste ITS</span>
                   </div>

                   {/* Refresh Button */}
                   <button 
                     onClick={refreshLiveDepartures}
                     disabled={isFetchingLive}
                     title="Odśwież rozkład czasu rzeczywistego"
                     className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 hover:border-white/10 active:scale-95 transition-all shadow-md cursor-pointer shrink-0 disabled:opacity-50"
                   >
                     <RefreshCw size={12} className={isFetchingLive ? "animate-spin text-teal-450" : ""} />
                   </button>
                 </div>
               </div>

               {/* Past Departures Toggle Switch Row */}
               <div className="flex justify-between items-center py-2 px-3 rounded-xl bg-white/[0.01] border border-white/[0.03] text-xs">
                 <div className="flex flex-col">
                   <span className="font-extrabold text-slate-300">Pokaż minione odjazdy</span>
                   <span className="text-[10px] text-slate-500">Wyświetla kursy z całego dnia, które już się odbyły</span>
                 </div>
                 <button
                   onClick={() => {
                     setShowPastDepartures(!showPastDepartures);
                     if (!showPastDepartures) {
                       setShowAllDepartures(true);
                     }
                   }}
                   className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                     showPastDepartures ? 'bg-teal-500' : 'bg-slate-700'
                   }`}
                 >
                   <span
                     className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                       showPastDepartures ? 'translate-x-4' : 'translate-x-0'
                     }`}
                   />
                 </button>
               </div>
             </div>
              
             <motion.div layout className="bg-[#0b121e]/38 backdrop-blur-2xl rounded-2xl border border-white/[0.10] overflow-hidden shadow-xl">
                {isLoading ? (
                  <div className="space-y-1.5 animate-pulse p-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-white/[0.01] rounded-xl border border-white/[0.01]">
                        <div className="flex items-center space-x-3 w-2/3">
                          <div className="w-11 h-8 bg-white/5 rounded-xl"></div>
                          <div className="flex-1 space-y-1.5">
                            <div className="h-3.5 bg-white/5 rounded w-3/4"></div>
                            <div className="h-2.5 bg-white/5 rounded w-1/2"></div>
                          </div>
                        </div>
                        <div className="w-10 h-5 bg-white/5 rounded-lg"></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <AnimatePresence mode="popLayout">
                  {displayedDepartures.map((dep, idx) => {
                    const isPast = (dep as any).isPast;
                    const departureTimeLabel = formatDepartureTime(dep);
                    return (
                      <motion.div 
                        layout="position"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: isPast ? 0.45 : 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.18, delay: Math.min(idx * 0.05, 0.3) }}
                        key={dep.id} 
                        className={`flex items-center justify-between p-3 sm:p-4 ${idx !== displayedDepartures.length - 1 ? 'border-b border-white/[0.03]' : ''} hover:bg-white/[0.02] transition-colors cursor-pointer ${isPast ? 'bg-black/15' : ''}`}
                      >
                        {/* Left Side: Line Badge & Directions */}
                        <div className="flex items-center min-w-0 flex-1 mr-2 sm:mr-3">
                          {/* Line Badge */}
                          <div className={`w-10 sm:w-11 py-1.5 rounded-xl font-extrabold text-center shrink-0 border text-xs shadow-sm ${
                            isPast 
                              ? 'bg-slate-500/5 text-slate-500 border-slate-500/10' 
                              : getLineStyle(dep.line)
                          }`}>
                            {dep.line}
                          </div>
                           
                          {/* Direction Info */}
                          <div className="ml-2.5 sm:ml-3 flex-1 min-w-0">
                             <div className="flex flex-wrap items-center gap-1.5">
                               <h4 className={`font-extrabold truncate text-[13px] sm:text-[15px] ${isPast ? 'text-slate-500 line-through font-normal' : 'text-white'}`}>{dep.direction}</h4>
                               {isPast && (
                                 <span className="px-1.5 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20 text-[8px] font-black tracking-wider uppercase leading-none scale-90">
                                   Odjechał
                                 </span>
                                )}
                             </div>
                             {dep.vehicleDesc && (
                               <div className="flex items-center text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">
                                 <Navigation size={9} className={`mr-1 rotate-[135deg] shrink-0 ${isPast ? 'text-slate-500' : dep.carrier?.colorClass || 'text-teal-400'}`} />
                                 {dep.vehicleDesc}
                               </div>
                             )}
                          </div>
                        </div>
                        
                        {/* Right Side: Departure Time & Delayed/On-time Badge */}
                        <div className="min-w-[4.4rem] text-right shrink-0 flex flex-col items-end pl-1.5 sm:pl-2">
                           <div className={`font-black tracking-tight text-[15px] sm:text-[16px] ${isPast ? 'text-slate-500 line-through' : 'text-white'}`}>{departureTimeLabel}</div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {activeDepartures.length === 0 && (
                  <div className="p-8 text-center text-slate-500 text-sm leading-relaxed">
                    Brak najbliższych odjazdów dla tej linii.
                  </div>
                )}
                
                {!showAllDepartures && activeDepartures.length > 5 && (
                  <button 
                    onClick={() => setShowAllDepartures(true)}
                    className="w-full py-4 text-xs font-bold text-slate-400 hover:text-white flex items-center justify-center gap-2 border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors uppercase tracking-wider cursor-pointer"
                  >
                    Pokaż wszystkie odjazdy ({activeDepartures.length})
                    <ChevronDown size={14} />
                  </button>
                )}
                  </>
                )}
             </motion.div>
          </div>

          {/* Lines serving stop */}
          <div className="pb-[calc(env(safe-area-inset-bottom)+9.5rem)] md:pb-6">
             <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3 ml-1">Linie obsługujące przystanek</h3>
             <div className="flex flex-wrap gap-2">
               {combinedLines.map(line => (
                  <div key={line} className={`px-4 py-2 rounded-xl border font-bold text-[13px] transition-all duration-300 hover:opacity-80 ${getLineStyle(line)}`}>
                    {line}
                  </div>
               ))}
             </div>
          </div>

        </div>
      </div>
    </motion.div>
  );
}
