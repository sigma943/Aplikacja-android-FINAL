import {CircleMarker,Marker} from 'leaflet';
import {MapContainer,Pane,useMap} from 'react-leaflet';
import {useEffect,useState} from 'react';
import 'leaflet/dist/leaflet.css';
import {CatalogStopsLayer,RouteStopsLayer} from '../components/map/StopLayers';
import {routeCatalogStopIds} from '../lib/map-stop-markers';
import {loadStopPlatforms} from '../lib/stop-platform-position';
const stop:any={id:'shared-platform',name:'Test wspólny peron 01',code:'01',type:'bus',lat:50.00005,lon:22.00005,lines:[],carriers:[],isFavorite:false,providerStopIds:{pks:'1',mpk_rzeszow:'1',marcel:'1'}};
const stops=[stop,{...stop,id:'unrelated',name:'Inny peron 02',code:'02',lon:22.0003,providerStopIds:{pks:'404',mpk_rzeszow:'404',marcel:'404'}}],data={'1':{n:'Test wspólny peron 01',lat:50,lon:22}},ids=['1'];
function Control({refresh}:{refresh:()=>void}){const map=useMap();useEffect(()=>{(window as any).__platformCenters=()=>{const circles:any[]=[],icons:any[]=[];map.eachLayer((layer:any)=>{if(layer instanceof CircleMarker)circles.push(map.latLngToContainerPoint(layer.getLatLng()));else if(layer instanceof Marker&&layer.options.icon?.options.className==='map-catalog-stop')icons.push(map.latLngToContainerPoint(layer.getLatLng()));});return {circles,icons};};(window as any).__platformZoom=(zoom:number)=>map.setZoom(zoom,{animate:false});(window as any).__platformRefresh=async()=>{await loadStopPlatforms();refresh();map.fire('moveend');};},[map,refresh]);return null;}
export default function MapPlatformJoinFixture({provider}:{provider:string}){
 const [,setRevision]=useState(0),[route,setRoute]=useState(true),[catalogVisible,setCatalogVisible]=useState(true),[clicks,setClicks]=useState(0);
 useEffect(()=>{(window as any).__routeVisible=setRoute;(window as any).__catalogVisible=setCatalogVisible;},[]);
 const catalog=catalogVisible?stops:[],activeIds=route?routeCatalogStopIds(catalog,ids,data,provider):new Set<string>();
 return <><MapContainer preferCanvas center={[50.00005,22.00005]} zoom={19} maxZoom={21} style={{height:'100%',width:'100%'}}><Control refresh={()=>setRevision(v=>v+1)}/><CatalogStopsLayer stops={catalog} routeStopIds={activeIds} onSelect={()=>setClicks(v=>v+1)}/><Pane name="routeStopsPane" style={{zIndex:470}}><RouteStopsLayer selectedVehicle={route?{id:'v',name:'108',provider,lat:50,lon:22}:undefined} stopsData={data} catalogStops={catalog} stopIds={ids} selectedRouteColor="#14b8a6"/></Pane></MapContainer>{clicks>0&&<div data-stop-details style={{position:'fixed',bottom:0,zIndex:10000}}>Panel przystanku · kliknięcia: {clicks}</div>}</>;
}
