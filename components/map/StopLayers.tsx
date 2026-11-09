'use client';
import './stop-markers.css';
import {stopCatalogDisplayLabel} from '@/lib/mpk-stop-label';
import {readBusCoordinates} from '@/lib/bus-coordinates';
import {platformPosition,stopPlatformRevision} from '@/lib/stop-platform-position';

import {memo, useState, useMemo} from 'react';
import {Marker, useMap, CircleMarker, useMapEvents} from 'react-leaflet';
import L from 'leaflet';

import type {Stop} from '@/Panel/src/types';
import {MAP_STOPS_MIN_ZOOM,mapStopColor,mapStopIconHtml,mapStopPinHtml,visibleMapStops,routeMapStopPoint,routeMapCatalogStopId} from '@/lib/map-stop-markers';

import {type Vehicle, type StopData} from '@/lib/transport/vehicle';

function SelectedStopPin({id,catalogId,point,stops,color,routeColor,rail=false,alignToCatalog=false}:{id?:string|null;catalogId?:string|null;point?:StopData;stops:Stop[];color:string;routeColor?:string;rail?:boolean;alignToCatalog?:boolean}) {
  const map=useMap();const [revision,setRevision]=useState(0);
  useMapEvents({zoomend:()=>setRevision(v=>v+1),moveend:()=>setRevision(v=>v+1)});
  const zoom=map.getZoom();
  const routeDot=Boolean(routeColor)&&zoom>=MAP_STOPS_MIN_ZOOM;
  const pinColor=zoom<MAP_STOPS_MIN_ZOOM?(routeColor||color):color;
  const icon=useMemo(()=>L.divIcon(routeDot
    ? {className:'map-catalog-stop map-route-stop-fallback',html:mapStopIconHtml(color,true),iconSize:[40,40],iconAnchor:[20,20]}
    : {className:'stop-highlight-pin',html:mapStopPinHtml(pinColor),iconSize:[38,48],iconAnchor:[19,46]}),[color,pinColor,routeDot]);
  const platformRevision=stopPlatformRevision();
  const catalogVisible=useMemo(()=>{
    if(!id)return false;
    const b=map.getBounds();
    return visibleMapStops(stops,[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()],map.getZoom(),catalogId||id).some(stop=>stop.id===(catalogId||id));
  },[map,stops,catalogId,id,revision,platformRevision]);
  if(!id||!point||(!rail && !readBusCoordinates(point.lat,point.lon)))return null;
  if(!rail){const catalog=alignToCatalog?stops.find(stop=>stop.id===catalogId):null;const position=platformPosition(catalog||point);if(!position)return null;point={...point,...position};}
  if(catalogVisible)return null;
  return <Marker position={[point.lat,point.lon]} zIndexOffset={5000} icon={icon}/>;
}

const CatalogStopMarker=memo(function CatalogStopMarker({stop,selected,color,onSelect,platformRevision}:{stop:Stop;selected:boolean;color:string;platformRevision:number;onSelect?:(stop:Stop)=>void}){
  const position=useMemo<[number,number]>(()=>{const point=platformPosition(stop)!;return [point.lat,point.lon];},[stop,platformRevision]);
  const icon=useMemo(()=>L.divIcon({className:'map-catalog-stop',html:mapStopIconHtml(color,selected),iconSize:[40,40],iconAnchor:[20,20]}),[color,selected]);
  const label=stopCatalogDisplayLabel(stop);
  const handlers=useMemo(()=>({click:(event:L.LeafletMouseEvent)=>{L.DomEvent.stopPropagation(event.originalEvent);onSelect?.({...stop,...platformPosition(stop)});}}),[stop,onSelect]);
  return <Marker position={position} title={label} alt={label} icon={icon} zIndexOffset={selected?4500:-500} eventHandlers={handlers}/>;
});

function CatalogStopsLayer({stops,selected,onSelect,routeStopIds}:{stops:Stop[];routeStopIds?:ReadonlySet<string>;selected?:string|null;onSelect?:(stop:Stop)=>void}) {
  const map=useMap();
  const [revision,setRevision]=useState(0);
  useMapEvents({moveend:()=>setRevision(value=>value+1),zoomend:()=>setRevision(value=>value+1)});
  const platformRevision=stopPlatformRevision();
  const visible=useMemo(()=>{const bounds=map.getBounds();return visibleMapStops(stops,[bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()],map.getZoom(),selected);},[map,stops,selected,revision,platformRevision]);
  return <>{visible.map(stop=><CatalogStopMarker key={stop.id} platformRevision={platformRevision} stop={stop} selected={stop.id===selected||Boolean(routeStopIds?.has(stop.id))}
    color={mapStopColor(stop)} onSelect={onSelect}/>)}</>;
}

