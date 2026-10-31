import React from 'react';
import {createRoot} from 'react-dom/client';
import {OperatorsView} from '@/app/admin/components/OperatorsView';
import {MaintenanceView} from '@/app/admin/components/MaintenanceView';
import {DeviceTable} from '@/app/admin/components/DeviceTable';
import {BansView} from '@/app/admin/components/BansView';
import {LogsView} from '@/app/admin/components/LogsView';
import {applyInterfaceAppearance,DEFAULT_INTERFACE_APPEARANCE} from '@/lib/interface-appearance';
import {uiAccentVariables} from '@/lib/ui-accent';
import {landscapePalette} from '@/lib/landscape-palette';
import {solarMilkMaterial} from '@/lib/solar-milk';
import {themeDecoration} from '@/lib/app-theme';
declare const ADMIN_LIGHT_STYLES:string;
const q=new URLSearchParams(location.search),theme=q.get('theme')||'light-warm',style=q.get('style')||'solid',accent=q.get('accent')||'#ff8000';
const altitude=Number(q.get('sun')||30),landscape=theme==='dark-mountains',dark=landscape?altitude<0:theme.startsWith('dark');
const root=document.documentElement;
applyInterfaceAppearance(root,{...DEFAULT_INTERFACE_APPEARANCE,buttonStyle:style as any,reducedMotion:true},dark,accent,false,theme);
for(const [key,value]of Object.entries(uiAccentVariables(accent,dark)))root.style.setProperty(key,value);
if(landscape){root.dataset.landscapeTheme='on';root.dataset.landscapePeriod=dark?'night':'day';for(const [key,value]of Object.entries(landscapePalette({sun:{altitude:altitude*Math.PI/180}} as any,64,!dark)))root.style.setProperty(key,value);root.style.setProperty('--landscape-milk-glow',solarMilkMaterial(altitude,!dark).glow);}
if(theme==='dark-cosmos')root.dataset.cosmicTheme='on';
const noop=()=>{},done=async()=>{},device:any={id:'other',name:'Telefon',os:'Android',deviceId:'sample',firstLogin:'31.10.2026, 13:15:00',role:'Administrator',status:'Aktywny',iconType:'mobile',lastSeenLabel:'teraz'};
createRoot(document.getElementById('root')!).render(<div className={'pks-theme-root '+(theme==='light-warm'?'theme-warm':'')} data-ui-theme={theme} style={{'--theme-decoration':themeDecoration(theme)} as React.CSSProperties}>
 <div data-admin-viewport className={'pks-panel-scope '+(!dark?'admin-light':'')} data-panel-theme={dark?'dark':'light'}>
  {!dark&&<style>{ADMIN_LIGHT_STYLES}</style>}
  <section data-fixture-view="operators"><OperatorsView operators={[]} currentDeviceRole="owner" onMenuClick={noop} onSaveOperator={done} onRemoveOperator={done} globalSettings={{loginEnabled:true,maintenanceMode:false,autoBan:false}} onSaveGlobalSettings={done}/></section>
  <section data-fixture-view="maintenance"><MaintenanceView onMenuClick={noop} canEdit={false}/></section>
  <section data-fixture-view="devices"><DeviceTable devices={[device]} currentDeviceRole="owner" onMenuClick={noop} onOpenBanModal={noop} onOpenRolesModal={noop} onNavigateToBanScreen={noop}/></section>
  <section data-fixture-view="bans"><BansView bans={[]} stats={{activeBans:0,expireToday:0,everWithBanDetails:0}} onUnblock={noop} onMenuClick={noop}/></section>
  <section data-fixture-view="logs"><LogsView logs={[]} onMenuClick={noop}/></section>
 </div>
</div>);
