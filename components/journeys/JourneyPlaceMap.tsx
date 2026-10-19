'use client';
import {useEffect,useMemo,useState} from 'react';
import {MapContainer,TileLayer,CircleMarker,Tooltip,ZoomControl,useMap,useMapEvents} from 'react-leaflet';
import L from 'leaflet';
import {MapPin,Check} from 'lucide-react';
import type {Stop} from '@/Panel/src/types';
import {journeyMapPoint} from '@/lib/journey-places';
import {displayStopCatalogLabel} from '@/lib/stop-label';
import 'leaflet/dist/leaflet.css';

type Props={stops:Stop[];initial:Stop|null;onSelect:(stop:Stop)=>void};
function MapPoints({stops,selected,onPick}:{stops:Stop[];selected:Stop|null;onPick:(stop:Stop)=>void}){
 const map=useMap();
 const [bounds,setBounds]=useState(()=>map.getBounds());
 useMapEvents({moveend(){setBounds(map.getBounds());},click(event){onPick(journeyMapPoint(event.latlng.lat,event.latlng.lng));}});
 useEffect(()=>{const observer=new ResizeObserver(()=>map.invalidateSize({pan:false}));observer.observe(map.getContainer());return()=>observer.disconnect();},[map]);
 const visible=useMemo(()=>stops.filter(stop=>Number.isFinite(stop.lat)&&Number.isFinite(stop.lon)&&bounds.pad(.1).contains([stop.lat!,stop.lon!])),[stops,bounds]);
 return <>
  {visible.map(stop=><CircleMarker key={stop.id} className="connections-pick-stop" center={[stop.lat!,stop.lon!]} radius={6} pathOptions={{color:'#fff',weight:2,fillColor:stop.carriers.some(c=>c.id==='mpk')?'#ff7a00':stop.carriers.some(c=>c.id==='marcel')?'#68c44a':'#14b8a6',fillOpacity:1}} eventHandlers={{click(event){L.DomEvent.stopPropagation(event.originalEvent);onPick(stop);}}}><Tooltip>{displayStopCatalogLabel(stop.name,stop.code)}</Tooltip></CircleMarker>)}
  {selected&&Number.isFinite(selected.lat)&&Number.isFinite(selected.lon)&&<CircleMarker className="connections-picked-point" center={[selected.lat!,selected.lon!]} radius={11} pathOptions={{color:'#fff',weight:3,fillColor:'#00a3a2',fillOpacity:1}} interactive={false}/>}
 </>;
}
export default function JourneyPlaceMap({stops,initial,onSelect}:Props){
 const [selected,setSelected]=useState<Stop|null>(initial&&Number.isFinite(initial.lat)&&Number.isFinite(initial.lon)?initial:null);
 const renderer=useMemo(()=>L.canvas({tolerance:8}),[]);
 const center:[number,number]=selected?[selected.lat!,selected.lon!]:[50.0412,21.9991];
 return <div className="connections-place-map">
  <p className="connections-place-map-hint"><MapPin size={16}/>Dotknij kropki przystanku albo dowolnego miejsca na mapie.</p>
  <MapContainer center={center} zoom={13} className="connections-place-leaflet" zoomControl={false} preferCanvas renderer={renderer}>
   <TileLayer url="https://mt1.google.com/vt/lyrs=m&hl=pl&gl=PL&x={x}&y={y}&z={z}" attribution='Map tiles by Google · &copy; OpenStreetMap contributors' maxZoom={19}/>
   <ZoomControl position="bottomright"/><MapPoints stops={stops} selected={selected} onPick={setSelected}/>
  </MapContainer>
  <div className="connections-place-confirm"><div aria-live="polite"><strong>{selected?displayStopCatalogLabel(selected.name,selected.code):'Wybierz miejsce na mapie'}</strong><small>{selected?`${selected.lat!.toFixed(5)}, ${selected.lon!.toFixed(5)}`:'Przystanki są oznaczone kolorowymi kropkami'}</small></div><button className="connections-primary" disabled={!selected} onClick={()=>selected&&onSelect(selected)}><Check size={17}/>Wybierz</button></div>
 </div>;
}
