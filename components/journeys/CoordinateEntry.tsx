'use client';
import {useId,useRef,useState} from 'react';
import {parseJourneyCoordinates} from '@/lib/journey-coordinates';
import type {Stop} from '@/Panel/src/types';

export default function CoordinateEntry({onPick}:{onPick:(stop:Stop)=>void}){
 const [value,setValue]=useState(''),[error,setError]=useState('');
 const input=useRef<HTMLInputElement>(null),id=useId();
 return <form className="connections-coordinate-entry" onSubmit={event=>{
  event.preventDefault();const point=parseJourneyCoordinates(value);
  if(!point){setError('Wpisz poprawne współrzędne, np. 50.03897, 22.00282.');return;}
  setError('');onPick(point);input.current?.blur();
 }}>
  <label htmlFor={id}>Współrzędne</label>
  <div><input ref={input} id={id} aria-label="Współrzędne" aria-describedby={id+'-hint'} aria-invalid={Boolean(error)} autoComplete="off" spellCheck={false} enterKeyHint="done" maxLength={100} placeholder="50.03897, 22.00282" value={value} onChange={e=>{setValue(e.target.value);setError('');}}/>
  <button type="submit" disabled={!value.trim()}>Ustaw punkt</button></div>
  <small id={id+'-hint'}>Wpisz lub wklej: szerokość, długość geograficzna.</small>
  {error&&<p aria-live="polite">{error}</p>}
 </form>;
}
