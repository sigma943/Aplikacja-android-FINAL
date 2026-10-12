'use client';
import {mpkCatalogDisplayName} from '@/lib/mpk-stop-label';

import {displayStopCatalogLabel} from '@/lib/stop-label';
import {readBusCoordinates} from '@/lib/bus-coordinates';
import {platformPosition,stopPlatformRevision} from '@/lib/stop-platform-position';

import {memo, useState, useMemo} from 'react';
import {Marker, useMap, CircleMarker, useMapEvents} from 'react-leaflet';
import L from 'leaflet';

import type {Stop} from '@/Panel/src/types';
import {mapStopColor, mapStopIconHtml, visibleMapStops, marcelMapStopPoint} from '@/lib/map-stop-markers';

import {type Vehicle, type StopData} from '@/lib/transport/vehicle';

function SelectedStopPin({id,catalogId,point,stops,color,rail=false,alignToCatalog=false}:{id?:string|null;catalogId?:string|null;point?:StopData;stops:Stop[];color:string;rail?:boolean;alignToCatalog?:boolean}) {
  const map=useMap();const [revision,setRevision]=useState(0);
  useMapEvents({zoomend:()=>setRevision(v=>v+1),moveend:()=>setRevision(v=>v+1)});
  const icon=useMemo(()=>L.divIcon({className:'stop-highlight-pin',html:`<svg class="map-stop-pin" width="38" height="48" viewBox="0 0 38 48" style="color:${color};filter:drop-shadow(0 3px 4px #0005)"><path d="M19 2C9.6 2 3 8.8 3 18c0 10.8 16 27 16 27s16-16.2 16-27C35 8.8 28.4 2 19 2Z" fill="currentColor" stroke="white" stroke-width="2.5"/><circle cx="19" cy="18" r="6.5" fill="white"/></svg>`,iconSize:[38,48],iconAnchor:[19,46]}),[color]);
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

const CatalogStopMarker=memo(function CatalogStopMarker({stop,selected,color,onSelect}:{stop:Stop;selected:boolean;color:string;onSelect?:(stop:Stop)=>void}){
  const position=useMemo<[number,number]>(()=>{const point=platformPosition(stop)!;return [point.lat,point.lon];},[stop]);
  const icon=useMemo(()=>L.divIcon({className:'map-catalog-stop',html:mapStopIconHtml(color,selected),iconSize:[40,40],iconAnchor:[20,20]}),[color,selected]);
  const label=displayStopCatalogLabel(mpkCatalogDisplayName(stop),stop.code);
  const handlers=useMemo(()=>({click:(event:L.LeafletMouseEvent)=>{L.DomEvent.stopPropagation(event.originalEvent);onSelect?.({...stop,...platformPosition(stop)});}}),[stop,onSelect]);
  return <Marker position={position} title={label} alt={label} icon={icon} zIndexOffset={selected?4500:-500} eventHandlers={handlers}/>;
});

function CatalogStopsLayer({stops,selected,selectedColor,onSelect}:{stops:Stop[];selected?:string|null;selectedColor?:string;onSelect?:(stop:Stop)=>void}) {
  const map=useMap();
  const [revision,setRevision]=useState(0);
  useMapEvents({moveend:()=>setRevision(value=>value+1),zoomend:()=>setRevision(value=>value+1)});
  const platformRevision=stopPlatformRevision();
  const visible=useMemo(()=>{const bounds=map.getBounds();return visibleMapStops(stops,[bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()],map.getZoom(),selected);},[map,stops,selected,revision,platformRevision]);
  return <>{visible.map(stop=><CatalogStopMarker key={stop.id} stop={stop} selected={stop.id===selected}
    color={stop.id===selected&&selectedColor?selectedColor:mapStopColor(stop)} onSelect={onSelect}/>)}</>;
}

function RouteStopsLayer({
  selectedVehicle,
  stopsData,
  catalogStops,
  stopIds,
  highlightedStopId,
  selectedRouteColor,
  onStopClick,
}: {
  selectedVehicle?: Vehicle;
  stopsData: Record<string, StopData>;
  catalogStops?: Stop[];
  stopIds: Array<string | number>;
  highlightedStopId?: string | null;
  selectedRouteColor: string;
  onStopClick?: (stopId: string) => void;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });

  const platformRevision=stopPlatformRevision();
  const marcelStops=useMemo(()=>{
    if(selectedVehicle?.provider!=='marcel'||!catalogStops?.length)return stopsData;
    const aligned={...stopsData};
    for(const id of stopIds){const raw=stopsData[String(id)];if(raw)aligned[String(id)]=marcelMapStopPoint(catalogStops,String(id),raw);}
    return aligned;
  },[selectedVehicle?.provider,catalogStops,stopsData,stopIds.join(','),platformRevision]);
  const visibleStopIds = selectedVehicle ? stopIds : [];

  if (!selectedVehicle) return null;

  const baseRadius = zoom <= 11 ? 4.5 : zoom <= 13 ? 5.1 : zoom <= 14 ? 5.8 : 6.5;

  return (
    <>
      {visibleStopIds.map((stopId, idx) => {
        const rawStop = marcelStops[String(stopId)];
        const alignedMarcel=selectedVehicle.provider==='marcel'&&rawStop!==stopsData[String(stopId)];
        const position=rawStop&&selectedVehicle.provider!=='pkp_intercity'?(alignedMarcel?{lat:rawStop.lat,lon:rawStop.lon}:platformPosition(rawStop)):null;
        const stop = rawStop && selectedVehicle.provider!=='pkp_intercity' ? (position?{...rawStop,...position}:null) : rawStop;
        if (!stop) return null;
        const isHighlighted = String(stopId) === highlightedStopId;

        return (
          <CircleMarker
            key={`stop-${stopId}-${idx}`}
            pane="routeStopsPane"
            center={[stop.lat, stop.lon]}
            radius={isHighlighted ? baseRadius + 2.3 : baseRadius}
            color={isHighlighted ? selectedRouteColor : 'rgba(12,18,28,0.9)'}
            fillColor="#ffffff"
            fillOpacity={1}
            weight={isHighlighted ? 4.6 : 2.8}
            pathOptions={{ pane: 'routeStopsPane', className: 'mks-route-stop-marker' }}
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
