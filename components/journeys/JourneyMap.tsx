'use client';
import {Fragment,useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {MapContainer,TileLayer,CircleMarker,Tooltip,Polyline,Marker,ZoomControl,useMap,useMapEvents,Pane} from 'react-leaflet';
import {Maximize2,Minimize2,ScanLine,RotateCcw,LoaderCircle} from 'lucide-react';
import L from 'leaflet';
import {officialBusRoute} from '@/lib/official-bus-routes';
import {roadRouteMatchesStops} from '@/lib/bus-road-geometry';
import {fetchRoadRouteForStops} from '@/lib/transport/road-routing';
import {journeyWalkingRoute} from '@/lib/journey-walking';
import {journeyStops,legStops} from '@/lib/journey-stops';
import {mapStopPinHtml} from '@/lib/map-stop-markers';
import {displayStopCatalogLabel} from '@/lib/stop-label';
import {getVehicleColor} from '@/components/map/vehicle-icons';
import {stopDistance,type Journey,type JourneyLeg} from '@/lib/journey-planner';
import {useDialogFocus} from '@/lib/use-dialog-focus';
import {useAppBack} from '@/lib/use-app-back';
import type {Stop} from '@/Panel/src/types';
import 'leaflet/dist/leaflet.css';

type Point=[number,number];
type Geometry={key:string;paths:Record<number,Point[]>;failed:number[]};
const color=(leg:JourneyLeg)=>getVehicleColor({provider:leg.provider==='mpk'?'mpk_rzeszow':leg.provider as 'pks'|'marcel'});
const hasCoordinates=(stop:Stop)=>Number.isFinite(stop.lat)&&Number.isFinite(stop.lon);
const walkSvg='<svg width="29" height="29" viewBox="0 0 32 32" aria-hidden="true"><circle cx="20" cy="5.5" r="3.3" fill="currentColor"/><path d="m13 28 3-9 3-8m5 17-5-10m-8 0 3-6 5-1 5 6 4 1" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function MapViewport({points,expanded,fitVersion}:{points:Point[];expanded:boolean;fitVersion:number}){
 const map=useMap();
 useEffect(()=>{
  let frame=0;
  const fit=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
   map.invalidateSize({pan:false});
   if(points.length)map.fitBounds(points,{padding:[30,40],maxZoom:17,animate:false});
  });};
  fit();
  const observer=new ResizeObserver(fit);observer.observe(map.getContainer());
  return()=>{observer.disconnect();cancelAnimationFrame(frame);};
 },[map,points,fitVersion]);
 useEffect(()=>{
  const media=matchMedia('(max-width: 767px), (pointer: coarse)');
  const update=()=>{if(expanded||!media.matches)map.dragging.enable();else map.dragging.disable();};
  update();media.addEventListener('change',update);
  return()=>media.removeEventListener('change',update);
 },[map,expanded]);
 return null;
}

async function legPath(leg:JourneyLeg):Promise<Point[]>{
 if(!hasCoordinates(leg.from)||!hasCoordinates(leg.to))throw Error('Brak współrzędnych odcinka.');
 if(leg.path)return leg.path;
 if(leg.walking!==undefined)return (await journeyWalkingRoute(leg.from,leg.to)).points;
 const waypoints=leg.via?.length?leg.via:[[leg.from.lat!,leg.from.lon!],[leg.to.lat!,leg.to.lon!]] as Point[];
 const full=await officialBusRoute(leg.provider==='mpk'?'mpk_rzeszow':leg.provider,leg.course.split(':')[1],[]).catch(()=>[] as Point[]);
 const distance=(point:Point,stop:Stop)=>stopDistance({lat:point[0],lon:point[1]} as Stop,stop);
 let start=-1,end=-1,startDistance=Infinity,endDistance=Infinity;
 full.forEach((point,index)=>{const d=distance(point,leg.from);if(d<startDistance){startDistance=d;start=index;}});
 full.forEach((point,index)=>{if(index<=start)return;const d=distance(point,leg.to);if(d<endDistance){endDistance=d;end=index;}});
 if(start>=0&&end>start&&startDistance<200&&endDistance<200){const route=full.slice(start,end+1);if(roadRouteMatchesStops(route,waypoints,150))return route;}
 return fetchRoadRouteForStops(waypoints,'journey:'+leg.course+':'+leg.from.id+':'+leg.to.id,{stopWaypoints:true});
}

