'use client';
import {useEffect,useState} from 'react';
import {fetchMpkRzeszowStopsClient} from './pks-client';
/** Display-only names from the existing MPK API/cache; never update stop identities. */
export function useMpkStopNames(enabled:boolean){
 const [names,setNames]=useState<ReadonlyMap<string,string>>(new Map());
 useEffect(()=>{if(!enabled)return;let active=true;
  void fetchMpkRzeszowStopsClient().then(rows=>{if(active)setNames(new Map(rows.filter(row=>row.stop_name).map(row=>[String(row.stop_id),row.stop_name])));}).catch(()=>{});
  return()=>{active=false;};
 },[enabled]);return names;
}
