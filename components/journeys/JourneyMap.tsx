'use client';
import {loadRouteWithRetry} from '@/lib/route-load-retry';
import {withRequestDeadline} from '@/lib/request-deadline';
import {mapReducedMotion} from '@/lib/map-motion';
import {Fragment,memo,useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {MapContainer,TileLayer,CircleMarker,Polyline,Marker,ZoomControl,useMap,useMapEvents,Pane} from 'react-leaflet';
import {Maximize2,Minimize2,ScanLine,RotateCcw,LoaderCircle,X} from 'lucide-react';
import L from 'leaflet';
import {journeyLegPath,journeyLegStops} from '@/lib/journey-leg-path';
import {journeyPathMidpoint,journeyPointRole,journeyPointSize,journeyPointPriority,spacedJourneyPoints,type JourneyPointRole} from '@/lib/journey-map-markers';
import {getVehicleColor} from '@/components/map/vehicle-icons';
import {type Journey,type JourneyLeg} from '@/lib/journey-planner';
import {useDialogFocus} from '@/lib/use-dialog-focus';
import {useAppBack} from '@/lib/use-app-back';
import type {Stop} from '@/Panel/src/types';
import {journeyDepartureLabel,journeyDestinationLabel} from '@/lib/journey-label';
import {journeyMapKey} from '@/lib/journey-view-state';
import 'leaflet/dist/leaflet.css';
import JourneyMapSheet from './JourneyMapSheet';

type Point=[number,number];
type Geometry={key:string;paths:Record<number,Point[]>;failed:number[]};
const color=(leg:JourneyLeg)=>getVehicleColor({provider:leg.provider==='mpk'?'mpk_rzeszow':leg.provider as 'pks'|'marcel'});
const hasCoordinates=(stop:Stop)=>Number.isFinite(stop.lat)&&Number.isFinite(stop.lon);
const pointSymbols={
 start:'<path d="m9 6 9 6-9 6V6Z" fill="currentColor"/>',
 end:'<path d="M7 20V5m0 0c3-3 6 3 10 0v9c-4 3-7-3-10 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
 transfer:'<path d="M5 8h14m-4-4 4 4-4 4M19 16H5m4-4-4 4 4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
};
const walkSvg='<svg width="18" height="18" viewBox="3.5 0 32 32" aria-hidden="true"><circle cx="20" cy="5.5" r="3.3" fill="currentColor"/><path d="m13 28 3-9 3-8m5 17-5-10m-8 0 3-6 5-1 5 6 4 1" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Leaflet updates stroke styles, but CSS classes require updating the path element. */
function JourneyRouteStroke({path,walking,focused,muted,strokeColor,onSelect}:{path:Point[];walking:boolean;focused:boolean;muted:boolean;strokeColor:string;onSelect:()=>void}){
 const stroke=useRef<L.Polyline>(null);
 useEffect(()=>{const node=stroke.current?.getElement();node?.classList.toggle('is-focused',focused);node?.classList.toggle('is-muted',muted);},[focused,muted]);
 return <Polyline ref={stroke} positions={path} className={walking?'connections-walking-path':'connections-bus-path'} eventHandlers={{click:onSelect}} pathOptions={{color:walking?'#fff':strokeColor,dashArray:walking?'5 10':undefined,weight:focused?(walking?5:7):walking?4:5.5,opacity:muted?.3:1,lineCap:'round',lineJoin:'round'}}/>;
}

function WalkingMarker({position}:{position:Point}){
 const map=useMap(),[zoom,setZoom]=useState(()=>map.getZoom());
 useMapEvents({zoomend:()=>setZoom(map.getZoom())});
 const size=zoom<14?20:zoom<16?24:28;
 const icon=useMemo(()=>L.divIcon({className:'connections-walk-marker',html:walkSvg,iconSize:[size,size],iconAnchor:[size/2,size/2]}),[size]);
 return <Marker pane="markerPane" position={position} icon={icon} keyboard={false} interactive={false}/>;
}

type JourneyMapPoint={stop:Stop;point:Point;role:JourneyPointRole};
function JourneyStopMarkers({markers,selected,onSelect,showAll=false}:{markers:JourneyMapPoint[];selected:string|null;showAll?:boolean;onSelect:(stop:Stop)=>void}){
 const map=useMap(),[zoom,setZoom]=useState(()=>map.getZoom());
 useMapEvents({zoomend:()=>setZoom(map.getZoom())});
 const visible=showAll?markers:spacedJourneyPoints(markers,p=>map.latLngToLayerPoint(p),zoom,selected);
 return <>{visible.map(({stop,point,role})=>{
  const size=journeyPointSize(zoom,role),name=({start:'Początek',end:'Cel',transfer:'Przesiadka',stop:'Przystanek'})[role]+': '+(role==='end'?journeyDestinationLabel(stop):stop.name);
  if(role==='stop')return <CircleMarker className={"connections-stop-point is-stop"+(selected===stop.id?" is-selected":"")} key={stop.id+point.join(':')+(selected===stop.id?':selected':'')} center={point} radius={selected===stop.id?size+2:size} eventHandlers={{click:()=>onSelect(stop)}} pathOptions={{color:'#334155',weight:1.1,fillColor:'#fff',fillOpacity:1}}></CircleMarker>;
  const icon=L.divIcon({className:'connections-stop-point connections-route-point is-'+role+(selected===stop.id?' is-selected':''),html:'<svg viewBox="0 0 24 24" aria-hidden="true">'+pointSymbols[role]+'</svg>',iconSize:[size,size],iconAnchor:[size/2,size/2]});
  return <Marker key={stop.id+point.join(':')} position={point} icon={icon} title={name} eventHandlers={{click:()=>onSelect(stop)}} zIndexOffset={role==='transfer'?100:200}></Marker>;
 })}</>;
}

/** A compact, arrow-free callout anchored to the displayed stop, including while panning. */
function SelectedStopBadge({marker,onClose}:{marker:JourneyMapPoint;onClose:()=>void}){
 const map=useMap(),ref=useRef<HTMLDivElement>(null),[,setRevision]=useState(0),[badgeHeight,setBadgeHeight]=useState(76);
 useMapEvents({move:()=>setRevision(v=>v+1),zoom:()=>setRevision(v=>v+1),resize:()=>setRevision(v=>v+1)});
 useEffect(()=>{const node=ref.current;if(!node)return;L.DomEvent.disableClickPropagation(node);L.DomEvent.disableScrollPropagation(node);const observer=new ResizeObserver(()=>{setBadgeHeight(node.offsetHeight||76);setRevision(v=>v+1);});observer.observe(node);return()=>observer.disconnect();},[map]);
 const point=map.latLngToContainerPoint(marker.point),size=map.getSize(),width=Math.min(250,size.x-24),height=badgeHeight;
 const fitsRight=point.x+14+width<=size.x-12,fitsLeft=point.x-width-14>=12,horizontal=fitsRight||fitsLeft;
 const left=Math.max(12,Math.min(size.x-width-12,fitsRight?point.x+14:fitsLeft?point.x-width-14:point.x-width/2));
 const top=Math.max(12,Math.min(size.y-height-12,horizontal?point.y-height/2:point.y-height-14>=12?point.y-height-14:point.y+14));
 const visible=point.x>=0&&point.x<=size.x&&point.y>=0&&point.y<=size.y;
 return createPortal(<div ref={ref} className="connections-stop-badge" role="status" style={{left,top,width,visibility:visible?'visible':'hidden'}} data-anchor-x={point.x} data-anchor-y={point.y}>
  <div><small>{({start:'Początek podróży',end:'Cel podróży',transfer:'Przesiadka',stop:'Przystanek'})[marker.role]}</small><strong>{marker.role==='end'?journeyDestinationLabel(marker.stop):marker.stop.name}</strong></div>
  <button aria-label="Zamknij opis przystanku" onClick={onClose}><X size={16}/></button>
 </div>,map.getContainer());
}

function MapViewport({points,fitVersion}:{points:Point[];fitVersion:number}){
 const map=useMap(),initialized=useRef(false);
 useEffect(()=>{
  let frame=0,timer:ReturnType<typeof setTimeout>;
  const fit=(animate:boolean)=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
   map.stop();map.invalidateSize({pan:false});
   if(!points.length)return;
   const options={padding:[24,24] as [number,number],maxZoom:17,animate:animate&&!mapReducedMotion(),duration:.55};
   if(options.animate)map.flyToBounds(points,options);else map.fitBounds(points,options);
   initialized.current=true;
  });};
  fit(initialized.current);
  // The sheet is a flex sibling. The map already occupies only the visible
  // space: do not subtract sheet height a second time or refit every frame.
  let size=map.getSize();
  const observer=new ResizeObserver(()=>{const next=map.getContainer();if(next.clientWidth===size.x&&next.clientHeight===size.y)return;size=L.point(next.clientWidth,next.clientHeight);clearTimeout(timer);timer=setTimeout(()=>fit(false),140);});
  observer.observe(map.getContainer());
  return()=>{observer.disconnect();clearTimeout(timer);cancelAnimationFrame(frame);};
 },[map,points,fitVersion]);
 return null;
}

