import type {Stop} from '@/Panel/src/types';
import {rzeszowTerminalPlatform} from './stop-label';
import {pksTerminalLines} from './pks-terminal-timetable';

// Physical passenger platforms from the bundled OSM survey (2026-10-08).
// 4 and 10 are also confirmed by GTFS stops 61 and 58. The stop-point
// endpoint omits these platforms; only 4 has a known legacy PKS stop ID.
const missingPlatforms=[
  {code:'4',id:'3720',lat:50.0423838,lon:22.0034691},
  {code:'7',id:'terminal:rzeszow-da:7',lat:50.0423516,lon:22.0026761},
  {code:'10',id:'terminal:rzeszow-da:10',lat:50.0421064,lon:22.0031106},
];
export function completeRzeszowTerminalPlatforms(stops:Stop[]):Stop[]{
  const terminal=stops.filter(s=>s.areaId==='1937'&&rzeszowTerminalPlatform(s.name,s.code)!==null);
  if(!terminal.length)return stops;
  const codes=new Set(terminal.map(s=>rzeszowTerminalPlatform(s.name,s.code)));
  const carrier=terminal.flatMap(s=>s.carriers).find(c=>c.id==='pks');
  const completed=[...stops,...missingPlatforms.filter(p=>!codes.has(p.code)).map<Stop>(p=>({
    ...p,name:'Rzeszów D.A. st. '+p.code,type:'bus' as const,areaId:'1937',
    carriers:carrier?[carrier]:[],lines:pksTerminalLines('1937',p.code)||[],isFavorite:false,sourceProviderIds:['pks'],
    ...(p.code==='7'?{timetableNotice:'Brak potwierdzonych odjazdów dla tego stanowiska w dostępnych danych.'}:{}),
    // Local identities are not invented provider stop-point IDs. Departures
    // use the real terminal area and exact platform code, including empty boards.
    providerStopIds:Object.fromEntries([['pksAreaIds','1937'],['pksCodes',p.code],...(p.id==='3720'?[['pks',p.id]]:[])]),
    pksStopPoints:[{id:p.id,areaId:'1937',code:p.code}],
  }))];
  return completed.map(stop=>{
    const lines=pksTerminalLines(stop.areaId,stop.code);
    if(lines===null)return stop;
    return {...stop,lines,...(['4','10'].includes(String(stop.code))?{timetableNotice:undefined}:{})};
  });
}
