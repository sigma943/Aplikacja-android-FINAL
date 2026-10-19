'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowDownUp,MapPin,CalendarDays,SlidersHorizontal,Search,ChevronDown,ChevronUp,Bus,Footprints,LocateFixed,History,X,LoaderCircle,ArrowRight,Clock,AlertCircle,Check,ArrowLeft} from 'lucide-react';
import type {Stop} from '@/Panel/src/types';
import StopList from '@/Panel/src/components/StopList';
import {displayStopCatalogLabel} from '@/lib/stop-label';
import {journeyPickerStops,currentJourneyLocation,LOCATION_ID} from '@/lib/journey-places';
import {loadJourneyCatalog} from '@/lib/journey-catalog';
import {searchConnections} from '@/lib/journey-loader';
import {type Journey,type JourneyOptions} from '@/lib/journey-planner';
import {warsawClock,warsawDateIso,warsawTimeMs} from '@/lib/transit-time';
import {useDialogFocus} from '@/lib/use-dialog-focus';
import {useAppBack} from '@/lib/use-app-back';
import dynamic from 'next/dynamic';
import JourneyIcon from './JourneyIcon';
import './journeys.css';
const JourneyMap=dynamic(()=>import('./JourneyMap'),{ssr:false,loading:()=> <p className="connections-hint">Ładowanie mapy…</p>});
const providers=[['pks','PKS Rzeszów'],['mpk','MPK Rzeszów'],['marcel','Marcel']];
const label=(stop:Stop)=>displayStopCatalogLabel(stop.name,stop.code);
type Recent={from:Stop;to:Stop};
function readRecents():Recent[]{try{const saved=JSON.parse(localStorage.getItem('pks-live:journey-recents')||'[]');return Array.isArray(saved)?saved.filter(x=>x?.from?.id&&x?.to?.id&&typeof x.from.name==='string'&&typeof x.to.name==='string').slice(0,6):[];}catch{return [];}}
function saveRecents(items:Recent[]){try{localStorage.setItem('pks-live:journey-recents',JSON.stringify(items.map(item=>({...item,from:item.from.id===LOCATION_ID?{...item.from,lat:undefined,lon:undefined}:item.from}))));}catch{}}

