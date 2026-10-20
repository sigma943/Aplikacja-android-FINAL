import type {JourneyLeg} from './journey-planner';
import {isRzeszowStation} from './journey-places';
import {displayStopLabel,displayStopCatalogLabel} from './stop-label';

/** A walking departure does not assign a boarding platform at the terminal. */
export function journeyDepartureLabel(leg:JourneyLeg,index=0):string {
  return index===0&&leg.walking!==undefined&&isRzeszowStation(leg.from)
    ?displayStopLabel(leg.from.name):displayStopCatalogLabel(leg.from.name,leg.from.code);
}

/** Arrival at the terminal needs no boarding platform; identities remain unchanged. */
export function journeyDestinationLabel(stop:JourneyLeg['to']):string {
 return isRzeszowStation(stop)?displayStopLabel(stop.name):displayStopCatalogLabel(stop.name,stop.code);
}
export function journeyArrivalLabel(leg:JourneyLeg,final=false):string {
 return final?journeyDestinationLabel(leg.to):displayStopCatalogLabel(leg.to.name,leg.to.code);
}
