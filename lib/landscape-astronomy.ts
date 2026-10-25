import * as SunCalc from 'suncalc';
import {Body,Observer,Equator,Horizon,SearchRiseSet,SearchAltitude} from 'astronomy-engine';
import horizon from './landscape-horizon.json';

// Engine topocentric positions include lunar parallax. Renderer uses radians
// and azimuth from south; SunCalc is retained only for lunar limb orientation.
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
  const date=new Date(ms),observer=new Observer(location.lat,location.lon,0);
  const position=(body:Body)=>{
    const eq=Equator(body,date,observer,true,true),horizontal=Horizon(date,observer,eq.ra,eq.dec);
    return {altitude:horizontal.altitude*Math.PI/180,azimuth:(horizontal.azimuth-180)*Math.PI/180,distance:eq.dist*149597870.7};
  };
  const sun=position(Body.Sun),moon={...position(Body.Moon),parallacticAngle:SunCalc.getMoonPosition(date,location.lat,location.lon).parallacticAngle},illumination=SunCalc.getMoonIllumination(date);
  return {ms,sun,moon,illumination};
}
export type AstronomyState=ReturnType<typeof astronomyAt>;
export const LANDSCAPE_TIME_ZONE='Europe/Warsaw';
const civilDate=new Intl.DateTimeFormat('en-CA',{timeZone:LANDSCAPE_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
/** Calendar bounds use Warsaw's actual offset on EACH end: DST days are 23/25h. */
export function landscapeDayBounds(ms:number){
 const parts=civilDate.formatToParts(ms),part=(key:string)=>Number(parts.find(p=>p.type===key)!.value);
 const date=Date.UTC(part('year'),part('month')-1,part('day'));
 const midnight=(utc:number)=>{
  const text=new Intl.DateTimeFormat('en',{timeZone:LANDSCAPE_TIME_ZONE,timeZoneName:'shortOffset'}).formatToParts(utc).find(p=>p.type==='timeZoneName')!.value;
  const hours=Number(text.match(/GMT([+-]\d+)/)?.[1]||0);return utc-hours*3600000;
 };
 return {start:midnight(date),end:midnight(date+86400000),noon:date+43200000};
}
const eventCache=new Map<string,Record<string,number|null>>();
function civilEvents(ms:number,location:LandscapeLocation,body:Body){
 const {start,end}=landscapeDayBounds(ms),key=`${start}:${location.lat}:${location.lon}:${body}`;
 const cached=eventCache.get(key);if(cached)return cached;
 const observer=new Observer(location.lat,location.lon,0),date=new Date(start),limit=(end-start)/86400000;
 const within=(t:{date:Date}|null)=>t&&+t.date>=start&&+t.date<end?+t.date:null;
 const rise=within(SearchRiseSet(body,observer,1,date,limit)),set=within(SearchRiseSet(body,observer,-1,date,limit));
 const result:Record<string,number|null>=body===Body.Moon?{moonrise:rise,moonset:set}:{sunrise:rise,sunset:set};
 if(body===Body.Sun)for(const [riseKey,setKey,altitude]of [['dawn','dusk',-6],['nauticalDawn','nauticalDusk',-12],['nightEnd','night',-18]] as const){
  result[riseKey]=within(SearchAltitude(body,observer,1,date,limit,altitude));result[setKey]=within(SearchAltitude(body,observer,-1,date,limit,altitude));
 }
 if(eventCache.size>=8)eventCache.clear();eventCache.set(key,result);return result;
}
export function solarEvents(ms:number,location:LandscapeLocation){return civilEvents(ms,location,Body.Sun);}
export function lunarEvents(ms:number,location:LandscapeLocation){return civilEvents(ms,location,Body.Moon);}
const mixAngle=(a:number,b:number,t:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
export function interpolateAstronomy(a:AstronomyState,b:AstronomyState,ms:number):AstronomyState{
  const t=Math.max(0,Math.min(1,(ms-a.ms)/(b.ms-a.ms||1))),mix=(x:number,y:number)=>x+(y-x)*t;
  return {ms,sun:{altitude:mix(a.sun.altitude,b.sun.altitude),azimuth:mixAngle(a.sun.azimuth,b.sun.azimuth,t),distance:mix(a.sun.distance,b.sun.distance)},
    moon:{altitude:mix(a.moon.altitude,b.moon.altitude),azimuth:mixAngle(a.moon.azimuth,b.moon.azimuth,t),parallacticAngle:mixAngle(a.moon.parallacticAngle,b.moon.parallacticAngle,t),distance:mix(a.moon.distance,b.moon.distance)},
    illumination:{fraction:mix(a.illumination.fraction,b.illumination.fraction),phase:((mixAngle(a.illumination.phase*Math.PI*2,b.illumination.phase*Math.PI*2,t)/(Math.PI*2))%1+1)%1,angle:mixAngle(a.illumination.angle,b.illumination.angle,t)}};
}
export const smoothstep=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function skyState(state:AstronomyState){
  const altitude=state.sun.altitude*180/Math.PI;
  const day=smoothstep(-7,12,altitude),twilight=smoothstep(-12,-1,altitude)*(1-smoothstep(-.5,10,altitude));
  const moonlight=state.illumination.fraction*smoothstep(0,.25,state.moon.altitude)*(1-day);
  return {day,twilight,moonlight,stars:1-smoothstep(-16,-4,altitude),fog:.16+.28*twilight+.07*(1-day)};
}
/** Vertical decorative track; true altitude/time drives it, azimuth cannot move
 * a body offscreen. At official rise/set the upper limb crosses the valley crest. */
export function apparentLandscapeAltitude(body:{altitude:number;distance?:number},kind:'sun'|'moon'='sun'){
 const limb=kind==='sun'?16/60:Math.asin(1737.4/(body.distance||384400))*180/Math.PI;
 return body.altitude+(34/60+limb)*Math.PI/180;
}
export function projectCelestial(body:{altitude:number;azimuth:number;distance?:number},kind:'sun'|'moon'='sun'){
 const x=kind==='sun'?.50:.78,index=x*255,i=Math.floor(index);
 const radius=(kind==='sun'?26:36)/(1000*1850/850),crest=horizon[i]+(horizon[i+1]-horizon[i])*(index-i);
 return {x,y:crest+radius-(crest-.07)*Math.sin(Math.max(-Math.PI/2,Math.min(Math.PI/2,apparentLandscapeAltitude(body,kind))))};
}

/** Let the rising Moon emerge through twilight, rather than compete with the Sun. */
export function moonPresentationOpacity(sunAltitude:number){
 return .10+.90*(1-smoothstep(-6,1,sunAltitude*180/Math.PI));
}
