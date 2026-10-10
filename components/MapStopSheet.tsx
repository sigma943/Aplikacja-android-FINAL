'use client';

import {displayStopLabel} from '@/lib/stop-label';
import { Clock, ChevronUp } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {useEffect,useState} from 'react';
import {useSheetGesture,SHEET_SPRING} from '@/lib/use-sheet-gesture';

export interface MapStopDeparture {
  id: string;
  line: string;
  direction: string;
  carrierName?:string;
  color: string;
  time: string;
  day: string;
  delayMinutes: number;
}

interface Props {
  preview?:boolean;
  name: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  transparent: boolean;
  dark: boolean;
  loading: boolean;
  error: string | null;
  departures: MapStopDeparture[];
}

export default function MapStopSheet({ preview=false,name, expanded, onExpandedChange, transparent, dark, loading, error, departures }: Props) {
  const reduceMotion = useReducedMotion();
  const next = departures[0];
  const [full,setFull]=useState(320);
  useEffect(()=>{const measure=()=>setFull(preview?280:Math.max(84,Math.min(innerHeight*.42,380)));measure();window.addEventListener('resize',measure);return()=>window.removeEventListener('resize',measure);},[preview]);
  const drag=useSheetGesture(expanded,onExpandedChange,84,full);
  return (
    <motion.section
      aria-label="Przystanek na mapie"
      data-map-stop-sheet={preview?undefined:true}
      data-expanded={expanded}
      data-glass={transparent ? 'on' : 'off'}
      data-ui-mode={dark ? 'dark' : 'light'}
      initial={reduceMotion||preview ? false : { y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={reduceMotion ? {duration: 0} : SHEET_SPRING}
      className="map-stop-sheet map-detail-shell absolute bottom-[calc(64px+env(safe-area-inset-bottom))] left-2 right-2 z-40 flex min-h-0 flex-col overflow-hidden rounded-[24px] border md:bottom-4 md:left-4 md:right-auto md:w-[380px]"
      style={{height:drag.height}}
    >
      <motion.button
        type="button"
        aria-label={expanded ? 'Zwiń panel przystanku' : 'Rozwiń panel przystanku'}
        aria-expanded={expanded}
        aria-controls={preview?'preview-stop-departures':'map-stop-departures'}
        {...drag.handle}
        className="map-stop-handle relative w-full shrink-0 px-4 pb-3 pt-3 text-left touch-none"
      >
        <span className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-bold tracking-tight">{displayStopLabel(name)}</span>
            <span className="map-detail-muted mt-1 block truncate text-xs">
              {loading ? 'Pobieranie odjazdów…' : next ? `${next.line} · ${next.direction} · ${next.time}` : 'Odjazdy z tego przystanku'}
            </span>
          </span>
          <ChevronUp size={18} className={`map-detail-muted shrink-0 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </motion.button>
      {(expanded || drag.dragging) && (
        <div id={preview?'preview-stop-departures':'map-stop-departures'} className="map-stop-departures min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 touch-pan-y custom-scrollbar">
          <div className="map-detail-muted flex items-center gap-2 px-1 py-2 text-[10px] font-bold uppercase tracking-[0.15em]"><Clock size={13} /> Najbliższe odjazdy</div>
          {error && <p role="alert" className="mb-2 rounded-xl bg-amber-500/10 p-2 text-xs text-amber-500">{error}</p>}
          {loading ? <div className="map-detail-muted py-6 text-center text-sm" role="status">Pobieranie rozkładu…</div> : !departures.length ? <p className="map-detail-muted py-5 text-center text-sm">{error ? 'Rozkład niedostępny' : 'Brak najbliższych odjazdów'}</p> : departures.map((departure, index) => (
            <div key={departure.id}>
              {departure.day && departure.day !== departures[index - 1]?.day && <p className="map-detail-muted px-1 pb-2 pt-3 text-[10px] font-bold uppercase tracking-wide">{departure.day}</p>}
              <div data-departure-row className="map-detail-row mb-2 flex items-center gap-3 rounded-2xl border p-3">
                <span className="flex min-w-10 shrink-0 items-center justify-center rounded-xl border px-2 py-2 text-xs font-black" style={{ color: departure.color, borderColor: `${departure.color}40`, backgroundColor: `${departure.color}18` }}>{departure.line}</span>
                <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">{departure.direction}</span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-bold tabular-nums">{departure.time}</span>
                  {departure.delayMinutes !== 0 && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${departure.delayMinutes > 0 ? 'bg-rose-500/15 text-rose-400' : 'bg-emerald-500/15 text-emerald-400'}`}>{departure.delayMinutes > 0 ? '+' : ''}{departure.delayMinutes} min</span>}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.section>
  );
}
