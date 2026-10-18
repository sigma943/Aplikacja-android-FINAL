'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Route,ArrowDownUp,MapPin,CalendarDays,SlidersHorizontal,Search,ChevronDown,ChevronUp,Bus,Footprints,Star,X,LoaderCircle,ArrowRight,Clock,AlertCircle} from 'lucide-react';
import type {Stop} from '@/Panel/src/types';
import {readStopsCatalogCache} from '@/lib/stops-catalog-cache';
import {buildStopsCatalogAsync} from '@/lib/stops-catalog-async';
import {fetchMpkRzeszowStopsClient} from '@/lib/pks-client';
import {getMarcelStopsIndex} from '@/components/stops-panel/stop-domain';
import {searchConnections} from '@/lib/journey-loader';
import {type Journey,type JourneyOptions} from '@/lib/journey-planner';
import {warsawClock,warsawDateIso,warsawTimeMs} from '@/lib/transit-time';
import {useDialogFocus} from '@/lib/use-dialog-focus';
import {useAppBack} from '@/lib/use-app-back';
import dynamic from 'next/dynamic';
const JourneyMap=dynamic(()=>import('./JourneyMap'),{ssr:false,loading:()=> <p className="journey-hint">Ładowanie mapy…</p>});
const providers=[['pks','PKS Rzeszów'],['mpk','MPK Rzeszów'],['marcel','Marcel']];
type Favorite={from:Stop;to:Stop};
export default function JourneyPlanner({stops,dark,active,allowMap=true,onClose}:{stops:Array<{id:string;name:string;lat?:number;lon?:number;areaId?:string;code?:string}>;dark:boolean;active:boolean;allowMap?:boolean;onClose:()=>void}){
 const [catalog,setCatalog]=useState<Stop[]>([]),[catalogError,setCatalogError]=useState(''),[catalogLoading,setCatalogLoading]=useState(true);
 const [from,setFrom]=useState<Stop|null>(null),[to,setTo]=useState<Stop|null>(null),[picker,setPicker]=useState<'from'|'to'|null>(null),[query,setQuery]=useState('');
 const [preferences,setPreferences]=useState(false),[date,setDate]=useState(warsawDateIso()),[time,setTime]=useState(warsawClock(Date.now())),[arriveBy,setArriveBy]=useState(false);
 const [options,setOptions]=useState<Omit<JourneyOptions,'at'|'arriveBy'>>({maxTransfers:1,walkMeters:500,transferMinutes:5,providers:providers.map(p=>p[0]),sort:'fastest'});
 const [results,setResults]=useState<Journey[]|null>(null),[selected,setSelected]=useState<string|null>(null),[map,setMap]=useState(false),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState(''),[warnings,setWarnings]=useState<string[]>([]),[favorites,setFavorites]=useState<Favorite[]>([]);
 const pickerRef=useRef<HTMLDivElement>(null);
 useDialogFocus(pickerRef,Boolean(picker)&&active,()=>setPicker(null));
 const controller=useRef<AbortController|null>(null),generation=useRef(0);
 useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem('pks-live:journey-favorites')||'[]');if(Array.isArray(saved))setFavorites(saved.filter(x=>x?.from?.id&&x?.to?.id&&typeof x.from.name==='string'&&typeof x.to.name==='string').slice(0,20));}catch{}return()=>controller.current?.abort();},[]);
 useEffect(()=>{if(!active){controller.current?.abort();setBusy(false);}},[active]);
 useEffect(()=>{let alive=true;setCatalogLoading(true);
  (async()=>{
   const cached=await readStopsCatalogCache();if(alive&&cached?.stops.length)setCatalog(cached.stops);
   const [mpk,marcel]=await Promise.allSettled([fetchMpkRzeszowStopsClient(),getMarcelStopsIndex(warsawDateIso())]);
   if(!alive)return;
   const raw=stops.length?stops:cached?.pks||[];
   const m=mpk.status==='fulfilled'?mpk.value.map(s=>({id:String(s.stop_id),name:s.stop_name,lat:Number(s.stop_lat),lon:Number(s.stop_lon),lines:String(s.lines||'').split(',').map(l=>l.trim()).filter(Boolean)})):cached?.mpk||[];
   const c=marcel.status==='fulfilled'?marcel.value:cached?.marcel||[];
   const list=await buildStopsCatalogAsync(raw,m,c,'journey:'+raw.length+':'+m.length+':'+c.length);
   if(alive){setCatalog(list);setCatalogError(mpk.status==='rejected'||marcel.status==='rejected'?'Nie wszyscy przewoźnicy są teraz dostępni.':'');}
  })().catch(()=>{if(alive)setCatalogError('Nie udało się pobrać przystanków. Otwórz ponownie zakładkę lub sprawdź połączenie.');}).finally(()=>{if(alive)setCatalogLoading(false);});
  return()=>{alive=false;};
 },[stops]);
 useAppBack(active&&Boolean(picker||preferences||map||selected),()=>{if(picker)setPicker(null);else if(preferences)setPreferences(false);else if(map)setMap(false);else setSelected(null);return true;},60);
 useAppBack(active,()=>{onClose();return true;},10);
 const filtered=useMemo(()=>{const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').toLowerCase();const q=normalize(query);return catalog.filter(s=>s.type==='bus'&&normalize(s.name).includes(q)).slice(0,60);},[catalog,query]);
 const chosen=results?.find(j=>j.id===selected);
 function invalidate(){generation.current++;controller.current?.abort();setBusy(false);setResults(null);setSelected(null);setMap(false);setError('');setWarnings([]);}
 async function search(){
  if(!from||!to){setError('Wybierz przystanek początkowy i końcowy.');return;}
  if(from.id===to.id){setError('Wybierz dwa różne przystanki.');return;}
  const at=warsawTimeMs(date,time);if(!Number.isFinite(at)||!options.providers.length){setError('Sprawdź termin i wybierz przewoźnika.');return;}
  if(at<Date.now()-60000){setError('Wybierz przyszły termin podróży.');return;}
  invalidate();const token=generation.current,c=new AbortController();controller.current=c;setBusy(true);
  try{const result=await searchConnections(from,to,catalog,date,{...options,at,arriveBy},c.signal,(n,total)=>{if(token===generation.current)setProgress(`${n} / ${total}`);});
   if(c.signal.aborted||token!==generation.current)return;setResults(result.journeys);setWarnings([...result.warnings,...(result.limited?['Przeszukano dostępne kursy i wybrane węzły przesiadkowe. Wyniki nie obejmują wszystkich możliwych połączeń.']:[])]);
  }catch(e){if(!c.signal.aborted)setError(navigator.onLine?'Nie udało się wyszukać połączeń. Spróbuj ponownie.':'Brak internetu. Sprawdź połączenie i spróbuj ponownie.');}
  finally{if(token===generation.current)setBusy(false);}
 }
 function favorite(){if(!from||!to)return;const exists=favorites.some(f=>f.from.id===from.id&&f.to.id===to.id);const next=exists?favorites.filter(f=>f.from.id!==from.id||f.to.id!==to.id):[{from,to},...favorites].slice(0,20);setFavorites(next);try{localStorage.setItem('pks-live:journey-favorites',JSON.stringify(next));}catch{setError('Nie udało się zapisać ulubionych.');}}
 const saved=Boolean(from&&to&&favorites.some(f=>f.from.id===from.id&&f.to.id===to.id));
 return <section className="journey-view" data-cosmic-canvas data-panel-theme={dark?'dark':'light'} aria-label="Połączenia">
  <div className="journey-content">
   <header data-cosmic-panel className="journey-card journey-heading"><span className="journey-icon"><Route/></span><div><h1>Połączenia</h1><p>Zaplanuj swoją podróż</p></div></header>
   <div data-cosmic-panel className="journey-card journey-form">
    <button className="journey-location" onClick={()=>{setQuery('');setPicker('from');}}><MapPin/><span><small>SKĄD</small>{from?.name||'Wybierz przystanek początkowy'}</span></button>
    <button className="journey-swap" aria-label="Zamień przystanki" onClick={()=>{invalidate();setFrom(to);setTo(from);}}><ArrowDownUp size={18}/></button>
    <button className="journey-location" onClick={()=>{setQuery('');setPicker('to');}}><MapPin/><span><small>DOKĄD</small>{to?.name||'Wybierz przystanek docelowy'}</span></button>
    <div className="journey-row"><button aria-pressed={!arriveBy} onClick={()=>{invalidate();setArriveBy(false);}}>Odjazd</button><button aria-pressed={arriveBy} onClick={()=>{invalidate();setArriveBy(true);}}>Przyjazd</button><button onClick={()=>{invalidate();setDate(warsawDateIso());setTime(warsawClock(Date.now()));}}><Clock size={16}/> Teraz</button></div>
    <div className="journey-row"><label><CalendarDays size={17}/> Data<input aria-label="Data podróży" type="date" min={warsawDateIso()} max={warsawDateIso(30)} value={date} onChange={e=>{invalidate();setDate(e.target.value);}}/></label><label><Clock size={17}/> Godzina<input aria-label="Godzina podróży" type="time" value={time} onChange={e=>{invalidate();setTime(e.target.value);}}/></label></div>
    <button className="journey-preferences" onClick={()=>setPreferences(!preferences)} aria-expanded={preferences}><SlidersHorizontal size={18}/> Preferencje podróży{preferences?<ChevronUp size={17}/>:<ChevronDown size={17}/>}</button>
    {preferences&&<div className="journey-preference-body">
     <label>Rodzaj połączenia<select value={options.sort} onChange={e=>{invalidate();setOptions({...options,sort:e.target.value as JourneyOptions['sort']});}}><option value="fastest">Najszybsze</option><option value="transfers">Najmniej przesiadek</option><option value="walking">Najmniej pieszo</option></select></label>
     <fieldset><legend>Przewoźnicy</legend>{providers.map(([id,name])=><label className="journey-check" key={id}><input type="checkbox" checked={options.providers.includes(id)} onChange={e=>{invalidate();setOptions({...options,providers:e.target.checked?[...options.providers,id]:options.providers.filter(p=>p!==id)});}}/>{name}</label>)}</fieldset>
     <label>Maksymalnie przesiadek<select value={options.maxTransfers} onChange={e=>{invalidate();setOptions({...options,maxTransfers:Number(e.target.value)});}}><option value={0}>Bez przesiadek</option><option value={1}>1 przesiadka</option><option value={2}>2 przesiadki</option></select></label>
     <label>Łączny marsz: {options.walkMeters} m<input type="range" min="0" max="2000" step="100" value={options.walkMeters} onChange={e=>{invalidate();setOptions({...options,walkMeters:Number(e.target.value)});}}/></label>
     <label>Zapas na przesiadkę<select value={options.transferMinutes} onChange={e=>{invalidate();setOptions({...options,transferMinutes:Number(e.target.value)});}}>{[3,5,10,15].map(n=><option key={n} value={n}>{n} min</option>)}</select></label>
    </div>}
    <p className="journey-hint">Połączenia autobusowe · do 6 godzin od wybranego terminu. Kursy nocne przez zmianę dnia mogą być niepełne.</p>
    <div className="journey-row"><button className="journey-primary" disabled={busy||catalogLoading&&!catalog.length} onClick={search}>{busy?<LoaderCircle className="animate-spin" size={18}/>:<Search size={18}/>} {busy?`Szukam… ${progress}`:'Szukaj połączeń'} {!busy&&<ArrowRight size={18}/>}</button>{from&&to&&<button aria-label={saved?'Usuń z ulubionych':'Zapisz połączenie'} aria-pressed={saved} onClick={favorite}><Star size={20} fill={saved?'currentColor':'none'}/></button>}</div>
    {busy&&<button onClick={()=>{generation.current++;controller.current?.abort();setBusy(false);}}>Anuluj wyszukiwanie</button>}
    {error&&<p role="alert" className="journey-error"><AlertCircle size={17}/>{error}</p>}
    {catalogLoading&&<p className="journey-hint" role="status">Wczytywanie przystanków…</p>}{catalogError&&<p className="journey-hint">{catalogError}</p>}
   </div>
   {!results&&favorites.length>0&&<div data-cosmic-panel className="journey-card"><h2>Ulubione połączenia</h2>{favorites.map(f=><div className="journey-row" key={f.from.id+':'+f.to.id}><button className="journey-favorite" onClick={()=>{invalidate();setFrom(catalog.find(s=>s.id===f.from.id)||f.from);setTo(catalog.find(s=>s.id===f.to.id)||f.to);}}><Star size={16}/>{f.from.name} → {f.to.name}</button><button aria-label="Usuń ulubione połączenie" onClick={()=>{const next=favorites.filter(x=>x!==f);setFavorites(next);try{localStorage.setItem('pks-live:journey-favorites',JSON.stringify(next));}catch{}}}><X size={16}/></button></div>)}</div>}
   {results&&<div className="journey-results" aria-live="polite"><h2>{results.length?'Dostępne połączenia':'Nie znaleziono potwierdzonego połączenia'}</h2>{!results.length&&<div data-cosmic-panel className="journey-card"><Route/><p>Spróbuj innej godziny, zwiększ liczbę przesiadek lub wybierz pobliski przystanek.</p></div>}
    {warnings.map(w=><p className="journey-hint" key={w}>{w}</p>)}
    {results.map(j=><article data-cosmic-panel className="journey-card" key={j.id}><button className="journey-result" aria-expanded={selected===j.id} onClick={()=>{setSelected(selected===j.id?null:j.id);setMap(false);}}><strong>{warsawClock(j.departure)} → {warsawClock(j.arrival)}</strong><b>{Math.ceil((j.arrival-j.departure)/60000)} min</b><span>{j.transfers===0?'Bez przesiadek':j.transfers===1?'1 przesiadka':`${j.transfers} przesiadki`} · {j.walking} m pieszo</span><div className="journey-badges">{j.legs.map((l,i)=><span key={i} data-provider={l.provider}>{l.walking!==undefined?<Footprints size={14}/>:<Bus size={14}/>} {l.walking!==undefined?`${l.walking} m`:l.line}</span>)}</div></button>
    {selected===j.id&&<div className="journey-timeline">{j.legs.map((l,i)=><div className="journey-leg" key={i}><span className="journey-timeline-dot"/><small>{warsawClock(l.departure)} — {warsawClock(l.arrival)}</small><h3>{l.from.name}</h3><p>{l.walking!==undefined?`Pieszo · około ${l.walking} m`:`Linia ${l.line} · ${providers.find(p=>p[0]===l.provider)?.[1]||l.provider}`}</p><p>→ {l.to.name}</p></div>)}<p className="journey-hint">Godziny według rozkładu. Dojścia piesze są szacunkowe. Sprawdź aktualne odjazdy przed podróżą.</p>{allowMap&&<button className="journey-primary" onClick={()=>setMap(!map)}><MapPin size={17}/>{map?'Ukryj mapę':'Pokaż plan na mapie'}</button>}{allowMap&&map&&chosen&&<JourneyMap journey={chosen} dark={dark}/>}</div>}</article>)}
   </div>}
  </div>
  {picker&&<div ref={pickerRef} className="journey-picker" role="dialog" aria-modal="true" aria-label="Wybierz przystanek"><div className="journey-picker-header"><h2>{picker==='from'?'Skąd jedziesz?':'Dokąd jedziesz?'}</h2><button aria-label="Zamknij wybór przystanku" onClick={()=>setPicker(null)}><X/></button></div><div className="journey-search"><Search size={19}/><input autoFocus placeholder="Wpisz nazwę przystanku…" aria-label="Szukaj przystanku" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="journey-stop-list">{filtered.map(s=><button key={s.id} onClick={()=>{invalidate();if(picker==='from')setFrom(s);else setTo(s);setPicker(null);}}><span className="journey-icon"><Bus size={19}/></span><span><strong>{s.name}</strong><small>{s.carriers.map(c=>c.name).join(' · ')}</small><small>{s.lines.join(' · ')}</small></span></button>)}{!filtered.length&&<p>{catalogLoading?'Wczytywanie…':'Brak pasujących przystanków.'}</p>}</div></div>}
 </section>;
}
