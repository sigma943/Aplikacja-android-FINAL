'use client';

import type {CSSProperties, Dispatch, RefObject, SetStateAction} from 'react';
import {motion, AnimatePresence} from 'motion/react';
import {Navigation, Clock, MapPin} from 'lucide-react';
import {SHEET_SPRING, type useSheetGesture} from '@/lib/use-sheet-gesture';
import type {Vehicle, StopSchedule} from '@/lib/transport/vehicle';
import {normalizeVehicleText, getVehicleDisplayNumber} from '@/lib/home/vehicle-display';
import {busPunctuality} from '@/lib/bus-punctuality';
import {vehicleStopDeparture} from '@/lib/vehicle-stop-timing';
import {punctualityTimeClass} from '@/lib/punctuality-color';
import {displayStopLabel} from '@/lib/stop-label';

interface BusDetailsPanelProps {
  selectedBus: Vehicle;
  busDrag: ReturnType<typeof useSheetGesture>;
  busHeaderRef: RefObject<HTMLDivElement | null>;
  isBusPanelExpanded: boolean;
  setIsBusPanelExpanded: Dispatch<SetStateAction<boolean>>;
  transparentUI: boolean;
  isDark: boolean;
  mapDetailPanel: string;
  mapDetailContent: string;
  mapDetailCard: string;
  mapDetailDivider: string;
  mapDetailLine: string;
  selectedBusHeaderStyle: CSSProperties;
  selectedVehicleIsTrain: boolean;
  selectedBusStatusLabel: string | null;
  selectedBusGpsSignalClock: string | null;
  breakCountdownLabel: string | null;
  selectedBusIsWaitingForDeparture: boolean;
  selectedBusScheduleLoading: boolean;
  selectedBusDisplayedStops: StopSchedule[];
  selectedStopId: string | null;
  selectedVehicleColor: string;
  textSub: string;
  textMain: string;
  themeColor: string;
  openVehicleRouteStop: (id: string) => void;
  formatScheduleStopName: (name: string) => string;
}

