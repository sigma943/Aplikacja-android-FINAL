import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MapContainer,Pane,useMap} from 'react-leaflet';
import RouteLines from '../components/map/RouteLines';
const points:[number,number][]=[[50,21.99],[50,22.01]];
function Inspector(){const map=useMap();(window as any).routeTestMap=map;return null;}
function App(){const [schematic,setSchematic]=useState(true),[identity,setIdentity]=useState('one');const canvas=new URLSearchParams(location.search).get('canvas')==='1';return <><button onClick={()=>setSchematic(v=>!v)}>Zmień tryb</button><button onClick={()=>setIdentity(v=>v==='one'?'two':'one')}>Zmień autobus</button><div data-mode={schematic?'schematic':'road'} data-identity={identity}/><MapContainer center={[50,22]} zoom={14} preferCanvas={canvas} zoomControl={false} style={{height:600,width:393}}><Inspector/><Pane name="routeLinePane" style={{zIndex:430}}><RouteLines positions={points} schematic={schematic} identity={identity} color="#ff7a00"/></Pane></MapContainer></>;}
createRoot(document.getElementById('root')!).render(<App/>);
