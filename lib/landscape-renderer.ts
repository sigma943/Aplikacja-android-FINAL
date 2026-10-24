import {paintSun,moonTexture,MOON_RADIUS} from './landscape-celestial';
import {projectCelestial,smoothstep,type AstronomyState} from './landscape-astronomy';
import {landscapeLighting,type LandscapeLightingState} from './landscape-lighting';
import {LandscapeWaterGPU,type WaterQuality} from './landscape-water-gpu';
export {mountainHorizon,discVisibility} from './landscape-lighting';
const TAU=Math.PI*2,WIDTH=1000,HEIGHT=1000*1850/850;
const blend=(a:number[],b:number[],t:number)=>a.map((v,i)=>v+(b[i]-v)*t);
const css=(c:number[])=>`rgb(${c.map(Math.round).join(',')})`;
export const cloudOffset=(seconds:number)=>((seconds*12)%WIDTH+WIDTH)%WIDTH;
export type LandscapeAssets={terrain:CanvasImageSource;clouds:CanvasImageSource;water:CanvasImageSource;moon?:CanvasImageSource;geometry?:CanvasImageSource;perspective?:CanvasImageSource;cloudAlpha?:Uint8ClampedArray};
/** One neutral illustrated terrain cutout, one cloud layer and a mask extracted from
 * the terrain's transparent river. All times use these SAME assets and geometry. */
