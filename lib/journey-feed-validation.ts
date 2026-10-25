import type {TimetableFeed} from './journey-timetable';
import {validRoadPoint} from './bus-road-geometry';

/** Normalize at the adapter boundary, before the search. Corrupt courses never
 * become guessed edges between remaining calls. Valid records remain usable. */
export function normalizeJourneyFeed(value:unknown,provider:string):TimetableFeed{
 const feed=value as TimetableFeed;
 if(!feed||feed.version!==1||feed.provider!==provider||!/^\d{8}$/.test(feed.validFrom)||!/^\d{8}$/.test(feed.validUntil)||feed.validFrom>feed.validUntil||!feed.stops||!feed.calendars||!feed.exceptions||!Array.isArray(feed.patterns)||!Array.isArray(feed.trips))throw Error('Nieprawidłowy plik rozkładu.');
 const stops:TimetableFeed['stops']={};let rejected=0;
 for(const [id,stop] of Object.entries(feed.stops)){
  if(id&&stop&&typeof stop.name==='string'&&validRoadPoint([stop.lat,stop.lon]))stops[id]=stop;else rejected++;
 }
 const patterns=feed.patterns.map(pattern=>{
  if(!Array.isArray(pattern)||pattern.length<2){rejected++;return [];}
  let previous=-Infinity;
  for(const call of pattern){
   if(!Array.isArray(call)||call.length<5||!stops[call[0]]||!Number.isFinite(call[1])||!Number.isFinite(call[2])||call[1]<previous||call[2]<call[1]||![0,1,2,3].includes(call[3])||![0,1,2,3].includes(call[4])){rejected++;return [];}
   previous=call[2];
  }
  return pattern;
 });
 const trips:TimetableFeed['trips']=[],identities=new Map<string,string>(),conflicts=new Set<string>();
 for(const trip of feed.trips){
  if(!Array.isArray(trip)||trip.length<5||!trip[0]||!trip[1]||!trip[2]||!Number.isFinite(trip[3])||trip[3]<0||!Number.isInteger(trip[4])||!patterns[trip[4]]?.length){rejected++;continue;}
  const key=String(trip[0]),signature=JSON.stringify(trip),old=identities.get(key);
  if(old){if(old!==signature){conflicts.add(key);rejected++;}continue;}
  identities.set(key,signature);trips.push(trip);
 }
 const usable=trips.filter(trip=>!conflicts.has(String(trip[0])));
 if(!usable.length)throw Error('Brak poprawnych kursów w rozkładzie.');
 return {...feed,stops,patterns,trips:usable,diagnostics:rejected?[`Pominięto nieprawidłowe lub niejednoznaczne rekordy rozkładu ${provider}: ${rejected}.`]:[]};
}
