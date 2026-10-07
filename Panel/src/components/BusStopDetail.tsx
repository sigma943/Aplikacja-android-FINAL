import {syncStopWidgets} from '../../../lib/stop-widget';
import GenerateStopWidget from '../../../components/widgets/GenerateStopWidget';
import {useForegroundRefresh} from '../../../lib/use-foreground-refresh';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, MapPin, LayoutGrid, Star, Navigation, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useStopDepartures, type DepartureLoader } from './useStopDepartures';
import { warsawDateIso, warsawTimeMs } from '../../../lib/transit-time';
import { departureIsPast, departureCountdown } from '../../../lib/departure-display';
import { Stop, Departure } from '../types';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { getLineStyle } from '../utils/lineStyles';
import type { Vehicle } from '../../../components/BusMap';
import { departureFromLiveVehicle } from '../../../lib/vehicle-stop-timing';

interface BusStopDetailProps {
  stop: Stop;
  onBack: () => void;
  toggleFavorite: (stopId: string) => void;
  loadDepartures: DepartureLoader;
  vehicles?: Vehicle[];
  onShowOnMap?: (stop: Stop) => void;
  isDarkTheme?: boolean;
  active?: boolean;
}

function getDynamicDays() {
  const weekdaysPl = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
  const labelsPl = ['Nie', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'];
  
  const days = [];
  const now = new Date(warsawDateIso()+'T12:00:00Z');
  
  for (let i = 0; i < 7; i++) {
    const futureDate = new Date(now);
    futureDate.setUTCDate(now.getUTCDate() + i);
    
    const dayName = weekdaysPl[futureDate.getUTCDay()];
    let label = labelsPl[futureDate.getUTCDay()];
    if (i === 0) label = 'Dziś';
    if (i === 1) label = 'Jutro';
    
    const weekdayKeys: Record<number, string> = {
      0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat'
    };
    const key = i === 0 ? 'today' : i === 1 ? 'tomorrow' : weekdayKeys[futureDate.getUTCDay()];
    
    days.push({
      label,
      dayNum: String(futureDate.getUTCDate()),
      weekday: dayName,
      key,
      monthName: futureDate.toLocaleDateString('pl-PL', { day:'numeric', month: 'long',timeZone:'UTC' }).replace(/^\d+\s+/,''),
      monthYear: futureDate.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })
    });
  }
  return days;
}

