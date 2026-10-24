import {smoothstep,type AstronomyState} from './landscape-astronomy';
/** Schlick approximation for an air/glass interface (IOR about 1.5).
 * UI panels use an artistic viewing angle, not a tracked physical camera. */
export function glassFresnel(cosine:number){const c=Math.max(0,Math.min(1,cosine));return .04+.96*(1-c)**5;}
export function solarShaftStrength(altitude:number){
 const degrees=altitude*180/Math.PI;
 return smoothstep(-7,-.5,degrees)*(1-smoothstep(4,20,degrees));
}
export function landscapeOptics(state:AstronomyState,opacity:number,glass:boolean){
 const warm=solarShaftStrength(state.sun.altitude);
 const transmission=glass?1-Math.max(0,Math.min(100,opacity))/100:0;
 const fresnel=glassFresnel(Math.max(.12,Math.sin(Math.max(0,state.sun.altitude))));
 const strength=transmission*(.035+warm*.20)*(.4+fresnel)*smoothstep(-.04,.01,state.sun.altitude);
 const rgb=[201+54*warm,229-37*warm,255-130*warm].map(Math.round).join(',');
 // The shared GPU layer supplies occluded screen-space shafts beneath the UI.
 return {
  '--landscape-reflection-image':'none',
  '--landscape-rim':`rgba(${rgb},${(strength*1.7).toFixed(4)})`,
  '--landscape-reflection-strength':strength.toFixed(4),
 };
}
export type LandscapeViewport={width:number;height:number;keyboard:boolean};
/** Keep the same composition while the IME consumes viewport height. Rotation
 * always establishes a new frame; keyboard dismissal releases the height lock. */
export function landscapeViewport(previous:LandscapeViewport|undefined,next:{width:number;height:number},editing:boolean):LandscapeViewport{
 const same=previous&&Math.abs(previous.width-next.width)<2;
 const drop=previous?previous.height-next.height:0;
 if(same&&((previous.keyboard&&drop>24)||(editing&&drop>120)))return {...previous,keyboard:true};
 return {...next,keyboard:false};
}
