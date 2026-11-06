import { startTransition, useEffect, useRef, useState } from 'react';
import type { Departure, DepartureResult, Stop } from '../types';
import { stopRequestKey } from '../../../lib/stop-timetable-store';
import { useForegroundRefresh } from '../../../lib/use-foreground-refresh';

export type DepartureLoader = (stop: Stop, dayIndex?: number, partial?: (result: DepartureResult) => void) => Promise<Departure[] | DepartureResult>;
/** One refresh loop per stop/date; cleanup invalidates both manual and automatic requests. */
export function useStopDepartures(stop: Stop, dayIndex: number, dateIso: string, load: DepartureLoader, enabled = true) {
  const [state,setState] = useState({departures:[] as Departure[],warnings:[] as string[],isLoading:true,isFetching:false,updatedAt:0});
  const refreshRef = useRef<() => void>(()=>{});
  const input = useRef({stop,load,dayIndex});
  input.current = {stop,load,dayIndex};
  const key = stopRequestKey(stop)+':'+dateIso+':'+dayIndex;
  const viewKey = JSON.stringify([stop.id,dateIso,dayIndex]);
  const previousView = useRef(viewKey);
  const scope = useRef(0);
  useEffect(()=> {
    scope.current++;
    // Catalog enrichment can change source metadata while this same stop/day
    // remains open. Reload its sources without replacing an already visible list.
    if(previousView.current!==viewKey){
      previousView.current=viewKey;
      setState({departures:[],warnings:[],isLoading:true,isFetching:false,updatedAt:0});
    }
    return ()=>{scope.current++;};
  },[key,viewKey]);
  const refresh = useForegroundRefresh(key,async()=>{
    const generation=scope.current;
    const valid=()=>generation===scope.current;
    setState(previous=>valid()?{...previous,isFetching:true}:previous);
    const partial=(result:DepartureResult)=>{if(valid())startTransition(()=>setState(previous=>!valid()||previous.updatedAt?previous:{...result,isLoading:false,isFetching:true}));};
    try {
      const value=await input.current.load(input.current.stop,input.current.dayIndex,partial);
      if(!valid())return;
      const result=Array.isArray(value)?{departures:value,warnings:[],updatedAt:Date.now()}:value;
      startTransition(()=>setState(previous=>valid()?{...result,isLoading:false,isFetching:false}:previous));
    }catch(error){if(valid())setState(previous=>valid()?{...previous,isLoading:false,isFetching:false,warnings:[error instanceof Error?error.message:'Nie udało się pobrać odjazdów.',...(previous.updatedAt?['Zachowano ostatnio pobrany rozkład.']:[])]}:previous);}
  },dayIndex===0?10_000:300_000,enabled);
  refreshRef.current=refresh;
  useEffect(()=>{
    const update=()=>{if(enabled)refreshRef.current();};
    window.addEventListener('pks-live:gtfs-updated',update);
    window.addEventListener('pks-live:mpk-gtfs-updated',update);
    return()=>{window.removeEventListener('pks-live:gtfs-updated',update);window.removeEventListener('pks-live:mpk-gtfs-updated',update);};
  },[enabled]);
  return {...state,refresh:()=>refreshRef.current()};
}
