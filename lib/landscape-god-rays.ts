import {solarShaftStrength} from './landscape-optics';

const TAU=Math.PI*2;
const rays=[
  [.037,.019,.66],[.102,.025,.84],[.181,.035,1],[.275,.022,.75],
  [.369,.031,.94],[.462,.014,.69],[.578,.018,.43],[.715,.019,.38],[.886,.026,.55],
] as const;

export function godRaysOpacity(altitude:number,intensity:number,strength:number){
  const gain=strength<=1?strength:1+3*(strength-1)**2;
  return Math.min(.34,Math.sqrt(intensity)*gain*(.04+.29*solarShaftStrength(altitude)));
}

/** One screen-space field shared by scenery and UI. Cloud openings shape its
 * angular profile, while distance from the real sun controls its falloff. */
export function paintGodRays(
  c:CanvasRenderingContext2D,width:number,height:number,
  sun:{x:number;y:number;color:readonly number[]},opacity:number,
  transmission:(x:number,y:number)=>number,
){
  const x=sun.x*width,y=sun.y*height,reach=Math.hypot(width,height)*.91;
  const color=sun.color.map(value=>Math.round(value*255)).join(',');
  const light=c.createConicGradient(0,x,y);
  light.addColorStop(0,'transparent');
  for(const [turn,spread,weight] of rays){
    const angle=turn*TAU,dx=Math.cos(angle),dy=Math.sin(angle);
    const open=transmission(sun.x+dx*reach*.09/width,sun.y+dy*reach*.09/height);
    const alpha=opacity*weight*(.12+.88*open);
    light.addColorStop(turn-spread,'transparent');
    light.addColorStop(turn-spread*.32,`rgba(${color},${alpha*.65})`);
    light.addColorStop(turn,`rgba(${color},${alpha})`);
    light.addColorStop(turn+spread,'transparent');
  }
  light.addColorStop(1,'transparent');
  c.fillStyle=light;c.fillRect(0,0,width,height);
  const falloff=c.createRadialGradient(x,y,0,x,y,reach);
  falloff.addColorStop(0,'#fff9');
  falloff.addColorStop(.1,'#fff');
  falloff.addColorStop(.52,'#fff8');
  falloff.addColorStop(1,'#fff0');
  c.globalCompositeOperation='destination-in';
  c.fillStyle=falloff;c.fillRect(0,0,width,height);
}
