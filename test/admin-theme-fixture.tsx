import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {StatisticsView} from '../app/admin/components/StatisticsView';
import BusSheetThemeFixture from './bus-sheet-theme-fixture';
import MapStopWarningFixture from './map-stop-warning-fixture';
import MapPlatformJoinFixture from './map-platform-join-fixture';
import {checkCloudMaterials} from './cloud-material-fixture';
import {DeviceTable} from '../app/admin/components/DeviceTable';
import {Sidebar} from '../app/admin/components/Sidebar';
import {aggregateApiStatisticsReports} from '../lib/api-statistics-reports';
import {warsawDateIso} from '../lib/transit-time';
import {applyInterfaceAppearance,DEFAULT_INTERFACE_APPEARANCE} from '../lib/interface-appearance';
import {landscapePalette} from '../lib/landscape-palette';
const query=new URLSearchParams(location.search),theme=query.get('theme')||'dark-mountains',night=query.has('night');
const dark=theme==='dark-mountains'?night:theme.startsWith('dark'),root=document.documentElement;
applyInterfaceAppearance(root,{...DEFAULT_INTERFACE_APPEARANCE,glassOpacity:20},dark,'#a4e3d1',false,theme);
root.style.setProperty('--ui-text',dark?'#f1f5f9':'#102030');root.style.setProperty('--ui-muted',dark?'#b8c8dc':'#40566c');
root.style.setProperty('--ui-canvas',dark?'#0c1625':'#edf3f8');root.style.setProperty('--ui-raised',dark?'#142236':'#fff');
if(theme==='dark-mountains'){root.dataset.landscapeTheme='on';root.dataset.landscapeGlass='on';root.dataset.landscapePeriod=night?'night':'day';for(const [k,v]of Object.entries(landscapePalette({sun:{altitude:night?-.5:.5}} as any,20,!night)))root.style.setProperty(k,v);}
if(theme==='dark-cosmos')root.dataset.cosmicTheme='on';
const date=warsawDateIso(),now=Date.now(),history=aggregateApiStatisticsReports([{stream:'a'.repeat(64),installationId:'sample',date,startedAt:now-60000,providers:{pks:{requests:100,errors:3,latencyMs:20000}}}]);
function App(){const [open,setOpen]=useState(false);return <div className="pks-theme-root flex h-screen" data-ui-theme={theme} style={{position:'relative',background:theme==='dark-mountains'?"url('/themes/mountains/terrain.webp') center/cover, #587897":dark?'#081321':'#edf3f8'}}><div data-control-card className="transit-card" style={{position:'fixed',width:1,height:1,left:-50}}/><Sidebar isOpen={open} onClose={()=>setOpen(false)} user={{name:'Administrator',role:'Właściciel',initials:'AD'}} activeView="statistics" onViewChange={()=>setOpen(false)} accentColor="#007f79"/>{query.get('view')==='devices'?<div data-admin-viewport data-panel-theme={dark?'dark':'light'} className={'pks-panel-scope w-full overflow-auto '+(!dark?'admin-light':'')}><DeviceTable devices={[{id:'sample',name:'Windows 19.0.1',os:'PRZEGLĄDARKA · WINDOWS',deviceId:'4fdafd9d-87eb-4148-be6b-020d097c3a70',firstLogin:'19.10.2026, 10:28:29',role:'Administrator',status:'Aktywny',iconType:'desktop',lastSeenLabel:'1 tyg. temu'}]} onOpenBanModal={()=>{}} onOpenRolesModal={()=>{}} onNavigateToBanScreen={()=>{}} onMenuClick={()=>setOpen(true)}/></div>:query.get('view')==='bus'?<BusSheetThemeFixture dark={dark} provider={query.get('provider')||'pks'}/>:<StatisticsView reportsEnabled={false} apiHistory={history} devices={[{id:'a',firstLogin:new Date(now).toISOString(),lastSeenAt:now}]} isDarkTheme={dark} accentColor="#a4e3d1" onMenuClick={()=>setOpen(true)}/>}</div>;}
document.getElementById('root')!.style.height='100vh';
if(query.get('view')==='clouds'){(window as any).__cloudMaterialCheck=checkCloudMaterials();}
createRoot(document.getElementById('root')!).render(query.get('view')==='stop'?<MapStopWarningFixture dark={dark}/>:query.get('view')==='platform'?<MapPlatformJoinFixture provider={query.get('provider')||'pks'}/>:<App/>);
