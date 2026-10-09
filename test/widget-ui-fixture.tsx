'use client';
import {useState} from 'react';
import GenerateStopWidget from '@/components/widgets/GenerateStopWidget';
import type {Stop,Departure} from '@/Panel/src/types';
export default function WidgetFixture(){
  const [open,setOpen]=useState(true);
  const carrier={id:'pks',name:'PKS Rzeszów',colorClass:'text-teal-400'};
  const stop:Stop={id:'2083',name:'Boguchwała, Stadion Motor 99',type:'bus',isFavorite:false,lines:['108','251','3'],carriers:[carrier]};
  const rows:Departure[]=['251','108','3'].map((line,index)=>({id:line,line,direction:index===2?'Krakowska':'Rzeszów D.A.',time:['14:21','14:25','14:30'][index],status:index===1?'delayed':'on_time',delayMins:index===1?1:0,carrier:index===2?{...carrier,id:'mpk'}:carrier,plannedAtMs:Date.now()+(index+1)*600000}));
  return <div className="pks-theme-root" data-ui-theme="dark"><button onClick={()=>setOpen(true)}>Otwórz tworzenie widżetu</button>{open&&<GenerateStopWidget stop={stop} lines={stop.lines} departures={rows} vehicles={[]} dark onClose={()=>setOpen(false)}/>}</div>;
}