function MapStopSelection({onClear}:{onClear:()=>void}){useMapEvents({click:onClear});return null;}
function JourneyStopPoint({stop,tint,kind,onSelect}:{stop:Stop;tint:string;kind:'start'|'end'|'intermediate';onSelect:()=>void}){
 const icon=useMemo(()=>L.divIcon({className:'connections-endpoint-marker connections-stop-point',html:`<span class="connections-endpoint" data-kind="${kind}" style="--stop-color:${tint}"><i/></span>`,iconSize:[40,40],iconAnchor:[20,20]}),[tint,kind]);
 const click=(event:L.LeafletMouseEvent)=>{L.DomEvent.stopPropagation(event.originalEvent);onSelect();};
 const name=displayStopCatalogLabel(stop.name,stop.code);
 if(kind!=='intermediate')return <Marker position={[stop.lat!,stop.lon!]} icon={icon} title={name} alt={name} eventHandlers={{click}}/>;
 return <><CircleMarker className="connections-stop-hit" center={[stop.lat!,stop.lon!]} radius={14} pathOptions={{stroke:false,fillOpacity:0,bubblingMouseEvents:false}} eventHandlers={{click}}/><CircleMarker className="connections-stop-point" center={[stop.lat!,stop.lon!]} radius={4.5} pathOptions={{color:'#fff',weight:1.5,fillColor:tint,fillOpacity:1,bubblingMouseEvents:false}} eventHandlers={{click}}/></>;
}

