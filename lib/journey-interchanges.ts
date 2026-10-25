import {type Journey,type JourneyLeg,type JourneyOptions} from './journey-planner';
import {journeyWalkMetric,type JourneySearchGraph} from './journey-footpath-network';

/** Keep the same actual courses and arrival, but avoid riding past a usable
 * interchange and back on the next bus. All candidates are recorded calls. */
export function tightenJourneyInterchanges(journey:Journey,options:JourneyOptions,graph?:JourneySearchGraph):Journey {
 let legs=journey.legs,changed=false,walking=journey.walking;
 for(let a=0;a<legs.length;a++){
  const incoming=legs[a];if(incoming.walking!==undefined||!incoming.stops)continue;
  let b=a+1;while(b<legs.length&&legs[b].walking!==undefined)b++;
  const outgoing=legs[b];if(!outgoing?.stops||incoming.course===outgoing.course)continue;
  const before=incoming.stops,after=outgoing.stops;
  const oldWalk=legs.slice(a+1,b).reduce((sum,leg)=>sum+(leg.walking||0),0);
  const oldMoving=incoming.arrival-incoming.departure+outgoing.arrival-outgoing.departure+
   legs.slice(a+1,b).reduce((sum,leg)=>sum+leg.arrival-leg.departure,0);
  let best:{i:number;j:number;meters:number;minutes:number;saving:number}|undefined;
  // Retain nonempty rides. The scan separately handles direct journeys that
  // make the first or last ride unnecessary.
  for(let i=1;i<before.length-1;i++){
   const arrival=before[i];if(arrival.dropoff===false||!Number.isFinite(arrival.arrival)||arrival.arrival<incoming.departure)continue;
   for(let j=1;j<after.length-1;j++){
    const departure=after[j];if(departure.pickup===false||!Number.isFinite(departure.departure)||departure.departure>outgoing.arrival)continue;
    const same=arrival.stop.id===departure.stop.id;
    if(!same&&options.walkMeters<=0)continue;
    const metric=journeyWalkMetric(arrival.stop,departure.stop,options.walkMeters,graph);if(!metric)continue;
    const meters=metric.meters;
    if(meters>options.walkMeters||(options.sort==='walking'&&meters>oldWalk))continue;
    const minutes=metric.minutes;
    if(arrival.arrival+(minutes+options.transferMinutes)*60000>departure.departure)continue;
    const moving=arrival.arrival-incoming.departure+outgoing.arrival-departure.departure+minutes*60000;
    const saving=oldMoving-moving;
    if(saving<60000)continue;
    if(!best||saving>best.saving||(saving===best.saving&&meters<best.meters))best={i,j,meters,minutes,saving};
   }
  }
  if(!best)continue;
  const arrival=before[best.i],departure=after[best.j];
  const first:JourneyLeg={...incoming,to:arrival.stop,arrival:arrival.arrival,scheduledArrival:arrival.scheduledArrival,stops:before.slice(0,best.i+1),path:undefined};
  const last:JourneyLeg={...outgoing,from:departure.stop,departure:departure.departure,scheduledDeparture:departure.scheduledDeparture,stops:after.slice(best.j),path:undefined};
  const metric=journeyWalkMetric(arrival.stop,departure.stop,options.walkMeters,graph)!;
  const foot:JourneyLeg[] = arrival.stop.id===departure.stop.id?[]:[{from:arrival.stop,to:departure.stop,departure:arrival.arrival,arrival:arrival.arrival+best.minutes*60000,walking:best.meters,walkingQuality:metric.quality,walkingCheckedAt:metric.checkedAt,path:metric.points,line:'Pieszo',course:'walk',provider:'walk'}];
  legs=[...legs.slice(0,a),first,...foot,last,...legs.slice(b+1)];
  walking+=best.meters-oldWalk;changed=true;
 }
 if(!changed)return journey;
 return {...journey,legs,walking,id:JSON.stringify(legs.map(leg=>[leg.provider,leg.course,leg.from.id,leg.to.id,leg.departure]))};
}
