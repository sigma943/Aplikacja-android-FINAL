import {LOCATION_ID} from './journey-places';
import {journeyWalkingRoute} from './journey-walking';
import type {Stop} from '@/Panel/src/types';
import {runTimetableSearch} from './journey-worker-client';
import {stopDistance,type JourneyOptions} from './journey-planner';
import type {Connection} from './journey-timetable';
import {fetchMarcelCoursesClient,fetchMarcelPublicCourseStopsClient} from './pks-client';
import {warsawTimeMs} from './transit-time';
import {withRequestDeadline} from './request-deadline';
import {readBusCoordinates} from './bus-coordinates';
import {marcelCourseStopIndexKey} from '@/components/stops-panel/stop-domain';

async function marcelConnections(from:Stop,to:Stop,catalog:Stop[],date:string,o:JourneyOptions,signal:AbortSignal){
 const ids=new Set<string>();
 const known=catalog.filter(s=>s.sourceProviderIds?.includes('marcel'));
 const nearby=known.filter(s=>o.maxTransfers===2||s.id===from.id||s.id===to.id||stopDistance(s,from)*1.35<=o.walkMeters||stopDistance(s,to)*1.35<=o.walkMeters);
 for(const s of [from,to,...nearby])for(const id of String(s.providerStopIds?.marcelRouteIds||'').split(',').filter(Boolean))ids.add(id);
 const result:Connection[]=[];if(!ids.size)return result;
 const earliest=o.at-(o.arriveBy?6*3600_000:0),latest=o.at+(o.arriveBy?0:6*3600_000);
 const courses=[...new Map((await Promise.all([...ids].map(id=>fetchMarcelCoursesClient(id,date)))).flat().map(c=>[c.idKu,c])).values()]
  .filter(c=>{const time=warsawTimeMs(date,c.godz||c.godzPr);return !Number.isFinite(time)||(time>=earliest-3*3600_000&&time<=latest);});
 let cursor=0;
 await Promise.all(Array.from({length:4},async()=>{while(cursor<courses.length){signal.throwIfAborted();const course=courses[cursor++],raw=await fetchMarcelPublicCourseStopsClient(course.idKu);let previous=0;
  const points=raw.map((p,index)=>{let time=warsawTimeMs(date,p.godz);if(time<previous&&previous-time>12*3600_000)time+=86400_000;previous=time;
   const coordinate=readBusCoordinates(p.szGps,p.dlGps),identity=marcelCourseStopIndexKey(p);
   const named=known.filter(s=>String(s.providerStopIds?.marcelCityMatchKeys||'').split(',').includes(identity));
   const candidates=known.map(s=>({stop:s,d:stopDistance(s,{lat:coordinate?.lat,lon:coordinate?.lon} as Stop)})).filter(x=>x.d<35).sort((a,b)=>a.d-b.d);
   const stop=named.length===1?named[0]:candidates.length&&(!candidates[1]||candidates[1].d-candidates[0].d>5)?candidates[0].stop:{id:'journey:marcel:'+course.idKu+':'+index,name:[p.nazMi,p.nazPr].filter(Boolean).join(' '),type:'bus' as const,lat:coordinate?.lat,lon:coordinate?.lon,carriers:[{id:'marcel',name:'Marcel',colorClass:''}],lines:['M'],isFavorite:false};return {stop,time};});
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(Number.isFinite(a.time)&&b.time>=a.time)result.push({from:a.stop,to:b.stop,departure:a.time,arrival:b.time,course:'marcel:'+course.idKu+':'+date,line:'M',provider:'marcel'});}
 }}));return result;
}
export async function searchConnections(from:Stop,to:Stop,catalog:Stop[],date:string,options:JourneyOptions,signal:AbortSignal,progress:(n:number,total:number)=>void){
 const warnings:string[]=[];let extra:Connection[]=[];
 if(options.providers.includes('marcel')&&![from,to,...catalog].some(s=>String(s.providerStopIds?.marcelRouteIds||'').trim()))warnings.push('Marcel: lista przystanków jest niedostępna. Wyniki mogą nie obejmować tego przewoźnika. Sprawdź połączenie z internetem.');
 if(options.providers.includes('marcel')){
  try{extra=await withRequestDeadline(()=>marcelConnections(from,to,catalog,date,options,signal),signal,12000);}
  catch{signal.throwIfAborted();warnings.push('Marcel: rozkład internetowy jest teraz niedostępny. Wyniki obejmują pozostałych wybranych przewoźników.');}
 }
 const walking=from.id===LOCATION_ID?journeyWalkingRoute(from,to).catch(()=>null):Promise.resolve(null);
 const result=await runTimetableSearch({from,to,catalog,date,options,extra,warnings},signal,progress);
 const estimatedWalking=result.journeys.some(j=>j.legs.every(l=>l.walking!==undefined));
 const foot=await (from.id===LOCATION_ID?walking:estimatedWalking?journeyWalkingRoute(from,to).catch(()=>null):Promise.resolve(null));signal.throwIfAborted();
 if(foot){result.journeys=result.journeys.filter(j=>!j.legs.every(l=>l.walking!==undefined));}
 if(foot&&foot.meters<=(from.id===LOCATION_ID?30000:options.walkMeters)){
  const duration=foot.minutes*60000,departure=options.arriveBy?options.at-duration:options.at;
  if(foot.meters<=350&&options.sort!=='walking')result.journeys=result.journeys.filter(j=>options.arriveBy?departure-j.departure<5*60000:j.arrival-(departure+duration)<5*60000);
  result.journeys.push({id:'walk-only',departure,arrival:departure+duration,walking:foot.meters,transfers:0,legs:[{from,to,departure,arrival:departure+duration,line:'Pieszo',provider:'walk',course:'walk',walking:foot.meters,path:foot.points}]});
 }else if(from.id===LOCATION_ID&&!foot)result.warnings.push('Nie udało się wczytać trasy w całości pieszo. Połączenia autobusowe nadal uwzględniają szacowane dojście do przystanków.');
 if(estimatedWalking||from.id===LOCATION_ID){const score=(j:typeof result.journeys[number])=>options.sort==='walking'?j.walking*86400000+(options.arriveBy?-j.departure:j.arrival):options.sort==='transfers'?j.transfers*86400000+(options.arriveBy?-j.departure:j.arrival):options.arriveBy?-j.departure:j.arrival;result.journeys.sort((a,b)=>score(a)-score(b));}
 return result;
}
