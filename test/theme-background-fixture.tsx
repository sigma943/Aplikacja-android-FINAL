import React from 'react';
import {createRoot} from 'react-dom/client';
import StopList from '@/Panel/src/components/StopList';
import JourneyPlanner from '@/components/journeys/JourneyPlanner';
import {BansView} from '@/app/admin/components/BansView';
import {applyInterfaceAppearance,DEFAULT_INTERFACE_APPEARANCE} from '@/lib/interface-appearance';
import {themeDecoration} from '@/lib/app-theme';
declare const ADMIN_LIGHT_STYLES:string;
const q=new URLSearchParams(location.search),theme=q.get('theme')||'light-warm',tab=q.get('tab')||'stops';
const dark=theme.startsWith('dark'),glass=q.get('glass')!=='off';
applyInterfaceAppearance(document.documentElement,{...DEFAULT_INTERFACE_APPEARANCE,glassOpacity:Number(q.get('opacity')||64),reducedMotion:true},dark,'#00a3a2',q.has('lightEffects'),theme);
function Stops(){return <div className="pks-panel-scope absolute inset-0" data-panel-theme={dark?'dark':'light'} data-glass={glass?'on':'off'}><StopList stops={[]} isDarkTheme={dark} isFullScreen backEnabled={false} onStopSelect={()=>{}} toggleFavorite={()=>{}} searchState={{isFullListOpen:q.has('full'),inputValue:'',fullInputValue:'',carrierFilter:'all',visibleFullCount:40}}/></div>;}
function Admin(){return <div data-admin-viewport className={'pks-panel-scope h-full flex '+(!dark?'admin-light':'')} data-panel-theme={dark?'dark':'light'} data-glass={glass?'on':'off'}>
 {!dark&&<style>{ADMIN_LIGHT_STYLES}</style>}<BansView bans={[]} stats={{activeBans:0,expireToday:0,everWithBanDetails:0}} onUnblock={()=>{}} onMenuClick={()=>{}}/>
</div>;}
createRoot(document.getElementById('root')!).render(<div className={'pks-theme-root fixed inset-0 '+(theme==='light-warm'?'theme-warm':'')} data-ui-theme={theme} style={{'--theme-decoration':themeDecoration(theme)} as React.CSSProperties}>
 <div data-hidden-map className="absolute inset-0" style={{background:'linear-gradient(135deg,#ff00ff,#00ff00)'}}/>
 <div data-native-view={tab} data-cosmic-canvas className={'absolute inset-0 flex flex-col '+(glass&&tab!=='journeys'?'pks-glass-frame':'')} data-panel-theme={dark?'dark':'light'}>
  {tab==='stops'?<Stops/>:tab==='journeys'?<JourneyPlanner stops={[]} active={false} dark={dark} onClose={()=>{}}/>:<Admin/>}
 </div>
</div>);
