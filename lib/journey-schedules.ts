import type {Vehicle} from './transport/vehicle';
import {applyJourneyDelays,applyJourneyTripUpdates} from './journey-realtime';
import type {JourneyTripUpdate} from './journey-model';
import {prepareJourneyNetwork} from './journey-network';
import {loadJourneyFeed} from './journey-feed';
import type {Stop} from '@/Panel/src/types';
import type {JourneyOptions} from './journey-planner';
import {feedConnections,scanJourneys,type TimetableFeed,type Connection} from './journey-timetable';
import type {JourneySearchGraph} from './journey-footpath-network';
export type TimetableSearch={from:Stop;to:Stop;catalog:Stop[];date:string;options:JourneyOptions;extra?:Connection[];warnings?:string[];vehicles?:Vehicle[];tripUpdates?:JourneyTripUpdate[];observedAt?:number;feedData?:Record<string,TimetableFeed|null>;graph?:JourneySearchGraph;walkingRefinement?:boolean};
export async function prepareTimetableSearch(input:TimetableSearch,progress:(n:number,total:number)=>void=()=>{}):Promise<TimetableSearch>{
 if(input.feedData)return input;
 const providers=input.options.providers.filter(p=>p==='pks'||p==='mpk'),feedData:Record<string,TimetableFeed|null>={};let loaded=0;
 await Promise.all(providers.map(async provider=>{try{feedData[provider]=await loadJourneyFeed(provider);}catch(error){console.warn('Local journey asset failed',provider,error);feedData[provider]=null;}finally{progress(++loaded,providers.length);}}));
 return {...input,feedData};
}
async function compileTimetableConnections(input:TimetableSearch,progress:(n:number,total:number)=>void=()=>{}){
 const providers=input.options.providers.filter(p=>p==='pks'||p==='mpk'),warnings=[...(input.warnings||[])];
 const connections:Connection[]=[...(input.extra||[])];let loaded=0,failed=0;
 await Promise.all(providers.map(async provider=>{
  try{
   const feed=input.feedData?input.feedData[provider]:await loadJourneyFeed(provider);
   if(!feed)throw Error('Brak lokalnego rozkładu');
   warnings.push(...(feed.diagnostics||[]));
   const day=input.date.replaceAll('-','');
   if(day<feed.validFrom||day>feed.validUntil){warnings.push(`${provider==='mpk'?'MPK':'PKS'}: rozkład nie obejmuje wybranej daty. Wybierz wcześniejszy termin lub zaktualizuj dane aplikacji.`);failed++;return;}
   // Avoid passing a complete feed as function arguments: Android workers have
   // a smaller stack and the widened live-delay window can exceed its limit.
   for(const connection of feedConnections(feed,input.catalog,input.date,input.options,input.vehicles?.length?3*3600000:0))connections.push(connection);
  }catch(error){console.warn('Journey timetable failed',provider,error);failed++;warnings.push(`${provider==='mpk'?'MPK':'PKS'}: nie udało się wczytać pełnego rozkładu. Spróbuj ponownie.`);}
  finally{progress(++loaded,providers.length);}
 }));
 if(providers.length&&failed===providers.length&&!connections.length)throw Error(warnings.join(' '));
 const updates=[...(input.tripUpdates||[]),...(input.vehicles||[]).flatMap(v=>v.journeyUpdate?[v.journeyUpdate]:[])];
 const live=applyJourneyTripUpdates(applyJourneyDelays(connections,input.vehicles||[],input.observedAt),updates,input.observedAt);
 const network=prepareJourneyNetwork(live);if(network.rejected)warnings.push(`Pominięto nieprawidłowe odcinki rozkładu: ${network.rejected}.`);
 return {connections:live,warnings};
}

let compiled:{input:TimetableSearch;key:string;result:Awaited<ReturnType<typeof compileTimetableConnections>>}|undefined;
/** A pedestrian refinement reuses the exact timetable/real-time snapshot. */
export async function executeTimetableSearch(input:TimetableSearch,progress:(n:number,total:number)=>void=()=>{}){
 const key=JSON.stringify([input.date,input.options.at,input.options.arriveBy,input.options.day,input.options.providers,input.observedAt,input.warnings]);
 const previous=compiled?.input;
 let data=compiled&&compiled.key===key&&previous?.feedData===input.feedData&&previous?.catalog===input.catalog&&previous?.extra===input.extra&&previous?.vehicles===input.vehicles&&previous?.tripUpdates===input.tripUpdates?compiled.result:undefined;
 if(!data){data=await compileTimetableConnections(input,progress);compiled={input,key,result:data};}
 const total=input.options.providers.filter(p=>p==='pks'||p==='mpk').length;
 return {journeys:scanJourneys(input.from,input.to,data.connections,input.options,()=>progress(total,total),input.graph),warnings:[...data.warnings],limited:false};
}
