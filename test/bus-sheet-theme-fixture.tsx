import {useRef,useState} from 'react';
import BusDetailsPanel from '../components/BusDetailsPanel';
import {useSheetGesture} from '../lib/use-sheet-gesture';
import {vehicleHeaderStyle} from '../lib/interface-appearance';
import type {Vehicle} from '../lib/transport/vehicle';
export default function BusSheetThemeFixture({dark,provider='pks'}:{dark:boolean;provider?:string}){
 const [expanded,setExpanded]=useState(false),header=useRef<HTMLDivElement>(null);
 const drag=useSheetGesture(expanded,setExpanded,260,480);
 const color=provider==='mpk_rzeszow'?'#ff7a00':provider==='marcel'?'#8bbd38':'#14b8a6';
 const sample:Vehicle={id:'regression',provider,name:'108',routeShortName:'108',vehicleNumber:'117',lat:50,lon:22,direction:'Rzeszów D.A.',speed:32,model:'Scania Higer Fencer f6 CNG',status:'active'};
 return <><div style={{position:'absolute',inset:0,background:'repeating-conic-gradient(#202c37 0% 25%,#829589 0% 50%) 0 0/90px 90px'}} data-test-map/><div style={{position:'absolute',inset:0,background:'linear-gradient(60deg,transparent 48%,#14b8a6 49%,#14b8a6 51%,transparent 52%)'}}/>
 <BusDetailsPanel selectedBus={sample} busDrag={drag} busHeaderRef={header} isBusPanelExpanded={expanded} setIsBusPanelExpanded={setExpanded} transparentUI isDark={dark} mapDetailPanel="map-detail-shell" mapDetailContent="map-detail-body" mapDetailCard="map-detail-row" mapDetailDivider="border-current/10" mapDetailLine="bg-current/10" selectedBusHeaderStyle={vehicleHeaderStyle(color,true,dark)} selectedVehicleIsTrain={false} selectedBusStatusLabel="W trasie" selectedBusGpsSignalClock="18:13" breakCountdownLabel={null} selectedBusIsWaitingForDeparture={false} selectedBusScheduleLoading={false} selectedBusDisplayedStops={[{id:1,name:'Przystanek testowy',planned:'18:30',real:null}]} selectedStopId={null} selectedVehicleColor={color} textSub="map-detail-muted" textMain={dark?'text-white':'text-slate-900'} themeColor="#14b8a6" openVehicleRouteStop={()=>{}} formatScheduleStopName={name=>name}/><nav data-test-navigation style={{position:'absolute',bottom:0,left:0,right:0,height:80,background:dark?'#142235':'#edf4f8',color:dark?'#fff':'#142235'}}>Mapa · Przystanki · Połączenia · Admin · Opcje</nav></>;
}
