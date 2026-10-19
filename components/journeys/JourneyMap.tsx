'use client';
import {Fragment,useEffect,useMemo,useState} from 'react';
import {MapContainer,TileLayer,CircleMarker,Tooltip,Polyline,Marker,ZoomControl,useMap} from 'react-leaflet';
import L from 'leaflet';
import {officialBusRoute} from '@/lib/official-bus-routes';
import {fetchRoadRouteForStops} from '@/lib/transport/road-routing';
import {journeyWalkingRoute} from '@/lib/journey-walking';
import {getVehicleColor} from '@/components/map/vehicle-icons';
import {stopDistance,type Journey,type JourneyLeg} from '@/lib/journey-planner';
import type {Stop} from '@/Panel/src/types';
import 'leaflet/dist/leaflet.css';
type Point=[number,number];
const color=(leg:JourneyLeg)=>getVehicleColor({provider:leg.provider==='mpk'?'mpk_rzeszow':leg.provider as 'pks'|'marcel'});
const walkSvg='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="2"/><path d="m7 21 3-6m6 6-2-9m-6 1 2-5 4 1 3 4 3 1M10 8l-2 5-3 1"/></svg>';
function FitJourney({points}:{points:Point[]}){const map=useMap();useEffect(()=>{map.invalidateSize();map.fitBounds(points,{padding:[35,35],maxZoom:17});},[map,points]);return null;}
async function legPath(l:JourneyLeg):Promise<Point[]>{
 if(l.path)return l.path;
 if(l.walking!==undefined)return (await journeyWalkingRoute(l.from,l.to)).points;
 const full=await officialBusRoute(l.provider==='mpk'?'mpk_rzeszow':l.provider,l.course.split(':')[1],[]).catch(()=>[] as Point[]);
 const distance=(p:Point,s:Stop)=>stopDistance({lat:p[0],lon:p[1]} as Stop,s);
 let start=-1,end=-1,sd=Infinity,ed=Infinity;
 full.forEach((p,n)=>{const d=distance(p,l.from);if(d<sd){sd=d;start=n;}});
 full.forEach((p,n)=>{if(n<=start)return;const d=distance(p,l.to);if(d<ed){ed=d;end=n;}});
 if(start>=0&&end>start&&sd<200&&ed<200)return full.slice(start,end+1);
 return fetchRoadRouteForStops([[l.from.lat!,l.from.lon!],[l.to.lat!,l.to.lon!]],'journey:'+l.course+':'+l.from.id+':'+l.to.id);
}
export default function JourneyMap({journey}:{journey:Journey;dark:boolean}){
 const [geometry,setGeometry]=useState<{id:string;paths:Record<number,Point[]>;failed:number[]}>({id:'',paths:{},failed:[]});
 useEffect(()=>{let alive=true;journey.legs.forEach((leg,index)=>{
  if(!Number.isFinite(leg.from.lat)||!Number.isFinite(leg.to.lat))return;
  void legPath(leg).then(path=>{if(path.length<2)throw Error('Brak trasy');if(alive)setGeometry(old=>({id:journey.id,paths:{...(old.id===journey.id?old.paths:{}),[index]:path},failed:old.id===journey.id?old.failed:[]}));})
   .catch(()=>{if(alive)setGeometry(old=>({id:journey.id,paths:old.id===journey.id?old.paths:{},failed:[...(old.id===journey.id?old.failed:[]),index]}));});
 });return()=>{alive=false;};},[journey]);
 const paths=geometry.id===journey.id?geometry.paths:{};
 const points=useMemo(()=>journey.legs.flatMap(l=>[l.from,l.to]).filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lon)),[journey]);
 const bounds=useMemo(()=>points.map(s=>[s.lat!,s.lon!] as Point),[points]);
 const walkingIcon=useMemo(()=>L.divIcon({className:'connections-walk-marker',html:walkSvg,iconSize:[36,36],iconAnchor:[18,18]}),[]);
 if(points.length<2)return <p className="connections-hint">Brak współrzędnych do wyświetlenia planu.</p>;
 return <div className="journey-map"><MapContainer bounds={bounds} boundsOptions={{padding:[35,35]}} className="connections-leaflet" zoomControl={false} scrollWheelZoom>
  <FitJourney points={bounds}/><ZoomControl position="bottomright"/>
  <TileLayer url="https://mt1.google.com/vt/lyrs=m&hl=pl&gl=PL&x={x}&y={y}&z={z}" attribution='Map tiles by Google · &copy; OpenStreetMap contributors' maxZoom={19}/>
  {journey.legs.map((leg,i)=>{const path=paths[i];if(!path)return null;const walking=leg.walking!==undefined;return <Fragment key={i}>
   <Polyline positions={path} pathOptions={{color:'#172536',weight:walking?7:9,opacity:.6,lineCap:'round',lineJoin:'round'}}/>
   <Polyline positions={path} className={walking?'connections-walking-path':'connections-bus-path'} pathOptions={{className:walking?'connections-walking-path':'connections-bus-path',color:walking?'#ffffff':color(leg),dashArray:walking?'5 10':undefined,weight:walking?4:5.5,opacity:1,lineCap:'round',lineJoin:'round'}}/>
   {walking&&<Marker position={path[Math.floor(path.length/2)]} icon={walkingIcon} keyboard={false}><Tooltip>Dojście pieszo · {leg.walking} m</Tooltip></Marker>}
  </Fragment>;})}
  {points.map((stop,i)=><CircleMarker key={i} center={[stop.lat!,stop.lon!]} radius={5} pathOptions={{color:'#fff',weight:2.5,fillColor:color(journey.legs[Math.min(Math.floor(i/2),journey.legs.length-1)]),fillOpacity:1}}><Tooltip>{stop.name}</Tooltip></CircleMarker>)}
 </MapContainer><div className="connections-map-legend"><span><i style={{background:'#14b8a6'}}/>PKS</span><span><i style={{background:'#ff7a00'}}/>MPK</span><span><i style={{background:'#68c44a'}}/>Marcel</span><span><i className="is-walk"/>Pieszo</span></div>
 {geometry.id===journey.id&&geometry.failed.length>0&&<p className="connections-hint" role="status">Nie udało się wczytać części przebiegu trasy. Sprawdź internet i otwórz mapę ponownie.</p>}
 {Object.keys(paths).length<journey.legs.length&&!geometry.failed.length&&<p className="connections-hint" role="status">Wyznaczam przebieg ulicami i ścieżkami…</p>}
 </div>;
}
