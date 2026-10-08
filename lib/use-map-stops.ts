'use client';
import {readBusCoordinates} from './bus-coordinates';
import {useEffect,useState} from 'react';
import type {Stop} from '@/Panel/src/types';
import {buildStopsCatalog} from './stops-catalog';
import {readStopsCatalogCache,peekStopsCatalogCache,type CatalogSnapshot} from './stops-catalog-cache';
import {fetchMpkRzeszowStopsClient} from './pks-client';
import {ensureMpkCityPrefix,stopCollectionSignature} from '@/components/stops-panel/stop-domain';
import type {RawStop} from '@/components/stops-panel/stop-domain';

function physicalCatalog(pks:RawStop[],mpk:CatalogSnapshot['mpk'],marcel:CatalogSnapshot['marcel']){
  return buildStopsCatalog(pks,mpk,marcel,[pks,mpk,marcel].map(stopCollectionSignature).join('|'),true);
}

/** Load only the stop catalog when enabled; departures are fetched after selection. */
export function useMapStops(enabled:boolean,pks:RawStop[]){
  const [stops,setStops]=useState<Stop[]>([]);
  useEffect(()=>{
    if(!enabled)return;
    let active=true;
    const controller=new AbortController();
    let scheduled = 0;
    const apply=(p:RawStop[],m:CatalogSnapshot['mpk'],r:CatalogSnapshot['marcel'])=>{
      window.clearTimeout(scheduled);
      scheduled=window.setTimeout(()=>{if(active)setStops(physicalCatalog(p,m,r));},40);
    };
    const refresh=async()=>{
      const cached=await readStopsCatalogCache();
      if(active&&cached)apply(cached.pks,cached.mpk,cached.marcel);
      const initialPks=pks.length?pks:cached?.pks||[];
      if(active&&initialPks.length)apply(initialPks,cached?.mpk||[],cached?.marcel||[]);
      const mpk=await fetchMpkRzeszowStopsClient({signal:controller.signal}).then(rows=>rows.map(stop=>({id:String(stop.stop_id),
        name:ensureMpkCityPrefix(stop.stop_name,Number(stop.stop_lat),Number(stop.stop_lon)),lat:readBusCoordinates(stop.stop_lat,stop.stop_lon)?.lat,lon:readBusCoordinates(stop.stop_lat,stop.stop_lon)?.lon,
        lines:String(stop.lines||'').split(',').map(line=>line.trim()).filter(Boolean)}))).catch(()=>cached?.mpk||[]);
      if(!active)return;
      const snapshot=peekStopsCatalogCache()||cached;
      const raw=pks.length?pks:snapshot?.pks||[];
      const marcel=snapshot?.marcel||[];
      apply(raw,mpk,marcel);
    };
    void refresh();
    const updated=()=>{const cached=peekStopsCatalogCache();if(active&&cached)apply(cached.pks,cached.mpk,cached.marcel);};
    window.addEventListener('pks-live:catalog-updated',updated);
    return()=>{active=false;window.clearTimeout(scheduled);controller.abort();window.removeEventListener('pks-live:catalog-updated',updated);};
  },[enabled,pks]);
  return enabled?stops:[];
}
