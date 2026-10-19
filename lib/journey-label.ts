import type {JourneyLeg} from './journey-planner';
import {isRzeszowStation} from './journey-places';
import {displayStopLabel,displayStopCatalogLabel} from './stop-label';

/** A walking departure does not assign a boarding platform at the terminal. */
export function journeyDepartureLabel(leg:JourneyLeg,index=0):string {
  return index===0&&leg.walking!==undefined&&isRzeszowStation(leg.from)
    ?displayStopLabel(leg.from.name):displayStopCatalogLabel(leg.from.name,leg.from.code);
}
