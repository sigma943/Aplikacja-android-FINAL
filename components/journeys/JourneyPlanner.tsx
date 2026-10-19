'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Route,ArrowDownUp,MapPin,CalendarDays,SlidersHorizontal,Search,ChevronDown,ChevronUp,Bus,Footprints,Star,X,LoaderCircle,ArrowRight,Clock,AlertCircle,Check,ArrowLeft} from 'lucide-react';
import type {Stop} from '@/Panel/src/types';
import StopList from '@/Panel/src/components/StopList';
import {displayStopCatalogLabel} from '@/lib/stop-label';
import {loadJourneyCatalog} from '@/lib/journey-catalog';
import {searchConnections} from '@/lib/journey-loader';
import {type Journey,type JourneyOptions} from '@/lib/journey-planner';
import {warsawClock,warsawDateIso,warsawTimeMs} from '@/lib/transit-time';
import {useDialogFocus} from '@/lib/use-dialog-focus';
import {useAppBack} from '@/lib/use-app-back';
import dynamic from 'next/dynamic';
import './journeys.css';
const JourneyMap=dynamic(()=>import('./JourneyMap'),{ssr:false,loading:()=> <p className="connections-hint">Ładowanie mapy…</p>});
const providers=[['pks','PKS Rzeszów'],['mpk','MPK Rzeszów'],['marcel','Marcel']];
const label=(stop:Stop)=>displayStopCatalogLabel(stop.name,stop.code);
type Favorite={from:Stop;to:Stop};
function readFavorites():Favorite[]{try{const saved=JSON.parse(localStorage.getItem('pks-live:journey-favorites')||'[]');return Array.isArray(saved)?saved.filter(x=>x?.from?.id&&x?.to?.id&&typeof x.from.name==='string'&&typeof x.to.name==='string').slice(0,20):[];}catch{return [];}}
function readFavoriteStops():string[]{try{const ids=JSON.parse(localStorage.getItem('pks-live:journey-stop-favorites')||localStorage.getItem('mks_fav_stops')||'[]');return Array.isArray(ids)?ids.map(String):[];}catch{return [];}}
type Props={stops:Array<{id:string;name:string;lat?:number;lon?:number;areaId?:string;code?:string}>;dark:boolean;active:boolean;allowMap?:boolean;onClose:()=>void};
export default function JourneyPlanner({stops,dark,active,allowMap=true,onClose}:Props){
 const [catalog,setCatalog]=useState<Stop[]>([]),[catalogError,setCatalogError]=useState(''),[catalogLoading,setCatalogLoading]=useState(true),[attempt,setAttempt]=useState(0);
 const [from,setFrom]=useState<Stop|null>(null),[to,setTo]=useState<Stop|null>(null),[picker,setPicker]=useState<'from'|'to'|null>(null);
 const [preferences,setPreferences]=useState(false),[date,setDate]=useState(()=>warsawDateIso()),[time,setTime]=useState(()=>warsawClock(Date.now())),[now,setNow]=useState(true),[arriveBy,setArriveBy]=useState(false);
 const [options,setOptions]=useState<Omit<JourneyOptions,'at'|'arriveBy'>>({maxTransfers:1,walkMeters:500,transferMinutes:5,providers:['pks','mpk'],sort:'fastest'});
 const [results,setResults]=useState<Journey[]|null>(null),[selected,setSelected]=useState<string|null>(null),[map,setMap]=useState(false),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState(''),[warnings,setWarnings]=useState<string[]>([]),[favorites,setFavorites]=useState<Favorite[]>(readFavorites),[favoriteStops,setFavoriteStops]=useState<string[]>(readFavoriteStops);
 const pickerRef=useRef<HTMLDivElement>(null),controller=useRef<AbortController|null>(null),generation=useRef(0);
 useDialogFocus(pickerRef,Boolean(picker)&&active,()=>setPicker(null));
 useEffect(()=>()=>controller.current?.abort(),[]);
 useEffect(()=>{if(!active){generation.current++;controller.current?.abort();queueMicrotask(()=>setBusy(false));}},[active]);
 useEffect(()=>{if(!active||!now)return;let alive=true;const update=()=>{if(alive){setDate(warsawDateIso());setTime(warsawClock(Date.now()));}};queueMicrotask(update);const timer=setInterval(update,30000);return()=>{alive=false;clearInterval(timer);};},[active,now]);
 const includeMarcel=options.providers.includes('marcel');
 useEffect(()=>{let alive=true;
  void Promise.resolve().then(async()=>{if(!alive)return;setCatalogLoading(true);setCatalogError('');try{const list=await loadJourneyCatalog(stops,includeMarcel);if(alive)setCatalog(list);}catch{if(alive)setCatalogError('Nie udało się wczytać listy przystanków. Spróbuj ponownie.');}finally{if(alive)setCatalogLoading(false);}});
  return()=>{alive=false;};
 },[stops,attempt,includeMarcel]);
 useAppBack(active&&Boolean(picker||preferences||map||selected),()=>{if(picker)setPicker(null);else if(map)setMap(false);else if(selected)setSelected(null);else setPreferences(false);return true;},60);
 useAppBack(active,()=>{onClose();return true;},10);
 const pickerStops=useMemo(()=>catalog.map(s=>({...s,isFavorite:favoriteStops.includes(s.id)})),[catalog,favoriteStops]);
 function invalidate(){generation.current++;controller.current?.abort();setBusy(false);setResults(null);setSelected(null);setMap(false);setError('');setWarnings([]);}
 async function search(){
  if(!from||!to){setError('Wybierz przystanek początkowy i końcowy.');return;}
  if(from.id===to.id){setError('Wybierz dwa różne przystanki.');return;}
  const at=now?Date.now():warsawTimeMs(date,time),searchDate=now?warsawDateIso():date;
  if(!Number.isFinite(at)||!options.providers.length){setError('Sprawdź datę, godzinę i wybierz przynajmniej jednego przewoźnika.');return;}
  if(at<Date.now()-60000){setError('Wybrana godzina już minęła. Wybierz „Teraz” lub przyszły termin.');return;}
  invalidate();const token=generation.current,c=new AbortController();controller.current=c;setBusy(true);setProgress('Wczytuję pełne rozkłady…');
  try{const result=await searchConnections(from,to,catalog,searchDate,{...options,at,arriveBy},c.signal,(n,total)=>{if(token===generation.current)setProgress(n===total?'Wyznaczam trasę…':'Wczytuję rozkłady '+n+' / '+total);});
   if(c.signal.aborted||token!==generation.current)return;setResults(result.journeys);setWarnings(result.warnings);
  }catch(e){if(!c.signal.aborted&&token===generation.current)setError(e instanceof Error?e.message:'Nie udało się wyszukać połączeń. Spróbuj ponownie.');}
  finally{if(token===generation.current)setBusy(false);}
 }
 function favorite(){if(!from||!to)return;const exists=favorites.some(f=>f.from.id===from.id&&f.to.id===to.id);const next=exists?favorites.filter(f=>f.from.id!==from.id||f.to.id!==to.id):[{from,to},...favorites].slice(0,20);setFavorites(next);try{localStorage.setItem('pks-live:journey-favorites',JSON.stringify(next));}catch{setError('Nie udało się zapisać ulubionych.');}}
 const saved=Boolean(from&&to&&favorites.some(f=>f.from.id===from.id&&f.to.id===to.id));
 const changeOption=(patch:Partial<typeof options>)=>{invalidate();setOptions(value=>({...value,...patch}));};
 return <section className="connections-view" data-panel-theme={dark?'dark':'light'} data-cosmic-canvas aria-label="Połączenia">
  <div className="connections-content">
   <header className="connections-heading"><span className="connections-emblem"><Route size={24}/></span><div><h1>Połączenia</h1><p>Twoja droga, krok po kroku</p></div></header>
   <div data-cosmic-panel className="connections-card connections-form">
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
    <div className="connections-actions"><button className="connections-primary" disabled={busy||catalogLoading&&!catalog.length} onClick={search}>{busy?<LoaderCircle className="animate-spin" size={19}/>:<Search size={19}/>}<span>{busy?'Szukam połączeń…':'Znajdź połączenie'}</span>{!busy&&<ArrowRight size={18}/>}</button>{from&&to&&<button className="connections-save" aria-label={saved?'Usuń z ulubionych':'Zapisz połączenie'} aria-pressed={saved} onClick={favorite}><Star size={20} fill={saved?'currentColor':'none'}/></button>}</div>
    {busy&&<div className="connections-progress" role="status"><span>{progress}</span><button onClick={invalidate}>Anuluj</button></div>}
    {error&&<p role="alert" className="connections-error"><AlertCircle size={17}/>{error}</p>}
    {catalogError&&<p className="connections-error">{catalogError}<button onClick={()=>setAttempt(n=>n+1)}>Ponów</button></p>}
   </div>
   {results===null&&!busy&&<div className="connections-intro"><span className="connections-intro-icon"><Bus size={23}/></span><h2>Dokąd dzisiaj?</h2><p>Wybierz dwa przystanki. Znajdziemy kursy bezpośrednie i wygodne przesiadki.</p><span><Check size={14}/> Pełne rozkłady PKS i MPK, również offline</span></div>}
   {!busy&&results===null&&favorites.length>0&&<div className="connections-favorites"><h2>Zapisane podróże</h2>{favorites.map(f=><div className="connections-favorite" key={f.from.id+':'+f.to.id}><button onClick={()=>{invalidate();setFrom(catalog.find(s=>s.id===f.from.id)||f.from);setTo(catalog.find(s=>s.id===f.to.id)||f.to);}}><Star size={17}/><span>{label(f.from)}<small><ArrowRight size={12}/>{label(f.to)}</small></span></button><button aria-label="Usuń ulubione połączenie" onClick={()=>{const next=favorites.filter(x=>x!==f);setFavorites(next);try{localStorage.setItem('pks-live:journey-favorites',JSON.stringify(next));}catch{}}}><X size={17}/></button></div>)}</div>}
   {results!==null&&!busy&&<div className="connections-results" aria-live="polite"><div className="connections-results-heading"><h2>{results.length?'Proponowane połączenia':'Brak połączeń w tym terminie'}</h2>{results.length>0&&<span>{results.length} propozycji</span>}</div>
    {!results.length&&<div className="connections-card connections-empty"><Search size={28}/><h3>Spróbuj innej godziny</h3><p>W ciągu 6 godzin od wybranego terminu nie ma połączenia spełniającego preferencje. Możesz też zwiększyć dystans pieszo lub liczbę przesiadek.</p></div>}
    {warnings.map(w=><p className="connections-warning" key={w}><AlertCircle size={16}/>{w}</p>)}
    {results.map(j=><article data-cosmic-panel data-journey-result className={'connections-card connections-result-card'+(selected===j.id?' is-expanded':'')} key={j.id}><button className="connections-result" aria-expanded={selected===j.id} onClick={()=>{setSelected(selected===j.id?null:j.id);setMap(false);}}><div className="connections-result-times"><strong>{warsawClock(j.departure)}<ArrowRight size={17}/>{warsawClock(j.arrival)}</strong><span>{Math.ceil((j.arrival-j.departure)/60000)} min</span></div><div className="connections-leg-badges">{j.legs.map((l,i)=><span key={i} data-provider={l.provider}>{l.walking!==undefined?<Footprints size={13}/>:<Bus size={13}/>} {l.walking!==undefined?l.walking+' m':l.line}</span>)}</div><div className="connections-result-meta"><span>{j.transfers===0?'Bez przesiadek':j.transfers===1?'1 przesiadka':j.transfers+' przesiadki'}{j.walking>0?' · '+j.walking+' m pieszo':''}</span>{selected===j.id?<ChevronUp size={17}/>:<ChevronDown size={17}/>}</div></button>
    {selected===j.id&&<div className="connections-detail">{j.legs.map((l,i)=><div className="connections-leg" key={i} data-provider={l.provider}><div className="connections-leg-time">{warsawClock(l.departure)}<small>{warsawClock(l.arrival)}</small></div><span className="connections-leg-track"/><div><h3>{label(l.from)}</h3><p>{l.walking!==undefined?'Dojście pieszo · ok. '+l.walking+' m':'Linia '+l.line+' · '+(providers.find(p=>p[0]===l.provider)?.[1]||l.provider)}</p><strong>{label(l.to)}</strong></div></div>)}<p className="connections-hint">Godziny według rozkładu. Sprawdź aktualne odjazdy przed podróżą. Dojścia piesze są szacunkowe.</p>{allowMap&&<button className="connections-map-button" onClick={()=>setMap(!map)}><MapPin size={16}/>{map?'Ukryj mapę':'Pokaż podróż na mapie'}</button>}{allowMap&&map&&<JourneyMap journey={j} dark={dark}/>}</div>}</article>)}
   </div>}
  </div>
  {picker&&<div ref={pickerRef} data-journey-picker className="connections-picker" role="dialog" aria-modal="true" aria-label={picker==='from'?'Wybierz przystanek początkowy':'Wybierz przystanek docelowy'}><header><button aria-label="Zamknij wybór przystanku" onClick={()=>setPicker(null)}><ArrowLeft size={20}/></button><div><h2>{picker==='from'?'Skąd jedziesz?':'Dokąd jedziesz?'}</h2><p>Wybierz przystanek z listy</p></div></header><div className="connections-picker-list"><StopList stops={pickerStops} isLoading={catalogLoading&&!catalog.length} isDarkTheme={dark} backEnabled={false} onClose={()=>setPicker(null)} notice={catalogError?<p role="alert">{catalogError}<button onClick={()=>setAttempt(n=>n+1)}>Ponów</button></p>:undefined} toggleFavorite={id=>{setFavoriteStops(previous=>{const next=previous.includes(id)?previous.filter(x=>x!==id):[...previous,id];try{localStorage.setItem('pks-live:journey-stop-favorites',JSON.stringify(next));}catch{}return next;});}} onStopSelect={stop=>{invalidate();if(picker==='from')setFrom(stop);else setTo(stop);setPicker(null);}}/></div></div>}
 </section>;
}
