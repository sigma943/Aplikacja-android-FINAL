import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import BusDetailsPanel from '../components/BusDetailsPanel';
import {useSheetGesture} from '../lib/use-sheet-gesture';
import {applyInterfaceAppearance,DEFAULT_INTERFACE_APPEARANCE,vehicleHeaderStyle} from '../lib/interface-appearance';
import {landscapePalette} from '../lib/landscape-palette';
const q=new URLSearchParams(location.search),theme=q.get('theme')||'dark-mountains',night=q.has('night'),provider=q.get('provider')||'pks';
const dark=theme==='dark-mountains'?night:theme.startsWith('dark'),root=document.documentElement;
function palette(accent:string){
 const appearance={...DEFAULT_INTERFACE_APPEARANCE,surfaceTint:'accent' as const,panelTintStrength:100};
 applyInterfaceAppearance(root,appearance,dark,accent,false,theme);
 if(theme==='dark-mountains'){
  root.dataset.landscapeTheme='on';root.dataset.landscapePeriod=night?'night':'day';
  for(const [k,v] of Object.entries(landscapePalette({sun:{altitude:night?-.5:.5}} as any,64,!night,appearance,accent)))root.style.setProperty(k,v);
 }
}
function App(){
 const [accent,setAccent]=useState('#3b82f6'),[expanded,setExpanded]=useState(true),header=useRef<HTMLDivElement>(null),drag=useSheetGesture(expanded,setExpanded,260,620);
 palette(accent);(window as any).__busAccent=setAccent;
 const color=provider==='mpk_rzeszow'?'#ff7a00':provider==='marcel'?'#8bbd38':provider==='pkp_intercity'?'#3b82f6':'#14b8a6';
 const sample:any={id:'colour-check',provider,name:'108',routeShortName:'108',vehicleNumber:'117',lat:50,lon:22,direction:'Rzeszów D.A.',speed:32,delay:180,model:'Scania Higer Fencer f6 CNG',status:'active'};
 return <div className="pks-theme-root" data-ui-theme={theme} style={{position:'fixed',inset:0}}>
  <div data-test-map style={{position:'absolute',inset:0,background:'#e2e8f0'}}/>
  <div className="pks-map-search-panel" data-test-search style={{height:60}}>PKS Live</div>
  <div className="map-detail-shell" data-map-detail-kind="stop" data-test-stop style={{position:'absolute',left:-1000,width:100,height:100}}>Przystanek</div>
  <BusDetailsPanel selectedBus={sample} busDrag={drag} busHeaderRef={header} isBusPanelExpanded={expanded} setIsBusPanelExpanded={setExpanded} transparentUI isDark={dark} mapDetailPanel="map-detail-shell" mapDetailContent="map-detail-body" mapDetailCard="map-detail-row" mapDetailDivider="border-current/10" mapDetailLine="bg-current/10" selectedBusHeaderStyle={vehicleHeaderStyle(color,true,dark)} selectedVehicleIsTrain={provider==='pkp_intercity'} selectedBusStatusLabel="W trasie" selectedBusGpsSignalClock="14:14" breakCountdownLabel={null} selectedBusIsWaitingForDeparture={false} selectedBusScheduleLoading={q.has('loading')} selectedBusDisplayedStops={[{id:1,name:'Przystanek testowy',planned:'14:30',real:null}]} selectedStopId={null} selectedVehicleColor={color} textSub="map-detail-muted" textMain={dark?'text-white':'text-slate-900'} themeColor={accent} openVehicleRouteStop={()=>{}} formatScheduleStopName={name=>name}/>
  <nav className="pks-navigation" data-test-navigation style={{position:'absolute',bottom:0,height:64,width:'100%'}}>Mapa · Przystanki · Połączenia · Admin · Opcje</nav>
 </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
