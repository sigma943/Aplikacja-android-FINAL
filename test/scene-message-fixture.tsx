import React from 'react';
import {createRoot} from 'react-dom/client';
import StopList from '@/Panel/src/components/StopList';
import {landscapePalette} from '@/lib/landscape-palette';
import {uiAccentVariables} from '@/lib/ui-accent';
import '@/components/journeys/journeys.css';

const params=new URLSearchParams(location.search),theme=params.get('theme')||'dark-mountains';
const degrees=Number(params.get('sun')||30),day=degrees>-2;
const dark=theme==='dark-mountains'?!day:theme.startsWith('dark');
const root=document.documentElement;
root.dataset.personalMotion='reduced';
if(theme==='dark-mountains'){
 root.dataset.landscapeTheme='on';root.dataset.landscapePeriod=day?'day':'night';
 const palette=landscapePalette({sun:{altitude:degrees*Math.PI/180}} as any,Number(params.get('opacity')||20),day);
 for(const [key,value] of Object.entries(palette))root.style.setProperty(key,value);
}
const variant=params.get('variant')||'preview';
createRoot(document.getElementById('root')!).render(<div className="pks-theme-root" data-ui-theme={theme} style={{...uiAccentVariables(params.get('accent')||'#00a3a2',dark),height:'100dvh'}}>
 <div style={{height:560,background:'linear-gradient(135deg,#ffffff,#071321 50%,#ffffff)'}}>
  <StopList stops={[]} onStopSelect={()=>{}} toggleFavorite={()=>{}} backEnabled={false} isDarkTheme={dark} isFullScreen
   searchState={{inputValue:'Hh',fullInputValue:'Hh',carrierFilter:'all',visibleFullCount:40,favoritesOnly:variant==='favorites',isFullListOpen:variant==='full'}}/>
 </div>
 <section className="connections-view" data-panel-theme={dark?'dark':'light'} style={{position:'relative',height:240,padding:16,background:'linear-gradient(135deg,#071321,#ffffff)'}}>
  <div className="connections-results-heading scene-message"><h2>Brak połączeń w tym terminie</h2><span>0 propozycji</span></div>
  <p className="connections-hint scene-message" role="status">Uzupełniam kursy Marcela i dane na żywo… Możesz już wybrać połączenie.</p>
 </section>
</div>);
