import {createRoot} from 'react-dom/client';
import {applyInterfaceAppearance,DEFAULT_INTERFACE_APPEARANCE} from '../lib/interface-appearance';
import {uiAccentVariables} from '../lib/ui-accent';
import {landscapePalette} from '../lib/landscape-palette';
import {solarMilkMaterial} from '../lib/solar-milk';
import {themeDecoration} from '../lib/app-theme';
(window as any).__pickerThemes=Object.fromEntries(['light-sky','dark-forest','light-pink'].map(t=>[t,themeDecoration(t)]));
import JourneyMap from '../components/journeys/JourneyMap';
import type {Journey} from '../lib/journey-planner';
import {BottomNavigation} from '../components/ApplicationChrome';
import JourneyIcon from '../components/journeys/JourneyIcon';
import JourneyPlanner from '../components/journeys/JourneyPlanner';
const query=new URLSearchParams(location.search),pickerNav=query.has('picker-nav'),theme=query.get('picker-theme')||(query.get('theme')==='light'?'light':'dark'),sun=Number(query.get('sun')||30);
const dark=theme==='dark-mountains'?sun<0:theme.startsWith('dark');
const root=document.documentElement;
root.style.setProperty('--ui-canvas',dark?'#101a26':'#f4f7f8');root.style.setProperty('--ui-surface',dark?'#152230':'#ffffff');root.style.setProperty('--ui-text',dark?'#edf2f7':'#172536');root.style.setProperty('--ui-muted',dark?'#9aaabb':'#64748b');root.style.setProperty('--ui-edge',dark?'#ffffff12':'#17253614');root.style.setProperty('--pks-accent','#00a3a2');
if(pickerNav){
 applyInterfaceAppearance(root,{...DEFAULT_INTERFACE_APPEARANCE,chromeStyle:query.get('chrome')==='classic'?'classic':'modern',reducedMotion:true},dark,'#8b5cf6',false,theme);
 for(const [key,value]of Object.entries(uiAccentVariables('#8b5cf6',dark)))root.style.setProperty(key,value);
 root.style.setProperty('--safe-bottom',query.get('safe')||'0px');root.dataset.nativeEdge='true';
 if(theme==='dark-mountains'){root.dataset.landscapeTheme='on';root.dataset.landscapePeriod=dark?'night':'day';for(const [key,value]of Object.entries(landscapePalette({sun:{altitude:sun*Math.PI/180}} as any,64,!dark)))root.style.setProperty(key,value);root.style.setProperty('--landscape-milk-glow',solarMilkMaterial(sun,!dark).glow);}
}
const icons=new URLSearchParams(location.search).has('icons');
const mapCase=new URLSearchParams(location.search).get('map-case');
const start={id:'start',name:'Początek trasy',type:'bus' as const,lat:50.04,lon:22,carriers:[],lines:[],isFavorite:false};
const end={...start,id:'end',name:'Koniec trasy',lon:22.02};
const example:Journey={id:'curve',departure:0,arrival:600000,transfers:0,walking:1500,legs:[{from:start,to:end,departure:0,arrival:600000,walking:1500,line:'Pieszo',provider:'walk',course:'walk',path:[[50.04,22],[50.07,22.01],[50.04,22.02]]}]};
if(mapCase==='missing')example.legs.push({from:{...end,id:'missing',lon:undefined},to:end,departure:600000,arrival:700000,line:'Pieszo',provider:'walk',course:'walk',walking:100});
createRoot(document.getElementById('root')!).render(<div className="pks-theme-root" data-ui-theme={theme} style={{position:'relative',height:'100dvh'}}><>{icons?<><div style={{padding:40,color:'var(--pks-accent)'}}><JourneyIcon size={96}/></div><div style={{position:'absolute',bottom:0,width:'100%',color:'var(--ui-muted)'}}><BottomNavigation activeTab="journeys" className="" themeColor="#00a3a2" onMap={()=>{}} onStops={()=>{}} onOptions={()=>{}} onJourneys={()=>{}}/></div></>:mapCase?<section className="connections-view" data-panel-theme={dark?'dark':'light'}><JourneyMap journey={example} dark={dark}/></section>:<><JourneyPlanner stops={[]} dark={dark} active allowMap onClose={()=>{}}/>{pickerNav&&<div data-app-navigation className="pointer-events-none absolute bottom-0 left-0 right-0 z-[5000]"><BottomNavigation activeTab="journeys" className="pks-navigation" themeColor="#8b5cf6" onMap={()=>{}} onStops={()=>{}} onOptions={()=>{}} onJourneys={()=>{}}/></div>}</>}</></div>);
