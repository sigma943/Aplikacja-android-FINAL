'use client';
import {Fragment,useMemo} from 'react';
import {Polyline} from 'react-leaflet';
import type {PolylineOptions} from 'leaflet';
const base:PolylineOptions={pane:'routeLinePane',lineCap:'round',lineJoin:'round',noClip:false,smoothFactor:0,dashArray:[]};
const halo:PolylineOptions={...base,color:'#f8fafc',weight:11,opacity:.5};
const glow:PolylineOptions={...base,color:'#020617',weight:7.5,opacity:.58};
/** Different roots recreate all Leaflet layers in paint order when the route mode changes. */
export default function RouteLines({positions,schematic,identity,color}:{positions:[number,number][];schematic:boolean;identity:string;color:string}){
 const road=useMemo<PolylineOptions>(()=>({...base,className:'mks-route-line',color,weight:5.5,opacity:.98}),[color]);
 const preview=useMemo<PolylineOptions>(()=>({...road,dashArray:'7 11',weight:3,opacity:.8}),[road]);
 if(positions.length<2)return null;
 if(schematic)return <Polyline key={`schematic:${identity}`} positions={positions} pathOptions={preview}/>;
 return <Fragment key={`road:${identity}`}>
  <Polyline positions={positions} pathOptions={halo}/>
  <Polyline positions={positions} pathOptions={glow}/>
  <Polyline positions={positions} pathOptions={road}/>
 </Fragment>;
}
