import type {Stop} from '@/Panel/src/types';
import type {Journey,JourneyLeg} from './journey-planner';

export function legStops(leg:JourneyLeg):Stop[]{return leg.stops?.length?leg.stops:[leg.from,leg.to];}
/** Remove only adjacent interchange duplicates: a later return is a real stop. */
export function journeyStops(journey:Journey):Stop[]{
 const result:Stop[]=[];
 for(const leg of journey.legs)for(const stop of legStops(leg)){
  const previous=result.at(-1);
  if(previous?.id===stop.id&&previous.lat===stop.lat&&previous.lon===stop.lon)continue;
  result.push(stop);
 }
 return result;
}
export function intermediateStopLabel(count:number){
 return '+'+count+' '+(count===1?'przystanek':count%10>=2&&count%10<=4&&(count%100<12||count%100>14)?'przystanki':'przystanków');
}
