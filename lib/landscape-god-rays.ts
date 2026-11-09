import {solarShaftStrength} from './landscape-optics';
import {smoothstep} from './landscape-astronomy';

const TAU=Math.PI*2;
const ANGULAR_SAMPLES=96;
const cloudSamples=[[.018,4],[.032,4],[.05,3],[.074,3],[.105,2],[.145,2],[.195,1]] as const;

export function godRaysOpacity(altitude:number,intensity:number,strength:number){
  const gain=strength<=1?strength:1+3*(strength-1)**2;
  return Math.min(.34,Math.sqrt(intensity)*gain*(.04+.29*solarShaftStrength(altitude)));
}

export function godRaysProfile(
  sun:{x:number;y:number},aspect:number,transmission:(x:number,y:number)=>number,
){
  const visibility=Array.from({length:ANGULAR_SAMPLES},(_,index)=>{
    const angle=index/ANGULAR_SAMPLES*TAU;
    const dx=Math.cos(angle)/aspect,dy=Math.sin(angle);
    let total=0,weights=0;
    for(const [distance,weight] of cloudSamples){
      total+=weight*transmission(sun.x+dx*distance,sun.y+dy*distance);
      weights+=weight;
    }
    return total/weights;
  });
  const at=(index:number)=>visibility[(index+ANGULAR_SAMPLES)%ANGULAR_SAMPLES];
  const ambient=visibility.reduce((sum,value)=>sum+value,0)/ANGULAR_SAMPLES;
  return visibility.map((_,index)=>{
    const open=(at(index-1)+2*at(index)+at(index+1))/4;
    const surrounding=(at(index-8)+at(index-4)+at(index+4)+at(index+8))/4;
    const contrast=.4*(open-ambient)+.6*(open-surrounding);
    return smoothstep(.006,.14,contrast);
  });
}

/** One screen-space field shared by scenery and UI. Cloud openings shape its
 * angular profile, while distance from the real sun controls its falloff. */
export function paintGodRays(
  c:CanvasRenderingContext2D,width:number,height:number,
  sun:{x:number;y:number;color:readonly number[]},opacity:number,
  profile:readonly number[],
){
  const x=sun.x*width,y=sun.y*height,reach=Math.hypot(width,height)*.91;
  const color=sun.color.map(value=>Math.round(value*255)).join(',');
  if(!profile.some(Boolean))return;
  const light=c.createConicGradient(0,x,y);
  for(let index=0;index<=profile.length;index++){
    const alpha=opacity*profile[index%profile.length];
    light.addColorStop(index/profile.length,`rgba(${color},${alpha})`);
  }
  c.fillStyle=light;c.fillRect(0,0,width,height);
  const falloff=c.createRadialGradient(x,y,0,x,y,reach);
  falloff.addColorStop(0,'#fff6');
  falloff.addColorStop(.08,'#fffd');
  falloff.addColorStop(.30,'#fff9');
  falloff.addColorStop(.63,'#fff3');
  falloff.addColorStop(1,'#fff0');
  c.globalCompositeOperation='destination-in';
  c.fillStyle=falloff;c.fillRect(0,0,width,height);
}