type Props={stops:Array<{id:string;name:string;lat?:number;lon?:number;areaId?:string;code?:string}>;dark:boolean;active:boolean;allowMap?:boolean;onClose:()=>void};
export default function JourneyPlanner({stops,dark,active,allowMap=true,onClose}:Props){
 const [catalog,setCatalog]=useState<Stop[]>([]),[catalogError,setCatalogError]=useState(''),[catalogLoading,setCatalogLoading]=useState(true),[attempt,setAttempt]=useState(0);
 const [from,setFrom]=useState<Stop|null>(null),[to,setTo]=useState<Stop|null>(null),[picker,setPicker]=useState<'from'|'to'|null>(null);
 const [preferences,setPreferences]=useState(false),[date,setDate]=useState(()=>warsawDateIso()),[time,setTime]=useState(()=>warsawClock(Date.now())),[now,setNow]=useState(true),[arriveBy,setArriveBy]=useState(false);
 const [options,setOptions]=useState<Omit<JourneyOptions,'at'|'arriveBy'>>({maxTransfers:1,walkMeters:500,transferMinutes:5,providers:['pks','mpk'],sort:'fastest'});
 const [results,setResults]=useState<Journey[]|null>(null),[selected,setSelected]=useState<string|null>(null),[map,setMap]=useState(false),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState(''),[warnings,setWarnings]=useState<string[]>([]),[recents,setRecents]=useState<Recent[]>(readRecents),[locating,setLocating]=useState(false);
 const pickerRef=useRef<HTMLDivElement>(null),controller=useRef<AbortController|null>(null),generation=useRef(0);
 useDialogFocus(pickerRef,Boolean(picker)&&active,()=>setPicker(null));
 useEffect(()=>()=>controller.current?.abort(),[]);
 useEffect(()=>{if(!active){generation.current++;controller.current?.abort();queueMicrotask(()=>{setBusy(false);setMap(false);});}},[active]);
 useEffect(()=>{if(!active||!now)return;let alive=true;const update=()=>{if(alive){setDate(warsawDateIso());setTime(warsawClock(Date.now()));}};queueMicrotask(update);const timer=setInterval(update,30000);return()=>{alive=false;clearInterval(timer);};},[active,now]);
 const includeMarcel=options.providers.includes('marcel');
 useEffect(()=>{let alive=true;
  void Promise.resolve().then(async()=>{if(!alive)return;setCatalogLoading(true);setCatalogError('');try{const list=await loadJourneyCatalog(stops,includeMarcel);if(alive)setCatalog(list);}catch{if(alive)setCatalogError('Nie udało się wczytać listy przystanków. Spróbuj ponownie.');}finally{if(alive)setCatalogLoading(false);}});
  return()=>{alive=false;};
 },[stops,attempt,includeMarcel]);
 useAppBack(active&&Boolean(picker||preferences||map||selected),()=>{if(picker)setPicker(null);else if(map)setMap(false);else if(selected)setSelected(null);else setPreferences(false);return true;},60);
 useAppBack(active,()=>{onClose();return true;},10);
 const places=useMemo(()=>journeyPickerStops(catalog),[catalog]);
 const pickerStops=useMemo(()=>places.map(s=>({...s,isFavorite:false})),[places]);
 function invalidate(){generation.current++;controller.current?.abort();setBusy(false);setResults(null);setSelected(null);setMap(false);setError('');setWarnings([]);}
 async function locate(){
  setLocating(true);setError('');try{const place=await currentJourneyLocation();invalidate();setFrom(place);setPicker(null);}catch(e){setError((e as Error).message);}finally{setLocating(false);}
 }
 async function search(){
  if(!from||!to){setError('Wybierz przystanek początkowy i końcowy.');return;}
  if(from.id===to.id){setError('Wybierz dwa różne przystanki.');return;}
  const at=now?Date.now():warsawTimeMs(date,time),searchDate=now?warsawDateIso():date;
  if(!Number.isFinite(at)||(!options.providers.length&&from.id!==LOCATION_ID)){setError('Sprawdź datę, godzinę i wybierz przynajmniej jednego przewoźnika.');return;}
  if(at<Date.now()-60000){setError('Wybrana godzina już minęła. Wybierz „Teraz” lub przyszły termin.');return;}
  invalidate();const token=generation.current,c=new AbortController();controller.current=c;setBusy(true);setProgress('Wczytuję pełne rozkłady…');
  try{const origin=from.id===LOCATION_ID?await currentJourneyLocation():from;if(c.signal.aborted||token!==generation.current)return;if(origin.id===LOCATION_ID)setFrom(origin);
   const next=[{from:origin,to},...recents.filter(r=>r.from.id!==origin.id||r.to.id!==to.id)].slice(0,6);setRecents(next);saveRecents(next);
   const result=await searchConnections(origin,to,catalog,searchDate,{...options,at,arriveBy},c.signal,(n,total)=>{if(token===generation.current)setProgress(n===total?'Wyznaczam trasę…':'Wczytuję rozkłady '+n+' / '+total);});
   if(c.signal.aborted||token!==generation.current)return;setResults(result.journeys);setWarnings(result.warnings);
  }catch(e){if(!c.signal.aborted&&token===generation.current)setError(e instanceof Error?e.message:'Nie udało się wyszukać połączeń. Spróbuj ponownie.');}
  finally{if(token===generation.current)setBusy(false);}
 }
 const changeOption=(patch:Partial<typeof options>)=>{invalidate();setOptions(value=>({...value,...patch}));};
 return <section className="connections-view" data-panel-theme={dark?'dark':'light'} data-cosmic-canvas aria-label="Połączenia">
  <div className="connections-content">
   <header className="connections-heading"><span className="connections-emblem"><JourneyIcon size={28}/></span><div><h1>Połączenia</h1><p>Twoja droga, krok po kroku</p></div></header>
   <div className="connections-workspace"><aside className="connections-search-column"><div data-cosmic-panel className="connections-card connections-form">
    <div className="connections-route-fields">
     <button data-journey-from className="connections-location" onClick={()=>setPicker('from')}><span className="connections-origin-dot"/><span><small>SKĄD JEDZIESZ?</small><strong>{from?label(from):'Wybierz przystanek początkowy'}</strong></span><ChevronDown size={18}/></button>
     <button className="connections-swap" aria-label="Zamień przystanki" onClick={()=>{invalidate();setFrom(to);setTo(from);}}><ArrowDownUp size={17}/></button>
     <button data-journey-to className="connections-location" onClick={()=>setPicker('to')}><MapPin size={20}/><span><small>DOKĄD?</small><strong>{to?label(to):'Wybierz przystanek docelowy'}</strong></span><ChevronDown size={18}/></button>
    </div>
    <div className="connections-time-mode"><div className="connections-segment"><button aria-pressed={!arriveBy} onClick={()=>{invalidate();setArriveBy(false);}}>Odjazd</button><button aria-pressed={arriveBy} onClick={()=>{invalidate();setArriveBy(true);}}>Przyjazd</button></div><button className="connections-now" aria-pressed={now} onClick={()=>{invalidate();setNow(true);setDate(warsawDateIso());setTime(warsawClock(Date.now()));}}><Clock size={15}/>Teraz</button></div>
    <div className="connections-datetime"><label><CalendarDays size={18}/><span><small>Data podróży</small><input aria-label="Data podróży" type="date" min={warsawDateIso()} max={warsawDateIso(30)} value={date} onChange={e=>{invalidate();setNow(false);setDate(e.target.value);}}/></span></label><label><Clock size={18}/><span><small>Godzina</small><input aria-label="Godzina podróży" type="time" value={time} onChange={e=>{invalidate();setNow(false);setTime(e.target.value);}}/></span></label></div>
    <button className="connections-preferences" onClick={()=>setPreferences(v=>!v)} aria-expanded={preferences}><SlidersHorizontal size={17}/><span>Preferencje podróży<small>{options.maxTransfers===0?'Bez przesiadek':'Do '+options.maxTransfers+' przesiadek'} · pieszo do {options.walkMeters} m</small></span>{preferences?<ChevronUp size={17}/>:<ChevronDown size={17}/>}</button>
    {preferences&&<div className="connections-preference-body">
     <label>Sortowanie<select value={options.sort} onChange={e=>changeOption({sort:e.target.value as JourneyOptions['sort']})}><option value="fastest">Najwcześniejszy przyjazd</option><option value="transfers">Najmniej przesiadek</option><option value="walking">Najmniej pieszo</option></select></label>
     <fieldset><legend>Przewoźnicy</legend><div className="connections-provider-options">{providers.map(([id,name])=><label key={id} data-provider={id}><input type="checkbox" checked={options.providers.includes(id)} onChange={e=>changeOption({providers:e.target.checked?[...options.providers,id]:options.providers.filter(p=>p!==id)})}/>{name}</label>)}</div><p className="connections-hint">PKS i MPK: pełny zapisany rozkład. Marcel: dane internetowe.</p></fieldset>
     <div className="connections-option-row"><label>Przesiadki<select value={options.maxTransfers} onChange={e=>changeOption({maxTransfers:Number(e.target.value)})}><option value={0}>Bez przesiadek</option><option value={1}>Maksymalnie 1</option><option value={2}>Maksymalnie 2</option></select></label><label>Zapas czasu<select value={options.transferMinutes} onChange={e=>changeOption({transferMinutes:Number(e.target.value)})}>{[3,5,10,15].map(n=><option key={n} value={n}>{n} min</option>)}</select></label></div>
     <label>Dojścia piesze: do {options.walkMeters} m<input aria-label="Maksymalny dystans pieszo" type="range" min="0" max="2000" step="100" value={options.walkMeters} onChange={e=>changeOption({walkMeters:Number(e.target.value)})}/></label>
    </div>}
    <div className="connections-actions"><button className="connections-primary" disabled={busy||locating||catalogLoading&&!catalog.length} onClick={search}>{busy?<LoaderCircle className="animate-spin" size={19}/>:<Search size={19}/>}<span>{busy?'Szukam połączeń…':'Znajdź połączenie'}</span>{!busy&&<ArrowRight size={18}/>}</button></div>
    {busy&&<div className="connections-progress" role="status"><span>{progress}</span><button onClick={invalidate}>Anuluj</button></div>}
    {error&&<p role="alert" className="connections-error"><AlertCircle size={17}/>{error}</p>}
    {catalogError&&<p className="connections-error">{catalogError}<button onClick={()=>setAttempt(n=>n+1)}>Ponów</button></p>}
   </div>
   {recents.length>0&&<div className="connections-recents"><h2><History size={17}/>Ostatnie wyszukiwania</h2>{recents.map(r=><div className="connections-recent" key={r.from.id+':'+r.to.id}><button onClick={()=>{invalidate();setFrom(places.find(s=>s.id===r.from.id)||r.from);setTo(places.find(s=>s.id===r.to.id)||r.to);}}><History size={17}/><span>{label(r.from)}<small><ArrowRight size={12}/>{label(r.to)}</small></span></button><button aria-label="Usuń ostatnie wyszukiwanie" onClick={()=>{const next=recents.filter(x=>x!==r);setRecents(next);saveRecents(next);}}><X size={17}/></button></div>)}</div>}
  </aside><main className="connections-answer-column">
   {results===null&&!busy&&<div className="connections-intro"><span className="connections-intro-icon"><Bus size={23}/></span><h2>Dokąd dzisiaj?</h2><p>Wybierz przystanki lub rozpocznij podróż ze swojej lokalizacji.</p><span><Check size={14}/> Pełne rozkłady PKS i MPK, również offline</span></div>}
   {results!==null&&!busy&&<div className="connections-results" aria-live="polite"><div className="connections-results-heading"><h2>{results.length?'Proponowane połączenia':'Brak połączeń w tym terminie'}</h2>{results.length>0&&<span>{results.length} propozycji</span>}</div>
    {!results.length&&<div className="connections-card connections-empty"><Search size={28}/><h3>Spróbuj innej godziny</h3><p>W ciągu 6 godzin od wybranego terminu nie ma połączenia spełniającego preferencje. Możesz też zwiększyć dystans pieszo lub liczbę przesiadek.</p></div>}
    {warnings.map(w=><p className="connections-warning" key={w}><AlertCircle size={16}/>{w}</p>)}
    {results.map(j=><article data-cosmic-panel data-journey-result className={'connections-card connections-result-card'+(selected===j.id?' is-expanded':'')} key={j.id}><button className="connections-result" aria-expanded={selected===j.id} onClick={()=>{setSelected(selected===j.id?null:j.id);setMap(false);}}><div className="connections-result-times"><strong>{warsawClock(j.departure)}<ArrowRight size={17}/>{warsawClock(j.arrival)}</strong><span>{Math.ceil((j.arrival-j.departure)/60000)} min</span></div><div className="connections-leg-badges">{j.legs.map((l,i)=><span key={i} data-provider={l.provider}>{l.walking!==undefined?<Footprints size={13}/>:<Bus size={13}/>} {l.walking!==undefined?l.walking+' m':l.line}</span>)}</div><div className="connections-result-meta"><span>{j.legs.every(l=>l.walking!==undefined)?'Całą trasę pieszo':j.transfers===0?'Bez przesiadek':j.transfers===1?'1 przesiadka':j.transfers+' przesiadki'}{j.walking>0?' · '+j.walking+' m pieszo':''}</span>{selected===j.id?<ChevronUp size={17}/>:<ChevronDown size={17}/>}</div></button>
    {selected===j.id&&<div className="connections-detail">{j.legs.map((l,i)=><div className="connections-leg" key={i} data-provider={l.provider}><div className="connections-leg-time">{warsawClock(l.departure)}<small>{warsawClock(l.arrival)}</small></div><span className="connections-leg-track"/><div><h3>{label(l.from)}</h3><p>{l.walking!==undefined?'Dojście pieszo · ok. '+l.walking+' m':'Linia '+l.line+' · '+(providers.find(p=>p[0]===l.provider)?.[1]||l.provider)}</p><strong>{label(l.to)}</strong></div></div>)}<p className="connections-hint">Godziny według rozkładu. Sprawdź aktualne odjazdy przed podróżą. Czasy dojść do przystanków są szacunkowe.</p>{allowMap&&<button className="connections-map-button" onClick={()=>setMap(!map)}><MapPin size={16}/>{map?'Ukryj mapę':'Pokaż podróż na mapie'}</button>}{allowMap&&map&&<JourneyMap journey={j} dark={dark}/>}</div>}</article>)}
   </div>}
  </main></div></div>
  {picker&&<div ref={pickerRef} data-journey-picker className="connections-picker" role="dialog" aria-modal="true" aria-label={picker==='from'?'Wybierz przystanek początkowy':'Wybierz przystanek docelowy'}><header><button aria-label="Zamknij wybór przystanku" onClick={()=>setPicker(null)}><ArrowLeft size={20}/></button><div><h2>{picker==='from'?'Skąd jedziesz?':'Dokąd jedziesz?'}</h2><p>Wybierz przystanek z listy</p></div></header>{picker==='from'&&<button className="connections-use-location" onClick={locate} disabled={locating}><span><LocateFixed size={23}/></span><div><strong>{locating?'Ustalam lokalizację…':'Twoja lokalizacja'}</strong><small>Znajdź pobliskie przystanki lub idź pieszo</small></div>{locating?<LoaderCircle size={20} className="animate-spin"/>:<ArrowRight size={20}/>}</button>}
   {error&&<p role="alert" className="connections-error">{error}</p>}<div className="connections-picker-list"><StopList stops={pickerStops} isLoading={catalogLoading&&!catalog.length} isDarkTheme={dark} backEnabled={false} onClose={()=>setPicker(null)} notice={catalogError?<p role="alert">{catalogError}<button onClick={()=>setAttempt(n=>n+1)}>Ponów</button></p>:undefined} toggleFavorite={()=>{}} onStopSelect={stop=>{invalidate();if(picker==='from')setFrom(stop);else setTo(stop);setPicker(null);}}/></div></div>}
 </section>;
}
