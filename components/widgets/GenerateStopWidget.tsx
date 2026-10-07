'use client';
import {createPortal} from 'react-dom';
import {useEffect,useRef,useState} from 'react';
import {motion,useReducedMotion,useDragControls} from 'motion/react';
import {Check,LoaderCircle,Search} from 'lucide-react';
import type {Stop,Departure} from '@/Panel/src/types';
import type {Vehicle} from '@/components/BusMap';
import {useAppBack} from '@/lib/use-app-back';
import {canGenerateWidget,pinStopWidget,widgetPinStatus,type StopWidgetConfig} from '@/lib/stop-widget';
import {getLineStyle} from '@/Panel/src/utils/lineStyles';
export default function GenerateStopWidget({stop,lines,departures,vehicles,dark,onClose}:{stop:Stop;lines:string[];departures:Departure[];vehicles:Vehicle[];dark:boolean;onClose:()=>void}) {
  const [scope,setScope]=useState('all'),[selected,setSelected]=useState<string[]>(lines),[query,setQuery]=useState('');
  const [size,setSize]=useState<StopWidgetConfig['size']>('medium'),[theme,setTheme]=useState<StopWidgetConfig['theme']>('system');
  const [busy,setBusy]=useState(false),[token,setToken]=useState(''),[added,setAdded]=useState(false),[error,setError]=useState('');
  const root=useRef<HTMLDivElement>(null),reduce=useReducedMotion(),drag=useDragControls();
  useAppBack(true,()=>{onClose();return true;},100);
  useEffect(()=>{const previous=document.activeElement as HTMLElement; root.current?.focus();return()=>previous?.focus();},[]);
  useEffect(()=>{if(!token||added)return;const timer=setInterval(()=>{void widgetPinStatus(token).then(r=>{if(r.added)setAdded(true);}).catch(()=>{});},1000);return()=>clearInterval(timer);},[token,added]);
  const card='rounded-2xl border p-3 text-left transition-all ui-accent-focus';
  const choice=(active:boolean)=>active?'ui-accent-soft border-[var(--pks-accent)]':dark?'border-white/10 bg-white/5':'border-slate-200 bg-slate-100';
  async function generate(){setBusy(true);setError('');try{const r=await pinStopWidget({stop,lines:scope==='all'?null:selected,size,theme},departures,vehicles);setToken(r.token);}catch(e){setError(e instanceof Error?e.message:'Nie udało się dodać widżetu.');}finally{setBusy(false);}}
  return createPortal(<div className="fixed inset-0 z-[6000] flex items-end justify-center bg-black/50" onClick={onClose}>
    <motion.div drag="y" dragListener={false} dragControls={drag} dragConstraints={{top:0,bottom:0}} dragElastic={{top:0,bottom:.3}} onDragEnd={(_,info)=>{if(info.offset.y>90||info.velocity.y>650)onClose();}} ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="widget-title" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const items=root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input');if(items?.length){const first=items[0],last=items[items.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===root.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}}} initial={reduce?false:{y:80,opacity:0}} animate={{y:0,opacity:1}} transition={{duration:.25}} className={`transit-view transit-surface w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-[32px] border p-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] shadow-2xl ${dark?'bg-[#101e26] text-white':'bg-white text-slate-900'}`} data-ui-mode={dark?'dark':'light'}>
      <button style={{touchAction:'none'}} onPointerDown={e=>drag.start(e)} aria-label="Zamknij okno widżetu" onClick={onClose} className="mx-auto mb-5 block h-2 w-14 rounded-full bg-slate-400/70" />
      <h2 id="widget-title" className="text-xl font-bold mb-5">{added?'Widżet został dodany!':'Generuj widżet'}</h2>
      {added?<div className="text-center py-8"><Check size={64} className="ui-accent-text mx-auto mb-5"/><p>Widżet znajdziesz na ekranie głównym. Przytrzymaj go, aby zmienić rozmiar.</p><button onClick={onClose} className="ui-accent-solid mt-8 w-full rounded-2xl p-4 font-bold">OK</button></div>:<>
      <p className="mb-4 text-sm opacity-70">{stop.name}</p>
      <fieldset className="space-y-2 mb-5"><legend className="mb-2 font-semibold">Zakres linii</legend>{[['all','Wszystkie linie z tego przystanku'],['selected','Tylko wybrane linie']].map(([value,label])=><label key={value} className={`${card} ${choice(scope===value)} flex gap-3 items-center`}><input type="radio" name="widget-lines" checked={scope===value} onChange={()=>setScope(value)}/>{label}</label>)}</fieldset>
      {scope==='selected'&&<div className="mb-5"><label className="flex items-center gap-2 border border-current/15 rounded-xl p-3"><Search size={18}/><input aria-label="Wyszukaj linię" placeholder="Wyszukaj linię…" value={query} onChange={e=>setQuery(e.target.value)} className="bg-transparent w-full outline-none"/></label><div className="max-h-44 overflow-y-auto mt-2">{lines.filter(l=>l.toLowerCase().includes(query.toLowerCase())).map(line=><label key={line} className="flex items-center justify-between py-2 border-b border-current/10"><span className={`rounded-lg border px-3 py-1 font-bold ${getLineStyle(line,stop.lineProviders?.[line]?.[0])}`}>{line}</span><input type="checkbox" aria-label={`Linia ${line}`} checked={selected.includes(line)} onChange={()=>setSelected(old=>old.includes(line)?old.filter(l=>l!==line):[...old,line])}/></label>)}</div></div>}
      <fieldset className="mb-5"><legend className="font-semibold mb-2">Rozmiar / układ</legend><div className="grid grid-cols-3 gap-2">{(['small','medium','large'] as const).map((value,i)=><button key={value} aria-pressed={size===value} onClick={()=>setSize(value)} className={`${card} ${choice(size===value)} text-center text-sm`}><div className="mx-auto mb-2 rounded-lg bg-current/10 p-2 space-y-1">{Array.from({length:3+i},(_,j)=><div key={j} className="h-1 rounded bg-current/25"/>)}</div>{['Mały','Średni','Duży'][i]}<span className="block text-xs opacity-60">{['2 × 1','4 × 2','4 × 3'][i]}</span></button>)}</div></fieldset>
      <fieldset className="mb-5"><legend className="font-semibold mb-2">Motyw</legend><div className="grid grid-cols-3 gap-2">{(['system','light','dark'] as const).map((value,i)=><button key={value} aria-pressed={theme===value} onClick={()=>setTheme(value)} className={`${card} ${choice(theme===value)} text-center text-sm`}>{['Systemowy','Jasny','Ciemny'][i]}</button>)}</div></fieldset>
      <p className="text-xs opacity-60 mb-4">Rozmiar i liczba odjazdów dopasują się po zmianie wielkości widżetu na ekranie głównym.</p>
      {token&&<p role="status" className="ui-accent-soft rounded-xl p-3 mb-3 text-sm">Potwierdź dodanie na ekranie telefonu. Jeśli okno zostało zamknięte, możesz spróbować ponownie.</p>}
      {error&&<p role="alert" className="text-rose-500 mb-3">{error}</p>}
      {!canGenerateWidget()&&<p className="text-sm mb-3">Otwórz aplikację na Androidzie, aby dodać widżet.</p>}
      <button disabled={busy||!canGenerateWidget()||(scope==='selected'&&!selected.length)} onClick={()=>void generate()} className="ui-accent-solid w-full rounded-2xl p-4 font-bold flex justify-center gap-2 disabled:opacity-40">{busy&&<LoaderCircle className="animate-spin" size={20}/>}Generuj widżet</button>
      </>}
    </motion.div>
  </div>,document.body);
}
