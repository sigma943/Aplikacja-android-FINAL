import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MapContainer,Pane,useMap} from 'react-leaflet';
import RouteLines from '../components/map/RouteLines';
const points:[number,number][]=[[50,21.99],[50,22.01]];
function Inspector(){const map=useMap();(window as any).routeTestMap=map;return null;}
function App(){const [loading,setLoading]=useState(true),[identity,setIdentity]=useState('one');const canvas=new URLSearchParams(location.search).get('canvas')==='1';return <><button onClick={()=>setLoading(v=>!v)}>Załaduj trasę</button><button onClick={()=>setIdentity(v=>v==='one'?'two':'one')}>Zmień autobus</button><div data-mode={loading?'loading':'road'} data-identity={identity}/><MapContainer center={[50,22]} zoom={14} preferCanvas={canvas} zoomControl={false} style={{height:600,width:393}}><Inspector/><Pane name="routeLinePane" style={{zIndex:430}}><RouteLines positions={loading?[]:points} identity={identity} color="#ff7a00"/></Pane></MapContainer></>;}
createRoot(document.getElementById('root')!).render(<App/>);
