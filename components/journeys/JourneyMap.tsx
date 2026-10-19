'use client';
import {useEffect,useState} from 'react';
import {officialBusRoute} from '@/lib/official-bus-routes';
import {MapContainer,TileLayer,CircleMarker,Tooltip,Polyline} from 'react-leaflet';
import type {Journey} from '@/lib/journey-planner';
import 'leaflet/dist/leaflet.css';
export default function JourneyMap({journey,dark}:{journey:Journey;dark:boolean}){
 const [paths,setPaths]=useState<Record<number,Array<[number,number]>>>({});
 useEffect(()=>{let alive=true;setPaths({});void Promise.all(journey.legs.map(async(l,i)=>{
  if(l.walking!==undefined||!['pks','mpk'].includes(l.provider))return;
  try{const full=await officialBusRoute(l.provider==='mpk'?'mpk_rzeszow':'pks',l.course.split(':')[1],[]);
   const distance=(p:[number,number],s:typeof l.from)=>Math.hypot((p[0]-s.lat!)*111000,(p[1]-s.lon!)*71000);
   let start=-1,end=-1,sd=Infinity,ed=Infinity;
   full.forEach((p,n)=>{const d=distance(p,l.from);if(d<sd){sd=d;start=n;}});
   full.forEach((p,n)=>{if(n<=start)return;const d=distance(p,l.to);if(d<ed){ed=d;end=n;}});
   if(alive&&start>=0&&end>start&&sd<200&&ed<200)setPaths(old=>({...old,[i]:full.slice(start,end+1)}));
  }catch{} }));return()=>{alive=false;};},[journey]);
 const points=journey.legs.flatMap(l=>[l.from,l.to]).filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lon));
 if(points.length<2)return <p className="journey-hint">Brak współrzędnych do wyświetlenia planu.</p>;
 return <div className="journey-map"><MapContainer bounds={points.map(s=>[s.lat!,s.lon!] as [number,number])} boundsOptions={{padding:[25,25]}} style={{height:320,width:'100%'}} scrollWheelZoom={false}>
  <TileLayer url={dark?'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png':'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'} attribution={dark?'&copy; OpenStreetMap &copy; CARTO':'&copy; OpenStreetMap'}/>
  {journey.legs.map((l,i)=>Number.isFinite(l.from.lat)&&Number.isFinite(l.from.lon)&&Number.isFinite(l.to.lat)&&Number.isFinite(l.to.lon)?<Polyline key={i} positions={paths[i]||[[l.from.lat!,l.from.lon!],[l.to.lat!,l.to.lon!]]} pathOptions={{color:l.walking!==undefined?'#94a3b8':l.provider==='mpk'?'#f97316':l.provider==='marcel'?'#84cc16':'#14b8a6',dashArray:paths[i]?undefined:'5 9',weight:3}}/>:null)}
  {points.map((s,i)=><CircleMarker key={i} center={[s.lat!,s.lon!]} radius={6} pathOptions={{color:'#fff',fillColor:'#14b8a6',fillOpacity:1}}><Tooltip>{s.name}</Tooltip></CircleMarker>)}
 </MapContainer><p className="journey-hint">Linia ciągła: przebieg trasy. Linia przerywana: schemat między przystankami lub szacowane dojście.</p></div>;
}
