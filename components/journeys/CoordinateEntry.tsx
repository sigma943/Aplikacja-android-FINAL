'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {resolveJourneyInput} from '@/lib/resolve-journey-input';
import type {Stop} from '@/Panel/src/types';

export default function CoordinateEntry({onPick}:{onPick:(stop:Stop)=>void}){
 const [value,setValue]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 const input=useRef<HTMLInputElement>(null),id=useId();
 const setPoint=async()=>{
  request.current?.abort();const controller=new AbortController();request.current=controller;
  setError('');setBusy(true);
  try{const point=await resolveJourneyInput(value.trim(),controller.signal);if(!controller.signal.aborted){onPick(point);input.current?.blur();}}
  catch(error){if(!controller.signal.aborted)setError(error instanceof Error&&error.name!=='AbortError'?error.message:'Nie udało się odczytać linku. Spróbuj ponownie.');}
  finally{if(request.current===controller)setBusy(false);}
 };
 return <form className="connections-coordinate-entry" onSubmit={event=>{event.preventDefault();void setPoint();}}>
  <label htmlFor={id}>Współrzędne lub link Google Maps</label>
  <div><input ref={input} id={id} aria-label="Współrzędne" aria-describedby={id+'-hint'} aria-invalid={Boolean(error)} autoComplete="off" spellCheck={false} enterKeyHint="done" maxLength={4096} placeholder="50.03897, 22.00282 lub link" value={value} onChange={e=>{request.current?.abort();setBusy(false);setValue(e.target.value);setError('');}}/>
  <button type="submit" disabled={!value.trim()||busy}>{busy?'Odczytywanie…':'Ustaw punkt'}</button></div>
  <small id={id+'-hint'}>Wpisz współrzędne lub wklej link Google Maps. Krótkie linki wymagają internetu.</small>
  {error&&<p aria-live="polite">{error}</p>}
 </form>;
}
