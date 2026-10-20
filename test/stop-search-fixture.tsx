import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {themeDecoration} from '../lib/app-theme';
import StopList from '../Panel/src/components/StopList';
import JourneyPlanner from '../components/journeys/JourneyPlanner';
import type {Stop} from '../Panel/src/types';
const stop=(id:string,name:string,provider='pks',extra:Partial<Stop>={}):Stop=>({id,name,type:'bus',carriers:[{id:provider,name:provider,colorClass:''}],lines:['108'],isFavorite:false,...extra});
const terminal=stop('3731','Rzeszów D.A. st. 1','pks',{areaId:'1937',code:'1',lat:50.0423,lon:22.0034,providerStopIds:{pks:'3731'}});
const base=[terminal,stop('1367','Babica 82','pks',{code:'82'}),stop('1373','Babica Kolonia 84'),stop('mpk_rzeszow:127','Rzeszów Dworzec Główny PKP 01','mpk'),stop('marcel:test','Głowienka Centrum 04','marcel'),...Array.from({length:55},(_,i)=>stop('park:'+i,'Park '+(i+1),i%2?'mpk':'pks'))];
export async function loadJourneyCatalog(){return base;}
export async function searchConnections(from:Stop,to:Stop){(window as any).__plannerSelection={from,to};return {journeys:[],warnings:[]};}
function Fixture(){
 const [stops,setStops]=useState(base),[theme,setTheme]=useState('dark');
 (window as any).__setStopTheme=setTheme;
 useEffect(()=>{document.documentElement.dataset.cosmicTheme=theme==='dark-cosmos'?'on':'off';document.documentElement.style.setProperty('--theme-decoration',themeDecoration(theme));},[theme]);
 const planner=new URLSearchParams(location.search).has('planner');
 return <div className="pks-theme-root" data-ui-theme={theme} style={{height:'100dvh',position:'relative'}}>
  {planner?<JourneyPlanner stops={[]} dark active allowMap={false} onClose={()=>{}}/>:<div style={{height:'100%',display:'flex',flexDirection:'column'}}><StopList isDarkTheme={!theme.startsWith('light')} stops={stops} backEnabled={false} isFullScreen onStopSelect={stop=>{(window as any).__chosenStop={id:stop.id,name:stop.name,sameReference:stops.includes(stop),providerStopIds:stop.providerStopIds};}} toggleFavorite={()=>{}}/>
   <button data-test-update style={{position:'fixed',right:0,bottom:0,zIndex:50}} onClick={()=>setStops(old=>[...old,stop('new','Nowa Świlcza 82','marcel')])}>Aktualizuj fixture</button></div>}
 </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
