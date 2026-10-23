import * as SunCalc from 'suncalc';

// SunCalc 1.9.0 uses RADIANS and azimuth clockwise from SOUTH (v2 differs).
// Offline, low precision ephemerides for a decorative scene, not navigation.
export const DEFAULT_LANDSCAPE_LOCATION={lat:50.0412,lon:21.9991,source:'default-rzeszow' as const};
export const LANDSCAPE_LOCATION_KEY='mks_landscape_location_v1';
export type LandscapeLocation={lat:number;lon:number;source:'default-rzeszow'|'saved-location';};
export function validLocation(value:unknown):value is {lat:number;lon:number}{
  const p=value as {lat:number;lon:number}|null;
  return !!p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
}
export function landscapeLocation(value:unknown):LandscapeLocation{
  return validLocation(value)?{lat:value.lat,lon:value.lon,source:'saved-location'}:DEFAULT_LANDSCAPE_LOCATION;
}
export function rememberLandscapeLocation(lat:number,lon:number){
  if(!validLocation({lat,lon})||typeof window==='undefined')return;
  try{localStorage.setItem(LANDSCAPE_LOCATION_KEY,JSON.stringify({lat,lon}));window.dispatchEvent(new Event('pks-landscape-location'));}catch{/* The default remains available with blocked storage. */}
}
export function astronomyAt(ms:number,location:LandscapeLocation){
  const date=new Date(ms),sun=SunCalc.getPosition(date,location.lat,location.lon);
  const moon=SunCalc.getMoonPosition(date,location.lat,location.lon),illumination=SunCalc.getMoonIllumination(date);
  return {ms,sun,moon,illumination};
}
export type AstronomyState=ReturnType<typeof astronomyAt>;
export function solarEvents(ms:number,location:LandscapeLocation){
  // An absolute instant contains its UTC offset already. No manual DST offsets.
  // SunCalc selects the solar day nearest the instant; invalid dates mean polar events are absent.
  const times=SunCalc.getTimes(new Date(ms),location.lat,location.lon);
  return Object.fromEntries(['sunrise','sunset','dawn','dusk','nauticalDawn','nauticalDusk','night','nightEnd'].map(key=>[key,Number.isFinite(+times[key])?+times[key]:null]));
}
const mixAngle=(a:number,b:number,t:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
export function interpolateAstronomy(a:AstronomyState,b:AstronomyState,ms:number):AstronomyState{
  const t=Math.max(0,Math.min(1,(ms-a.ms)/(b.ms-a.ms||1))),mix=(x:number,y:number)=>x+(y-x)*t;
  return {ms,sun:{altitude:mix(a.sun.altitude,b.sun.altitude),azimuth:mixAngle(a.sun.azimuth,b.sun.azimuth,t)},
    moon:{altitude:mix(a.moon.altitude,b.moon.altitude),azimuth:mixAngle(a.moon.azimuth,b.moon.azimuth,t),parallacticAngle:mixAngle(a.moon.parallacticAngle,b.moon.parallacticAngle,t),distance:mix(a.moon.distance,b.moon.distance)},
    illumination:{fraction:mix(a.illumination.fraction,b.illumination.fraction),phase:((mixAngle(a.illumination.phase*Math.PI*2,b.illumination.phase*Math.PI*2,t)/(Math.PI*2))%1+1)%1,angle:mixAngle(a.illumination.angle,b.illumination.angle,t)}};
}
export const smoothstep=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function skyState(state:AstronomyState){
  const altitude=state.sun.altitude*180/Math.PI;
  const day=smoothstep(-7,12,altitude),twilight=smoothstep(-12,-1,altitude)*(1-smoothstep(1,18,altitude));
  const moonlight=state.illumination.fraction*smoothstep(0,.25,state.moon.altitude)*(1-day);
  return {day,twilight,moonlight,stars:1-smoothstep(-16,-4,altitude),fog:.16+.28*twilight+.07*(1-day)};
}
/** Fixed south-facing 260° artistic panorama. Mountains are NOT the local horizon.
 * North passes behind the viewer, outside the image, so azimuth wrap is offscreen. */
export function projectCelestial(body:{altitude:number;azimuth:number}){
  const azimuth=Math.atan2(Math.sin(body.azimuth),Math.cos(body.azimuth));
  return {x:.5+azimuth/(260*Math.PI/180),y:.55-body.altitude/(Math.PI/2)*.49};
}
