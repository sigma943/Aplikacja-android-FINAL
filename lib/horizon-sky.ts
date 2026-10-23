import SunCalc from 'suncalc';

export const HORIZON_DEFAULT_LOCATION={lat:50.0412,lon:21.9991};
export const HORIZON_STEP_MS=60_000;
const degrees=180/Math.PI;
export const clamp=(n:number,min=0,max=1)=>Math.max(min,Math.min(max,n));
const smooth=(a:number,b:number,n:number)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};
export function mixSky(a:string,b:string,t:number){
  return '#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-clamp(t))+parseInt(b.slice(i,i+2),16)*clamp(t)).toString(16).padStart(2,'0')).join('');
}

/** Illuminated sphere, not an overlapping circle: crescents and gibbous phases
 * have the correct terminator and exactly the requested illuminated area. */
export function moonPhasePath(fraction:number,r=24){
  const k=1-2*clamp(fraction),points:string[]=[];
  for(let i=0;i<=48;i++){
    const y=r-2*r*i/48,x=k*Math.sqrt(Math.max(0,r*r-y*y));
    points.push(`${x.toFixed(3)},${y.toFixed(3)}`);
  }
  return `M0,${-r} A${r},${r} 0 0 1 0,${r} L${points.join(' L')} Z`;
}

export function horizonSnapshot(time:number,lat=HORIZON_DEFAULT_LOCATION.lat,lon=HORIZON_DEFAULT_LOCATION.lon){
  if(!Number.isFinite(time))throw Error('Invalid sky time');
  if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180){lat=HORIZON_DEFAULT_LOCATION.lat;lon=HORIZON_DEFAULT_LOCATION.lon;}
  const date=new Date(time),sun=SunCalc.getPosition(date,lat,lon),moon=SunCalc.getMoonPosition(date,lat,lon),light=SunCalc.getMoonIllumination(date);
  const altitude=sun.altitude*degrees,day=smooth(-7,14,altitude),night=1-smooth(-15,-5,altitude);
  const rising=SunCalc.getPosition(new Date(time+60_000),lat,lon).altitude>sun.altitude;
  const warmth=Math.exp(-(((altitude-1)/10)**2));
  const evening=.5+.5*Math.sin(sun.azimuth);
  const top=mixSky('#070c28','#1a3159',day);
  const middle=mixSky(mixSky('#171738','#49335e',1-night),'#435e8c',day);
  const bottom=mixSky(mixSky('#29264f','#7794be',day),mixSky('#d18ea8','#ec9d79',evening),warmth*(1-night));
  // Clock-independent altitude also handles polar day/night and date-line travel.
  const project=(azimuth:number,alt:number)=>({x:50+Math.sin(azimuth)*43,y:78-(alt*degrees+.833)*.95});
  const times=SunCalc.getTimes(date,lat,lon);
  const instant=(value:Date)=>Number.isFinite(value?.getTime())?value.getTime():null;
  return {time,altitude,rising,top,middle,bottom,warmth,night,day,sunrise:instant(times.sunrise),sunset:instant(times.sunset),
    surface:mixSky('#101633','#172344',day),raised:mixSky('#1a2044','#252e54',day),
    accent:mixSky(mixSky('#bda2ff','#b9c8ff',day),'#e0b5ff',warmth*.6),
    ridgeFar:mixSky('#25284d','#435477',day),ridgeMid:mixSky('#1a2243','#2c3c5c',day),ridgeNear:mixSky('#111a37','#1b2c48',day),
    sun:{...project(sun.azimuth,sun.altitude),opacity:smooth(-1.8,-.8,altitude)},
    moon:{...project(moon.azimuth,moon.altitude),opacity:smooth(-1,2,moon.altitude*degrees)*(1-day*.88),
      fraction:light.fraction,phase:light.phase,rotation:-(light.angle-moon.parallacticAngle)*degrees-90,path:moonPhasePath(light.fraction)},
    stars:night*(1-light.fraction*.28),
  };
}

/** Fixed seeded field: no twinkling timers, random re-renders or layout reads. */
export const HORIZON_STARS=Array.from({length:64},(_,i)=>({
  x:((i*137.508)%100),y:3+((i*71.713)%66),radius:i%9===0?1.3:.65,opacity:.35+(i%5)*.13,
}));
