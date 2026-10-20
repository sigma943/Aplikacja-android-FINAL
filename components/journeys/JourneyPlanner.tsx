'use client';
import {formatJourneyDuration} from '@/lib/journey-duration';
import {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowDownUp,MapPin,CalendarDays,SlidersHorizontal,Search,ChevronDown,ChevronUp,Bus,Footprints,LocateFixed,History,Trash2,LoaderCircle,ArrowRight,Clock,AlertCircle,Check,ArrowLeft,Map as MapIcon} from 'lucide-react';
import type {Stop} from '@/Panel/src/types';
import StopList from '@/Panel/src/components/StopList';
import {displayStopCatalogLabel} from '@/lib/stop-label';
import {transferCount} from '@/lib/polish-count';
import {journeyDepartureLabel,journeyDestinationLabel} from '@/lib/journey-label';
import {journeyPickerStops,currentJourneyLocation,LOCATION_ID,isJourneyCoordinate} from '@/lib/journey-places';
import {loadJourneyCatalog} from '@/lib/journey-catalog';
import {searchConnections} from '@/lib/journey-loader';
import {useForegroundRefresh} from '@/lib/use-foreground-refresh';
import {stableJourneyResults} from '@/lib/journey-view-state';
import {type Journey,type JourneyOptions} from '@/lib/journey-planner';
import {warsawClock,warsawDateIso,warsawTimeMs} from '@/lib/transit-time';
import {useDialogFocus} from '@/lib/use-dialog-focus';
import {useAppBack} from '@/lib/use-app-back';
import dynamic from 'next/dynamic';
import JourneyIcon from './JourneyIcon';
import JourneyStages from './JourneyStages';
import './journeys.css';
const JourneyMap=dynamic(()=>import('./JourneyMap'),{ssr:false,loading:()=> <p className="connections-hint">Ładowanie mapy…</p>});
const JourneyPlaceMap=dynamic(()=>import('./JourneyPlaceMap'),{ssr:false,loading:()=> <p className="connections-hint">Ładowanie mapy…</p>});
const providers=[['pks','PKS Rzeszów'],['mpk','MPK Rzeszów'],['marcel','Marcel']];
const label=(stop:Stop)=>displayStopCatalogLabel(stop.name,stop.code);
type Recent={from:Stop;to:Stop;searchedAt?:number};
type LiveQuery={from:Stop;to:Stop;date:string;now:boolean;options:JourneyOptions};
function readRecents():Recent[]{try{const saved=JSON.parse(localStorage.getItem('pks-live:journey-recents')||'[]');return Array.isArray(saved)?saved.filter(x=>x?.from?.id&&x?.to?.id&&typeof x.from.name==='string'&&typeof x.to.name==='string').slice(0,5):[];}catch{return [];}}
const privatePlace=(stop:Stop)=>stop.id===LOCATION_ID?{...stop,lat:undefined,lon:undefined}:stop;
function saveRecents(items:Recent[]){try{localStorage.setItem('pks-live:journey-recents',JSON.stringify(items.map(item=>({...item,from:privatePlace(item.from),to:privatePlace(item.to)}))));}catch{}}

