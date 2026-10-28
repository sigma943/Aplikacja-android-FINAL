'use client';
import {useEffect,useRef,useState,useId} from 'react';
import {Search,X,LoaderCircle,MapPin} from 'lucide-react';
import {parsePlaceCoordinates,looksLikePlaceCoordinates,searchPlaces,type PlaceResult} from '@/lib/place-search';
import type {Stop} from '@/Panel/src/types';

export default function PlaceSearch({bias,onPick}:{bias:[number,number];onPick:(stop:Stop)=>void}){
 const [query,setQuery]=useState(''),[attempt,setAttempt]=useState(0),[results,setResults]=useState<PlaceResult[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[open,setOpen]=useState(false);
 const container=useRef<HTMLDivElement>(null);
 const input=useRef<HTMLInputElement>(null),list=useRef<HTMLDivElement>(null),id=useId(),submitted=useRef(false);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(!container.current?.contains(event.target as Node))setOpen(false);};
  document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
 },[open]);
 // Keep the search focus stable while the selected pin/map moves.
 const biasRef=useRef(bias);biasRef.current=bias;
 useEffect(()=>{
  const controller=new AbortController(),value=query.trim(),immediate=submitted.current;
  submitted.current=false;
  setResults([]);setMessage('');setBusy(false);
  if(!value){setOpen(false);return()=>controller.abort();}
  const coordinates=parsePlaceCoordinates(value);
  if(coordinates){setResults([{stop:coordinates,address:'Współrzędne: szerokość, długość geograficzna'}]);setOpen(true);return()=>controller.abort();}
  if(looksLikePlaceCoordinates(value)){setMessage('Wpisz poprawne współrzędne, np. 50.03897, 22.00282.');setOpen(true);return()=>controller.abort();}
  if(value.length<3){setMessage('Wpisz co najmniej 3 znaki.');setOpen(true);return()=>controller.abort();}
  setOpen(true);setBusy(true);
  const delay=immediate?0:700;
  const timer=setTimeout(()=>{
   void searchPlaces(value,biasRef.current,controller.signal).then(next=>{
    if(controller.signal.aborted)return;setResults(next);setMessage(next.length?'':'Brak wyników. Dopisz miejscowość lub wklej współrzędne.');
   }).catch(()=>{if(!controller.signal.aborted)setMessage('Nie udało się wyszukać miejsca. Spróbuj ponownie lub wklej współrzędne.');})
    .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
  },delay);
  return()=>{clearTimeout(timer);controller.abort();};
 },[query,attempt]);
 const pick=(stop:Stop)=>{onPick(stop);setOpen(false);input.current?.blur();};
 return <div ref={container} className="connections-place-search">
  <form role="search" aria-label="Wyszukaj miejsce na mapie" onSubmit={event=>{event.preventDefault();submitted.current=true;setOpen(true);setAttempt(n=>n+1);}}>
   <Search size={18} aria-hidden="true"/>
   <input ref={input} role="combobox" aria-label="Miejsce, adres lub współrzędne" aria-autocomplete="list" aria-expanded={open} aria-controls={id} autoComplete="off" spellCheck={false} maxLength={160} placeholder="Miejsce, adres lub współrzędne…" value={query} onChange={e=>setQuery(e.target.value)} onFocus={()=>{if(query.trim())setOpen(true);}}
    onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);e.stopPropagation();}if(e.key==='ArrowDown'&&results.length){e.preventDefault();list.current?.querySelector<HTMLButtonElement>('button')?.focus();}}}/>
   {query&&<button type="button" aria-label="Wyczyść wyszukiwanie miejsca" onClick={()=>{setQuery('');input.current?.focus();}}><X size={16}/></button>}
   <button type="submit" aria-label="Szukaj miejsca" disabled={!query.trim()}>{busy?<LoaderCircle size={18} className="animate-spin"/>:<Search size={18}/>}</button>
  </form>
  {open&&<div className="connections-place-search-results">
   <div ref={list} id={id} role="listbox" aria-label="Znalezione miejsca">{results.map(({stop,address})=><button type="button" role="option" aria-selected={false} key={stop.id+stop.name} onClick={()=>pick(stop)}
    onKeyDown={e=>{const buttons=[...list.current!.querySelectorAll<HTMLButtonElement>('button')],index=buttons.indexOf(e.currentTarget);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(index+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();}if(e.key==='Escape'){e.stopPropagation();input.current?.focus();setOpen(false);}}}>
    <MapPin size={17}/><span><strong>{stop.name}</strong><small>{address||`${stop.lat!.toFixed(5)}, ${stop.lon!.toFixed(5)}`}</small></span></button>)}</div>
   {(busy||message)&&<p aria-live="polite">{busy?'Wyszukiwanie miejsc…':message}</p>}
   <small className="connections-place-search-source">Photon · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></small>
   <button className="connections-place-search-dismiss" type="button" onClick={()=>setOpen(false)}>Zamknij wyniki</button>
  </div>}
 </div>;
}
