import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {loadPksGtfs,refreshPksGtfs,peekPksGtfs,pksGtfsLines,pksGtfsIndex,pksGtfsUpdateStatus} from '../lib/pks-gtfs-runtime';
import {loadMpkGtfs,refreshMpkGtfs,withMpkGtfsStops,mpkGtfsUpdateStatus} from '../lib/mpk-gtfs-runtime';
import {fetchStopsClient} from '../lib/providers/pks-stops';
import {fetchDeparturesClient} from '../lib/providers/pks-departures';
import {loadJourneyFeed} from '../lib/journey-feed';
import {loadStopDepartures} from '../lib/stop-departures';
import BusStopDetail from '../Panel/src/components/BusStopDetail';
import type {Stop} from '../Panel/src/types';
const carrier={id:'pks',name:'PKS',colorClass:'text-green-700'};
function App(){
 const [state,setState]=useState<any>(null),[stop,setStop]=useState<Stop|null>(null);
 useEffect(()=>{
  let alive=true;
  async function read(){
   await loadPksGtfs();const points=await fetchStopsClient(),lines=pksGtfsLines(),key='gtfs:777',s=points[key];
   const feed=await loadJourneyFeed('pks'),mpk=await loadJourneyFeed('mpk'),mpkStops=await withMpkGtfsStops([]);
   const selected:Stop|undefined=s?{id:key,name:s.n,lat:s.lat,lon:s.lon,areaId:s.areaId,code:s.code,type:'bus',carriers:[carrier],lines:lines?.[key]||[],isFavorite:false,sourceProviderIds:['pks'],providerStopIds:{pks:key},pksStopPoints:[{id:key,areaId:s.areaId,code:s.code}]}:undefined;
   const departures=selected?await fetchDeparturesClient(key,s.areaId,s.code,'2026-11-04'):null;
   if(alive){setStop(selected||null);setState({revision:peekPksGtfs()?.revision,pksStatus:pksGtfsUpdateStatus(),mpkStatus:mpkGtfsUpdateStatus(),mpkLines:[...new Set(mpk.trips.map(t=>t[1]))],mpkStopLines:mpkStops.find(s=>String(s.stop_id)==='777')?.lines,lines:lines?.[key],journeys:departures?.journeys.map(r=>r.line_name),feedLines:[...new Set(feed.trips.map(t=>t[1]))],hasLutcza:Object.values(points).some(p=>/lutcza/i.test(p.n)),mapped:Boolean(pksGtfsIndex()?.byStop[key])});}
  }
  (window as any).__refreshPks=async()=>{await Promise.all([refreshPksGtfs(true),refreshMpkGtfs(true)]);await read();};
  (window as any).__readPks=read;
  void read().catch(e=>{console.error(e);setState({error:e.message});});
  return()=>{alive=false;};
 },[]);
 return <><pre id="snapshot">{JSON.stringify(state)}</pre>{stop&&<BusStopDetail stop={stop} onBack={()=>{}} toggleFavorite={()=>{}} loadDepartures={loadStopDepartures} isDarkTheme={false}/>}</>;
}
createRoot(document.getElementById('root')!).render(<App/>);
