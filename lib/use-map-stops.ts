'use client';
import {useEffect,useState} from 'react';
import type {Stop} from '@/Panel/src/types';
import {buildStopsCatalog} from './stops-catalog';
import {readStopsCatalogCache,peekStopsCatalogCache} from './stops-catalog-cache';
import {fetchMpkRzeszowStopsClient} from './pks-client';
import {ensureMpkCityPrefix,stopCollectionSignature} from '@/components/stops-panel/stop-domain';
import type {RawStop} from '@/components/stops-panel/stop-domain';

/** Load only the stop catalog when enabled; departures are fetched after selection. */
export function useMapStops(enabled:boolean,pks:RawStop[]){
  const [stops,setStops]=useState<Stop[]>([]);
  useEffect(()=>{
    if(!enabled)return;
    let active=true;
    const controller=new AbortController();
    const refresh=async()=>{
      const cached=await readStopsCatalogCache();
      if(active&&cached)setStops(cached.stops);
      const initialPks=pks.length?pks:cached?.pks||[];
      if(active&&initialPks.length)setStops(buildStopsCatalog(initialPks,cached?.mpk||[],cached?.marcel||[],
        'map-initial:'+stopCollectionSignature(initialPks)+':'+stopCollectionSignature(cached?.mpk||[])));
      const mpk=await fetchMpkRzeszowStopsClient({signal:controller.signal}).then(rows=>rows.map(stop=>({id:String(stop.stop_id),
        name:ensureMpkCityPrefix(stop.stop_name,Number(stop.stop_lat),Number(stop.stop_lon)),lat:Number(stop.stop_lat),lon:Number(stop.stop_lon),
        lines:String(stop.lines||'').split(',').map(line=>line.trim()).filter(Boolean)}))).catch(()=>cached?.mpk||[]);
      if(!active)return;
      const snapshot=peekStopsCatalogCache()||cached;
      const raw=pks.length?pks:snapshot?.pks||[];
      const marcel=snapshot?.marcel||[];
      const key='map:'+ [raw,mpk,marcel].map(stopCollectionSignature).join('|');
      setStops(buildStopsCatalog(raw,mpk,marcel,key));
    };
    void refresh();
    const updated=()=>{const cached=peekStopsCatalogCache();if(active&&cached)setStops(cached.stops);};
    window.addEventListener('pks-live:catalog-updated',updated);
    return()=>{active=false;controller.abort();window.removeEventListener('pks-live:catalog-updated',updated);};
  },[enabled,pks]);
  return enabled?stops:[];
}
