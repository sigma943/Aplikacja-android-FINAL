import {gunzipSync,strFromU8} from 'fflate';
import type {TimetableAssets} from './journey-assets';
import type {Stop} from '@/Panel/src/types';
import type {JourneyOptions} from './journey-planner';
import {feedConnections,scanJourneys,type TimetableFeed,type Connection} from './journey-timetable';
export type TimetableSearch={from:Stop;to:Stop;catalog:Stop[];date:string;options:JourneyOptions;extra?:Connection[];warnings?:string[];assets:TimetableAssets};
const feeds=new Map<string,Promise<TimetableFeed>>();
export async function executeTimetableSearch(input:TimetableSearch,progress:(n:number,total:number)=>void=()=>{}){
 const providers=input.options.providers.filter(p=>p==='pks'||p==='mpk'),warnings=[...(input.warnings||[])];
 const connections:Connection[]=[...(input.extra||[])];let loaded=0,failed=0;
 await Promise.all(providers.map(async provider=>{
  try{
   if(!feeds.has(provider))feeds.set(provider,(async()=>{
    const bytes=input.assets[provider];
    if(!bytes?.length)throw Error('Brak rozkładu');
    const feed=JSON.parse(strFromU8(bytes[0]===31&&bytes[1]===139?gunzipSync(bytes):bytes)) as TimetableFeed;
    if(feed.version!==1||feed.provider!==provider||!feed.trips?.length)throw Error('Nieprawidłowy rozkład');return feed;
   })().catch(error=>{feeds.delete(provider);throw error;}));
   const feed=await feeds.get(provider)!,day=input.date.replaceAll('-','');
   if(day<feed.validFrom||day>feed.validUntil){warnings.push(`${provider==='mpk'?'MPK':'PKS'}: rozkład nie obejmuje wybranej daty. Wybierz wcześniejszy termin lub zaktualizuj dane aplikacji.`);failed++;return;}
   // Mobile WebViews have a smaller argument stack: a full feed contains tens
   // of thousands of segments. Never spread it into a function call.
   for(const connection of feedConnections(feed,input.catalog,input.date,input.options))connections.push(connection);
  }catch{failed++;warnings.push(`${provider==='mpk'?'MPK':'PKS'}: nie udało się wczytać pełnego rozkładu. Spróbuj ponownie.`);}
  finally{progress(++loaded,providers.length);}
 }));
 if(providers.length&&failed===providers.length&&!connections.length)throw Error(warnings.join(' '));
 return {journeys:scanJourneys(input.from,input.to,connections,input.options),warnings,limited:false};
}
