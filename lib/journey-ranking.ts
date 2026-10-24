import type {Journey,JourneyOptions} from './journey-planner';
import type {Stop} from '@/Panel/src/types';
import {tightenJourneyInterchanges} from './journey-interchanges';
import type {JourneySearchGraph} from './journey-footpath-network';

/** Presentation policy is separate from reachability and label dominance. */
export function rankJourneyAlternatives(answers:Journey[],from:Stop,to:Stop,o:JourneyOptions,graph?:JourneySearchGraph):Journey[]{
 const score=(j:Journey)=>[o.sort==='transfers'?j.transfers:o.sort==='walking'?j.walking:0,o.arriveBy?-j.departure:j.arrival];
 const slack=(j:Journey)=>{let minimum=900,rides=0;for(let i=0;i<j.legs.length;i++)if(j.legs[i].walking===undefined){if(rides++&&i>0)minimum=Math.min(minimum,(j.legs[i].departure-j.legs[i-1].arrival)/1000);}return minimum;};
 // Keep later departures, but remove worse detours for the very same boarding.
 const firstRide=(j:Journey)=>j.legs.find(l=>l.walking===undefined);
 const boardingKey=(j:Journey)=>{const ride=firstRide(j);return ride?JSON.stringify([ride.provider,ride.course,ride.from.id,ride.departure]):'walking';};
 const groups=new Map<string,Journey[]>();for(const journey of answers){const key=boardingKey(journey),list=groups.get(key)||[];list.push(journey);groups.set(key,list);}
 const useful=answers.filter(candidate=>!(groups.get(boardingKey(candidate))||[]).some(better=>{
  if(better===candidate||better.arrival>candidate.arrival||better.transfers>candidate.transfers)return false;
  const walkingOkay=better.walking<=candidate.walking||(o.sort!=='walking'&&better.walking<=candidate.walking+Math.min(150,o.walkMeters*.3)&&candidate.arrival-better.arrival>=5*60000);
  return walkingOkay&&(better.arrival<candidate.arrival||better.transfers<candidate.transfers||better.walking<candidate.walking);
 }));
 // A later-starting direct ride also supersedes a needless out-and-back transfer.
 // Never collapse later departures just because an earlier bus arrives earlier.
 const direct=useful.filter(j=>j.transfers===0&&j.legs.some(l=>l.walking===undefined));
 const practical=useful.filter(candidate=>candidate.transfers===0||!direct.some(better=>better.departure>=candidate.departure&&better.arrival<=candidate.arrival&&(better.walking<=candidate.walking||(o.sort!=='walking'&&better.walking<=candidate.walking+Math.min(150,o.walkMeters*.3)))));
 // The scan may produce many label variants of the same sequence of boardings.
 // Deduplicate before inspecting their recorded calls, then deduplicate again
 // because different interchanges can normalize to the same shorter journey.
 const uniqueRoutes=(journeys:Journey[])=>{const seen=new Set<string>();return journeys.filter(j=>{const key=j.legs.filter(l=>l.walking===undefined).map(l=>JSON.stringify([l.provider,l.course,l.from.id,l.to.id])).join('|')||'walk:'+from.id+':'+to.id;if(seen.has(key))return false;seen.add(key);return true;});};
 // Comfort only breaks ties after the requested objective and arrival/departure.
 // It cannot turn a slower option into the claimed fastest connection.
 const rank=(a:Journey,b:Journey)=>{const x=score(a),y=score(b);return x[0]-y[0]||x[1]-y[1]||a.transfers-b.transfers||slack(b)-slack(a)||a.walking-b.walking;};
 const adjusted=uniqueRoutes(practical.sort(rank)).map(j=>tightenJourneyInterchanges(j,o,graph));
 return uniqueRoutes(adjusted.sort(rank)).slice(0,o.day?undefined:12).map(j=>{
  let rides=0;const legs=j.legs.map((leg,i)=>{if(leg.walking!==undefined)return leg;if(!rides++)return leg;return {...leg,transferSlackSeconds:Math.max(0,Math.floor((leg.departure-j.legs[i-1].arrival)/1000))};});
  return {...j,legs};
 });
}
