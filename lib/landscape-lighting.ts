import {projectCelestial,apparentLandscapeAltitude,moonPresentationOpacity,skyState,smoothstep,type AstronomyState} from './landscape-astronomy';
import {SUN_RADIUS,MOON_RADIUS} from './landscape-celestial';
import horizon from './landscape-horizon.json';
export type LightColor=[number,number,number];
export interface LandscapeLightingState {
  time:number;
  sun:{x:number;y:number;altitude:number;intensity:number;color:LightColor};
  moon:{x:number;y:number;altitude:number;illumination:number;intensity:number;color:LightColor};
  ambient:{intensity:number;color:LightColor};
  sky:ReturnType<typeof skyState>;
}
export function mountainHorizon(x:number){
  const index=Math.max(0,Math.min(255,x*255)),i=Math.floor(index);
  return horizon[i]+((horizon[Math.min(255,i+1)]??horizon[i])-horizon[i])*(index-i);
}
export function discVisibility(x:number,y:number,r:number,altitude:number){
  if(altitude<=0||x<-.1||x>1.1)return 0;
  const z=Math.max(-1,Math.min(1,(mountainHorizon(x)-y)/r));
  return (.5+(Math.asin(z)+z*Math.sqrt(1-z*z))/Math.PI)*smoothstep(0,.003,altitude);
}
/** Consume the existing interpolated ephemeris and projection; never compute a second orbit. */
export function landscapeLighting(state:AstronomyState,time:number,sunTransmission=1,moonTransmission=1):LandscapeLightingState{
  const base=skyState(state),sky={...base,twilight:base.twilight*(2-base.twilight)},sun=projectCelestial(state.sun),moon=projectCelestial(state.moon,'moon');
  const warm=sky.twilight;
  return {time,sky,
    sun:{...sun,altitude:state.sun.altitude,intensity:(.45+.55*sky.day)*Math.sqrt(discVisibility(sun.x,sun.y,SUN_RADIUS/(1000*1850/850),apparentLandscapeAltitude(state.sun)))*sunTransmission,
      color:[1,.94-warm*.28,.81-warm*.36]},
    moon:{...moon,altitude:state.moon.altitude,illumination:state.illumination.fraction,
      intensity:state.illumination.fraction*(1-sky.day)*moonPresentationOpacity(state.sun.altitude)*discVisibility(moon.x,moon.y,MOON_RADIUS/(1000*1850/850),apparentLandscapeAltitude(state.moon,'moon'))*moonTransmission*.32,color:[.67,.81,1]},
    ambient:{intensity:.12+.88*sky.day,color:[.12+.32*sky.day,.24+.35*sky.day,.39+.31*sky.day]}};
}
