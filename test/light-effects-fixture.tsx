import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MotionGlobalConfig} from 'motion/react';
import UIMotionProvider from '../components/UIMotionProvider';
import CosmicFilterEffects from '../components/CosmicFilterEffects';
import BusDetailsPanel from '../components/BusDetailsPanel';
import {useSheetGesture} from '../lib/use-sheet-gesture';
import {vehicleTripFinished} from '../lib/vehicle-trip-finished';
import {INTERFACE_APPEARANCE_KEY} from '../lib/interface-appearance';
localStorage.setItem('mks_app_theme','dark-cosmos');
localStorage.setItem('mks_transparent','true');
localStorage.setItem(INTERFACE_APPEARANCE_KEY,JSON.stringify({glassBlur:22,glassOpacity:35,reducedMotion:false}));
(window as any).__skipAnimations=()=>MotionGlobalConfig.skipAnimations;
function Fixture(){
 const [light,setLight]=useState(localStorage.getItem('mks_light_effects')==='true'),[future,setFuture]=useState(false),[expanded,setExpanded]=useState(true);
 const header=useRef<HTMLDivElement>(null),drag=useSheetGesture(expanded,setExpanded,160,440,true);
 const bus:any={id:'terminal',provider:'pks',lat:50,lon:22,routeShortName:'288',status:'break',speed:0,schedule:future?[{id:1,name:'Nowy kurs',planned:new Date(Date.now()+600000).toISOString()}]:[]};
 return <div className="pks-theme-root" data-ui-theme="dark-cosmos" data-cosmic-tab="journeys" style={{height:'100dvh',position:'relative',background:'#080d1d',color:'white'}}>
  <button data-light-toggle onClick={()=>{const next=!light;setLight(next);localStorage.setItem('mks_light_effects',String(next));window.dispatchEvent(new Event('pks-interface-appearance'));}}>Lekkie efekty</button>
  <button data-future onClick={()=>setFuture(!future)}>Zmień kurs</button>
  <div data-test-glass className="connections-card" data-cosmic-panel style={{margin:12,padding:16,backdropFilter:'blur(18px)',background:'rgba(12,22,32,.35)',boxShadow:'0 0 20px #fff'}}><CosmicFilterEffects/>Panel<span className="animate-spin" data-test-spinner style={{display:'inline-block'}}>◌</span></div>
  <BusDetailsPanel selectedBus={bus} busDrag={drag} busHeaderRef={header} isBusPanelExpanded={expanded} setIsBusPanelExpanded={setExpanded}
   transparentUI isDark mapDetailPanel="map-detail-shell" mapDetailContent="map-detail-body" mapDetailCard="map-detail-row" mapDetailDivider="border-white/10" mapDetailLine="bg-white/10"
   selectedBusHeaderStyle={{backgroundColor:'#365e2d'}} selectedVehicleIsTrain={false} selectedBusStatusLabel="Przerwa" selectedBusGpsSignalClock="20:34" breakCountdownLabel={null} selectedBusIsWaitingForDeparture
   selectedBusTripFinished={vehicleTripFinished(bus,Date.now())} selectedBusScheduleLoading={!future} selectedBusDisplayedStops={bus.schedule} selectedStopId={null} selectedVehicleColor="#00a3a2" textSub="map-detail-muted" textMain="text-white" themeColor="#00a3a2" openVehicleRouteStop={()=>{}} formatScheduleStopName={name=>name}/>
 </div>;
}
createRoot(document.getElementById('root')!).render(<UIMotionProvider><Fixture/></UIMotionProvider>);
