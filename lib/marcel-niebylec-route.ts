import {roadDistance} from './bus-road-geometry';

type Point=[number,number];
// OSM ways 171187883 (by Magnolia) and 44306359, checked 2026-10-09.
// Marcel's northbound route reaches the platform through the southern link,
// then turns left onto the main road instead of entering from the north and reversing.
const corridor:Point[]=[
  [49.8555186,21.9027491],[49.8555022,21.9028155],[49.8555363,21.9029416],
  [49.8555931,21.9030823],[49.8557351,21.9034652],[49.8557770,21.9035804],
  [49.8558035,21.9036532],[49.8558663,21.9037637],[49.8559194,21.9038137],
  [49.8559622,21.9037261],[49.8560430,21.9036462],[49.8561975,21.9034986],
  [49.8562247,21.9034755],[49.8562489,21.9034549],[49.8562756,21.9034073],
];
const platformRoad:Point=[49.856062,21.903628];

/** Replace only the recorded northbound Niebylec out-and-back; retain other legs. */
export function correctMarcelNiebylecRoute(route:Point[],provider?:string):Point[] {
  if(provider!=='marcel')return route;
  for(let index=0;index<route.length-3;index++) {
    if(roadDistance(route[index],corridor[0])>8 ||
      roadDistance(route[index+1],corridor.at(-1)!)>8 ||
      roadDistance(route[index+2],platformRoad)>8 ||
      roadDistance(route[index+3],corridor.at(-1)!)>8)continue;
    return [...route.slice(0,index),route[index],...corridor.slice(1,-1),route[index+3],...route.slice(index+4)];
  }
  return route;
}
