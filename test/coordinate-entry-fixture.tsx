import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import JourneyPlaceMap from '../components/journeys/JourneyPlaceMap';
import '../components/journeys/journeys.css';
function Fixture(){const [selected,setSelected]=useState<unknown>(null);return <div className="connections-view" style={{display:'flex',padding:12}}><JourneyPlaceMap stops={[]} initial={null} onSelect={setSelected}/><output data-confirmed hidden>{JSON.stringify(selected)}</output></div>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
