import { useEffect, useRef, useState } from 'react';
import type { Departure, DepartureResult, Stop } from '../types';
import { stopRequestKey } from '../../../lib/stop-timetable-store';

export type DepartureLoader = (stop: Stop, dayIndex?: number) => Promise<Departure[] | DepartureResult>;
/** One refresh loop per stop/date; cleanup invalidates both manual and automatic requests. */
export function useStopDepartures(stop: Stop, dayIndex: number, dateIso: string, load: DepartureLoader) {
  const [state,setState] = useState({departures:[] as Departure[],warnings:[] as string[],isLoading:true,isFetching:false});
  const refreshRef = useRef<() => void>(()=>{});
  const input = useRef({stop,load,dayIndex});
  input.current = {stop,load,dayIndex};
  const key = stopRequestKey(stop);
  useEffect(()=> {
    let active = true;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let loaded = false;
    setState({departures:[],warnings:[],isLoading:true,isFetching:false});
    async function refresh() {
      if(!active || pending) return;
      pending = true;
      clearTimeout(timer);
      setState(state=>({...state,isFetching:true}));
      try {
        const value = await input.current.load(input.current.stop,input.current.dayIndex);
        if(!active) return;
        const result = Array.isArray(value) ? {departures:value,warnings:[]} : value;
        loaded = true;
        setState({...result,isLoading:false,isFetching:false});
      } catch(error) {
        if(active) setState(state=>({...state,isLoading:false,isFetching:false,warnings:[error instanceof Error ? error.message : 'Nie udało się pobrać odjazdów.',...(loaded ? ['Zachowano ostatnio pobrany rozkład.'] : [])]}));
      } finally {
        pending = false;
        if(active) timer = setTimeout(refresh,dayIndex===0 ? 10_000 : 300_000);
      }
    }
    refreshRef.current = ()=>{ void refresh(); };
    void refresh();
    return ()=>{active=false;clearTimeout(timer);};
  },[key,dateIso,dayIndex]);
  return {...state,refresh:()=>refreshRef.current()};
}
