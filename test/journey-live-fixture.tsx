import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import JourneyPlanner from '../components/journeys/JourneyPlanner';
import type {Stop} from '../Panel/src/types';
import type {Journey} from '../lib/journey-planner';
const place=(id:string,name:string,lat:number,lon:number):Stop=>({id,name,lat,lon,type:'bus',carriers:[{id:'pks',name:'PKS Rzeszów',colorClass:''}],lines:['108'],isFavorite:false});
const a=place('a','Początek',50.04,22),b=place('b','Przesiadka',50.041,22.001),c=place('c','Koniec',50.043,22.004),middle=place('middle','Przystanek pośredni',50.04215,22.0025);
const d=place('d','Cel podróży',50.044,22.0055);
export async function loadJourneyCatalog(){return [a,b,c,d];}
export async function searchConnections(){
 const count=((window as any).__liveCalls||0)+1;(window as any).__liveCalls=count;
 const departure=Date.now()+3600000+count*60000,arrival=departure+900000;
 const journey:Journey={id:'changing:'+count,departure,arrival,walking:100,transfers:1,legs:[
  {from:a,to:b,departure,arrival:departure+120000,course:'walk',provider:'walk',line:'Pieszo',walking:100,path:[[a.lat!,a.lon!],[b.lat!,b.lon!]]},
  {from:b,to:c,departure:departure+120000,arrival:departure+600000,course:'pks:123:2026-10-19',provider:'pks',line:'108',delaySeconds:count*60,stops:[{stop:b,arrival:departure+120000,departure:departure+120000},{stop:middle,arrival:departure+360000,departure:departure+360000},{stop:c,arrival:departure+600000,departure:departure+600000}],path:[[b.lat!,b.lon!],[c.lat!,c.lon!]]},
  {from:c,to:d,departure:departure+660000,arrival,course:'mpk:124:2026-10-19',provider:'mpk',line:'11',delaySeconds:-60,path:[[c.lat!,c.lon!],[d.lat!,d.lon!]]},
 ]};
 return {journeys:[journey],warnings:[]};
}
localStorage.setItem('pks-live:journey-recents',JSON.stringify(Array.from({length:7},(_,i)=>({from:a,to:d,searchedAt:Date.now()-i*60000}))));
function Fixture(){const [active,setActive]=useState(true);return <div className="pks-theme-root" data-ui-theme="dark" style={{position:'relative',height:'100dvh'}}><button data-fixture-toggle style={{position:'fixed',right:0,top:0,zIndex:9999}} onClick={()=>setActive(!active)}>Toggle</button><JourneyPlanner stops={[a,b,c]} active={active} dark onClose={()=>{}}/></div>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
