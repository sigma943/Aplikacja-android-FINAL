import React from 'react';
import {createRoot} from 'react-dom/client';
import {DeviceTable} from '../app/admin/components/DeviceTable';
import {StatisticsView} from '../app/admin/components/StatisticsView';
import StopList from '../Panel/src/components/StopList';
import JourneyPlanner from '../components/journeys/JourneyPlanner';
import DynamicLandscape from '../components/DynamicLandscape';
import {BottomNavigation} from '../components/ApplicationChrome';
import {applyInterfaceAppearance,DEFAULT_INTERFACE_APPEARANCE} from '../lib/interface-appearance';
import {themeDecoration,THEME_SCREEN_COLORS} from '../lib/app-theme';
import '../components/journeys/journeys.css';
const query=new URLSearchParams(location.search),theme=query.get('theme')||'dark-forest',tab=query.get('tab')||'admin',overlay=!query.has('off'),native=!query.has('desktop');
const root=document.documentElement,dark=theme==='dark-mountains'?false:theme.startsWith('dark');
root.dataset.nativeEdge=String(native);root.dataset.pksTheme=theme;
root.style.setProperty('--native-top',native?'32px':'0px');root.style.setProperty('--native-bottom',native?'24px':'0px');root.style.setProperty('--native-left','0px');root.style.setProperty('--native-right','0px');
applyInterfaceAppearance(root,{...DEFAULT_INTERFACE_APPEARANCE,statusBarOverlay:overlay},dark,'#00a3a2',false,theme);
if(theme==='dark-cosmos')root.dataset.cosmicTheme='on';
const noop=()=>{},stop:any={id:'one',name:'Rzeszów, Podkarpacka',type:'bus',lines:['108'],carriers:[],isFavorite:false};
function App(){return <div className="pks-theme-root fixed inset-0 flex flex-col overflow-hidden" data-ui-theme={theme} data-cosmic-tab={tab} style={{backgroundColor:THEME_SCREEN_COLORS[theme as keyof typeof THEME_SCREEN_COLORS]?.background,'--theme-decoration':themeDecoration(theme)} as React.CSSProperties}>
 <div data-native-status-background/>
 <DynamicLandscape active={theme==='dark-mountains'} glass sceneCovered={false}/>
 <div data-app-content className="relative flex-1 min-h-0 overflow-hidden">
  <div data-map-canvas className="absolute inset-0" style={{background:'red'}} hidden/>
  <div data-native-view={tab} className="absolute inset-0 flex flex-col min-h-0 overflow-hidden">
   {tab==='admin'?<div data-admin-viewport className={'pks-panel-scope flex flex-1 min-h-0 flex-col overflow-hidden '+(!dark?'admin-light':'')} data-panel-theme={dark?'dark':'light'} data-glass="on"><div data-cosmic-content className="flex flex-1 min-h-0 flex-col overflow-hidden"><DeviceTable devices={[{id:'sample',name:'Windows 19.0.0',os:'PRZEGLĄDARKA - WINDOWS',deviceId:'sample',firstLogin:'27.10.2026',role:'Administrator',status:'Aktywny',iconType:'desktop'}]} onOpenBanModal={noop} onOpenRolesModal={noop} onNavigateToBanScreen={noop} onMenuClick={noop}/></div></div>:tab==='statistics'?<StatisticsView devices={[]} isDarkTheme={dark} accentColor="#00a3a2" onMenuClick={noop}/>:tab==='stops'?<StopList stops={[stop]} isDarkTheme={dark} backEnabled={false} isFullScreen onStopSelect={noop} toggleFavorite={noop}/>:<JourneyPlanner stops={[]} dark={dark} allowMap={false} active={false} onClose={noop}/>}
  </div>
 </div>
 <div data-app-navigation className="absolute bottom-0 left-0 right-0"><BottomNavigation activeTab={tab} className="pks-navigation" themeColor="#00a3a2" onMap={noop} onStops={noop} onJourneys={noop} onAdmin={noop} onOptions={noop}/></div>
</div>;}
createRoot(document.getElementById('root')!).render(<App/>);
