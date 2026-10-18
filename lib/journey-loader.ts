import type {Stop,Departure} from '@/Panel/src/types';
import {loadStopDepartures} from './stop-departures';
import {runJourneySearch} from './journey-worker-client';
import {buildJourneyLegs,findJourneys,stopDistance,departureCourse,type JourneyOptions} from './journey-planner';
import {fetchMpkTripStops} from './providers/mpk-vehicles';
import {fetchMarcelPublicCourseStopsClient} from './pks-client';
import {warsawDateIso,warsawTimeMs} from './transit-time';
/** Reuse timetable clients and their shared six-request limit; never poll from this tab. */
export async function searchConnections(from:Stop,to:Stop,catalog:Stop[],date:string,options:JourneyOptions,signal:AbortSignal,progress:(n:number,total:number)=>void){
 const check=()=>{if(signal.aborted)throw new DOMException('Anulowano','AbortError');};
 const offset=Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(warsawDateIso()+'T12:00:00Z'))/86400_000);
 const fromLines=new Set(from.lines),toLines=new Set(to.lines);
 const candidates=catalog.filter(s=>s.type==='bus'&&s.id!==from.id&&s.id!==to.id).map(stop=>({stop,score:
  (stop.lines.some(l=>fromLines.has(l))&&stop.lines.some(l=>toLines.has(l))?1000:0)+
  (stopDistance(stop,from)<=options.walkMeters||stopDistance(stop,to)<=options.walkMeters?500:0)+Math.min(stop.lines.length,50)}))
  .sort((a,b)=>b.score-a.score).slice(0,options.maxTransfers?48:8).map(x=>x.stop);
 const points=[...new Map([from,to,...candidates].map(s=>[s.id,s])).values()];
 const boards:Array<{stop:Stop;departures:Departure[]}>=[],warnings=new Set<string>();let done=0,index=0;
 await Promise.all(Array.from({length:4},async()=>{
  while(index<points.length){check();const stop=points[index++];
   try{const scoped={...stop,sourceProviderIds:(stop.sourceProviderIds||['pks']).filter(p=>options.providers.includes(p==='mpk_rzeszow'?'mpk':p)),providerStopIds:{...stop.providerStopIds,mpk_rzeszow:options.providers.includes('mpk')?stop.providerStopIds?.mpk_rzeszow||'':''}};
   if(!scoped.sourceProviderIds.length&&!scoped.providerStopIds.mpk_rzeszow){progress(++done,points.length);continue;}
   const result=await loadStopDepartures(scoped,offset);check();boards.push({stop,departures:result.departures});result.warnings.forEach(w=>warnings.add(w));}
   catch(error){check();warnings.add('Część rozkładów jest niedostępna.');}
   progress(++done,points.length);
  }
 }));check();
 // Resolve complete trip timetables where the connected API exposes them.
 // This includes terminal stops that departure boards intentionally hide.
 const courses=[...new Map(boards.flatMap(b=>b.departures.filter(d=>options.providers.includes(d.carrier?.id||'')&&
  d.plannedAtMs!>=options.at-(options.arriveBy?6*3600_000:0)&&d.plannedAtMs!<=options.at+(options.arriveBy?0:6*3600_000))
  .map(d=>[departureCourse(d),d] as const))).entries()].filter(([key])=>key).sort((a,b)=>{const atOrigin=(key:string)=>boards.some(board=>board.stop.id===from.id&&board.departures.some(d=>departureCourse(d)===key));return Number(atOrigin(b[0]))-Number(atOrigin(a[0]))||Math.abs(a[1].plannedAtMs!-options.at)-Math.abs(b[1].plannedAtMs!-options.at);});
 let tripIndex=0;
 await Promise.all(Array.from({length:4},async()=>{
  while(tripIndex<Math.min(courses.length,100)){
   check();progress(done+tripIndex+1,points.length+Math.min(courses.length,100));const [key,row]=courses[tripIndex++],provider=row.carrier!.id,id=key.slice(provider.length+1);
   try{
    let points:Array<{id?:string;name?:string;lat?:number;lon?:number;time?:string}>=[];
    if(provider==='mpk')points=(await fetchMpkTripStops(id)).map(p=>({id:String(p.stop_id),lat:Number(p.lat??p.stop_lat),lon:Number(p.lon??p.stop_lon),time:p.departure_time||p.arrival_time}));
    else if(provider==='marcel')points=(await fetchMarcelPublicCourseStopsClient(id)).map(p=>({name:[p.nazMi,p.nazPr].filter(Boolean).join(' '),lat:p.szGps,lon:p.dlGps,time:p.godz}));
    else continue;
    check();let previous=0;
    for(const point of points){
     let time=warsawTimeMs(date,point.time);if(!Number.isFinite(time))continue;
     if(time<previous&&previous-time>12*3600_000)time+=86400_000;previous=time;
     const match=provider==='mpk'?catalog.find(s=>String(s.providerStopIds?.mpk_rzeszow||'').split(',').includes(point.id!)):
      catalog.filter(s=>s.sourceProviderIds?.includes('marcel')).find(s=>stopDistance(s,{lat:point.lat,lon:point.lon} as Stop)<60);
     if(!match)continue;
     boards.push({stop:match,departures:[{...row,id:`planner:${key}:${match.id}:${time}`,courseId:id,plannedAtMs:time,realAtMs:undefined}]});
    }
   }catch{check();warnings.add('Nie wszystkie pełne rozkłady kursów są dostępne.');}
  }
 }));check();
 return {journeys:await runJourneySearch(from,to,buildJourneyLegs(boards,options.providers),options,signal),warnings:[...warnings],limited:candidates.length<catalog.length-2};
}
