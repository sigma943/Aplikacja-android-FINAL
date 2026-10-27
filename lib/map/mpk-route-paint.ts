import {journeyBusCorridor} from '../journey-bus-corridor';
import type {Point} from '../journey-route-geometry';
/** Only MPK map paint: remove verified short platform-pin spurs on a straight
 * road. Keep the stored/routed geometry and every other carrier unchanged. */
export function mpkRouteForPaint(route:Point[],provider:string|undefined,pins:Point[]):Point[]{
 return provider==='mpk_rzeszow'&&route.length>=5&&pins.length?journeyBusCorridor(route,pins):route;
}
