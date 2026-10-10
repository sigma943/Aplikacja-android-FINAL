'use client';

import {displayStopLabel} from '@/lib/stop-label';
import {readBusCoordinates} from '@/lib/bus-coordinates';
import {platformPosition} from '@/lib/stop-platform-position';

import {useState, useMemo} from 'react';
import {Marker, useMap, CircleMarker, useMapEvents} from 'react-leaflet';
import L from 'leaflet';

import type {Stop} from '@/Panel/src/types';
import {mapStopColor, mapStopIconHtml, visibleMapStops} from '@/lib/map-stop-markers';

import {type Vehicle, type StopData} from '@/lib/transport/vehicle';

function SelectedStopPin({id,catalogId,point,stops,color,rail=false}:{id?:string|null;catalogId?:string|null;point?:StopData;stops:Stop[];color:string;rail?:boolean}) {
  const map=useMap();const [revision,setRevision]=useState(0);
  useMapEvents({zoomend:()=>setRevision(v=>v+1),moveend:()=>setRevision(v=>v+1)});
  const icon=useMemo(()=>L.divIcon({className:'stop-highlight-pin',html:`<svg class="map-stop-pin" width="38" height="48" viewBox="0 0 38 48" style="color:${color};filter:drop-shadow(0 3px 4px #0005)"><path d="M19 2C9.6 2 3 8.8 3 18c0 10.8 16 27 16 27s16-16.2 16-27C35 8.8 28.4 2 19 2Z" fill="currentColor" stroke="white" stroke-width="2.5"/><circle cx="19" cy="18" r="6.5" fill="white"/></svg>`,iconSize:[38,48],iconAnchor:[19,46]}),[color]);
  if(!id||!point||(!rail && !readBusCoordinates(point.lat,point.lon)))return null;
  if(!rail)point={...point,...platformPosition(point)};
  const b=map.getBounds();
  if(visibleMapStops(stops,[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()],map.getZoom(),catalogId||id).some(stop=>stop.id===(catalogId||id)))return null;
  return <Marker position={[point.lat,point.lon]} zIndexOffset={5000} icon={icon}/>;
}

function CatalogStopsLayer({stops,selected,selectedColor,onSelect}:{stops:Stop[];selected?:string|null;selectedColor?:string;onSelect?:(stop:Stop)=>void}) {
  const map=useMap();
  const [revision,setRevision]=useState(0);
  useMapEvents({moveend:()=>setRevision(value=>value+1),zoomend:()=>setRevision(value=>value+1)});
  const visible=useMemo(()=>{const bounds=map.getBounds();return visibleMapStops(stops,[bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()],map.getZoom(),selected);},[map,stops,selected,revision]);
  const icons=useMemo(()=>new Map(visible.map(stop=>[stop.id,L.divIcon({className:'map-catalog-stop',html:mapStopIconHtml(stop.id===selected&&selectedColor?selectedColor:mapStopColor(stop),stop.id===selected),iconSize:[40,40],iconAnchor:[20,20]})])),[visible,selected,selectedColor]);
  return <>{visible.map(stop=><Marker key={stop.id} position={[platformPosition(stop)!.lat,platformPosition(stop)!.lon]} title={displayStopLabel(stop.name)} alt={displayStopLabel(stop.name)}
    icon={icons.get(stop.id)!} zIndexOffset={stop.id===selected?4500:-500}
    eventHandlers={{click:event=>{L.DomEvent.stopPropagation(event.originalEvent);onSelect?.({...stop,...platformPosition(stop)});}}}/>)}</>;
}

function RouteStopsLayer({
  selectedVehicle,
  stopsData,
  stopIds,
  highlightedStopId,
  selectedRouteColor,
  onStopClick,
}: {
  selectedVehicle?: Vehicle;
  stopsData: Record<string, StopData>;
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

  const visibleStopIds = selectedVehicle ? stopIds : [];

  if (!selectedVehicle) return null;

  const baseRadius = zoom <= 11 ? 4.5 : zoom <= 13 ? 5.1 : zoom <= 14 ? 5.8 : 6.5;

  return (
    <>
      {visibleStopIds.map((stopId, idx) => {
        const rawStop = stopsData[String(stopId)];
        const stop = rawStop && selectedVehicle.provider!=='pkp_intercity' ? {...rawStop,...platformPosition(rawStop)} : rawStop;
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
