'use client';
import {Fragment,useMemo} from 'react';
import {Polyline} from 'react-leaflet';
import {svg} from 'leaflet';
import type {PolylineOptions} from 'leaflet';
const base:PolylineOptions={pane:'routeLinePane',lineCap:'round',lineJoin:'round',noClip:false,smoothFactor:0,dashArray:[]};
const halo:PolylineOptions={...base,color:'#f8fafc',weight:11,opacity:.5};
const glow:PolylineOptions={...base,color:'#020617',weight:7.5,opacity:.58};
/** Always paint validated geometry with the same solid foreground above its halos. */
export default function RouteLines({positions,identity,color}:{positions:[number,number][];identity:string;color:string}){
 // Keep the three route strokes in one SVG layer, independent of the shared
 // Canvas redraw/clip state used by large stop collections.
 const renderer=useMemo(()=>svg({pane:'routeLinePane',padding:.5}),[]);
 const road=useMemo<PolylineOptions>(()=>({...base,className:'mks-route-line',color,weight:5.5,opacity:.98}),[color]);
 if(positions.length<2)return null;
 return <Fragment key={`road:${identity}`}>
  <Polyline positions={positions} renderer={renderer} pathOptions={halo}/>
  <Polyline positions={positions} renderer={renderer} pathOptions={glow}/>
  <Polyline positions={positions} renderer={renderer} className="mks-route-line" pathOptions={road}/>
 </Fragment>;
}
