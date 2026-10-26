import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import JourneyMap from '../components/journeys/JourneyMap';
import InterfacePersonalization from '../components/InterfacePersonalization';
import DynamicLandscape from '../components/DynamicLandscape';
import {DEFAULT_INTERFACE_APPEARANCE,applyInterfaceAppearance} from '../lib/interface-appearance';
import {landscapePalette} from '../lib/landscape-palette';
import {themeScreenMaterial} from '../lib/app-theme';
import '../components/journeys/journeys.css';
import road from '../public/data/bus-routes/pks/505.json';
import {sliceJourneyRoute} from '../lib/journey-route-geometry';
import {correctPksStationJunction} from '../lib/pks-station-junction';
const params=new URLSearchParams(location.search),theme=params.get('theme')||'dark-mountains',options=params.get('view')==='options';
const dark=!theme.startsWith('light')&&theme!=='dark-mountains';
const root=document.documentElement;root.style.setProperty('--ui-surface',dark?'#152230':'#f5f8fc');root.style.setProperty('--ui-text',dark?'#edf2f7':'#172536');root.style.setProperty('--ui-muted',dark?'#b8c8d8':'#475569');root.style.setProperty('--ui-edge','#7a8b9c55');root.style.setProperty('--pks-accent','#00a3a2');
applyInterfaceAppearance(root,DEFAULT_INTERFACE_APPEARANCE,dark,'#00a3a2',false,theme);
if(theme==='dark-cosmos')root.dataset.cosmicTheme='on';
if(theme==='dark-mountains'){
 root.dataset.landscapeTheme='on';root.dataset.landscapeGlass='on';root.dataset.landscapePeriod='day';
 for(const [key,value] of Object.entries(landscapePalette({sun:{altitude:.5}} as any,64,true)))root.style.setProperty(key,value);
}
const a={id:'a',name:'Rzeszów D.A. st. 8',lat:50.0420817,lon:22.0037329,type:'bus' as const,carriers:[],lines:[],isFavorite:false},b={...a,id:'b',name:'Warszawska ZS. Samoch. 04 nż',lat:50.05531,lon:21.99611};
const path=sliceJourneyRoute(correctPksStationJunction(road as [number,number][],'pks'),[[a.lat,a.lon],[b.lat,b.lon]]);
const journey:any={id:'regression',departure:0,arrival:1200000,walking:0,transfers:0,legs:[{from:a,to:b,departure:0,arrival:1200000,line:'207',provider:'pks',course:'pks:regression',path,stops:[{stop:a},{stop:b}]}]};
function Options(){const [value,onChange]=useState({...DEFAULT_INTERFACE_APPEARANCE});return <><DynamicLandscape active={theme==='dark-mountains'}/><InterfacePersonalization value={value} onChange={onChange} theme={theme} dark={dark} accent="#00a3a2" setAccent={()=>{}} setTheme={()=>{}} glass glow={false} glowStrength={25} setGlass={()=>{}} setGlow={()=>{}} setGlowStrength={()=>{}} lightEffects={false} chrome={{mapGlassPanel:'',mapGlassInput:'',textSub:'',bottomGlassShell:''}}/></>;}
createRoot(document.getElementById('root')!).render(<div data-underlay-root className="pks-theme-root" data-ui-theme={theme} style={{height:'100dvh',position:'relative',transform:'translateZ(0)',background:themeScreenMaterial(theme).background}}>
 {options?<Options/>:<><div style={{position:'absolute',top:0}}>UNDERLYING HEADER</div><section className="connections-view" data-panel-theme={dark?'dark':'light'} style={{height:'100%'}}><JourneyMap journey={journey} dark={dark}/></section><nav data-underlay-navigation style={{position:'fixed',bottom:0,left:0,right:0,zIndex:5000,height:80,background:'#f00'}}>UNDERLYING NAVIGATION</nav></>}
 </div>);
