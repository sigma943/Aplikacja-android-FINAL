import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import HorizonSky,{HorizonWindow} from '@/components/HorizonSky';
import {horizonSnapshot} from '@/lib/horizon-sky';
const w=window as any;
const realNow=Date.now;let now=Date.parse('2026-10-23T15:00:00Z');Date.now=()=>now;
w.horizonAt=(time:string)=>{now=Date.parse(time);window.dispatchEvent(new Event('focus'));};
w.skyAt=(time:string)=>horizonSnapshot(Date.parse(time));
let hidden=false;Object.defineProperty(document,'visibilityState',{get:()=>hidden?'hidden':'visible'});
w.horizonHidden=(next:boolean)=>{hidden=next;document.dispatchEvent(new Event('visibilitychange'));};
localStorage.setItem('mks_app_theme','dark-horizon');
function Fixture(){const [on,setOn]=useState(true);return <><div className="pks-theme-root fixed inset-0" data-ui-theme={on?'dark-horizon':'dark'}>
  <main className="transit-view" style={{position:'fixed',inset:0,padding:'24px',paddingTop:'32vh'}}>
    <HorizonWindow canvas/>
    <header className="connections-heading"><div><h1 style={{fontSize:28,fontWeight:700}}>Horyzont</h1><p>Jedno niebo. Rzeczywisty czas.</p></div></header>
    <section className="transit-surface" style={{marginTop:24,padding:24,borderRadius:24}}><h2>108 · Rzeszów D.A.</h2><p style={{marginTop:16}}>Następny przystanek</p><strong>Gwoźnica Dolna 11</strong><p>06:19 · Zgodnie z planem</p></section>
    <section className="transit-surface" style={{marginTop:16,padding:24,borderRadius:24}}>Połączenia · Przystanki · Administratorzy</section>
    <button id="toggle-theme" style={{marginTop:24}} onClick={()=>{localStorage.setItem('mks_app_theme',on?'dark':'dark-horizon');setOn(!on);window.dispatchEvent(new Event('pks-interface-appearance'));}}>Zmień motyw</button>
  </main></div><HorizonSky/></>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
w.restoreNow=()=>{Date.now=realNow;};
