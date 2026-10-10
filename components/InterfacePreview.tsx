'use client';
import {useEffect,useRef,useState} from 'react';
import {MotionConfig} from 'motion/react';
import {MapHeader,BottomNavigation} from './ApplicationChrome';
import MapStopSheet from './MapStopSheet';
import BusDetailsPanel from './BusDetailsPanel';
import CarrierBusIcon from './CarrierBusIcon';
import {useSheetGesture} from '@/lib/use-sheet-gesture';
import {vehicleHeaderStyle,type NavItem} from '@/lib/interface-appearance';
import type {PreviewChrome} from './OptionsContent';
import type {Vehicle} from '@/lib/transport/vehicle';
const sample:Vehicle={id:'preview',provider:'pks',name:'108',routeShortName:'108',vehicleNumber:'58',lat:50,lon:22,direction:'Rzeszów D.A.',speed:32,delay:0,model:'Isuzu Citiport 12 CNG',status:'active'};
const noAction=()=>{};
export default function InterfacePreview({chrome,accent,glass,dark,navOrder}:{navOrder?:readonly NavItem[];chrome:PreviewChrome;accent:string;glass:boolean;dark:boolean}){
 const [view,setView]=useState('map'),[shown,setShown]=useState(true),[scale,setScale]=useState(.75);
 const wrap=useRef<HTMLDivElement>(null),busHeader=useRef<HTMLDivElement>(null);
 const drag=useSheetGesture(true,noAction,260,260);
 useEffect(()=>{if(!wrap.current)return;const measure=()=>setScale(wrap.current!.clientWidth/393);const observer=new ResizeObserver(measure);observer.observe(wrap.current);measure();return()=>observer.disconnect();},[shown]);
 return <section data-options-appearance className="personal-preview-wrap">
  <div className="flex items-center justify-between gap-2"><span className="text-[10px] uppercase tracking-widest opacity-60">Podgląd aplikacji</span><button type="button" className="ui-accent-text text-xs py-2" aria-expanded={shown} onClick={()=>setShown(!shown)}>{shown?'Ukryj podgląd':'Pokaż podgląd'}</button></div>
  {shown&&<>
   <div className="personal-choices mb-3">{[['map','Mapa'],['stop','Przystanek'],['bus','Autobus']].map(([id,name])=><button className={`personal-choice ${view===id?'ui-accent-soft':''}`} type="button" key={id} aria-label={`Podgląd: ${name}`} aria-pressed={view===id} onClick={()=>setView(id)}>{name}</button>)}</div>
   <div ref={wrap} className="personal-preview" data-interface-preview style={{height:480*scale}}>
    <MotionConfig reducedMotion="always"><div className="personal-preview-scene" inert style={{width:393,height:480,transform:`scale(${scale})`}}>
     <div className="personal-preview-roads"/>
     <div className="absolute left-0 right-0 top-0 p-2"><MapHeader mapGlassPanel={chrome.mapGlassPanel} mapGlassInput={chrome.mapGlassInput} themeColor={accent} transparentUI={glass} isDark={dark} isManualRefreshing={false} showAlertDot={false} isOffline={false} textSub={chrome.textSub} filterRoute="" setFilterRoute={noAction} handleManualRefresh={noAction} closeMapPanelsForSearch={noAction}/></div>
     <div className="absolute left-[258px] top-[145px] h-[48px] w-[34px]"><CarrierBusIcon color="#14b8a6" label="108"/></div>
     {view==='stop'&&<MapStopSheet preview name="Rzeszów, Podkarp.Matuszczaka 04" expanded onExpandedChange={noAction} transparent={glass} dark={dark} loading={false} error={null} departures={[{id:'sample',line:'108',direction:'Rzeszów D.A.',color:'#14b8a6',time:'5 min',day:'',delayMinutes:0},{id:'sample2',line:'43',direction:'Krasne CH',color:'#ff7a00',time:'12 min',day:'',delayMinutes:2}]}/>}
     {view==='bus'&&<BusDetailsPanel preview selectedBus={sample} busDrag={drag} busHeaderRef={busHeader} isBusPanelExpanded setIsBusPanelExpanded={noAction} transparentUI={glass} isDark={dark} mapDetailPanel="map-detail-shell" mapDetailContent="map-detail-body" mapDetailCard="map-detail-row" mapDetailDivider="border-current/10" mapDetailLine="bg-current/10" selectedBusHeaderStyle={vehicleHeaderStyle('#14b8a6',glass)} selectedVehicleIsTrain={false} selectedBusStatusLabel="W trasie" selectedBusGpsSignalClock="13:07" breakCountdownLabel={null} selectedBusIsWaitingForDeparture={false} selectedBusScheduleLoading={false} selectedBusDisplayedStops={[]} selectedStopId={null} selectedVehicleColor="#14b8a6" textSub="map-detail-muted" textMain={dark?'text-white':'text-slate-900'} themeColor={accent} openVehicleRouteStop={noAction} formatScheduleStopName={name=>name}/>}
     <div className="absolute bottom-0 left-0 right-0"><BottomNavigation preview order={navOrder} activeTab="map" className={chrome.bottomGlassShell} themeColor={accent} onMap={noAction} onStops={noAction} onOptions={noAction}/></div>
    </div></MotionConfig>
   </div>
   <p className="personal-note mt-2">Dane przykładowe.</p>
  </>}
 </section>;
}