type Props={stops:Array<{id:string;name:string;lat?:number;lon?:number;areaId?:string;code?:string}>;dark:boolean;active:boolean;allowMap?:boolean;onClose:()=>void};
export default function JourneyPlanner({stops,dark,active,allowMap=true,onClose}:Props){
 const [catalog,setCatalog]=useState<Stop[]>([]),[catalogError,setCatalogError]=useState(''),[catalogLoading,setCatalogLoading]=useState(true),[attempt,setAttempt]=useState(0);
 const [from,setFrom]=useState<Stop|null>(null),[to,setTo]=useState<Stop|null>(null),[picker,setPicker]=useState<'from'|'to'|null>(null);
 const [resultLimit,setResultLimit]=useState(12);
 const [legFocus,setLegFocus]=useState<{journeyId:string;index:number|null;version:number}|null>(null);
 function focusStage(journeyId:string,index:number|null){setMap(true);setLegFocus(old=>({journeyId,index,version:(old?.version||0)+1}));}
 const [mapPicker,setMapPicker]=useState(false),[pickerHost,setPickerHost]=useState<HTMLElement|null>(null);
 const viewRef=useRef<HTMLElement>(null);
 const [preferences,setPreferences]=useState(false),[date,setDate]=useState(()=>warsawDateIso()),[time,setTime]=useState(()=>warsawClock(Date.now())),[now,setNow]=useState(true),[arriveBy,setArriveBy]=useState(false);
 const [options,setOptions]=useState<Omit<JourneyOptions,'at'|'arriveBy'>>({maxTransfers:1,walkMeters:500,transferMinutes:5,providers:['pks','mpk','marcel'],sort:'fastest'});
 const [results,setResults]=useState<Journey[]|null>(null),[selected,setSelected]=useState<string|null>(null),[map,setMap]=useState(false),[busy,setBusy]=useState(false),[refining,setRefining]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState(''),[warnings,setWarnings]=useState<string[]>([]),[recents,setRecents]=useState<Recent[]>(readRecents),[locating,setLocating]=useState(false);
 const pickerRef=useRef<HTMLDivElement>(null),controller=useRef<AbortController|null>(null),generation=useRef(0);
 const liveQuery=useRef<LiveQuery|null>(null),liveController=useRef<AbortController|null>(null);
 useDialogFocus(pickerRef,Boolean(picker)&&active,()=>{if(mapPicker)setMapPicker(false);else setPicker(null);});
 useEffect(()=>()=>{controller.current?.abort();liveController.current?.abort();},[]);
 useEffect(()=>{if(!active){generation.current++;controller.current?.abort();liveController.current?.abort();queueMicrotask(()=>{setBusy(false);setRefining(false);setMap(false);setPicker(null);setMapPicker(false);});}},[active]);
 useEffect(()=>{if(!active||!now)return;let alive=true;const update=()=>{if(alive){setDate(warsawDateIso());setTime(warsawClock(Date.now()));}};queueMicrotask(update);const timer=setInterval(update,30000);return()=>{alive=false;clearInterval(timer);};},[active,now]);
 const includeMarcel=options.providers.includes('marcel');
 useEffect(()=>{let alive=true;
  void Promise.resolve().then(async()=>{if(!alive)return;setCatalogLoading(true);setCatalogError('');try{const base=await loadJourneyCatalog(stops,false);if(!alive)return;setCatalog(base);if(includeMarcel){const list=await loadJourneyCatalog(stops,true);if(alive)setCatalog(list);}}catch{if(alive)setCatalogError('Nie udało się wczytać listy przystanków. Spróbuj ponownie.');}finally{if(alive)setCatalogLoading(false);}});
  return()=>{alive=false;};
 },[stops,attempt,includeMarcel]);
 useAppBack(active&&Boolean(picker||preferences||map||selected),()=>{if(picker){if(mapPicker)setMapPicker(false);else setPicker(null);}else if(map)setMap(false);else if(selected)setSelected(null);else setPreferences(false);return true;},60);
 useAppBack(active,()=>{onClose();return true;},10);
 const places=useMemo(()=>journeyPickerStops(catalog),[catalog]);
 const pickerStops=useMemo(()=>places.map(s=>({...s,isFavorite:false})),[places]);
 function invalidate(){setResultLimit(12);generation.current++;controller.current?.abort();liveController.current?.abort();liveQuery.current=null;setBusy(false);setRefining(false);setResults(null);setSelected(null);setLegFocus(null);setMap(false);setError('');setWarnings([]);}
 function openPicker(kind:'from'|'to'){setPickerHost(viewRef.current?.closest<HTMLElement>('.pks-theme-root')||document.body);setError('');setMapPicker(false);setPicker(kind);}
 function choosePlace(stop:Stop){invalidate();if(picker==='from')setFrom(stop);else setTo(stop);setPicker(null);setMapPicker(false);}
 async function locate(){
  setLocating(true);setError('');try{const place=await currentJourneyLocation();choosePlace(place);}catch(e){setError((e as Error).message);}finally{setLocating(false);}
 }
 async function search(){
  if(!from||!to){setError('Wybierz przystanek początkowy i końcowy.');return;}
  if(from.id===to.id){setError('Wybierz dwa różne przystanki.');return;}
  const at=now?Date.now():warsawTimeMs(date,time),searchDate=now?warsawDateIso():date;
  if(!Number.isFinite(at)||(!options.providers.length&&!isJourneyCoordinate(from)&&!isJourneyCoordinate(to))){setError('Sprawdź datę, godzinę i wybierz przynajmniej jednego przewoźnika.');return;}
  if(at<Date.now()-60000){setError('Wybrana godzina już minęła. Wybierz przyszłą datę i godzinę.');return;}
  invalidate();const token=generation.current,c=new AbortController();controller.current=c;setBusy(true);setProgress('Wczytuję pełne rozkłady…');
  try{const location=from.id===LOCATION_ID||to.id===LOCATION_ID?await currentJourneyLocation():null;const origin=from.id===LOCATION_ID?location!:from,destination=to.id===LOCATION_ID?location!:to;if(c.signal.aborted||token!==generation.current)return;if(origin.id===LOCATION_ID)setFrom(origin);if(destination.id===LOCATION_ID)setTo(destination);
   const next=[{from:origin,to:destination,searchedAt:Date.now()},...recents].slice(0,5);setRecents(next);saveRecents(next);
   const result=await searchConnections(origin,destination,catalog,searchDate,{...options,at,arriveBy,day:searchDate},c.signal,(n,total)=>{if(token===generation.current)setProgress(n===total?'Wyznaczam trasę…':'Wczytuję rozkłady '+n+' / '+total);},partial=>{if(!c.signal.aborted&&token===generation.current){setResults(stableJourneyResults(partial.journeys));setWarnings(partial.warnings);setBusy(false);setRefining(true);}});
   if(c.signal.aborted||token!==generation.current)return;
   liveQuery.current={from:origin,to:destination,date:searchDate,now,options:{...options,at,arriveBy,day:searchDate}};
   setResults(stableJourneyResults(result.journeys));setWarnings(result.warnings);
  }catch(e){if(!c.signal.aborted&&token===generation.current)setError(e instanceof Error?e.message:'Nie udało się wyszukać połączeń. Spróbuj ponownie.');}
  finally{if(token===generation.current){setBusy(false);setRefining(false);}}
 }
 useForegroundRefresh('connections-live',async()=>{
  const query=liveQuery.current;
  if(!query||busy||picker||query.date!==warsawDateIso())return;
  const token=generation.current,c=new AbortController();liveController.current?.abort();liveController.current=c;
  try{
   const result=await searchConnections(query.from,query.to,catalog,query.date,{...query.options,at:query.now?Date.now():query.options.at},c.signal,()=>{});
   if(c.signal.aborted||token!==generation.current)return;
   setResults(stableJourneyResults(result.journeys));setWarnings(result.warnings);
  }catch{
   if(!c.signal.aborted&&token===generation.current)setWarnings(current=>[...current.filter(w=>!w.startsWith('Aktualizacja opóźnień:')),'Aktualizacja opóźnień: nie udało się pobrać nowych danych. Ponowię automatycznie.']);
  }
 },30000,active&&results!==null&&!busy,30000);
 const changeOption=(patch:Partial<typeof options>)=>{invalidate();setOptions(value=>({...value,...patch}));};
 return <section ref={viewRef} className="connections-view" data-panel-theme={dark?'dark':'light'} data-cosmic-canvas aria-label="Połączenia">
  <div className="connections-content" inert={Boolean(picker)}>
   <header className="connections-heading"><span className="connections-emblem"><JourneyIcon size={28}/></span><div><h1>Połączenia</h1><p>Rozkłady jazdy i planowanie podróży</p></div></header>
   <div className="connections-workspace"><aside className="connections-search-column"><div data-cosmic-panel className="connections-card connections-form">
    <div className="connections-route-fields">
     <button data-journey-from className="connections-location" onClick={()=>openPicker('from')}><span className="connections-origin-dot"/><span><small>SKĄD JEDZIESZ?</small><strong>{from?label(from):'Wybierz przystanek początkowy'}</strong></span><ChevronDown size={18}/></button>
     <button className="connections-swap" aria-label="Zamień przystanki" onClick={()=>{invalidate();setFrom(to);setTo(from);}}><ArrowDownUp size={17}/></button>
     <button data-journey-to className="connections-location" onClick={()=>openPicker('to')}><MapPin size={20}/><span><small>DOKĄD?</small><strong>{to?journeyDestinationLabel(to):'Wybierz przystanek docelowy'}</strong></span><ChevronDown size={18}/></button>
    </div>
    <div className="connections-time-mode"><div className="connections-segment"><button aria-pressed={!arriveBy} onClick={()=>{invalidate();setArriveBy(false);}}>Odjazd</button><button aria-pressed={arriveBy} onClick={()=>{invalidate();setArriveBy(true);}}>Przyjazd</button></div></div>
    <div className="connections-datetime"><label><CalendarDays size={18}/><span><small>Data podróży</small><input aria-label="Data podróży" type="date" min={warsawDateIso()} max={warsawDateIso(30)} value={date} onChange={e=>{invalidate();setNow(false);setDate(e.target.value);}}/></span></label><label><Clock size={18}/><span><small>{arriveBy?'Przyjazd do':'Od godziny'}</small><input aria-label="Godzina podróży" type="time" value={time} onChange={e=>{invalidate();setNow(false);setTime(e.target.value);}}/></span></label></div>
    <button className="connections-preferences" onClick={()=>setPreferences(v=>!v)} aria-expanded={preferences}><SlidersHorizontal size={17}/><span>Preferencje podróży<small>{options.maxTransfers<0?'Bez limitu przesiadek':options.maxTransfers===0?'Bez przesiadek':options.maxTransfers===1?'Do 1 przesiadki':'Do '+options.maxTransfers+' przesiadek'} · dojścia do {options.walkMeters} m</small></span>{preferences?<ChevronUp size={17}/>:<ChevronDown size={17}/>}</button>
    {preferences&&<div className="connections-preference-body">
     <label className="connections-sort-label">Sortowanie<select value={options.sort} onChange={e=>changeOption({sort:e.target.value as JourneyOptions['sort']})}><option value="fastest">Najwcześniejszy przyjazd</option><option value="transfers">Najmniej przesiadek</option><option value="walking">Najmniej pieszo</option></select></label>
     <fieldset><legend>Przewoźnicy</legend><div className="connections-provider-options">{providers.map(([id,name])=><button type="button" key={id} data-provider={id} aria-pressed={options.providers.includes(id)} onClick={()=>changeOption({providers:options.providers.includes(id)?options.providers.filter(p=>p!==id):[...options.providers,id]})}><span className="connections-provider-dot"/>{name}{options.providers.includes(id)&&<Check size={13}/>}</button>)}</div></fieldset>
     <div className="connections-option-row"><fieldset><legend><ArrowDownUp size={15}/>Przesiadki</legend><div className="connections-option-chips">{[0,1,2,-1].map(n=><button type="button" key={n} aria-label={n<0?'Bez limitu przesiadek':n===0?'Bez przesiadek':n===1?'Maksymalnie 1 przesiadka':'Maksymalnie 2 przesiadki'} aria-pressed={options.maxTransfers===n} onClick={()=>changeOption({maxTransfers:n})}><strong>{n<0?'∞':n===0?'Bez':n}</strong><small>{n<0?'bez limitu':n===0?'bezpośrednio':n===1?'przesiadka':'przesiadki'}</small></button>)}</div></fieldset><fieldset><legend><Clock size={15}/>Czas na przesiadkę</legend><div className="connections-option-chips">{[3,5,10,15,0].map(n=><button type="button" key={n} aria-label={n===0?'Bez limitu czasu na przesiadkę':'Zapas '+n+' min'} aria-pressed={options.transferMinutes===n} onClick={()=>changeOption({transferMinutes:n})}><strong>{n===0?'∞':n}</strong><small>{n===0?'bez limitu':'min'}</small></button>)}</div><p className="connections-hint">Minuty określają minimalny zapas na przesiadkę. Bez limitu: bez dodatkowego zapasu. Dłuższe oczekiwanie jest dozwolone do końca wybranego dnia.</p></fieldset></div>
     <label className="connections-walk-option"><span><Footprints size={16}/>Dojścia piesze<output>{options.walkMeters} m</output></span><input aria-label="Maksymalny dystans pieszo" type="range" min="0" max="2000" step="50" value={options.walkMeters} style={{background:`linear-gradient(to right,var(--cn-accent) ${options.walkMeters/20}%,var(--cn-edge) 0)`}} onChange={e=>changeOption({walkMeters:Number(e.target.value)})}/><small><span>0 m</span><span>2 km</span></small><small>Niewielkie przekroczenie dystansu jest dopuszczalne.</small></label>
    </div>}
    <div className="connections-actions"><button className="connections-primary" disabled={busy||locating||catalogLoading&&!catalog.length} onClick={search}>{busy?<LoaderCircle className="animate-spin" size={19}/>:<Search size={19}/>}<span>{busy?'Szukam połączeń…':'Znajdź połączenie'}</span>{!busy&&<ArrowRight size={18}/>}</button></div>
    {busy&&<div className="connections-progress" role="status"><span>{progress}</span><button onClick={invalidate}>Anuluj</button></div>}
    {error&&<p role="alert" className="connections-error"><AlertCircle size={17}/>{error}</p>}
    {catalogError&&<p className="connections-error">{catalogError}<button onClick={()=>setAttempt(n=>n+1)}>Ponów</button></p>}
   </div>
   {results===null&&!busy&&recents.length>0&&<div data-cosmic-panel className="connections-card connections-recents"><h2><History size={17}/>Ostatnie wyszukiwania</h2>{recents.map((r,index)=><div className="connections-recent" key={r.searchedAt+':'+index}><button onClick={()=>{invalidate();setFrom(places.find(s=>s.id===r.from.id)||r.from);setTo(places.find(s=>s.id===r.to.id)||r.to);}}><History size={17}/><span>{label(r.from)}<small><ArrowRight size={12}/>{journeyDestinationLabel(r.to)}</small></span></button><button className="connections-recent-delete" aria-label="Usuń ostatnie wyszukiwanie" onClick={()=>{const next=recents.filter(x=>x!==r);setRecents(next);saveRecents(next);}}><Trash2 size={17}/></button></div>)}</div>}
  </aside><main className="connections-answer-column">
   {results!==null&&!busy&&<div className="connections-results" aria-live="polite"><div className="connections-results-heading"><h2>{results.length?'Proponowane połączenia':'Brak połączeń w tym terminie'}</h2>{results.length>0&&<span>{results.length} propozycji</span>}</div>
    {!results.length&&<div className="connections-card connections-empty"><Search size={28}/><h3>Spróbuj innej godziny</h3><p>{arriveBy?'Od początku dnia do wybranej godziny':'Od wybranej godziny do końca dnia'} nie ma połączenia spełniającego preferencje. Możesz też zwiększyć dystans pieszo lub liczbę przesiadek.</p></div>}
    {refining&&<p className="connections-hint" role="status" data-journey-refining>Uzupełniam kursy Marcela i dane na żywo… Możesz już wybrać połączenie.</p>}
    {warnings.map(w=><p className="connections-warning" key={w}><AlertCircle size={16}/>{w}</p>)}
    {results.slice(0,resultLimit).map(j=><article data-cosmic-panel data-journey-result className={'connections-card connections-result-card'+(selected===j.id?' is-expanded':'')} key={j.id}>
     <button className="connections-result" aria-expanded={selected===j.id} onClick={()=>{setSelected(selected===j.id?null:j.id);setLegFocus(null);setMap(false);}}>
      <div className="connections-result-times"><strong>{warsawClock(j.departure)}<ArrowRight size={17}/>{warsawClock(j.arrival)}</strong><span className="connections-duration">{formatJourneyDuration(j.arrival-j.departure)}</span></div>
      <div className="connections-leg-badges">{j.legs.map((l,i)=><span key={i} data-provider={l.provider}>{l.walking!==undefined?<Footprints size={13}/>:<Bus size={13}/>} {l.walking!==undefined?l.walking+' m':l.line}</span>)}</div>
      <div className="connections-endpoints"><span>{journeyDepartureLabel(j.legs[0])}</span><ArrowRight size={16}/><span>{journeyDestinationLabel(j.legs.at(-1)!.to)}</span></div>
      <div className="connections-stops-summary"><span className="connections-disclosure-icon"><Bus size={17}/></span><span className="connections-disclosure-copy"><strong>Przystanki i godziny</strong><small>Szczegóły podróży</small></span><span className="connections-disclosure-action">{selected===j.id?'Zwiń':'Rozwiń'} {selected===j.id?<ChevronUp size={15}/>:<ChevronDown size={15}/>}</span></div>

      <div className="connections-result-meta"><span>{j.legs.every(l=>l.walking!==undefined)?'Całą trasę pieszo':j.transfers===0?'Bez przesiadek':transferCount(j.transfers)}{j.walking>0?' · '+j.walking+' m pieszo':''}</span></div>
     </button>
     {selected===j.id&&<div className="connections-detail connections-journey-timeline">
      <JourneyStages journey={j}/>

      {allowMap&&<button className="connections-map-button" onClick={()=>setMap(!map)}><MapPin size={16}/>{map?'Ukryj mapę':'Pokaż podróż na mapie'}</button>}{allowMap&&map&&<JourneyMap journey={j} dark={dark} focusLeg={legFocus?.journeyId===j.id?legFocus.index:null} focusVersion={legFocus?.version||0} onFocusLeg={index=>focusStage(j.id,index)}/>}</div>}
    </article>)}
    {results.length>resultLimit&&<button className="connections-load-more" onClick={()=>setResultLimit(n=>n+12)}>Pokaż kolejne połączenia <span>+{results.length-resultLimit}</span><ChevronDown size={16}/></button>}
   </div>}
  </main></div></div>
  {active&&picker&&pickerHost&&createPortal(<div className="connections-view connections-picker-host" data-panel-theme={dark?'dark':'light'}><div ref={pickerRef} data-journey-picker className="connections-picker" role="dialog" aria-modal="true" aria-label={picker==='from'?'Wybierz przystanek początkowy':'Wybierz przystanek docelowy'}><header><button aria-label={mapPicker?'Wróć do listy przystanków':'Zamknij wybór przystanku'} onClick={()=>{if(mapPicker)setMapPicker(false);else setPicker(null);}}><ArrowLeft size={20}/></button><div><h2>{picker==='from'?'Skąd jedziesz?':'Dokąd jedziesz?'}</h2><p>{mapPicker?'Wybierz punkt lub przystanek na mapie':'Wybierz przystanek lub dowolne miejsce'}</p></div></header>
   <div className="connections-picker-actions">{picker==='from'&&<button className="connections-use-location" onClick={locate} disabled={locating}><span><LocateFixed size={20}/></span><strong>{locating?'Ustalam lokalizację…':'Twoja lokalizacja'}</strong>{locating&&<LoaderCircle size={17} className="animate-spin"/>}</button>}{allowMap&&<button className="connections-use-location" aria-pressed={mapPicker} onClick={()=>setMapPicker(value=>!value)}><span><MapIcon size={20}/></span><strong>{mapPicker?'Lista przystanków':'Wybierz z mapy'}</strong></button>}</div>
   {error&&<p role="alert" className="connections-error">{error}</p>}{mapPicker?<JourneyPlaceMap stops={catalog} initial={picker==='from'?from:to} onSelect={choosePlace}/>:<div className="connections-picker-list"><StopList stops={pickerStops} isLoading={catalogLoading&&!catalog.length} isDarkTheme={dark} backEnabled={false} onClose={()=>setPicker(null)} notice={catalogError?<p role="alert">{catalogError}<button onClick={()=>setAttempt(n=>n+1)}>Ponów</button></p>:undefined} toggleFavorite={()=>{}} onStopSelect={choosePlace}/></div>}</div></div>,pickerHost)}
 </section>;
}