export default function JourneyMap({journey,dark}:{journey:Journey;dark:boolean}){
 const [geometry,setGeometry]=useState<Geometry>({key:'',paths:{},failed:[]});
 const [attempt,setAttempt]=useState(0),[expanded,setExpanded]=useState(false),[fitVersion,setFitVersion]=useState(0);
 const [placeholderHeight,setPlaceholderHeight]=useState(0);
 const [selectedStop,setSelectedStop]=useState<string|null>(null);
 const [dialogTheme,setDialogTheme]=useState<CSSProperties>({});
 const host=useRef<HTMLDivElement>(null),dialog=useRef<HTMLElement>(null);
 const requestKey=journey.id+':'+attempt;
 useDialogFocus(dialog,expanded,()=>setExpanded(false));
 useAppBack(expanded,()=>{setExpanded(false);return true;},80);
 useEffect(()=>{
  if(!expanded)return;
  const page=host.current?.closest<HTMLElement>('.connections-view');
  const previous=page?.style.overflow;
  if(page)page.style.overflow='hidden';
  const bodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  return()=>{if(page)page.style.overflow=previous||'';document.body.style.overflow=bodyOverflow;};
 },[expanded]);
 useEffect(()=>{
  let alive=true;
  journey.legs.forEach((leg,index)=>{
   void legPath(leg).then(path=>{
    if(path.length<2||path.some(point=>!point.every(Number.isFinite)))throw Error('Brak kompletnej trasy.');
    if(alive)setGeometry(old=>({key:requestKey,paths:{...(old.key===requestKey?old.paths:{}),[index]:path},failed:old.key===requestKey?old.failed:[]}));
   }).catch(()=>{
    if(alive)setGeometry(old=>({key:requestKey,paths:old.key===requestKey?old.paths:{},failed:[...(old.key===requestKey?old.failed:[]),index]}));
   });
  });
  return()=>{alive=false;};
 },[journey,requestKey]);
 const endpoints=useMemo(()=>journey.legs.flatMap(leg=>[leg.from,leg.to]).filter(hasCoordinates),[journey]);
 const bounds=useMemo(()=>[
  ...endpoints.map(stop=>[stop.lat!,stop.lon!] as Point),
  ...(geometry.key===requestKey?Object.values(geometry.paths).flat():[]),
 ],[endpoints,geometry,requestKey]);
 const markers=useMemo(()=>{
  const sequence=journeyStops(journey),first=sequence[0],last=sequence.at(-1);
  const unique=new Map<string,{key:string;stop:Stop;tint:string;kind:'start'|'end'|'intermediate'}>();
  journey.legs.forEach(leg=>legStops(leg).filter(hasCoordinates).forEach(stop=>{
   const key=`${journey.id}:${stop.id}:${stop.lat}:${stop.lon}`;
   const kind=stop.id===first?.id?'start':stop.id===last?.id?'end':'intermediate';
   if(!unique.has(key)||leg.walking===undefined)unique.set(key,{key,stop,tint:leg.walking===undefined?color(leg):'#475569',kind});
  }));
  return [...unique.values()];
 },[journey]);
 const highlighted=markers.find(marker=>marker.key===selectedStop);
 const selectedIcon=useMemo(()=>L.divIcon({className:'stop-highlight-pin',html:mapStopPinHtml(highlighted?.tint||'#00a3a2'),iconSize:[38,48],iconAnchor:[19,46]}),[highlighted?.tint]);
 const walkingIcon=useMemo(()=>L.divIcon({className:'connections-walk-marker',html:walkSvg,iconSize:[46,46],iconAnchor:[23,23]}),[]);
 const paths=geometry.key===requestKey?geometry.paths:{};
 const failed=geometry.key===requestKey?geometry.failed:[];
 const pending=Object.keys(paths).length+failed.length<journey.legs.length;
 function openMap(){
  if(host.current){
   const toolbar=host.current.querySelector<HTMLElement>('.connections-map-toolbar');
   setPlaceholderHeight(host.current.clientHeight-(toolbar?.offsetHeight||0));
   const computed=getComputedStyle(host.current),values:Record<string,string>={};
   for(const name of ['--cn-surface','--cn-text','--cn-muted','--cn-edge','--cn-accent'])values[name]=computed.getPropertyValue(name);
   values.fontFamily=computed.fontFamily;
   setDialogTheme(values as CSSProperties);
  }
  setExpanded(true);
 }
 if(endpoints.length<2)return <p className="connections-hint">Brak współrzędnych do wyświetlenia planu.</p>;
 const mapContent=<>
  <MapContainer key={expanded?'fullscreen':'inline'} bounds={bounds} boundsOptions={{padding:[30,40]}} className="connections-leaflet" zoomControl={false} scrollWheelZoom={expanded} preferCanvas={false}>
   <MapStopSelection onClear={()=>setSelectedStop(null)}/><MapViewport points={bounds} expanded={expanded} fitVersion={fitVersion}/><ZoomControl position="bottomright"/>
   <TileLayer url="https://mt1.google.com/vt/lyrs=m&hl=pl&gl=PL&x={x}&y={y}&z={z}" attribution='Map tiles by Google · &copy; OpenStreetMap contributors' maxZoom={19}/>
   <Pane name="journey-route-strokes" style={{zIndex:410}}>
   {journey.legs.map((leg,index)=>{
    const path=paths[index];if(!path)return null;const walking=leg.walking!==undefined;
    return <Fragment key={index}>
     <Polyline positions={path} pathOptions={{color:'#172536',weight:walking?7:9,opacity:.6,lineCap:'round',lineJoin:'round'}}/>
     <Polyline positions={path} className={walking?'connections-walking-path':'connections-bus-path'} pathOptions={{color:walking?'#fff':color(leg),dashArray:walking?'5 10':undefined,weight:walking?4:5.5,opacity:1,lineCap:'round',lineJoin:'round'}}/>
     {walking&&<Marker pane="markerPane" position={path[Math.floor(path.length/2)]} icon={walkingIcon} keyboard={false}><Tooltip pane="tooltipPane">Dojście pieszo · {leg.walking} m</Tooltip></Marker>}
    </Fragment>;
   })}
   </Pane><Pane name="journey-stop-points" style={{zIndex:450}}>
   {markers.map(({key,stop,tint,kind})=><JourneyStopPoint key={key} stop={stop} tint={tint} kind={kind} onSelect={()=>setSelectedStop(key)}/>)}
   </Pane>
   {highlighted&&<Marker position={[highlighted.stop.lat!,highlighted.stop.lon!]} icon={selectedIcon} zIndexOffset={5000} title={highlighted.stop.name} eventHandlers={{click:event=>L.DomEvent.stopPropagation(event.originalEvent)}}><Tooltip permanent direction="top" offset={[0,-46]} className="connections-stop-label"><strong>{displayStopCatalogLabel(highlighted.stop.name,highlighted.stop.code)}</strong><span>{highlighted.kind==='start'?'Początek podróży':highlighted.kind==='end'?'Koniec podróży':'Przystanek na trasie'}</span></Tooltip></Marker>}
  </MapContainer>
  <div className="connections-map-footer">
   <div className="connections-map-legend"><span><i style={{background:'#14b8a6'}}/>PKS</span><span><i style={{background:'#ff7a00'}}/>MPK</span><span><i style={{background:'#68c44a'}}/>Marcel</span><span><i className="is-walk"/>Pieszo</span></div>
   {!expanded&&<p className="connections-map-touch-hint">Przesuwaj stronę jednym palcem. Powiększ mapę, aby ją przesuwać.</p>}
   {pending&&<p className="connections-map-status" role="status"><LoaderCircle size={15} className="animate-spin"/>Wczytuję przebieg trasy…</p>}
   {failed.length>0&&<div className="connections-map-error" role="status"><span>Nie udało się wczytać {failed.length===1?'jednego odcinka':'części trasy'}. Sprawdź połączenie z internetem.</span><button onClick={()=>setAttempt(value=>value+1)}><RotateCcw size={16}/>Ponów</button></div>}
  </div>
 </>;
 return <div className="journey-map" data-panel-theme={dark?'dark':'light'} ref={host}>
  <div className="connections-map-toolbar"><strong>Mapa podróży</strong><button aria-label="Pokaż całą trasę" onClick={()=>setFitVersion(value=>value+1)}><ScanLine size={19}/></button><button aria-label="Powiększ mapę" onClick={openMap}><Maximize2 size={19}/><span>Pełny ekran</span></button></div>
  {expanded?<div className="connections-map-placeholder" style={{height:placeholderHeight||undefined}}/>:mapContent}
  {expanded&&createPortal(<section ref={dialog} className="connections-map-modal" data-panel-theme={dark?'dark':'light'} style={dialogTheme} role="dialog" aria-modal="true" aria-label="Mapa podróży na pełnym ekranie">
   <header className="connections-map-toolbar"><div><strong>Mapa podróży</strong><small>{journey.legs[0].from.name} → {journey.legs.at(-1)!.to.name}</small></div><button aria-label="Pokaż całą trasę" onClick={()=>setFitVersion(value=>value+1)}><ScanLine size={20}/></button><button aria-label="Zamknij pełny ekran mapy" onClick={()=>setExpanded(false)}><Minimize2 size={20}/><span>Zamknij</span></button></header>
   {mapContent}
  </section>,document.body)}
 </div>;
}
