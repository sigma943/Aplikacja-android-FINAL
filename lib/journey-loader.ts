import {isJourneyCoordinate} from './journey-places';
import {resolveJourneyAccess} from './journey-access-walk';
import {journeyWalkingRoute} from './journey-walking';
import type {Stop} from '@/Panel/src/types';
import {runTimetableSearch} from './journey-worker-client';
import {journeyWindow,journeyWalkingBudget,stopDistance,type JourneyOptions} from './journey-planner';
import type {Connection} from './journey-timetable';
import {fetchMarcelCoursesClient,fetchMarcelPublicCourseStopsClient} from './pks-client';
import {fetchVehiclesClient} from './pks-client';
import type {TransportProviderId} from './transport/types';
import {warsawDateIso,warsawTimeMs} from './transit-time';
import {withRequestDeadline} from './request-deadline';
import {readBusCoordinates} from './bus-coordinates';
import {marcelCourseStopIndexKey} from '@/components/stops-panel/stop-domain';

async function marcelConnections(from:Stop,to:Stop,catalog:Stop[],date:string,o:JourneyOptions,signal:AbortSignal,result:Connection[],warnings:string[]){
 const ids=new Set<string>();
 const known=catalog.filter(s=>s.sourceProviderIds?.includes('marcel'));
 const nearby=known.filter(s=>o.maxTransfers>=2||o.maxTransfers<0||s.id===from.id||s.id===to.id||stopDistance(s,from)*1.35<=o.walkMeters||stopDistance(s,to)*1.35<=o.walkMeters)
  .sort((a,b)=>Math.min(stopDistance(a,from),stopDistance(a,to))-Math.min(stopDistance(b,from),stopDistance(b,to)));
 for(const s of [from,to,...nearby])for(const id of String(s.providerStopIds?.marcelRouteIds||'').split(',').filter(Boolean))ids.add(id);
 if(!ids.size)return;
 const {latest}=journeyWindow(o);
 let failed=false;
 const routeIds=[...ids],courses=new Map<string,Awaited<ReturnType<typeof fetchMarcelCoursesClient>>[number]>();
 let routeCursor=0;
 // Bound requests and isolate failures: one unavailable route must not erase others.
 await Promise.all(Array.from({length:4},async()=>{while(routeCursor<routeIds.length){
  signal.throwIfAborted();const id=routeIds[routeCursor++];
  try{for(const course of await fetchMarcelCoursesClient(id,date)){signal.throwIfAborted();const time=warsawTimeMs(date,course.godz||course.godzPr);if(!Number.isFinite(time)||time<=latest)courses.set(String(course.idKu),course);}}
  catch{signal.throwIfAborted();failed=true;}
 }}));
 const names=new Map<string,Stop[]>();
 for(const stop of known)for(const key of String(stop.providerStopIds?.marcelCityMatchKeys||'').split(',').filter(Boolean)){const list=names.get(key)||[];list.push(stop);names.set(key,list);}
 const matched=new Map<string,Stop|null>();
 const pointsFor=(courseId:string,raw:Awaited<ReturnType<typeof fetchMarcelPublicCourseStopsClient>>)=>{
  let previous=0;
  return raw.map((p,index)=>{
   let time=warsawTimeMs(date,p.godz);if(time<previous&&previous-time>12*3600_000)time+=86400_000;previous=time;
   const coordinate=readBusCoordinates(p.szGps,p.dlGps),identity=marcelCourseStopIndexKey(p),key=JSON.stringify([identity,coordinate]);
   if(!matched.has(key)){
    const named=names.get(identity)||[];
    const candidates=named.length===1?[]:known.map(stop=>({stop,d:stopDistance(stop,{lat:coordinate?.lat,lon:coordinate?.lon} as Stop)})).filter(x=>x.d<35).sort((a,b)=>a.d-b.d);
    matched.set(key,named.length===1?named[0]:candidates.length&&(!candidates[1]||candidates[1].d-candidates[0].d>5)?candidates[0].stop:null);
   }
   // An unmatched physical call has a stable course-independent identity, so
   // later Marcel courses can board there without merging nearby named poles.
   const stop=matched.get(key)||{id:coordinate?'journey:marcel:call:'+encodeURIComponent(key):'journey:marcel:'+courseId+':'+index,name:[p.nazMi,p.nazPr].filter(Boolean).join(' '),type:'bus' as const,lat:coordinate?.lat,lon:coordinate?.lon,carriers:[{id:'marcel',name:'Marcel',colorClass:''}],lines:['M'],isFavorite:false};
   return {stop,time};
  });
 };
 let cursor=0;const list=[...courses.values()];
 await Promise.all(Array.from({length:4},async()=>{while(cursor<list.length){
  signal.throwIfAborted();const course=list[cursor++];
  try{
   const raw=await fetchMarcelPublicCourseStopsClient(course.idKu);signal.throwIfAborted();const points=pointsFor(String(course.idKu),raw);
   for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(Number.isFinite(a.time)&&b.time>=a.time)result.push({from:a.stop,to:b.stop,departure:a.time,arrival:b.time,course:'marcel:'+course.idKu+':'+date,line:'M',provider:'marcel'});}
  }catch{signal.throwIfAborted();failed=true;}
 }}));
 if(failed)warnings.push(result.length?'Marcel: część kursów jest niedostępna. Pokazujemy połączenia z poprawnie wczytanych rozkładów.':'Marcel: rozkład internetowy jest teraz niedostępny. Wyniki obejmują pozostałych wybranych przewoźników.');
}
export type JourneySearchResult=Awaited<ReturnType<typeof runTimetableSearch>>;
export async function searchConnections(from:Stop,to:Stop,catalog:Stop[],date:string,preferences:JourneyOptions,signal:AbortSignal,progress:(n:number,total:number)=>void,onPartial?:(result:JourneySearchResult)=>void){
 const options={...preferences,walkMeters:journeyWalkingBudget(preferences.walkMeters)};
 const warnings:string[]=[];const extra:Connection[]=[];
 const coordinateJourney=isJourneyCoordinate(from)||isJourneyCoordinate(to);
 const walking=coordinateJourney&&stopDistance(from,to)<=options.walkMeters?journeyWalkingRoute(from,to).catch(()=>null):Promise.resolve(null);
 if(options.providers.includes('marcel')&&![from,to,...catalog].some(s=>String(s.providerStopIds?.marcelRouteIds||'').trim()))warnings.push('Marcel: lista przystanków jest niedostępna. Wyniki mogą nie obejmować tego przewoźnika. Sprawdź połączenie z internetem.');
 // Start online enrichment independently of the local search. Each task handles
 // errors immediately, so cancellation never leaves an unhandled rejection.
 const marcelLoading=(async()=>{
  if(!options.providers.includes('marcel'))return;
  try{await withRequestDeadline(deadlineSignal=>marcelConnections(from,to,catalog,date,options,deadlineSignal,extra,warnings),signal,25000);}
  catch{if(!signal.aborted)warnings.push(extra.length?'Marcel: wczytywanie części kursów przekroczyło limit czasu. Wyniki obejmują poprawnie wczytane kursy.':'Marcel: rozkład internetowy jest teraz niedostępny. Wyniki obejmują pozostałych wybranych przewoźników.');}
 })();
 let vehicles:Awaited<ReturnType<typeof fetchVehiclesClient>>=[];
 const realtimeLoading=(async()=>{
  if(date!==warsawDateIso())return;
  try{vehicles=await withRequestDeadline(liveSignal=>fetchVehiclesClient(false,options.providers.map(p=>p==='mpk'?'mpk_rzeszow':p) as TransportProviderId[],{signal:liveSignal}),signal,4500);}
  catch{if(!signal.aborted)warnings.push('Dane o opóźnieniach są niedostępne. Pokazujemy godziny rozkładowe.');}
 })();
 const finish=async(result:JourneySearchResult)=>{
 if(isJourneyCoordinate(from)){const access=await resolveJourneyAccess(result.journeys,options,signal);result.journeys=access.journeys;if(access.failed)result.warnings.push('Nie udało się wyznaczyć dojścia od Twojej lokalizacji. Otwórz mapę podróży, aby ponowić wczytywanie.');}
 const estimatedWalking=result.journeys.some(j=>j.legs.every(l=>l.walking!==undefined));
 const foot=await (coordinateJourney?walking:estimatedWalking?journeyWalkingRoute(from,to).catch(()=>null):Promise.resolve(null));signal.throwIfAborted();
 if(foot){result.journeys=result.journeys.filter(j=>!j.legs.every(l=>l.walking!==undefined));}
 if(foot&&foot.meters<=options.walkMeters){
  const duration=foot.minutes*60000,departure=options.arriveBy?options.at-duration:options.at;
  result.journeys.push({id:'walk-only',departure,arrival:departure+duration,walking:foot.meters,transfers:0,legs:[{from,to,departure,arrival:departure+duration,line:'Pieszo',provider:'walk',course:'walk',walking:foot.meters,path:foot.points}]});
 }else if(coordinateJourney&&stopDistance(from,to)<=options.walkMeters&&!foot)result.warnings.push('Nie udało się wczytać trasy w całości pieszo. Połączenia autobusowe nadal uwzględniają szacowane dojście do przystanków.');
 if(estimatedWalking||coordinateJourney){const score=(j:typeof result.journeys[number])=>options.sort==='walking'?j.walking*86400000+(options.arriveBy?-j.departure:j.arrival):options.sort==='transfers'?j.transfers*86400000+(options.arriveBy?-j.departure:j.arrival):options.arriveBy?-j.departure:j.arrival;result.journeys.sort((a,b)=>score(a)-score(b));}
 return result;
 };

 let preliminary:JourneySearchResult|undefined;
 if(onPartial&&options.providers.some(p=>p==='pks'||p==='mpk')){
  try{
   preliminary=await finish(await runTimetableSearch({from,to,catalog,date,options,extra:[],warnings:[],vehicles:[],observedAt:Date.now()},signal,progress));
   signal.throwIfAborted();if(preliminary.journeys.length)onPartial(preliminary);
  }catch{signal.throwIfAborted();}
 }
 await Promise.all([marcelLoading,realtimeLoading]);signal.throwIfAborted();
 // No need to repeat an expensive scan when the online sources added no data.
 if(preliminary&&!extra.length&&!vehicles.length)return {...preliminary,warnings:[...preliminary.warnings,...warnings]};
 return finish(await runTimetableSearch({from,to,catalog,date,options,extra,warnings,vehicles,observedAt:Date.now()},signal,progress));
}