type JourneyMapProps={journey:Journey;dark:boolean;focusLeg?:number|null;focusVersion?:number;onFocusLeg?:(index:number|null)=>void};
function JourneyMap({journey,dark,focusLeg=null,focusVersion=0,onFocusLeg}:JourneyMapProps){
 const [activeLeg,setActiveLeg]=useState<number|null>(focusLeg);

 function focusStage(index:number|null){setActiveLeg(index);setSelectedStop(null);setFitVersion(v=>v+1);onFocusLeg?.(index);}
 const geometryKey=journeyMapKey(journey);
 const [selectedStop,setSelectedStop]=useState<Stop|null>(null);
 const [geometry,setGeometry]=useState<Geometry>({key:'',paths:{},failed:[]});
 const [attempt,setAttempt]=useState(0),[expanded,setExpanded]=useState(false),[fitVersion,setFitVersion]=useState(0);
 const [placeholderHeight,setPlaceholderHeight]=useState(0),[dialogUiTheme,setDialogUiTheme]=useState('');
 useEffect(()=>{let alive=true;queueMicrotask(()=>{if(alive){setActiveLeg(focusLeg);setSelectedStop(null);setFitVersion(v=>v+1);}});return()=>{alive=false;};},[focusLeg,focusVersion]);
 const [dialogTheme,setDialogTheme]=useState<CSSProperties>({});
 const host=useRef<HTMLDivElement>(null),dialog=useRef<HTMLElement>(null);
 const requestKey=geometryKey+':'+attempt;
 useEffect(()=>{if(focusVersion>0&&!expanded)host.current?.scrollIntoView({behavior:'smooth',block:'start'});},[focusVersion,expanded]);
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
  const controller=new AbortController();let alive=true;
  const previous=geometry.key===geometryKey?geometry.paths:{};
  journey.legs.forEach((leg,index)=>{
   if(previous[index]?.length>1)return;
   const load=async()=>{
    try{
     const path=await withRequestDeadline(()=>journeyLegPath(leg),controller.signal,65000);
     if(path.length<2||path.some(point=>!point.every(Number.isFinite)))throw Error('Brak kompletnej trasy.');
     return path;
    }catch(error){
     if(alive&&!controller.signal.aborted)setGeometry(old=>({key:geometryKey,paths:old.key===geometryKey?old.paths:{},failed:[...new Set([...(old.key===geometryKey?old.failed:[]),index])]}));
     throw error;
    }
   };
   void loadRouteWithRetry(load,controller.signal,[1000,3000,10000,30000],{keepRetrying:true}).then(path=>{
    if(alive)setGeometry(old=>({key:geometryKey,paths:{...(old.key===geometryKey?old.paths:{}),[index]:path},failed:(old.key===geometryKey?old.failed:[]).filter(i=>i!==index)}));
   }).catch(()=>{/* Selection changes abort only this subscriber. Shared valid paths stay cached. */});
  });
  return()=>{alive=false;controller.abort();};
 },[requestKey]);
 const endpoints=useMemo(()=>journey.legs.flatMap(leg=>[leg.from,leg.to]).filter(hasCoordinates),[geometryKey]);
 const bounds=useMemo(()=>[
  ...endpoints.map(stop=>[stop.lat!,stop.lon!] as Point),
  ...(geometry.key===geometryKey?Object.values(geometry.paths).flat():[]),
 ],[endpoints,geometry,requestKey]);
 const paths=geometry.key===geometryKey?geometry.paths:{};
 const markers=useMemo(()=>{
  const unique=new Map<string,JourneyMapPoint>();
  journey.legs.forEach((leg,index)=>{
   const path=geometry.key===geometryKey?geometry.paths[index]:undefined;if(!path)return;
   const stops=journeyLegStops(leg).filter(hasCoordinates);
   // Passenger platforms stay on their physical side of the road.
   const points=stops.map(stop=>({point:[stop.lat!,stop.lon!] as Point}));
   points.forEach((p,i)=>{
    const key=p.point.map(v=>v.toFixed(6)).join(':'),role=journeyPointRole(journey,stops[i]),previous=unique.get(key);
    if(!previous||journeyPointPriority[role]>journeyPointPriority[previous.role])unique.set(key,{stop:stops[i],point:p.point,role});
   });
  });
  return [...unique.values()];
 },[geometryKey,geometry,requestKey]);
 const focusPoints=useMemo(()=>activeLeg===null?bounds:paths[activeLeg]||[journey.legs[activeLeg]?.from,journey.legs[activeLeg]?.to].filter((s):s is Stop=>Boolean(s)&&hasCoordinates(s!)).map(s=>[s.lat!,s.lon!] as Point),[activeLeg,bounds,geometry,requestKey]);
 const legStopIds=activeLeg===null?null:new Set(journeyLegStops(journey.legs[activeLeg]).map(stop=>stop.id));
 const visibleMarkers=legStopIds?markers.filter(marker=>legStopIds.has(marker.stop.id)):markers;
 const selectedMarker=visibleMarkers.find(marker=>marker.stop.id===selectedStop?.id);
 const failed=geometry.key===geometryKey?geometry.failed:[];
 const pending=Object.keys(paths).length+failed.length<journey.legs.length;
 useEffect(()=>{if(!failed.length)return;const retry=()=>setAttempt(v=>v+1);window.addEventListener('online',retry);return()=>window.removeEventListener('online',retry);},[failed.length]);
 function openMap(){
  if(host.current){
   const toolbar=host.current.querySelector<HTMLElement>('.connections-map-toolbar');
   setPlaceholderHeight(host.current.clientHeight-(toolbar?.offsetHeight||0));
   const computed=getComputedStyle(host.current),values:Record<string,string>={};
   for(const name of ['--cn-surface','--cn-text','--cn-muted','--cn-edge','--cn-accent','--pks-accent','--ui-surface','--ui-text','--ui-muted','--ui-edge'])values[name]=computed.getPropertyValue(name);
   setDialogUiTheme(host.current.closest<HTMLElement>('[data-ui-theme]')?.dataset.uiTheme||'');
   setDialogTheme(values as CSSProperties);
  }
  // A body portal escapes animated cards, transformed app roots and dock
  // stacking contexts. Fullscreen map chrome must never expose other panels.
  setExpanded(true);
 }
 if(endpoints.length<2)return <p className="connections-hint">Brak współrzędnych do wyświetlenia planu.</p>;
 const status=pending?<span className="connections-route-status" role="status" aria-label="Wczytywanie trasy"><LoaderCircle size={17} className="animate-spin"/></span>:failed.length>0?<button aria-label="Niepełna trasa. Ponów wczytywanie" title="Niepełna trasa. Ponów wczytywanie" onClick={()=>setAttempt(value=>value+1)}><RotateCcw size={17}/></button>:null;
 const mapContent=<>
  <MapContainer key={expanded?'fullscreen':'inline'} bounds={bounds} boundsOptions={{padding:[30,40]}} className="connections-leaflet" zoomSnap={.25} zoomControl={false} dragging touchZoom attributionControl={false} scrollWheelZoom={expanded} preferCanvas={false}>
   <MapViewport points={focusPoints} fitVersion={fitVersion}/><ZoomControl position="bottomright"/>
   <TileLayer url="https://mt1.google.com/vt/lyrs=m&hl=pl&gl=PL&x={x}&y={y}&z={z}" maxZoom={19}/>
   <Pane name="journey-route-strokes" style={{zIndex:410}}>
   {journey.legs.map((leg,index)=>{
    const path=paths[index];if(!path)return null;const walking=leg.walking!==undefined,focused=activeLeg===index,muted=activeLeg!==null&&!focused;
    return <Fragment key={index}>
     <Polyline interactive={false} positions={path} pathOptions={{color:focused&&walking?'var(--cn-accent)':'#172536',weight:focused?12:walking?7:9,opacity:muted?.15:focused?.8:.6,lineCap:'round',lineJoin:'round'}}/>
     <JourneyRouteStroke path={path} walking={walking} focused={focused} muted={muted} strokeColor={color(leg)} onSelect={()=>focusStage(index)}/>
     {walking&&<WalkingMarker position={journeyPathMidpoint(path)!}/>}
    </Fragment>;
   })}
   </Pane><Pane name="journey-stop-points" style={{zIndex:450}}>
   <JourneyStopMarkers markers={visibleMarkers} showAll={activeLeg!==null} selected={selectedStop?.id||null} onSelect={stop=>setSelectedStop(old=>old?.id===stop.id?null:stop)}/>
   </Pane>
   {selectedMarker&&<SelectedStopBadge marker={selectedMarker} onClose={()=>setSelectedStop(null)}/>}
  </MapContainer>

 </>;
 return <div className="journey-map" data-panel-theme={dark?'dark':'light'} ref={host}>
  <div className="connections-map-toolbar"><strong>Mapa podróży</strong>{status}<button aria-label="Pokaż całą trasę" onClick={()=>focusStage(null)}><ScanLine size={19}/></button><button aria-label="Powiększ mapę" onClick={openMap}><Maximize2 size={19}/><span>Pełny ekran</span></button></div>
  {expanded?<div className="connections-map-placeholder" style={{height:placeholderHeight||undefined}}/>:mapContent}
  {expanded&&createPortal(<section ref={dialog} className="connections-map-modal" data-ui-theme={dialogUiTheme} data-panel-theme={dark?'dark':'light'} style={dialogTheme} role="dialog" aria-modal="true" aria-label="Mapa podróży na pełnym ekranie">
   <header className="connections-map-toolbar"><div><strong>Mapa podróży</strong><small>{journeyDepartureLabel(journey.legs[0])} → {journeyDestinationLabel(journey.legs.at(-1)!.to)}</small></div>{status}<button aria-label="Pokaż całą trasę" onClick={()=>focusStage(null)}><ScanLine size={20}/></button><button aria-label="Zamknij pełny ekran mapy" onClick={()=>setExpanded(false)}><Minimize2 size={20}/></button></header>
   {mapContent}
   <JourneyMapSheet journey={journey} activeLeg={activeLeg} onFocusLeg={index=>{focusStage(index);requestAnimationFrame(()=>dialog.current?.querySelector<HTMLElement>('.leaflet-container')?.focus({preventScroll:true}));}}/>
  </section>,document.body)}
 </div>;
}

// Re-render live details without reloading geometry or resetting the map viewport.
export default memo(JourneyMap,(before,after)=>before.dark===after.dark&&before.focusLeg===after.focusLeg&&before.focusVersion===after.focusVersion&&before.journey===after.journey);
