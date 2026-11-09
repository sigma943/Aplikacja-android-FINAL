import type {Journey} from './journey-planner';

/** Live times and refined walking access must not close an unchanged ride. */
export function stableJourneyResults(journeys:Journey[],previous:Journey[]=[]):Journey[]{
 const identity=(j:Journey)=>JSON.stringify(j.legs.map(l=>[l.provider,l.course,l.from.id,l.to.id]));
 const rides=(j:Journey)=>{
  const legs=j.legs.filter(l=>l.walking===undefined);
  return legs.length?JSON.stringify(legs.map(l=>[l.provider,l.course,l.from.id,l.to.id])):null;
 };
 const oldRides=new Map<string,Journey[]>(),newCounts=new Map<string,number>();
 for(const j of previous){const key=rides(j);if(key)oldRides.set(key,[...(oldRides.get(key)||[]),j]);}
 for(const j of journeys){const key=rides(j);if(key)newCounts.set(key,(newCounts.get(key)||0)+1);}
 const strictIds=journeys.map(identity);
 return journeys.map((j,index)=>{
  const key=rides(j),matches=key?oldRides.get(key):undefined;
  const oldId=key&&newCounts.get(key)===1&&matches?.length===1?matches[0].id:null;
  // Ambiguous alternatives keep their complete identity; never merge two cards.
  const id=oldId&&!strictIds.some((other,i)=>i!==index&&other===oldId)?oldId:strictIds[index];
  return {...j,id};
 });
}
export function journeyMapKey(journey:Journey):string {
 return JSON.stringify(journey.legs.map(l=>[l.course,l.routePattern,l.from.id,l.from.lat,l.from.lon,l.to.id,l.to.lat,l.to.lon,l.walking,l.path,l.stops?.map(c=>[c.stop.id,c.stop.lat,c.stop.lon,c.routePoint])]));
}