export default function BusDetailsPanel({selectedBus, busDrag, busHeaderRef, isBusPanelExpanded, setIsBusPanelExpanded, transparentUI, isDark, mapDetailPanel, mapDetailContent, mapDetailCard, mapDetailDivider, mapDetailLine, selectedBusHeaderStyle, selectedVehicleIsTrain, selectedBusStatusLabel, selectedBusGpsSignalClock, breakCountdownLabel, selectedBusIsWaitingForDeparture, selectedBusScheduleLoading, selectedBusDisplayedStops, selectedStopId, selectedVehicleColor, textSub, textMain, themeColor, openVehicleRouteStop, formatScheduleStopName}: BusDetailsPanelProps) {
  return (
    <motion.div
                  key="bus-panel-map"
                  style={{height:busDrag.height}}
                  data-map-bus-sheet
                  data-expanded={isBusPanelExpanded}
                  data-glass={transparentUI ? 'on' : 'off'}
                  data-ui-mode={isDark ? 'dark' : 'light'}
                  initial={{ y: "100%", opacity: 0.5 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: "100%", opacity: 0.5 }}
                  transition={SHEET_SPRING}
                  className={`absolute bottom-[calc(64px+env(safe-area-inset-bottom))] left-0 right-0 md:bottom-4 md:left-4 md:right-auto md:w-[400px] rounded-t-3xl md:rounded-3xl border-t border-l border-r md:border z-50 overflow-hidden flex flex-col max-h-[calc(60vh-32px)] md:max-h-[85vh] md:mb-0 ${mapDetailPanel}`}
                >
                  <motion.div 
                     ref={busHeaderRef}
                     role="button"
                     tabIndex={0}
                     aria-label={isBusPanelExpanded ? 'Zwiń panel autobusu' : 'Rozwiń panel autobusu'}
                     aria-expanded={isBusPanelExpanded}
                     onKeyDown={event => {if (event.key === 'Enter' || event.key === ' ') {event.preventDefault();setIsBusPanelExpanded(value => !value);}}}
                     className="p-3 pb-5 md:p-6 md:pb-8 text-white relative shrink-0 cursor-pointer touch-none overflow-hidden" 
                     style={selectedBusHeaderStyle}
                     {...busDrag.handle}
                  >
                     <div 
                        className="w-12 h-1.5 rounded-full bg-white/40 hover:bg-white/60 mx-auto mb-3 transition-colors"
                     />
                     
                     <div className="flex items-baseline gap-2 mb-1 md:mb-1.5">
                        <span className="text-3xl md:text-5xl font-black tracking-tighter drop-shadow-sm">{selectedBus.routeShortName || '-'}</span>
                        <span className="uppercase tracking-widest text-[10px] md:text-xs font-bold text-white/90">{selectedVehicleIsTrain ? 'Pociag' : 'Linia'}</span>
                     </div>
                     <div className="pr-12 relative z-20 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm md:text-[17px] font-medium leading-tight opacity-100 drop-shadow-sm">
                       <h2 className="min-w-0">
                         {selectedVehicleIsTrain ? 'Relacja' : 'Kierunek'}: <span className="font-bold">{normalizeVehicleText(selectedBus.direction) || 'Nieustalony'}</span>
                       </h2>
                       {selectedBus.provider === 'marcel' && selectedBusStatusLabel && (
                         <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] md:text-[11px] font-black leading-none tracking-wide ${selectedBus.status === 'break' ? 'bg-amber-400 text-slate-950' : selectedBus.status === 'cached' ? 'bg-white/20 text-white' : selectedBus.status === 'technical' ? 'bg-indigo-500/80 text-white' : 'bg-white/[0.18] text-white'}`}>
                           {normalizeVehicleText(selectedBusStatusLabel)}
                         </span>
                       )}
                     </div>
                     <h3 className="text-[10px] md:text-xs font-medium leading-tight opacity-90 drop-shadow-sm mt-0.5 md:mt-1 relative z-20 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {getVehicleDisplayNumber(selectedBus) && (
                          <span className="text-white/80 uppercase tracking-[0.18em] font-semibold">
                            {selectedVehicleIsTrain ? 'Nr pociagu' : 'Nr pojazdu'}: {getVehicleDisplayNumber(selectedBus)}
                          </span>
                        )}
                        {selectedBus.provider !== 'marcel' && selectedBusStatusLabel && (
                          <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-black leading-none tracking-wide ${selectedBus.status === 'break' ? 'bg-amber-400 text-slate-950' : selectedBus.status === 'cached' ? 'bg-white/20 text-white' : selectedBus.status === 'technical' ? 'bg-indigo-500/80 text-white' : 'bg-white/[0.18] text-white'}`}>
                            {normalizeVehicleText(selectedBusStatusLabel)}
                          </span>
                        )}
                        {selectedBus.model && (
                          <span className="basis-full text-[12px] md:text-sm font-semibold leading-tight text-white/95">Model: {selectedBus.model}</span>
                        )}
                        {selectedVehicleIsTrain && selectedBusGpsSignalClock && (
                          <span className="basis-full text-[10px] md:text-xs font-semibold leading-tight text-white/85">
                            Ostatnia aktualizacja: <span className="font-black text-white">{selectedBusGpsSignalClock}</span>
                          </span>
                        )}
                        {((!selectedVehicleIsTrain && selectedBusGpsSignalClock) || (selectedBus.status === 'break' && breakCountdownLabel)) && (
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
                    {(isBusPanelExpanded || busDrag.dragging) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 35 }}
                        className="flex flex-1 flex-col min-h-0 overflow-hidden"
                      >
                        <div className={`p-2.5 md:p-4 flex flex-col gap-2.5 md:gap-4 overflow-y-auto mt-1.5 md:mt-2 rounded-t-xl md:rounded-t-2xl relative z-10 ${mapDetailContent}`}>
                        <div className="grid grid-cols-2 gap-2 md:gap-4 shrink-0">
                        <div className={`flex flex-col justify-center p-2.5 md:p-3 rounded-xl md:rounded-2xl border ${mapDetailCard} ${selectedBusIsWaitingForDeparture ? 'col-span-2' : ''}`}>
                           <div className={`flex items-center gap-1.5 md:gap-2 text-[9px] md:text-[10px] font-bold uppercase tracking-wider mb-0.5 md:mb-1 ${textSub}`}>
                              <Navigation className="w-3 h-3 md:w-3.5 md:h-3.5" /> Prędkość
                           </div>
                           <span className={`text-base md:text-lg font-medium tracking-tight ${textMain}`}>
                              {selectedVehicleIsTrain
                                ? (Number.isFinite(selectedBus.speed)
                                    ? `${Math.round(selectedBus.speed || 0)} km/h`
                                    : 'Brak danych')
                                : Number.isFinite(selectedBus.speed)
                                  ? `${Math.round(selectedBus.speed || 0)} km/h`
                                  : 'Brak danych'}
                           </span>
                        </div>
                        
                        {!selectedBusIsWaitingForDeparture && (
                        <div className={`flex flex-col justify-center p-2.5 md:p-3 rounded-xl md:rounded-2xl border ${mapDetailCard}`}>
                              <div className={`flex items-center gap-1.5 md:gap-2 text-[9px] md:text-[10px] font-bold uppercase tracking-wider mb-0.5 md:mb-1 ${textSub}`}>
                                 <Clock className="w-3 h-3 md:w-3.5 md:h-3.5" /> Punktualność
                              </div>
                              {(() => {
                                 const punctuality = busPunctuality(selectedBus.delay || 0, textMain);
                                 const m = punctuality.minutes;
                                 if (punctuality.status === 'on_time') return (
                                   <div className={`flex flex-col items-start ${punctuality.colorClass}`}>
                                     <span className="text-sm md:text-base font-bold leading-tight">Zgodnie z planem</span>
                                   </div>
                                 );
                                 if (punctuality.status === 'early') return (
                                   <div className={`flex flex-col items-start ${punctuality.colorClass}`}>
                                     <div className="flex items-baseline gap-1">
                                       <span className="text-xl font-bold leading-none">{m}</span>
                                       <span className="text-sm font-medium">min</span>
                                     </div>
                                     <span className="text-[10px] font-bold uppercase tracking-wider mt-1 opacity-90">Przed czasem</span>
                                   </div>
                                 );
                                 return (
                                   <div className={`flex flex-col items-start ${punctuality.colorClass}`}>
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
                      
                      {(selectedBusScheduleLoading || selectedBusDisplayedStops.length > 0) && (
                       <div className={`flex flex-col gap-2 mt-1 border-t pt-4 ${mapDetailDivider}`}>
                          <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${textSub}`}>
                            <MapPin className="w-4 h-4" /> {selectedVehicleIsTrain ? 'Wszystkie przystanki trasy' : 'Następne przystanki'}
                          </h3>
                          <div className="flex flex-col gap-0 relative">
                             <div className={`absolute left-[9px] top-4 bottom-4 w-0.5 ${mapDetailLine}`}></div>
                             {selectedBusScheduleLoading ? (
                                [0, 1, 2].map((idx) => (
                                  <div key={`mpk-stops-loading-${idx}`} className="flex items-start gap-4 py-2 relative z-10 px-2 -mx-2">
                                     <div className="w-5 h-5 rounded-full border-4 shrink-0 mt-0.5 shadow-sm animate-pulse" style={{ backgroundColor: themeColor, borderColor: isDark ? 'rgba(15,23,42,0.8)' : 'rgba(255,255,255,0.85)' }}></div>
                                     <div className={`flex flex-col flex-1 pb-2 border-b ${mapDetailDivider}`}>
                                        <div className={`h-3.5 w-36 rounded-full animate-pulse ${isDark ? 'bg-white/12' : 'bg-slate-200'}`}></div>
                                        <div className={`mt-2 h-2.5 w-16 rounded-full animate-pulse ${isDark ? 'bg-white/8' : 'bg-slate-100'}`}></div>
                                     </div>
                                  </div>
                                ))
                             ) : selectedBusDisplayedStops.map((sch: any, idx: number) => {
                                const timing = vehicleStopDeparture(selectedBus,sch);
                                const timeStr = timing.time;
                                const timeClass = punctualityTimeClass(timing.delayMins,textMain);
                                const isHighlighted = sch.id?.toString() === selectedStopId;
                                const isPastStop = Boolean(sch.isPast) || Boolean(selectedBus.lastStopId && sch.id === selectedBus.lastStopId);
                                return (
                                  <div 
                                     key={`${sch.id || idx}-${idx}`} 
                                     data-route-stop-id={sch.id}
                                     onClick={() => {
                                       if (sch.id) {
                                         openVehicleRouteStop(sch.id.toString());
                                       }
                                     }}
                                     className={`flex items-start gap-4 py-2 relative z-10 cursor-pointer transition-colors hover:bg-slate-500/10 rounded-xl px-2 -mx-2 ${isHighlighted ? (isDark ? 'bg-amber-500/20' : 'bg-amber-100') : ''} ${isPastStop ? 'opacity-50' : ''}`}
                                  >
                                     <div className={`w-5 h-5 rounded-full border-4 shrink-0 mt-0.5 shadow-sm leading-none transition-colors ${isHighlighted ? 'border-red-500' : (isDark ? 'border-slate-800/80' : 'border-white/85')}`} style={{ backgroundColor: isHighlighted ? selectedVehicleColor : (isPastStop ? '#94a3b8' : selectedVehicleColor) }}></div>
                                     <div className={`flex flex-col flex-1 pb-2 border-b ${mapDetailDivider} ${isHighlighted ? 'border-transparent' : ''}`}>
                                        <span className={`text-[13px] font-semibold leading-tight pr-2 ${textMain}`}>{displayStopLabel(formatScheduleStopName(sch.name))}</span>
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
  );
}
