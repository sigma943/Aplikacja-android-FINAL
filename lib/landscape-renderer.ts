import {projectCelestial,skyState,smoothstep,type AstronomyState} from './landscape-astronomy';
import horizon from './landscape-horizon.json';
const TAU=Math.PI*2,WIDTH=1000,HEIGHT=1000*1850/850;
const blend=(a:number[],b:number[],t:number)=>a.map((v,i)=>v+(b[i]-v)*t);
const css=(c:number[])=>`rgb(${c.map(Math.round).join(',')})`;
export function mountainHorizon(x:number){
  const index=Math.max(0,Math.min(255,x*255)),i=Math.floor(index);
  return horizon[i]+((horizon[Math.min(255,i+1)]??horizon[i])-horizon[i])*(index-i);
}
export function discVisibility(x:number,y:number,r:number,altitude:number){
  if(altitude<=0||x<-.1||x>1.1)return 0;
  const z=Math.max(-1,Math.min(1,(mountainHorizon(x)-y)/r));
  return (.5+(Math.asin(z)+z*Math.sqrt(1-z*z))/Math.PI)*smoothstep(0,.003,altitude);
}
export type LandscapeAssets={terrain:CanvasImageSource;clouds:CanvasImageSource;water:CanvasImageSource;cloudAlpha?:Uint8ClampedArray};
/** One neutral illustrated terrain cutout, one cloud layer and a mask extracted from
 * the terrain's transparent river. All times use these SAME assets and geometry. */
