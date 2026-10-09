'use client';
import {createPortal} from 'react-dom';
import {useEffect,useRef,useState} from 'react';
import {motion,useReducedMotion} from 'motion/react';
import {Battery,Check,LayoutGrid,LoaderCircle,RefreshCw,Search} from 'lucide-react';
import type {Stop,Departure} from '@/Panel/src/types';
import type {Vehicle} from '@/components/BusMap';
import {useAppBack} from '@/lib/use-app-back';
import {canGenerateWidget,widgetSystemIsDark,pinStopWidget,widgetDepartures,widgetPinStatus,type StopWidgetConfig} from '@/lib/stop-widget';
import {getLineStyle} from '@/Panel/src/utils/lineStyles';
import {DEFAULT_WIDGET_APPEARANCE,type WidgetAppearance} from '@/lib/widget-appearance';
import WidgetPreview from './WidgetPreview';
import WidgetPersonalization from './WidgetPersonalization';
import './widget-generator.css';
export default function GenerateStopWidget({stop,lines,departures,vehicles,dark,onClose}:{stop:Stop;lines:string[];departures:Departure[];vehicles:Vehicle[];dark:boolean;onClose:()=>void}) {
  const [scope,setScope]=useState('all'),[selected,setSelected]=useState<string[]>([]),[query,setQuery]=useState('');
  const [size,setSize]=useState<StopWidgetConfig['size']>('medium'),[theme,setTheme]=useState<StopWidgetConfig['theme']>('system');
  const [systemDark,setSystemDark]=useState(false);
  useEffect(()=>{let active=true;const media=window.matchMedia('(prefers-color-scheme: dark)');const update=()=>void widgetSystemIsDark().then(value=>{if(active)setSystemDark(value);}).catch(()=>{if(active)setSystemDark(media.matches);});update();media.addEventListener('change',update);return()=>{active=false;media.removeEventListener('change',update);};},[]);
  const glass=true;
  const [appearance,setAppearance]=useState<WidgetAppearance>(()=>({...DEFAULT_WIDGET_APPEARANCE}));
  const [refreshMinutes,setRefreshMinutes]=useState<NonNullable<StopWidgetConfig['refreshMinutes']>>(30);
  const [refreshMode,setRefreshMode]=useState<NonNullable<StopWidgetConfig['refreshMode']>>('battery-saver');
  const [busy,setBusy]=useState(false),[token,setToken]=useState(''),[added,setAdded]=useState(false),[error,setError]=useState('');
  const root=useRef<HTMLDivElement>(null),reduce=useReducedMotion();
  useAppBack(true,()=>{onClose();return true;},100);
  useEffect(()=>{const previous=document.activeElement as HTMLElement;root.current?.focus();return()=>previous?.focus();},[]);
  useEffect(()=>{if(!token||added)return;const timer=setInterval(()=>{void widgetPinStatus(token).then(r=>{if(r.added)setAdded(true);}).catch(()=>{});},1000);return()=>clearInterval(timer);},[token,added]);
  const card='rounded-2xl border p-3 text-left transition-all ui-accent-focus';
  const choice=(active:boolean)=>active?'ui-accent-soft border-[var(--pks-accent)]':dark?'border-white/10 bg-white/[.035]':'border-slate-200 bg-slate-50';
  const previewDark=theme==='dark'||theme==='system'&&systemDark;
  const preview=widgetDepartures(departures,vehicles,scope==='all'?null:selected,Date.now(),size==='small'?1:size==='medium'?3:5);
  async function generate(){setBusy(true);setError('');try{const r=await pinStopWidget({stop,lines:scope==='all'?null:selected,size,theme,glass,appearance,refreshMinutes,refreshMode},departures,vehicles);setToken(r.token);}catch(e){setError(e instanceof Error?e.message:'Nie udało się dodać widżetu.');}finally{setBusy(false);}}
  return createPortal(<motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduce?0:.2}} className="fixed inset-0 z-[6000] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
    <motion.div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="widget-title" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const items=root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)');if(items?.length){const first=items[0],last=items[items.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===root.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}}} initial={reduce?false:{y:80}} animate={{y:0}} exit={{y:80}} transition={{duration:reduce?0:.24,ease:[.2,.8,.2,1]}} style={{backgroundColor:dark?'#101e26':'#ffffff'}} className={`widget-generator transit-view flex w-full max-w-lg max-h-[92dvh] flex-col overflow-hidden rounded-t-[28px] border shadow-2xl ${dark?'border-white/10 text-white':'border-slate-200 text-slate-900'}`} data-ui-mode={dark?'dark':'light'}>
      <header className="flex shrink-0 items-center gap-3 px-5 pt-5 pb-4 border-b border-current/10">
        <span className="ui-accent-soft rounded-2xl p-3"><LayoutGrid size={22}/></span>
        <div className="min-w-0 flex-1"><h2 id="widget-title" className="text-lg font-bold">{added?'Widżet został dodany!':'Generuj widżet'}</h2><p className="mt-1 text-xs opacity-60 truncate">{stop.name}</p></div>
        {!added&&<button aria-label="Zamknij okno widżetu" onClick={onClose} className="rounded-xl px-2 py-3 text-xs opacity-70 ui-accent-focus">Anuluj</button>}
      </header>
      {added?<div className="px-6 py-8 text-center"><motion.div initial={reduce?false:{scale:.7,opacity:0}} animate={{scale:1,opacity:1}} className="ui-accent-soft mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full"><Check size={48}/></motion.div><p className="text-sm leading-relaxed opacity-75">Widżet znajdziesz na ekranie głównym.<br/>Przytrzymaj go, aby zmienić rozmiar lub usunąć.</p><button onClick={onClose} className="ui-accent-solid mt-7 w-full rounded-2xl p-4 font-bold">OK</button></div>:<>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">
        <WidgetPreview name={stop.name} departures={preview} size={size} dark={previewDark} glass={glass} appearance={appearance}/>
        <fieldset className="widget-settings-card space-y-2"><legend className="mb-2 text-sm font-semibold">Zakres linii</legend>{[['all','Wszystkie linie z tego przystanku'],['selected','Tylko wybrane linie']].map(([value,label])=><label key={value} className={`${card} ${choice(scope===value)} flex gap-3 items-center text-sm`}><input type="radio" name="widget-lines" checked={scope===value} onChange={()=>setScope(value)}/>{label}</label>)}</fieldset>
        {scope==='selected'&&<div><label className="flex items-center gap-2 border border-current/15 rounded-xl p-3"><Search size={16}/><input aria-label="Wyszukaj linię" placeholder="Wyszukaj linię…" value={query} onChange={e=>setQuery(e.target.value)} className="bg-transparent w-full outline-none text-sm"/></label><div className="max-h-40 overflow-y-auto mt-2">{lines.filter(l=>l.toLowerCase().includes(query.toLowerCase())).map(line=><label key={line} className="flex items-center justify-between py-2 border-b border-current/10"><span className={`rounded-lg border px-3 py-1 text-sm font-bold ${getLineStyle(line,stop.lineProviders?.[line]?.[0])}`}>{line}</span><input type="checkbox" role="switch" aria-label={`Linia ${line}`} checked={selected.includes(line)} onChange={()=>setSelected(old=>old.includes(line)?old.filter(l=>l!==line):[...old,line])}/></label>)}</div></div>}
        <fieldset className="widget-settings-card"><legend className="font-semibold text-sm mb-2">Rozmiar / układ</legend><div className="grid grid-cols-3 gap-2">{(['small','medium','large'] as const).map((value,i)=><button key={value} aria-pressed={size===value} onClick={()=>setSize(value)} className={`${card} ${choice(size===value)} text-center text-xs`}><div className="mx-auto mb-2 rounded-lg bg-current/10 p-2 space-y-1">{Array.from({length:2+i},(_,j)=><div key={j} className="h-1 rounded bg-current/25"/>)}</div>{['Mały','Średni','Duży'][i]}<span className="block text-[10px] opacity-50 mt-1">{['2 × 1','4 × 2','4 × 3'][i]}</span></button>)}</div><p className="text-xs opacity-50 mt-2">Układ dopasuje się również po zmianie rozmiaru na ekranie głównym.</p></fieldset>
        <fieldset className="widget-settings-card"><legend className="font-semibold text-sm mb-2">Motyw</legend><div className="grid grid-cols-3 gap-2">{(['system','light','dark'] as const).map((value,i)=><button key={value} aria-pressed={theme===value} onClick={()=>setTheme(value)} className={`${card} ${choice(theme===value)} text-center text-xs`}>{['Systemowy','Jasny','Ciemny'][i]}</button>)}</div></fieldset>
        <WidgetPersonalization value={appearance} onChange={setAppearance} dark={dark}/>
        <fieldset className="widget-settings-card"><legend className="font-semibold text-sm mb-2 flex items-center gap-2"><RefreshCw size={15}/>Automatyczne odświeżanie</legend><label className="block text-xs opacity-60 mb-2" htmlFor="widget-refresh-interval">Częstotliwość</label><select id="widget-refresh-interval" value={refreshMinutes} disabled={refreshMode==='off'} onChange={e=>setRefreshMinutes(Number(e.target.value) as NonNullable<StopWidgetConfig['refreshMinutes']>)} className={`${card} ${choice(false)} w-full text-sm disabled:opacity-40`} style={{backgroundColor:dark?'#182a34':'#f1f5f9',color:'inherit'}}>{[15,30,60,120].map(n=><option key={n} value={n}>Co {n===60?'1 godzinę':n===120?'2 godziny':`${n} minut`}{n===30?' (domyślnie)':''}</option>)}</select>
          <div className="space-y-2 mt-3">{[['battery-saver','Pauza w oszczędzaniu baterii'],['always','Włączone również w oszczędzaniu baterii'],['off','Wyłączone — tylko ręcznie']].map(([value,label])=><label key={value} className={`${card} ${choice(refreshMode===value)} flex gap-3 items-center text-xs`}><input type="radio" name="widget-refresh-mode" checked={refreshMode===value} onChange={()=>setRefreshMode(value as NonNullable<StopWidgetConfig['refreshMode']>)}/>{label}</label>)}</div>
          <p className="flex gap-2 text-xs opacity-55 mt-3 leading-relaxed"><Battery size={16} className="shrink-0 mt-0.5"/>Android może opóźnić aktualizację, gdy telefon jest uśpiony. Przycisk ↻ pozwala odświeżyć odjazdy ręcznie.</p>
        </fieldset>
        {token&&<p role="status" className="ui-accent-soft rounded-xl p-3 text-sm">Potwierdź dodanie na ekranie telefonu. Jeśli zamknąłeś okno systemowe, możesz spróbować ponownie.</p>}
        {error&&<p role="alert" className="text-rose-500 text-sm">{error}</p>}
        {!canGenerateWidget()&&<p className="text-xs opacity-60">Otwórz aplikację na Androidzie, aby dodać widżet.</p>}
      </div>
      <footer className="shrink-0 border-t border-current/10 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"><button disabled={busy||!canGenerateWidget()||(scope==='selected'&&!selected.length)} onClick={()=>void generate()} className="ui-accent-solid w-full rounded-2xl p-3.5 text-sm font-bold flex justify-center gap-2 disabled:opacity-40">{busy&&<LoaderCircle className="animate-spin" size={18}/>}Generuj widżet</button></footer>
      </>}
    </motion.div>
  </motion.div>,document.body);
}