function RouteStopsLayer({
  selectedVehicle,
  stopsData,
  catalogStops,
  stopIds,
  highlightedStopId,
  catalogSelected,
  selectedRouteColor,
  onStopClick,
}: {
  selectedVehicle?: Vehicle;
  stopsData: Record<string, StopData>;
  catalogStops?: Stop[];
  stopIds: Array<string | number>;
  highlightedStopId?: string | null;
  catalogSelected?: string | null;
  selectedRouteColor: string;
  onStopClick?: (stopId: string) => void;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  const [viewRevision,setViewRevision]=useState(0);

  useMapEvents({
    zoomend: () => {setZoom(map.getZoom());setViewRevision(v=>v+1);},
    moveend: () => setViewRevision(v=>v+1),
  });

  const platformRevision=stopPlatformRevision();
  const visibleCatalogIds=useMemo(()=>{const b=map.getBounds();return new Set(visibleMapStops(catalogStops||[],[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()],zoom,catalogSelected).map(stop=>stop.id));},[map,catalogStops,zoom,viewRevision,platformRevision,catalogSelected]);
  const routeDisplay=useMemo(()=>{
    if(!selectedVehicle||selectedVehicle.provider==='pkp_intercity'||!catalogStops?.length)return {stops:stopsData,catalogIds:new Map<string,string>()};
    const aligned={...stopsData},catalogIds=new Map<string,string>(),ids=new Set(stopIds.map(id=>String(id).replace(/^(pks|mpk_rzeszow):/,'')));
    const catalog=selectedVehicle.provider==='marcel'?catalogStops:catalogStops.filter(stop=>String(stop.providerStopIds?.[selectedVehicle.provider||'pks']||'').split(',').some(id=>ids.has(id.trim())));
    for(const id of stopIds){const raw=stopsData[String(id)];if(!raw)continue;const match=routeMapCatalogStopId(catalog,String(id),raw,selectedVehicle.provider);if(match)catalogIds.set(String(id),match);aligned[String(id)]=routeMapStopPoint(catalog,String(id),raw,selectedVehicle.provider);}
    return {stops:aligned,catalogIds};
  },[selectedVehicle?.provider,catalogStops,stopsData,stopIds.join(','),platformRevision]);
  const visibleStopIds = selectedVehicle ? stopIds : [];

  if (!selectedVehicle) return null;

  const closeRoadStops=selectedVehicle.provider!=='pkp_intercity'&&zoom>=MAP_STOPS_MIN_ZOOM;
  const baseRadius = zoom <= 11 ? 4.5 : zoom <= 13 ? 5.1 : zoom <= 14 ? 5.8 : 6.5;

  return (
    <>
      {visibleStopIds.map((stopId, idx) => {
        const rawStop = routeDisplay.stops[String(stopId)];
        const alignedPlatform=rawStop!==stopsData[String(stopId)];
        const position=rawStop&&selectedVehicle.provider!=='pkp_intercity'?(alignedPlatform?{lat:rawStop.lat,lon:rawStop.lon}:platformPosition(rawStop)):null;
        const stop = rawStop && selectedVehicle.provider!=='pkp_intercity' ? (position?{...rawStop,...position}:null) : rawStop;
        if (!stop) return null;
        const catalogId=routeDisplay.catalogIds.get(String(stopId));
        if(catalogId&&visibleCatalogIds.has(catalogId))return null;
        const isHighlighted = String(stopId) === highlightedStopId;
        // The selected stop already has an icon at this scale, even without the catalog layer.
        if(closeRoadStops&&isHighlighted)return null;
        const stopColor=closeRoadStops?mapStopColor({name:stop.n}):'#ffffff';

        return (
          <CircleMarker
            key={`stop-${stopId}-${idx}`}
            pane="routeStopsPane"
            center={[stop.lat, stop.lon]}
            radius={isHighlighted ? baseRadius + 2.3 : baseRadius}
            pathOptions={{
              className:'mks-route-stop-marker',
              color:isHighlighted?selectedRouteColor:'rgba(12,18,28,0.9)',
              fillColor:stopColor,
              fillOpacity:1,
              weight:isHighlighted?4.6:2.8,
            }}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e as any);
                if (onStopClick) onStopClick(String(stopId));
              }
            }}
          />
        );
      })}
    </>
  );
}

export {SelectedStopPin};
export {CatalogStopsLayer};
export {RouteStopsLayer};