export class LandscapeRenderer{
  private ctx:CanvasRenderingContext2D;
  private terrain:HTMLCanvasElement;
  private clouds:HTMLCanvasElement;
  private water:HTMLCanvasElement;
  private lastLight='';
  private width=1;private height=1;private scale=1;private offsetX=0;private offsetY=0;
  private assets:LandscapeAssets|null=null;
  private stars=Array.from({length:180},(_,i)=>{const r=(n:number)=>((Math.sin(n*127.1)*43758.5453)%1+1)%1;return{x:r(i+1),y:r(i+72)*.46,size:.4+r(i+17),brightness:r(i+45)};});
  constructor(private canvas:HTMLCanvasElement){
    this.ctx=canvas.getContext('2d',{alpha:false})!;
    this.terrain=document.createElement('canvas');this.clouds=document.createElement('canvas');this.water=document.createElement('canvas');
  }
  setAssets(assets:LandscapeAssets){this.assets=assets;this.lastLight='';}
  resize(w:number,h:number,dpr:number){
    const density=Math.min(dpr,1.5,Math.sqrt(1800000/(w*h)));
    this.width=this.canvas.width=Math.round(w*density);this.height=this.canvas.height=Math.round(h*density);
    for(const layer of [this.terrain,this.clouds,this.water]){layer.width=this.width;layer.height=this.height;}
    // Uniform scale; phones crop at most a narrow edge instead of stretching artwork.
    this.scale=Math.max(this.width/WIDTH,this.height/HEIGHT);this.offsetX=(this.width-WIDTH*this.scale)/2;this.offsetY=this.height-HEIGHT*this.scale;this.lastLight='';
  }
  private coordinates(c:CanvasRenderingContext2D){c.setTransform(this.scale,0,0,this.scale,this.offsetX,this.offsetY);}
  private relight(day:number,warm:number,moon:number,sunX:number){
    if(!this.assets)return;
    for(const [canvas,image,isCloud]of [[this.terrain,this.assets.terrain,false],[this.clouds,this.assets.clouds,true]] as const){
      const c=canvas.getContext('2d')!;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,this.width,this.height);this.coordinates(c);
      c.drawImage(image,0,0,WIDTH,HEIGHT);
      c.globalCompositeOperation='source-atop';
      c.fillStyle=`rgba(2,14,48,${(1-day)*(isCloud?.92:.84)-moon*.05})`;c.fillRect(0,0,WIDTH,HEIGHT);
      if(warm>0){
        const g=c.createLinearGradient(sunX*WIDTH,0,(1-sunX)*WIDTH,HEIGHT);
        g.addColorStop(0,`rgba(255,159,81,${warm*(isCloud?.75:.25)})`);g.addColorStop(1,`rgba(170,78,93,${warm*.12})`);c.fillStyle=g;c.fillRect(0,0,WIDTH,HEIGHT);
      }
      c.globalCompositeOperation='source-over';
    }
  }
  private cloudTransmission(x:number,y:number,shift:number){
    const alpha=this.assets?.cloudAlpha;if(!alpha)return 1;
    const px=Math.floor((x-shift/WIDTH)*850),py=Math.floor(y*1850);
    return px>=0&&px<850&&py>=0&&py<1850?1-alpha[py*850+px]/255:1;
  }
  private moon(c:CanvasRenderingContext2D,state:AstronomyState,x:number,y:number,radius:number){
    const f=state.illumination.fraction,opacity=c.globalAlpha;
    c.save();c.translate(x,y);
    // SunCalc's bright limb angle minus parallactic angle is anticlockwise from zenith.
    c.rotate(-(state.illumination.angle-state.moon.parallacticAngle)-Math.PI/2);
    c.fillStyle='#7184a0';c.globalAlpha=opacity*.15;c.beginPath();c.arc(0,0,radius,0,TAU);c.fill();c.globalAlpha=opacity;
    c.fillStyle='#fff0cf';c.beginPath();
    for(let i=0;i<=64;i++){const v=-1+2*i/64;c.lineTo(radius*Math.sqrt(Math.max(0,1-v*v)),radius*v);}
    for(let i=64;i>=0;i--){const v=-1+2*i/64;c.lineTo(radius*(1-2*f)*Math.sqrt(Math.max(0,1-v*v)),radius*v);}
    c.closePath();c.fill();c.clip();c.globalAlpha=opacity*.15;c.fillStyle='#66717b';
    for(const [dx,dy,rr] of [[-.2,.3,.2],[.4,-.25,.24],[-.3,-.5,.13],[.3,.5,.1],[.1,-.05,.18]]){c.beginPath();c.arc(dx*radius,dy*radius,rr*radius,0,TAU);c.fill();}
    c.restore();
  }
  render(state:AstronomyState,seconds:number,motion:boolean){
    const c=this.ctx,sky=skyState(state),sun=projectCelestial(state.sun),moon=projectCelestial(state.moon);
    const lightKey=[sky.day.toFixed(3),sky.twilight.toFixed(3),sky.moonlight.toFixed(2),sun.x.toFixed(2)].join(':');
    if(lightKey!==this.lastLight){this.relight(sky.day,sky.twilight,sky.moonlight,sun.x);this.lastLight=lightKey;}
    c.setTransform(1,0,0,1,0,0);
    const gradient=c.createLinearGradient(0,0,0,this.height*.61);
    gradient.addColorStop(0,css(blend(blend([2,9,31],[28,114,204],sky.day),[51,45,105],sky.twilight*.55)));
    gradient.addColorStop(.6,css(blend(blend([8,21,51],[88,172,231],sky.day),[196,107,142],sky.twilight*.8)));
    gradient.addColorStop(1,css(blend(blend([22,34,66],[200,222,226],sky.day),[255,168,88],sky.twilight)));
    c.fillStyle=gradient;c.fillRect(0,0,this.width,this.height);this.coordinates(c);
    for(const s of this.stars){const opacity=smoothstep(s.brightness*.5,.65+s.brightness*.35,sky.stars);if(opacity<=0)continue;
      const distance=Math.hypot(s.x-moon.x,s.y-moon.y);
      c.globalAlpha=opacity*(.72+(motion?.12*Math.sin(seconds*.17+s.x*100):0))*(1-state.illumination.fraction*.55*(1-smoothstep(0,.15,distance)));
      c.fillStyle='#e5efff';c.beginPath();c.arc(s.x*WIDTH,s.y*HEIGHT,s.size,0,TAU);c.fill();
    }c.globalAlpha=1;
    const sx=sun.x*WIDTH,sy=sun.y*HEIGHT,mx=moon.x*WIDTH,my=moon.y*HEIGHT;
    if(state.sun.altitude>-.06){
      const glow=c.createRadialGradient(sx,sy,10,sx,sy,190);glow.addColorStop(0,'#ffe3a688');glow.addColorStop(1,'#ffd98700');c.fillStyle=glow;c.fillRect(sx-190,sy-190,380,380);
      c.fillStyle=sky.twilight>.2?'#fff1b0':'#fff8d4';c.beginPath();c.arc(sx,sy,25,0,TAU);c.fill();
    }
    if(state.moon.altitude>0){
      const glow=c.createRadialGradient(mx,my,15,mx,my,100);glow.addColorStop(0,`rgba(222,229,245,${state.illumination.fraction*.2*(1-sky.day)})`);glow.addColorStop(1,'#cadfff00');c.fillStyle=glow;c.fillRect(mx-100,my-100,200,200);
      c.save();c.globalAlpha=.25+.75*(1-sky.day);this.moon(c,state,mx,my,22);c.restore();
    }
    c.setTransform(1,0,0,1,0,0);
    const cloudShift=motion?Math.sin(seconds*.006)*10:0;
    c.drawImage(this.clouds,cloudShift*this.scale,0);c.drawImage(this.terrain,0,0);
    if(!this.assets)return;
    // Only the lower part of this persistent buffer is drawn. Alpha mask includes
    // the exact riverbanks and intervening trees; light can never land on the forest.
    const w=this.water.getContext('2d')!;w.setTransform(1,0,0,1,0,0);w.clearRect(0,0,this.width,this.height);this.coordinates(w);
    const water=w.createLinearGradient(0,HEIGHT*.6,0,HEIGHT);
    water.addColorStop(0,css(blend(blend([13,35,69],[113,179,199],sky.day),[201,133,143],sky.twilight*.55)));
    water.addColorStop(1,css(blend(blend([9,28,58],[48,123,155],sky.day),[177,124,135],sky.twilight*.4)));
    w.fillStyle=water;w.fillRect(0,HEIGHT*.57,WIDTH,HEIGHT);
    w.save();w.translate(motion?Math.sin(seconds*.3)*1.5:0,HEIGHT*1.30);w.scale(1,-1);w.globalAlpha=.24;w.drawImage(this.terrain,0,0,this.width,this.height,0,0,WIDTH,HEIGHT);w.restore();
    for(let i=0;i<44;i++){
      const y=HEIGHT*(.6+i*.009),p=i/44;
      const shift=motion?Math.sin(seconds*.45+i*1.7)*(2+p*7):0;
      w.strokeStyle=sky.day>.5?'#c8edf1':'#7799be';w.globalAlpha=.04+p*.045;w.lineWidth=.6+p*1.5;w.beginPath();w.moveTo(-100+shift,y);w.lineTo(1100+shift,y+.5);w.stroke();
    }
    const reflect=(p:{x:number;y:number},radius:number,altitude:number,brightness:number,fill:string)=>{
      const visibility=discVisibility(p.x,p.y,radius/HEIGHT,altitude)*this.cloudTransmission(p.x,p.y,cloudShift);
      if(visibility===0||brightness<.001)return;
      w.strokeStyle=fill;w.lineCap='round';
      for(let i=0;i<50;i++){
        const y=HEIGHT*(.6+i*.008),perspective=(y/HEIGHT-.59)/.41;
        const shift=motion?Math.sin(seconds*.6+i*1.9)*(.8+perspective*5):0;
        const x=500+(p.x-.5)*(150+perspective*1250)+shift;
        const half=5+perspective*(18+50*(1-smoothstep(0,.65,altitude)));
        w.globalAlpha=brightness*visibility*(.16+.28*(1-perspective))*(.7+.3*Math.sin(i*2.4+(motion?seconds*.5:0)));
        w.lineWidth=1+perspective*3;w.beginPath();w.moveTo(x-half,y);w.lineTo(x+half,y);w.stroke();
      }
    };
    reflect(sun,25,state.sun.altitude,sky.day,'#ffe4ab');reflect(moon,22,state.moon.altitude,state.illumination.fraction*(1-sky.day),'#d3e7ff');
    w.globalAlpha=1;w.globalCompositeOperation='destination-in';w.drawImage(this.assets.water,0,0,WIDTH,HEIGHT);w.globalCompositeOperation='source-over';
    c.setTransform(1,0,0,1,0,0);c.drawImage(this.water,0,0);
    // Feathered valley mist, driven by the same light; no per-frame blur filters.
    this.coordinates(c);const mist=c.createLinearGradient(0,HEIGHT*.56,0,HEIGHT*.78);
    mist.addColorStop(0,'transparent');mist.addColorStop(.5,`rgba(185,204,220,${sky.fog*.15})`);mist.addColorStop(1,'transparent');c.fillStyle=mist;c.fillRect(0,HEIGHT*.56,WIDTH,HEIGHT*.22);
  }
}