export class LandscapeRenderer{
  private ctx:CanvasRenderingContext2D;
  private terrain:HTMLCanvasElement;
  private clouds:HTMLCanvasElement;
  private water:HTMLCanvasElement;
  private gpu:LandscapeWaterGPU|null=null;
  private gpuAttempted=false;
  quality:WaterQuality='high';
  lighting:LandscapeLightingState|null=null;
  private lunarTexture:CanvasImageSource;
  private lastBackground=-Infinity;
  private backgroundFrames=0;
  private lastAstronomy=-Infinity;
  private lastLight='';
  private fallbackKey='';
  private width=1;private height=1;private scale=1;private offsetX=0;private offsetY=0;
  private assets:LandscapeAssets|null=null;
  private ambientSeconds=0;
  private stars=Array.from({length:180},(_,i)=>{const r=(n:number)=>((Math.sin(n*127.1)*43758.5453)%1+1)%1;return{x:r(i+1),y:r(i+72)*.46,size:.4+r(i+17),brightness:r(i+45)};});
  constructor(private canvas:HTMLCanvasElement,private directWater=false){
    this.ctx=canvas.getContext('2d',{alpha:false})!;this.lunarTexture=moonTexture();
    this.terrain=document.createElement('canvas');this.clouds=document.createElement('canvas');this.water=document.createElement('canvas');
  }
  setAssets(assets:LandscapeAssets){this.assets=assets;if(assets.moon)this.lunarTexture=assets.moon;this.lastLight='';this.fallbackKey='';this.lastBackground=-Infinity;this.gpu?.setAssets(assets);}
  suspend(){this.gpu?.suspend();}
  dispose(){this.gpu?.dispose();this.gpu=null;this.assets=null;for(const layer of [this.terrain,this.clouds,this.water])layer.width=layer.height=1;}
  getGpuMs(){return this.gpu?.getGpuMs()??0;}
  diagnostics(){return {quality:this.quality,presentation:this.directWater?'direct-gpu':'composited',backgroundFrames:this.backgroundFrames,lighting:this.lighting,gpu:this.gpu?.diagnostics()};}
  sunScreen(){const sun=this.lighting?.sun;return sun?{x:(sun.x*WIDTH*this.scale+this.offsetX)/this.width,y:(sun.y*HEIGHT*this.scale+this.offsetY)/this.height}:null;}
  resize(w:number,h:number,dpr:number){
    const density=Math.min(dpr,1.25,Math.sqrt(900000/(w*h)));
    this.width=this.canvas.width=Math.round(w*density);this.height=this.canvas.height=Math.round(h*density);
    for(const layer of [this.terrain,this.clouds,this.water]){layer.width=this.width;layer.height=this.height;}
    // Uniform scale; phones crop at most a narrow edge instead of stretching artwork.
    this.scale=Math.max(this.width/WIDTH,this.height/HEIGHT);this.offsetX=(this.width-WIDTH*this.scale)/2;this.offsetY=this.height-HEIGHT*this.scale;this.lastLight='';this.fallbackKey='';this.lastBackground=-Infinity;
  }
  copyWindow(context:CanvasRenderingContext2D,sx:number,sy:number,sw:number,sh:number,width:number,height:number,waterFresh=false){
    context.drawImage(this.canvas,sx,sy,sw,sh,0,0,width,height);
    if(this.directWater&&this.gpu&&this.gpu.diagnostics().available&&!this.gpu.diagnostics().lost){
      // Within the draw task the freshly rendered GPU buffer is still valid.
      // Sheet snapshots share it instead of issuing three extra passes per card.
      if(!waterFresh&&this.lighting)this.gpu.render(this.lighting,{width:this.width,height:this.height,scale:this.scale,x:this.offsetX,y:this.offsetY},this.quality);
      const gx=this.gpu.canvas.width/this.width,gy=this.gpu.canvas.height/this.height;
      context.drawImage(this.gpu.canvas,sx*gx,sy*gy,sw*gx,sh*gy,0,0,width,height);
    }
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
        g.addColorStop(0,`rgba(255,159,81,${warm*(isCloud?.75:.42)})`);g.addColorStop(1,`rgba(170,78,93,${warm*.16})`);c.fillStyle=g;c.fillRect(0,0,WIDTH,HEIGHT);
      }
      c.globalCompositeOperation='source-over';
      if(isCloud){
        // The atlas is not painted as a seamless tile. Feather both ends before
        // repeating it, so passing cloud groups never expose a vertical cut.
        const edge=c.createLinearGradient(0,0,WIDTH,0);
        edge.addColorStop(0,'transparent');edge.addColorStop(.09,'#000');edge.addColorStop(.91,'#000');edge.addColorStop(1,'transparent');
        c.globalCompositeOperation='destination-in';c.fillStyle=edge;c.fillRect(0,0,WIDTH,HEIGHT);c.globalCompositeOperation='source-over';
      }
    }
  }
  private cloudTransmission(x:number,y:number,shift:number){
    const alpha=this.assets?.cloudAlpha;if(!alpha)return 1;
    const px=Math.floor((((x-shift/WIDTH)%1+1)%1)*850),py=Math.floor(y*1850);
    if(py<0||py>=1850)return 1;
    // Average a small patch so fine cloud edges do not abruptly switch a reflection.
    let opacity=0;
    for(const dx of [-4,0,4])for(const dy of [-4,0,4])opacity+=alpha[Math.max(0,Math.min(1849,py+dy))*850+(px+dx+850)%850];
    const edge=smoothstep(0,.09,px/850)*(1-smoothstep(.91,1,px/850));
    return 1-opacity/(9*255)*edge;
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
    c.closePath();c.clip();c.drawImage(this.lunarTexture,-radius,-radius,radius*2,radius*2);
    c.restore();
  }
  render(state:AstronomyState,seconds:number,motion:boolean){
    if(motion)this.ambientSeconds=seconds;
    seconds=this.ambientSeconds;
    const sun=projectCelestial(state.sun),moon=projectCelestial(state.moon);
    const shift=cloudOffset(seconds);
    const lighting=this.lighting=landscapeLighting(state,seconds,this.cloudTransmission(sun.x,sun.y,shift),this.cloudTransmission(moon.x,moon.y,shift));
    const c=this.ctx,sky=lighting.sky;
    if(this.assets&&!this.gpuAttempted){
      this.gpuAttempted=true;this.gpu=new LandscapeWaterGPU();this.gpu.setAssets(this.assets);
      if(this.directWater){this.gpu.canvas.dataset.landscapeWater='';this.gpu.canvas.setAttribute('aria-hidden','true');this.canvas.insertAdjacentElement('afterend',this.gpu.canvas);}
    }
    const gpuReady=this.gpu?.render(lighting,{width:this.width,height:this.height,scale:this.scale,x:this.offsetX,y:this.offsetY},this.quality)??false;
    if(this.directWater&&this.gpu){
      const style=`position:absolute;inset:0;width:100%;height:${this.canvas.style.height||'100%'};z-index:-1;pointer-events:none;visibility:${gpuReady?'visible':'hidden'}`;
      if(this.gpu.canvas.getAttribute('style')!==style)this.gpu.canvas.setAttribute('style',style);
      // The compositor presents water directly: no GPU -> 2D readback on the animation path.
      const jumped=Math.abs(state.ms-this.lastAstronomy)>2000;
      if(!jumped&&seconds-this.lastBackground<1/8)return;
    }
    this.lastBackground=seconds;this.lastAstronomy=state.ms;this.backgroundFrames++;
    const lightKey=[sky.day.toFixed(3),sky.twilight.toFixed(3),sky.moonlight.toFixed(2),sun.x.toFixed(2)].join(':');
    if(lightKey!==this.lastLight){this.relight(sky.day,sky.twilight,sky.moonlight,sun.x);this.lastLight=lightKey;}
    c.setTransform(1,0,0,1,0,0);
    const gradient=c.createLinearGradient(0,0,0,this.height*.61);
    gradient.addColorStop(0,css(blend(blend([2,9,31],[28,114,204],sky.day),[92,47,102],sky.twilight*.8)));
    gradient.addColorStop(.6,css(blend(blend([8,21,51],[88,172,231],sky.day),[224,107,128],sky.twilight*.9)));
    gradient.addColorStop(1,css(blend(blend([22,34,66],[200,222,226],sky.day),[255,148,64],sky.twilight)));
    c.fillStyle=gradient;c.fillRect(0,0,this.width,this.height);this.coordinates(c);
    for(const s of this.stars){const opacity=smoothstep(s.brightness*.5,.65+s.brightness*.35,sky.stars);if(opacity<=0)continue;
      const distance=Math.hypot(s.x-moon.x,s.y-moon.y);
      c.globalAlpha=opacity*(.72+(motion?.12*Math.sin(seconds*.17+s.x*100):0))*(1-state.illumination.fraction*.55*(1-smoothstep(0,.15,distance)));
      c.fillStyle='#e5efff';c.beginPath();c.arc(s.x*WIDTH,s.y*HEIGHT,s.size,0,TAU);c.fill();
    }c.globalAlpha=1;
    const sx=sun.x*WIDTH,sy=sun.y*HEIGHT,mx=moon.x*WIDTH,my=moon.y*HEIGHT;
    if(state.sun.altitude>-.06){
      paintSun(c,sx,sy,sky.twilight);
    }
    if(state.moon.altitude>0){
      const glow=c.createRadialGradient(mx,my,15,mx,my,100);glow.addColorStop(0,`rgba(222,229,245,${state.illumination.fraction*.2*(1-sky.day)})`);glow.addColorStop(1,'#cadfff00');c.fillStyle=glow;c.fillRect(mx-100,my-100,200,200);
      c.save();c.globalAlpha=.25+.75*(1-sky.day);this.moon(c,state,mx,my,MOON_RADIUS);c.restore();
    }
    c.setTransform(1,0,0,1,0,0);
    const cloudShift=cloudOffset(seconds);
    // Seamless, steady drift rather than oscillating the whole sky in place.
    c.drawImage(this.clouds,cloudShift*this.scale,0);
    c.drawImage(this.clouds,(cloudShift-WIDTH)*this.scale,0);c.drawImage(this.terrain,0,0);
    if(!this.assets)return;
    if(gpuReady){if(!this.directWater)c.drawImage(this.gpu!.canvas,0,0,this.width,this.height);}else{
    // Explicit STATIC fallback when WebGL2/assets/context are unavailable.
    // No CPU reflection strips or alternate wave simulation runs here.
    if(this.fallbackKey!==lightKey){
      const w=this.water.getContext('2d')!;w.setTransform(1,0,0,1,0,0);w.clearRect(0,0,this.width,this.height);this.coordinates(w);
      const fill=w.createLinearGradient(0,HEIGHT*.57,0,HEIGHT);
      fill.addColorStop(0,css(blend(blend([13,35,69],[113,179,199],sky.day),[201,133,143],sky.twilight*.55)));
      fill.addColorStop(1,css(blend(blend([9,28,58],[48,123,155],sky.day),[177,124,135],sky.twilight*.4)));
      w.fillStyle=fill;w.fillRect(0,HEIGHT*.57,WIDTH,HEIGHT);w.globalCompositeOperation='destination-in';w.drawImage(this.assets.water,0,0,WIDTH,HEIGHT);w.globalCompositeOperation='source-over';this.fallbackKey=lightKey;
    }
    c.drawImage(this.water,0,0);
    }
    // Feathered valley mist, driven by the same light; no per-frame blur filters.
    this.coordinates(c);const mist=c.createLinearGradient(0,HEIGHT*.56,0,HEIGHT*.78);
    mist.addColorStop(0,'transparent');mist.addColorStop(.5,`rgba(185,204,220,${sky.fog*.15})`);mist.addColorStop(1,'transparent');c.fillStyle=mist;c.fillRect(0,HEIGHT*.56,WIDTH,HEIGHT*.22);
  }
}
