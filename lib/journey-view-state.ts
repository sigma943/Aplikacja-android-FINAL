import type {Journey} from './journey-planner';

/** Live times change; the expanded journey and its map retain their identity. */
export function stableJourneyResults(journeys:Journey[]):Journey[]{
 return journeys.map(j=>({...j,id:JSON.stringify(j.legs.map(l=>[l.course,l.from.id,l.to.id]))}));
}
export function journeyMapKey(journey:Journey):string {
 return JSON.stringify(journey.legs.map(l=>[l.course,l.from.id,l.from.lat,l.from.lon,l.to.id,l.to.lat,l.to.lon,l.walking,l.path]));
}
