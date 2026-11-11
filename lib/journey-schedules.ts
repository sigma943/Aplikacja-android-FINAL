import type {Vehicle} from './transport/vehicle';
import {applyJourneyDelays} from './journey-realtime';
import {loadJourneyFeed} from './journey-feed';
import type {Stop} from '@/Panel/src/types';
import type {JourneyOptions} from './journey-planner';
import {feedConnections,scanJourneys,type TimetableFeed,type Connection} from './journey-timetable';
export type TimetableSearch={from:Stop;to:Stop;catalog:Stop[];date:string;options:JourneyOptions;extra?:Connection[];warnings?:string[];vehicles?:Vehicle[];observedAt?:number;feedData?:Record<string,TimetableFeed|null>};
export async function prepareTimetableSearch(input:TimetableSearch,progress:(n:number,total:number)=>void=()=>{}):Promise<TimetableSearch>{
 if(input.feedData)return input;
 const providers=input.options.providers.filter(p=>p==='pks'||p==='mpk'),feedData:Record<string,TimetableFeed|null>={};let loaded=0;
 await Promise.all(providers.map(async provider=>{try{feedData[provider]=await loadJourneyFeed(provider);}catch(error){console.warn('Local journey asset failed',provider,error);feedData[provider]=null;}finally{progress(++loaded,providers.length);}}));
 return {...input,feedData};
}
export async function executeTimetableSearch(input:TimetableSearch,progress:(n:number,total:number)=>void=()=>{}){
 const providers=input.options.providers.filter(p=>p==='pks'||p==='mpk'),warnings=[...(input.warnings||[])];
 const connections:Connection[]=[...(input.extra||[])];let loaded=0,failed=0;
 await Promise.all(providers.map(async provider=>{
  try{
   const feed=input.feedData?input.feedData[provider]:await loadJourneyFeed(provider);
   if(!feed)throw Error('Brak lokalnego rozkładu');
   const day=input.date.replaceAll('-','');
   if(day<feed.validFrom||day>feed.validUntil){warnings.push(`${provider==='mpk'?'MPK':'PKS'}: rozkład nie obejmuje wybranej daty. Wybierz wcześniejszy termin lub zaktualizuj dane aplikacji.`);failed++;return;}
   // Avoid passing a complete feed as function arguments: Android workers have
   // a smaller stack and the widened live-delay window can exceed its limit.
   for(const connection of feedConnections(feed,input.catalog,input.date,input.options,input.vehicles?.length?3*3600000:0))connections.push(connection);
  }catch(error){console.warn('Journey timetable failed',provider,error);failed++;warnings.push(`${provider==='mpk'?'MPK':'PKS'}: nie udało się wczytać pełnego rozkładu. Spróbuj ponownie.`);}
  finally{progress(++loaded,providers.length);}
 }));
 if(providers.length&&failed===providers.length&&!connections.length)throw Error(warnings.join(' '));
 return {journeys:scanJourneys(input.from,input.to,applyJourneyDelays(connections,input.vehicles||[],input.observedAt),input.options),warnings,limited:false};
}