export default function BusStopDetail({ stop, onBack, toggleFavorite, loadDepartures, vehicles = [], onShowOnMap, isDarkTheme = true, active = true }: BusStopDetailProps) {
  const [showWidget,setShowWidget]=useState(false);
  const todayKey = warsawDateIso();
  const days = useMemo(getDynamicDays,[todayKey]);
  const [selectedLine, setSelectedLine] = useState<string>('all');
  const [showAllDepartures, setShowAllDepartures] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>('today');
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const selectedDayIndex = Math.max(0,days.findIndex(d=>d.key===selectedDay));
  const selectedDateKey = warsawDateIso(selectedDayIndex);
  const {departures: scheduledDepartures,warnings,isLoading} = useStopDepartures(stop,selectedDayIndex,selectedDateKey,loadDepartures,active);
  const departures = useMemo(() => scheduledDepartures
    .map(departure => departureFromLiveVehicle(departure, vehicles))
    .sort((a, b) => (a.realAtMs ?? a.plannedAtMs ?? 0) - (b.realAtMs ?? b.plannedAtMs ?? 0)), [scheduledDepartures, vehicles]);
  useEffect(()=>{if(active&&selectedDayIndex===0&&!isLoading&&(!warnings.length||departures.length))void syncStopWidgets(stop.id,departures,vehicles,warnings).catch(()=>{});},[stop.id,departures,vehicles,warnings,isLoading,active,selectedDayIndex]);
  const reduceMotion = useReducedMotion();
  const animateDepartures = !reduceMotion && !showAllDepartures;

  useForegroundRefresh(stop.id+':clock',async()=>{setCurrentTimeMs(Date.now());},1000,active);

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

  const stopLines = stop.lines || [];
  const uniqueLinesFromDeps = Array.from(new Set(departures.map(d => d.line))).filter(Boolean);
  const combinedLines = Array.from(new Set([...stopLines, ...uniqueLinesFromDeps])).filter(Boolean);
  const lines = ['Wszystkie', ...combinedLines.filter(l => l !== 'Wszystkie')];
  const lineProviderIds = useMemo(() => {
    const map = new Map<string, string>(Object.entries(stop.lineProviders || {}).map(([line,providers])=>[line,providers[0]]));
    if (stop.carriers.length === 1) {
      stopLines.forEach((line) => map.set(line, stop.carriers[0].id));
    }
    departures.forEach((departure) => {
      if (departure.carrier?.id) map.set(departure.line, departure.carrier.id);
    });
    return map;
  }, [departures, stop.carriers, stop.lineProviders, stopLines]);

  const timedDepartures = useMemo(() => departures.map(d => ({
    ...d, fallbackAtMs: d.plannedAtMs ?? warsawTimeMs(selectedDateKey,d.time),
  })), [departures, selectedDateKey]);
  const processedDepartures = timedDepartures.map(d => ({...d,
    isPast: selectedDayIndex===0 && currentTimeMs>0 && departureIsPast(d,currentTimeMs,d.fallbackAtMs)
  }));

  const filteredDeparturesByLine = processedDepartures.filter(d => {
    if (!selectedLine || selectedLine === 'all') return true;
    return d.line === selectedLine;
  });

  const activeDepartures = filteredDeparturesByLine.filter(d => !d.isPast);
  const displayedDepartures = showAllDepartures ? activeDepartures : activeDepartures.slice(0, 5);
  const panelShellClass = isDarkTheme ? 'text-slate-200' : 'text-slate-900';
  const headerShellClass = 'transit-surface';
  const surfaceClass = 'transit-surface';
  const departuresCardClass = 'transit-card';
  const headingTextClass = isDarkTheme ? 'text-white' : 'text-slate-900';
  const mutedTextClass = isDarkTheme ? 'text-slate-400' : 'text-slate-600';
  const subtleTextClass = isDarkTheme ? 'text-slate-500' : 'text-slate-500';
  const headerGradientClass = 'transit-header-glow';
  const headerIconButtonClass = isDarkTheme
    ? 'text-white hover:bg-white/10 border-white/5 hover:border-white/10'
    : 'text-slate-700 hover:bg-slate-200/60 border-slate-300 hover:border-slate-400';
  const mapButtonClass = isDarkTheme
    ? 'bg-white/10 hover:bg-white/15 border-white/15 text-slate-100'
    : 'bg-white/70 hover:bg-white border-slate-300 text-slate-700';
  const dayInactiveClass = isDarkTheme
    ? 'bg-[#121f31]/40 text-slate-400 border-white/[0.03] hover:bg-white/[0.04] hover:text-slate-200'
    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-white hover:text-slate-800';
  const dayActiveClass = 'ui-accent-soft';
  const rowClass = isDarkTheme
    ? 'hover:bg-white/[0.02]'
    : 'hover:bg-slate-100/65';
  const rowBorderClass = isDarkTheme ? 'border-white/[0.03]' : 'border-slate-200/95';
  const skeletonRowClass = isDarkTheme
    ? 'bg-white/[0.01] border-white/[0.01]'
    : 'bg-slate-100/85 border-slate-200';
  const skeletonBlockClass = isDarkTheme ? 'bg-white/5' : 'bg-slate-200';
  const formatDepartureTime = (departure: Departure) => {
    if (selectedDay !== 'today') return departure.time;
    if (!currentTimeMs) return departure.time;
    return departureCountdown(departure, currentTimeMs);
  };

  return (
    <motion.div 
      initial={reduceMotion ? false : { opacity: 0, x: 15 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 15 }}
      transition={{ duration: reduceMotion ? 0 : 0.5, ease: [0.25, 0.1, 0.25, 1] }}
      data-ui-mode={isDarkTheme ? "dark" : "light"}
      className={`transit-view h-full min-h-0 overflow-y-auto overscroll-contain font-sans pb-[calc(env(safe-area-inset-bottom)+5rem)] md:pb-5 backdrop-blur-2xl backdrop-saturate-150 ${panelShellClass}`}
    >
      <div className="w-full max-w-3xl min-w-0 mx-auto">
        {/* Header */}
        <div className={`relative mx-3 mt-3 rounded-[24px] border p-3.5 lg:mx-8 lg:p-5 overflow-hidden backdrop-blur-2xl ${headerShellClass}`}>
          {/* Subtle background gradient */}
          <div className={`absolute top-0 right-0 w-full h-full ${headerGradientClass}`}></div>
          
          {/* Top bar */}
          <div className="flex justify-between items-center mb-3 relative z-10 w-full">
            <button aria-label="Wróć do listy przystanków" onClick={onBack} className={`ui-accent-focus flex h-10 w-10 items-center justify-center rounded-xl border border-current/10 transition-colors flex-shrink-0 ${isDarkTheme ? 'text-white hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200/60'}`}>
              <ArrowLeft size={22} />
            </button>
            
            <div className="flex items-center ml-auto gap-2">
              <button
                aria-label="Pokaż przystanek na mapie"
                onClick={() => onShowOnMap?.(stop)}
                disabled={!onShowOnMap}
                className={`flex flex-shrink-0 items-center justify-center gap-1.5 h-10 px-3 rounded-xl border text-[11px] font-semibold transition-colors cursor-pointer active:scale-95 leading-none ui-accent-focus font-sans backdrop-blur-xl disabled:cursor-not-allowed disabled:opacity-40 ${mapButtonClass}`}
              >
                <MapPin size={13} className="ui-accent-text" />
                <span>Pokaż na mapie</span>
              </button>
              <button aria-label="Generuj widżet przystanku" onClick={()=>setShowWidget(true)} className={`ui-accent-focus ui-accent-text w-10 h-10 flex items-center justify-center rounded-xl border flex-shrink-0 ${mapButtonClass}`}><LayoutGrid size={19}/></button>
              <button 
                aria-label={stop.isFavorite ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
                onClick={() => toggleFavorite(stop.id)} 
                className={`ui-accent-focus w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 flex-shrink-0 cursor-pointer active:scale-90 border ${headerIconButtonClass}`}
              >
                <Star size={16} className={stop.isFavorite ? 'ui-accent-fill' : 'text-slate-400'} />
              </button>
            </div>
          </div>

          {/* Stop Info */}
          <div className="relative z-10">
            <h1 className={`text-xl sm:text-2xl lg:text-3xl font-semibold mb-2 tracking-tight leading-tight break-words ${headingTextClass}`}>{stop.name}</h1>
            
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

        <div className="px-3 lg:px-8 mt-3 space-y-4 relative z-10">
          
          {/* Calendar Picker Swipable 7-Day Row */}
          <div className={`relative rounded-[22px] p-3 border backdrop-blur-2xl ${surfaceClass}`}>
            <div className="flex justify-between items-center mb-2 px-1">
              <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-widest font-sans">Dzień odjazdu</h3>
              <span className="ui-accent-soft text-[10px] font-medium px-2 py-1 rounded-lg border capitalize">
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
                    aria-pressed={isSelected}
                    data-selected={isSelected}
                    className={`ui-accent-focus min-h-14 min-w-[3.5rem] flex-shrink-0 snap-start flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer border ${
                      isSelected ? dayActiveClass : dayInactiveClass
                    }`}
                  >
                    <span className={`text-[10px] uppercase font-extrabold ${isSelected ? 'ui-accent-text' : mutedTextClass}`}>
                      {day.label}
                    </span>
                    <span className={`text-[16px] font-semibold ${isSelected ? (isDarkTheme ? 'text-white' : 'text-slate-900') : (isDarkTheme ? 'text-slate-300' : 'text-slate-700')}`}>
                      {day.dayNum}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Line Filter */}
          <div className="relative">
            <h3 className={`text-[11px] font-semibold uppercase tracking-[0.12em] mb-2 ml-1 ${mutedTextClass}`}>Linie</h3>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 px-1 snap-x">
               {lines.map(line => {
                 const value = (line === 'Wszystkie' ? 'all' : line) as string;
                 const isActive = selectedLine === value;
                 
                 const activeClass = 'ui-accent-solid';
                 const inactiveClass = value === 'all'
                   ? (isDarkTheme ? 'bg-white/5 text-slate-300 border-white/10' : 'bg-white text-slate-700 border-slate-200')
                   : `${getLineStyle(value, lineProviderIds.get(value))} hover:opacity-80`;

                 return (
                   <button
                     key={line}
                     aria-pressed={isActive}
                     onClick={() => setSelectedLine(value)}
                     className={`ui-accent-focus h-10 flex-shrink-0 snap-start px-3.5 rounded-xl text-[12px] font-semibold transition-colors border cursor-pointer ${
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
             {warnings.length > 0 && <div role="alert" className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-500">{warnings.join(' ')}</div>}
             <div className="flex flex-col gap-2.5 mb-3 px-1">
               <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                 <div className="text-xs font-medium text-slate-400">
                   {days.find(d => d.key === selectedDay)?.weekday}, {days.find(d => d.key === selectedDay)?.dayNum} {days.find(d => d.key === selectedDay)?.monthName}
                 </div>
                 
               </div>
             </div>
              
             <motion.div layout className={`backdrop-blur-2xl rounded-[22px] border overflow-hidden ${departuresCardClass}`}>
                {isLoading ? (
                  <div className="space-y-1.5 animate-pulse p-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${skeletonRowClass}`}>
                        <div className="flex items-center space-x-3 w-2/3">
                          <div className={`w-11 h-8 rounded-xl ${skeletonBlockClass}`}></div>
                          <div className="flex-1 space-y-1.5">
                            <div className={`h-3.5 rounded w-3/4 ${skeletonBlockClass}`}></div>
                            <div className={`h-2.5 rounded w-1/2 ${skeletonBlockClass}`}></div>
                          </div>
                        </div>
                        <div className={`w-10 h-5 rounded-lg ${skeletonBlockClass}`}></div>
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
                        layout={animateDepartures ? "position" : false}
                        initial={animateDepartures ? { opacity: 0, y: 8 } : false}
                        animate={animateDepartures ? { opacity: isPast ? 0.45 : 1, y: 0 } : { opacity: isPast ? 0.45 : 1, y: 0 }}
                        exit={animateDepartures ? { opacity: 0, scale: 0.98 } : undefined}
                        transition={animateDepartures ? { duration: 0.3, delay: Math.min(idx * 0.06, 0.3) } : { duration: 0 }}
                        key={dep.id} 
                        className={`flex items-center justify-between p-3 sm:p-4 ${idx !== displayedDepartures.length - 1 ? `border-b ${rowBorderClass}` : ''} ${rowClass} transition-colors cursor-pointer ${isPast ? (isDarkTheme ? 'bg-black/15' : 'bg-slate-100/70') : ''}`}
                      >
                        {/* Left Side: Line Badge & Directions */}
                        <div className="flex items-center min-w-0 flex-1 mr-2 sm:mr-3">
                          {/* Line Badge */}
                          <div className={`w-10 sm:w-11 py-1.5 rounded-xl font-extrabold text-center shrink-0 border text-xs shadow-sm ${
                            isPast 
                              ? 'bg-slate-500/5 text-slate-500 border-slate-500/10' 
                              : getLineStyle(dep.line, dep.carrier?.id)
                          }`}>
                            {dep.line}
                          </div>
                           
                          {/* Direction Info */}
                          <div className="ml-2.5 sm:ml-3 flex-1 min-w-0">
                             <div className="flex flex-wrap items-center gap-1.5">
                               <h4 className={`font-semibold truncate text-[13px] sm:text-[15px] ${isPast ? 'text-slate-500 line-through font-normal' : headingTextClass}`}>{dep.direction}</h4>
                               {isPast && (
                                 <span className="px-1.5 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20 text-[8px] font-black tracking-wider uppercase leading-none scale-90">
                                   Odjechał
                                 </span>
                                )}
                             </div>
                             {dep.vehicleDesc && (
                               <div className={`flex items-center text-[10px] sm:text-[11px] mt-0.5 truncate ${mutedTextClass}`}>
                                 <Navigation size={9} className={`mr-1 rotate-[135deg] shrink-0 ${isPast ? 'text-slate-500' : dep.carrier?.colorClass || 'text-teal-400'}`} />
                                 {dep.vehicleDesc}
                               </div>
                             )}
                          </div>
                        </div>
                        
                        {/* Right Side: Departure Time & Delayed/On-time Badge */}
                        <div className="min-w-[4.4rem] text-right shrink-0 flex flex-col items-end pl-1.5 sm:pl-2">
                           <div className={`font-semibold tabular-nums tracking-tight text-[18px] sm:text-[19px] ${isPast ? 'text-slate-500 line-through' : headingTextClass}`}>{departureTimeLabel}</div>
                           {!isPast && dep.status === 'delayed' && Number.isFinite(dep.delayMins) && Math.abs(Number(dep.delayMins)) > 0 && (
                             <span className={`mt-1 rounded-full px-2 py-0.5 text-[10px] font-black leading-none ${
                               Number(dep.delayMins) > 0
                                 ? 'bg-rose-500/20 text-rose-300 border border-rose-400/35'
                                 : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/35'
                             }`}>
                               {(dep.delayEstimated || dep.realtimeSource === 'position-estimate') ? 'szac. ' : ''}{Number(dep.delayMins) > 0 ? `+${Math.abs(Number(dep.delayMins))} min` : `-${Math.abs(Number(dep.delayMins))} min`}
                             </span>
                           )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {activeDepartures.length === 0 && (
                  <div className={`p-8 text-center text-sm leading-relaxed ${subtleTextClass}`}>
                    {warnings.length ? 'Nie można potwierdzić pełnej listy odjazdów.' : filteredDeparturesByLine.length ? 'Wszystkie kursy na dziś już odjechały.' : selectedLine === 'all' ? 'Brak zaplanowanych odjazdów w wybranym dniu.' : 'Brak odjazdów wybranej linii w tym dniu.'}
                  </div>
                )}
                
                {!showAllDepartures && activeDepartures.length > 5 && (
                  <button 
                    onClick={() => setShowAllDepartures(true)}
                    className={`w-full py-4 text-xs font-bold flex items-center justify-center gap-2 border-t transition-colors uppercase tracking-wider cursor-pointer ${
                      isDarkTheme
                        ? 'text-slate-400 hover:text-white border-white/[0.04] hover:bg-white/[0.02]'
                        : 'text-slate-600 hover:text-slate-900 border-slate-200 hover:bg-slate-100/70'
                    }`}
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
          <div data-stop-lines>
             <h3 className={`text-[11px] font-semibold uppercase tracking-[0.12em] mb-2 ml-1 ${mutedTextClass}`}>Linie obsługujące przystanek</h3>
             <div className="flex flex-wrap gap-2">
               {combinedLines.map(line => (
                  <div key={line} className={`px-4 py-2 rounded-xl border font-bold text-[13px] transition-all duration-300 hover:opacity-80 ${getLineStyle(line, lineProviderIds.get(line))}`}>
                    {line}
                  </div>
               ))}
             </div>
          </div>

        </div>
      </div>
      {showWidget&&<GenerateStopWidget stop={stop} lines={combinedLines} departures={departures} vehicles={vehicles} dark={isDarkTheme} onClose={()=>setShowWidget(false)}/>}
    </motion.div>
  );
}
