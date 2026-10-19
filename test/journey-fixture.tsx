import {createRoot} from 'react-dom/client';
import JourneyMap from '../components/journeys/JourneyMap';
import type {Journey} from '../lib/journey-planner';
import {BottomNavigation} from '../components/ApplicationChrome';
import JourneyIcon from '../components/journeys/JourneyIcon';
import JourneyPlanner from '../components/journeys/JourneyPlanner';
const dark=new URLSearchParams(location.search).get('theme')!=='light';
const root=document.documentElement;
root.style.setProperty('--ui-canvas',dark?'#101a26':'#f4f7f8');root.style.setProperty('--ui-surface',dark?'#152230':'#ffffff');root.style.setProperty('--ui-text',dark?'#edf2f7':'#172536');root.style.setProperty('--ui-muted',dark?'#9aaabb':'#64748b');root.style.setProperty('--ui-edge',dark?'#ffffff12':'#17253614');root.style.setProperty('--pks-accent','#00a3a2');
const icons=new URLSearchParams(location.search).has('icons');
const mapCase=new URLSearchParams(location.search).get('map-case');
const start={id:'start',name:'Początek trasy',type:'bus' as const,lat:50.04,lon:22,carriers:[],lines:[],isFavorite:false};
const end={...start,id:'end',name:'Koniec trasy',lon:22.02};
const example:Journey={id:'curve',departure:0,arrival:600000,transfers:0,walking:1500,legs:[{from:start,to:end,departure:0,arrival:600000,walking:1500,line:'Pieszo',provider:'walk',course:'walk',path:[[50.04,22],[50.07,22.01],[50.04,22.02]]}]};
if(mapCase==='stops'){
 const middle={...start,id:'middle',name:'Przystanek pośredni',lat:50.041,lon:22.01};
 example.legs=[{from:start,to:end,departure:0,arrival:600000,line:'301',provider:'pks',course:'pks:1',stops:[start,middle,end],via:[[start.lat,start.lon],[middle.lat,middle.lon],[end.lat,end.lon]],path:[[start.lat,start.lon],[middle.lat,middle.lon],[end.lat,end.lon]]}];
 example.walking=0;
}
if(mapCase==='missing')example.legs.push({from:{...end,id:'missing',lon:undefined},to:end,departure:600000,arrival:700000,line:'Pieszo',provider:'walk',course:'walk',walking:100});
createRoot(document.getElementById('root')!).render(<div className="pks-theme-root" data-ui-theme={dark?'dark':'light'} style={{position:'relative',height:'100dvh'}}><>{icons?<><div style={{padding:40,color:'var(--pks-accent)'}}><JourneyIcon size={96}/></div><div style={{position:'absolute',bottom:0,width:'100%',color:'var(--ui-muted)'}}><BottomNavigation activeTab="journeys" className="" themeColor="#00a3a2" onMap={()=>{}} onStops={()=>{}} onOptions={()=>{}} onJourneys={()=>{}}/></div></>:mapCase?<section className="connections-view" data-panel-theme={dark?'dark':'light'}><JourneyMap journey={example} dark={dark}/></section>:<JourneyPlanner stops={[]} dark={dark} active allowMap onClose={()=>{}}/>}</></div>);
