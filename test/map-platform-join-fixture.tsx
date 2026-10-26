import {MapContainer,Pane,useMap} from 'react-leaflet';
import {useEffect,useState} from 'react';
import 'leaflet/dist/leaflet.css';
import {CatalogStopsLayer,RouteStopsLayer} from '../components/map/StopLayers';
import {loadStopPlatforms} from '../lib/stop-platform-position';
const stop:any={id:'shared-platform',name:'Test wspólny peron 01',code:'01',type:'bus',lat:50.00005,lon:22.00005,lines:[],carriers:[],isFavorite:false,providerStopIds:{pks:'1',mpk_rzeszow:'1',marcel:'1'}};
const stops=[stop],data={'1':{n:'Test wspólny peron 01',lat:50,lon:22}},ids=['1'];
function Control({refresh}:{refresh:()=>void}){const map=useMap();useEffect(()=>{(window as any).__platformZoom=(zoom:number)=>map.setZoom(zoom,{animate:false});(window as any).__platformRefresh=async()=>{await loadStopPlatforms();refresh();map.fire('moveend');};},[map,refresh]);return null;}
export default function MapPlatformJoinFixture({provider}:{provider:string}){const [,setRevision]=useState(0);return <MapContainer center={[50.00005,22.00005]} zoom={19} maxZoom={21} style={{height:'100%',width:'100%'}}><Control refresh={()=>setRevision(v=>v+1)}/><CatalogStopsLayer stops={stops}/><Pane name="routeStopsPane" style={{zIndex:470}}><RouteStopsLayer selectedVehicle={{id:'v',name:'108',provider,lat:50,lon:22}} stopsData={data} catalogStops={stops} stopIds={ids} selectedRouteColor="#14b8a6"/></Pane></MapContainer>;}
