import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {fetchStopsClient} from '../lib/providers/pks-stops';
import {buildStopsCatalog} from '../lib/stops-catalog';
import {pksLinesForStop} from '../components/stops-panel/stop-domain';
import {pksGtfsLines} from '../lib/pks-gtfs-runtime';
import {rzeszowTerminalPlatform} from '../lib/stop-label';
import {loadStopDepartures} from '../lib/stop-departures';
import StopList from '../Panel/src/components/StopList';
import BusStopDetail from '../Panel/src/components/BusStopDetail';
import type {Stop} from '../Panel/src/types';
function App(){
 const [stops,setStops]=useState<Stop[]>([]),[selected,setSelected]=useState<Stop|null>(null);
 useEffect(()=>{void fetchStopsClient().then(points=>{
  const catalog=buildStopsCatalog(Object.entries(points).map(([id,s])=>({...s,id,name:s.n})),[],[],'display-browser');
  setStops(catalog.filter(s=>['1','4','7','10'].includes(rzeszowTerminalPlatform(s.name,s.code)||'')).map(s=>({...s,lines:pksLinesForStop(s,pksGtfsLines()||{})})));
 });},[]);
 return <div style={{height:'100vh'}}>{selected?<BusStopDetail stop={selected} onBack={()=>setSelected(null)} toggleFavorite={()=>{}} loadDepartures={loadStopDepartures} isDarkTheme={false}/>:<StopList stops={stops} onStopSelect={setSelected} toggleFavorite={()=>{}} isFullScreen isDarkTheme={false}/>}</div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
