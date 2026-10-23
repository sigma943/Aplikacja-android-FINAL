import {projectCelestial,skyState,smoothstep,type AstronomyState} from './landscape-astronomy';
import horizon from './landscape-horizon.json';
const TAU=Math.PI*2,WIDTH=1000,HEIGHT=1000*1850/850;
const blend=(a:number[],b:number[],t:number)=>a.map((v,i)=>v+(b[i]-v)*t);
const css=(c:number[])=>`rgb(${c.map(Math.round).join(',')})`;
export const cloudOffset=(seconds:number)=>((seconds*12)%WIDTH+WIDTH)%WIDTH;
/** Two gentle crossing wave trains; dimensions increase towards the viewer. */
export function waterWave(x:number,y:number,seconds:number){
  const depth=smoothstep(.59,.94,y/HEIGHT);
  return Math.sin(x*.025+y*.052-seconds*1.2)*(2.8+depth*6.2)+Math.sin(x*.049-y*.019+seconds*.76)*(1.4+depth*3.2);
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
export type LandscapeAssets={terrain:CanvasImageSource;clouds:CanvasImageSource;water:CanvasImageSource;cloudAlpha?:Uint8ClampedArray};
/** One neutral illustrated terrain cutout, one cloud layer and a mask extracted from
 * the terrain's transparent river. All times use these SAME assets and geometry. */
export class LandscapeRenderer{
  private ctx:CanvasRenderingContext2D;
  private terrain:HTMLCanvasElement;
  private clouds:HTMLCanvasElement;
  private water:HTMLCanvasElement;
  private surface:HTMLCanvasElement;
  private surfacePixels:ImageData;
  private lastLight='';
  private width=1;private height=1;private scale=1;private offsetX=0;private offsetY=0;
  private assets:LandscapeAssets|null=null;
  private ambientSeconds=0;
  private stars=Array.from({length:180},(_,i)=>{const r=(n:number)=>((Math.sin(n*127.1)*43758.5453)%1+1)%1;return{x:r(i+1),y:r(i+72)*.46,size:.4+r(i+17),brightness:r(i+45)};});
  constructor(private canvas:HTMLCanvasElement){
    this.ctx=canvas.getContext('2d',{alpha:false})!;
    this.surface=document.createElement('canvas');this.surface.width=192;this.surface.height=192;
    this.surfacePixels=this.surface.getContext('2d')!.createImageData(192,192);
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
    c.closePath();c.fill();c.clip();c.globalAlpha=opacity*.15;c.fillStyle='#66717b';
    for(const [dx,dy,rr] of [[-.2,.3,.2],[.4,-.25,.24],[-.3,-.5,.13],[.3,.5,.1],[.1,-.05,.18]]){c.beginPath();c.arc(dx*radius,dy*radius,rr*radius,0,TAU);c.fill();}
    c.restore();
  }
  render(state:AstronomyState,seconds:number,motion:boolean){
    if(motion)this.ambientSeconds=seconds;
    seconds=this.ambientSeconds;
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
    const cloudShift=cloudOffset(seconds);
    // Seamless, steady drift rather than oscillating the whole sky in place.
    c.drawImage(this.clouds,cloudShift*this.scale,0);
    c.drawImage(this.clouds,(cloudShift-WIDTH)*this.scale,0);c.drawImage(this.terrain,0,0);
    if(!this.assets)return;
    // Only the lower part of this persistent buffer is drawn. Alpha mask includes
    // the exact riverbanks and intervening trees; light can never land on the forest.
    const w=this.water.getContext('2d')!;w.setTransform(1,0,0,1,0,0);w.clearRect(0,0,this.width,this.height);this.coordinates(w);
    const water=w.createLinearGradient(0,HEIGHT*.6,0,HEIGHT);
    water.addColorStop(0,css(blend(blend([13,35,69],[113,179,199],sky.day),[201,133,143],sky.twilight*.55)));
    water.addColorStop(1,css(blend(blend([9,28,58],[48,123,155],sky.day),[177,124,135],sky.twilight*.4)));
    w.fillStyle=water;w.fillRect(0,HEIGHT*.57,WIDTH,HEIGHT);
    // Ripple the reflected terrain in narrow strips, reusing the existing texture.
    w.globalAlpha=.40;
    for(let i=0;i<108;i++){
      const y=HEIGHT*(.59+i*.0039),band=HEIGHT*.0039;
      const sourceY=HEIGHT*1.30-y-band+waterWave(300,y,seconds)*1.5;
      if(sourceY<0)continue;
      w.save();w.translate(waterWave(480,y,seconds)*2.2,y+band);w.scale(1,-1);
      const sy=(sourceY*this.scale+this.offsetY)/this.height*this.terrain.height;
      w.drawImage(this.terrain,0,Math.max(0,sy),this.width,Math.max(1,band*this.scale),0,0,WIDTH,band);w.restore();
    }
    // Evaluate a moving normal field over the ENTIRE river, rather than animating
    // the opacity of fixed strokes. Low-resolution shading is bilinearly enlarged;
    // the full-resolution bank mask and reflected terrain keep the illustration crisp.
    const pixels=this.surfacePixels.data;
    const sunPower=sky.day*discVisibility(sun.x,sun.y,25/HEIGHT,state.sun.altitude)*this.cloudTransmission(sun.x,sun.y,cloudShift);
    const moonPower=state.illumination.fraction*(1-sky.day)*discVisibility(moon.x,moon.y,22/HEIGHT,state.moon.altitude)*this.cloudTransmission(moon.x,moon.y,cloudShift);
    const light=moonPower>sunPower?moon:sun,power=Math.max(sunPower,moonPower),lunar=moonPower>sunPower;
    for(let row=0;row<192;row++){
      const depth=row/191,y=HEIGHT*(.57+.43*depth),perspective=.16+.84*depth;
      for(let col=0;col<192;col++){
        const x=col/191*WIDTH;
        // Crossing travelling waves, with wavelengths increasing towards the eye.
        const u=x/(22+depth*48),v=(y-HEIGHT*.57)/(5+depth*13);
        const a=Math.sin(u+v-seconds*2.1),b=Math.sin(u*1.73-v*.82+seconds*1.43);
        const ripple=Math.sin(u*3.1+v*2.8-seconds*3.2);
        const nx=a*.57+b*.28+ripple*.15;
        const ny=Math.cos(u*.48+v-seconds*1.8)*.58+Math.cos(u*1.7-v*1.3+seconds*1.15)*.42;
        const axis=500+(light.x-.5)*(150+depth*1250);
        const distance=(x-axis)/(110+perspective*340);
        // Wave normals break the light path into flowing silver/gold facets.
        const reflected=distance+nx*.95;
        const lobe=Math.exp(-reflected*reflected*1.25);
        const facet=Math.pow(Math.max(0,1-Math.abs(ny*.86+nx*.21)),7);
        const specular=power*lobe*(.13+facet*.87)*(1-depth*.28);
        const crest=(nx*.5+ny*.5)*(.025+.055*depth);
        const ambient=.045+crest+Math.pow(Math.max(0,ny*.8+nx*.2),4)*(.15+.08*sky.day);
        const strength=Math.min(.94,Math.max(.005,ambient+specular*.85));
        const index=(row*192+col)*4;
        pixels[index]=lunar?202:Math.round(160+95*specular);
        pixels[index+1]=lunar?226:Math.round(204+29*specular);
        pixels[index+2]=lunar?255:Math.round(229-68*specular);
        pixels[index+3]=Math.round(strength*255);
      }
    }
    this.surface.getContext('2d')!.putImageData(this.surfacePixels,0,0);
    w.globalAlpha=1;w.imageSmoothingEnabled=true;w.drawImage(this.surface,0,HEIGHT*.57,WIDTH,HEIGHT*.43);
    w.globalAlpha=1;w.globalCompositeOperation='destination-in';w.drawImage(this.assets.water,0,0,WIDTH,HEIGHT);w.globalCompositeOperation='source-over';
    c.setTransform(1,0,0,1,0,0);c.drawImage(this.water,0,0);
    // Feathered valley mist, driven by the same light; no per-frame blur filters.
    this.coordinates(c);const mist=c.createLinearGradient(0,HEIGHT*.56,0,HEIGHT*.78);
    mist.addColorStop(0,'transparent');mist.addColorStop(.5,`rgba(185,204,220,${sky.fog*.15})`);mist.addColorStop(1,'transparent');c.fillStyle=mist;c.fillRect(0,HEIGHT*.56,WIDTH,HEIGHT*.22);
  }
}
