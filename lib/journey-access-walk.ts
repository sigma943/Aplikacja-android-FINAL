import {journeyWalkingRoute} from './journey-walking';
import {isJourneyCoordinate} from './journey-places';
import type {Journey,JourneyOptions} from './journey-planner';
/** Resolve access from a coordinate origin before presenting the first results. */
export async function resolveJourneyAccess(journeys:Journey[],options:JourneyOptions,signal:AbortSignal){
 let cursor=0,failed=false;
 const result:Array<Journey|null>=[...journeys];
 await Promise.all(Array.from({length:3},async()=>{
  while(cursor<result.length){
   const index=cursor++,journey=result[index];if(!journey)continue;const first=journey.legs[0];
   if(!first||first.walking===undefined||!isJourneyCoordinate(first.from)||journey.legs.every(l=>l.walking!==undefined))continue;
   try{
    signal.throwIfAborted();
    const rideIndex=journey.legs.findIndex(l=>l.walking===undefined),ride=journey.legs[rideIndex];
    const route=await journeyWalkingRoute(first.from,ride.from);signal.throwIfAborted();
    const oldWalking=journey.legs.slice(0,rideIndex).reduce((sum,l)=>sum+(l.walking||0),0),departure=ride.departure-route.minutes*60000;
    const walking=journey.walking-oldWalking+route.meters;
    if(route.meters>options.walkMeters||(!options.arriveBy&&departure<options.at)){result[index]=null;continue;}
    result[index]={...journey,departure,walking,legs:[{...first,to:ride.from,departure,arrival:ride.departure,walking:route.meters,path:route.points,walkingQuality:'verified',walkingCheckedAt:Date.now()},...journey.legs.slice(rideIndex)]};
   }catch{signal.throwIfAborted();failed=true;}
  }
 }));
 return {journeys:result.filter((j):j is Journey=>j!==null),failed};
}
