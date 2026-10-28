'use client';
import {useEffect,useMemo,useState} from 'react';
import {MapContainer,TileLayer,Marker,ZoomControl,useMap,useMapEvents} from 'react-leaflet';
import L from 'leaflet';
import CoordinateEntry from './CoordinateEntry';
import CosmicFilterEffects from '../CosmicFilterEffects';
import {MapPin,Check} from 'lucide-react';
import type {Stop} from '@/Panel/src/types';
import {mapStopPinHtml} from '@/lib/map-stop-markers';
import {CatalogStopsLayer} from '@/components/map/StopLayers';
import {journeyMapPoint,isJourneyCoordinate} from '@/lib/journey-places';
import {displayStopCatalogLabel} from '@/lib/stop-label';
import 'leaflet/dist/leaflet.css';

type Props={stops:Stop[];initial:Stop|null;onSelect:(stop:Stop)=>void};
function MapPoints({stops,selected,onPick,focus}:{stops:Stop[];selected:Stop|null;onPick:(stop:Stop)=>void;focus:[number,number]|null}){
 const map=useMap();
 useEffect(()=>{if(focus)map.setView(focus,Math.max(15,map.getZoom()),{animate:false});},[map,focus]);
 const pin=useMemo(()=>L.divIcon({className:'connections-picked-pin',html:mapStopPinHtml('var(--cn-accent,var(--pks-accent,#00a3a2))'),iconSize:[38,48],iconAnchor:[19,46]}),[]);
 useMapEvents({click(event){onPick(journeyMapPoint(event.latlng.lat,event.latlng.lng));}});
 useEffect(()=>{const observer=new ResizeObserver(()=>map.invalidateSize({pan:false}));observer.observe(map.getContainer());return()=>observer.disconnect();},[map]);
 return <>
  <CatalogStopsLayer stops={stops} selected={selected&&!isJourneyCoordinate(selected)?selected.id:null} onSelect={onPick}/>
  {selected&&isJourneyCoordinate(selected)&&Number.isFinite(selected.lat)&&Number.isFinite(selected.lon)&&<Marker position={[selected.lat!,selected.lon!]} icon={pin} zIndexOffset={5000} interactive={false} keyboard={false}/>}
 </>;
}
export default function JourneyPlaceMap({stops,initial,onSelect}:Props){
 const [selected,setSelected]=useState<Stop|null>(initial&&Number.isFinite(initial.lat)&&Number.isFinite(initial.lon)?initial:null);
 const [focus,setFocus]=useState<[number,number]|null>(null);
 const center:[number,number]=selected?[selected.lat!,selected.lon!]:[50.0412,21.9991];
 return <div className="connections-place-map">
  <CoordinateEntry onPick={stop=>{setSelected(stop);setFocus([stop.lat!,stop.lon!]);}}/>
  <p className="connections-place-map-hint"><MapPin size={16}/>Dotknij kropki przystanku albo dowolnego miejsca na mapie.</p>
  <MapContainer attributionControl={false} center={center} zoom={15} className="connections-place-leaflet" zoomControl={false}>
   <TileLayer url="https://mt1.google.com/vt/lyrs=m&hl=pl&gl=PL&x={x}&y={y}&z={z}" maxZoom={19}/>
   <ZoomControl position="bottomright"/><MapPoints stops={stops} selected={selected} onPick={setSelected} focus={focus}/>
  </MapContainer>
  <div className="connections-place-confirm"><CosmicFilterEffects/><div aria-live="polite"><strong>{selected?displayStopCatalogLabel(selected.name,selected.code):'Wybierz miejsce na mapie'}</strong><small>{selected?`${selected.lat!.toFixed(5)}, ${selected.lon!.toFixed(5)}`:'Przybliż mapę, aby zobaczyć kropki przystanków'}</small></div><button className="connections-primary" disabled={!selected} onClick={()=>selected&&onSelect(selected)}><Check size={17}/>Wybierz</button></div>
 </div>;
}
