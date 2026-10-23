import {projectCelestial,skyState,smoothstep,type AstronomyState} from './landscape-astronomy';

type Point=[number,number];
const TAU=Math.PI*2;
function random(seed:number){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const rgb=(a:number[],b:number[],t:number)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
const color=(night:number[],day:number[],d:number,warm=0)=>{const c=rgb(night,day,d);return `rgb(${rgb(c,[Math.min(255,c[0]+65),Math.min(255,c[1]+16),Math.max(0,c[2]-25)],warm).join(',')})`;};
const ridge:Point[]=[[-.8,.56],[0,.53],[.07,.52],[.13,.493],[.19,.47],[.24,.498],[.30,.51],[.36,.537],[.43,.525],[.49,.542],[.56,.518],[.65,.49],[.71,.51],[.78,.535],[.86,.52],[.94,.542],[1.8,.54]];
export function mountainHorizon(x:number){
  for(let i=1;i<ridge.length;i++)if(x<=ridge[i][0]){const a=ridge[i-1],b=ridge[i];return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);}
  return .54;
}
/** Fraction of a disc above the decorative ridge. The Canvas clip supplies the exact silhouette. */
export function discVisibility(x:number,y:number,r:number,altitude:number){
  if(altitude<=0||x<-.1||x>1.1)return 0;
  const z=Math.max(-1,Math.min(1,(mountainHorizon(x)-y)/r));
  return (.5+(Math.asin(z)+z*Math.sqrt(1-z*z))/Math.PI)*smoothstep(0,.003,altitude);
}
const waterOutline='M 556 1400 C 703 1400 845 1428 676 1476 C 540 1514 811 1511 926 1552 C 1120 1635 414 1625 654 1753 C 793 1812 482 1917 315 2100 L 732 2100 C 801 1986 1115 1863 848 1768 C 597 1671 1154 1664 1000 1558 C 862 1486 682 1520 756 1472 C 839 1424 669 1396 556 1400 Z';
export const WATER_OUTLINE=waterOutline;

/** Fixed seeded illustration. Terrain is cached; no regenerated trees or per-frame bitmaps. */
export class LandscapeRenderer{
  private canvas:HTMLCanvasElement;
  private ctx:CanvasRenderingContext2D;
  private terrain:HTMLCanvasElement;
  private terrainCtx:CanvasRenderingContext2D;
  private water=new Path2D(waterOutline);
  private lastLight=-10;
  private lastMoon=-10;
  private lastWarm=-10;
  private width=1000;
  private height=2100;
  private scale=1;
  private offsetX=0;
  private offsetY=0;
  private stars=Array.from({length:160},(_,i)=>{const r=random(99+i*47);return{x:r(),y:r()*.48,size:.35+r()*.9,brightness:r()};});
  private clouds=Array.from({length:75},(_,i)=>{const r=random(175+i*93);return{x:r()*1350-175,y:50+r()*900,w:25+r()*90,h:7+r()*27};});
  private trees=Array.from({length:1800},(_,i)=>{const r=random(943+i*19);return{x:r()*1600-300,y:1240+r()*900,size:4+r()*20,shade:r()};});
  constructor(canvas:HTMLCanvasElement){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false})!;
    this.terrain=document.createElement('canvas');this.terrainCtx=this.terrain.getContext('2d')!;
  }
  resize(w:number,h:number,dpr:number){
    // Cap backing area and density, including on high-DPI Android phones.
    const density=Math.min(dpr,1.5,Math.sqrt(1800000/(w*h)));
    this.canvas.width=Math.round(w*density);this.canvas.height=Math.round(h*density);
    this.terrain.width=this.canvas.width;this.terrain.height=this.canvas.height;
    this.width=this.canvas.width;this.height=this.canvas.height;
    this.scale=Math.min(this.width/1000,this.height/2100);
    this.offsetX=(this.width-1000*this.scale)/2;this.offsetY=this.height-2100*this.scale;
    this.lastLight=-10;
  }
  private coordinates(ctx:CanvasRenderingContext2D){ctx.setTransform(this.scale,0,0,this.scale,this.offsetX,this.offsetY);}
  private polygon(ctx:CanvasRenderingContext2D,points:Point[],fill:string){
    ctx.fillStyle=fill;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();
  }
  private tree(ctx:CanvasRenderingContext2D,x:number,y:number,size:number,fill:string){
    ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(x,y-size);ctx.lineTo(x-size*.24,y-size*.4);ctx.lineTo(x-size*.12,y-size*.45);ctx.lineTo(x-size*.38,y);ctx.lineTo(x+size*.38,y);ctx.lineTo(x+size*.12,y-size*.45);ctx.lineTo(x+size*.24,y-size*.4);ctx.closePath();ctx.fill();
  }
  private renderTerrain(day:number,warm:number,moon:number){
    const c=this.terrainCtx;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,this.width,this.height);this.coordinates(c);
    const light=Math.min(1,day+moon*.1);
    // Distant massif: many separately shaded faces, not a blurred silhouette.
    this.polygon(c,[...ridge.map(([x,y])=>[x*1000,y*2100] as Point),[1800,2100],[-800,2100]],color([14,31,65],[119,159,183],light,warm*.25));
    const r=random(412);
    for(let i=1;i<ridge.length-2;i++){
      const [x,y]=ridge[i],next=ridge[i+1];
      this.polygon(c,[[x*1000,y*2100],[x*1000+(r()-.3)*110,1300],[next[0]*1000,next[1]*2100]],color([21,42,80],[68,112,151],light,warm*.25));
      if(y<.52){
        this.polygon(c,[[x*1000,y*2100],[x*1000-18,y*2100+72],[x*1000+4,y*2100+45],[x*1000+23,y*2100+77],[x*1000+12,y*2100+19]],color([45,63,101],[217,230,221],light,warm*.55));
        for(let j=0;j<14;j++){const dx=r()*80-20,dy=25+r()*175;c.strokeStyle=color([26,45,79],[152,182,190],light,warm*.3);c.lineWidth=1+r()*4;c.beginPath();c.moveTo(x*1000+dx*.12,y*2100+dy*.13);c.lineTo(x*1000+dx,y*2100+dy);c.stroke();}
      }
    }
    // Alternating ridgelines create a winding valley with atmospheric depth.
    for(let band=0;band<6;band++){
      const points:Point[]=[[-800,1250+band*120]];
      for(let x=-600;x<=1800;x+=35){const y=1190+band*105+Math.sin(x*.006+band*1.8)*75+Math.cos(x*.013+band)*20;points.push([x,y]);}
      points.push([1800,2300],[-800,2300]);
      const night=[10-band,30-band*2,58-band*4],dayColor=[70-band*8,126-band*6,139-band*12];
      const path=new Path2D();points.forEach(([x,y],i)=>i?path.lineTo(x,y):path.moveTo(x,y));path.closePath();
      c.fillStyle=color(night,dayColor,light,warm*.35);c.fill(path);
      c.save();c.clip(path);
      for(let j=0;j<210;j++){
        const x=r()*2200-600,y=1160+band*109+r()*135,size=5+band*2+r()*13;
        this.tree(c,x,y,size,color(night,[52-band*5,103-band*4,108-band*9],light,warm*.22));
      }
      c.restore();
      // Narrow valley mist, cached with the light. No expensive live blur.
      const fog=c.createLinearGradient(0,1270+band*105,0,1325+band*105);
      fog.addColorStop(0,'transparent');fog.addColorStop(.6,color([38,56,94],[192,212,202],light,warm*.6));fog.addColorStop(1,'transparent');
      c.globalAlpha=.16+warm*.15;c.fillStyle=fog;c.fillRect(-800,1250+band*105,2600,90);c.globalAlpha=1;
    }
    // Lake/river geometry is shared by base water and clipped live reflections.
    c.fillStyle=color([15,43,79],[96,168,190],light,warm*.28);c.fill(this.water);
    c.save();c.clip(this.water);
    for(let i=0;i<100;i++){
      const y=1390+r()*740;c.strokeStyle=color([22,51,88],[166,208,206],light,warm*.4);c.globalAlpha=.12+r()*.25;c.lineWidth=1+r()*3;c.beginPath();c.moveTo(-200,y);c.lineTo(1300,y+3);c.stroke();
    }c.restore();c.globalAlpha=1;
    // Foreground forest frame, leaving the river open.
    const left=new Path2D('M-800 1490 Q-100 1460 110 1660 Q240 1750 360 2100 L-800 2400Z');
    const right=new Path2D('M1800 1570 Q1250 1480 943 1750 Q835 1900 795 2100 L1800 2400Z');
    for(const path of [left,right]){
      c.fillStyle=color([5,20,32],[24,69,59],light,warm*.14);c.fill(path);c.save();c.clip(path);
      for(const t of this.trees)this.tree(c,t.x,t.y,t.size*(.5+t.y/1300),color([5+12*t.shade,21+12*t.shade,32+14*t.shade],[24+t.shade*38,72+t.shade*40,59+t.shade*12],light,warm*.4));
      c.restore();
    }
    // Fine evergreen silhouettes and leafy branches in the closest plane.
    for(let i=0;i<23;i++){
      const x=i<14?-60+i*29:840+(i-14)*28,y=2040+r()*100;
      this.tree(c,x,y,115+r()*185,color([3,16,23],[16,53,44],light,warm*.12));
    }
    for(const side of [-1,1])for(let i=0;i<70;i++){
      const x=(side===-1?20:980)+side*(r()*100-50),y=1850+r()*290;
      c.fillStyle=color([9,29,33],[40+r()*45,92+r()*50,42+r()*24],light,warm*.4);
      c.beginPath();c.ellipse(x,y,8+r()*18,4+r()*8,side*.7,0,TAU);c.fill();
    }
  }
  private moon(c:CanvasRenderingContext2D,state:AstronomyState,x:number,y:number,radius:number){
    const f=state.illumination.fraction;
    c.save();c.translate(x,y);
    // SunCalc's bright limb angle minus parallactic angle is anticlockwise from zenith.
    c.rotate(-(state.illumination.angle-state.moon.parallacticAngle)-Math.PI/2);
    c.fillStyle='#7184a0';c.globalAlpha=.15;c.beginPath();c.arc(0,0,radius,0,TAU);c.fill();c.globalAlpha=1;
    c.fillStyle='#fff0cf';c.beginPath();
    for(let i=0;i<=64;i++){const v=-1+2*i/64;c.lineTo(radius*Math.sqrt(Math.max(0,1-v*v)),radius*v);}
    for(let i=64;i>=0;i--){const v=-1+2*i/64;c.lineTo(radius*(1-2*f)*Math.sqrt(Math.max(0,1-v*v)),radius*v);}
    c.closePath();c.fill();c.clip();c.globalAlpha=.15;c.fillStyle='#66717b';
    for(const [dx,dy,rr] of [[-.2,.3,.2],[.4,-.25,.24],[-.3,-.5,.13],[.3,.5,.1],[.1,-.05,.18]]){c.beginPath();c.arc(dx*radius,dy*radius,rr*radius,0,TAU);c.fill();}
    c.restore();
  }
  render(state:AstronomyState,seconds:number,motion:boolean){
    const c=this.ctx,sky=skyState(state),sun=projectCelestial(state.sun),moon=projectCelestial(state.moon);
    if(Math.abs(sky.day-this.lastLight)>.0015||Math.abs(sky.moonlight-this.lastMoon)>.015||Math.abs(sky.twilight-this.lastWarm)>.003){this.renderTerrain(sky.day,sky.twilight,sky.moonlight);this.lastLight=sky.day;this.lastMoon=sky.moonlight;this.lastWarm=sky.twilight;}
    c.setTransform(1,0,0,1,0,0);
    const gradient=c.createLinearGradient(0,0,0,this.height*.65);
    gradient.addColorStop(0,color([2,10,34],[29,111,191],sky.day,sky.twilight*.14));
    gradient.addColorStop(.65,color([10,26,59],[94,174,224],sky.day,sky.twilight*.6));
    gradient.addColorStop(1,color([27,37,69],[195,219,222],sky.day,sky.twilight));c.fillStyle=gradient;c.fillRect(0,0,this.width,this.height);
    this.coordinates(c);
    for(const s of this.stars){const opacity=smoothstep(s.brightness*.5,.65+s.brightness*.35,sky.stars);if(opacity<=0)continue;
      c.globalAlpha=opacity*(.65+(motion?.15*Math.sin(seconds*.17+s.x*100):0));c.fillStyle='#e5efff';c.beginPath();c.arc(s.x*1000,s.y*2100,s.size,0,TAU);c.fill();}
    c.globalAlpha=1;
    const sx=sun.x*1000,sy=sun.y*2100,mx=moon.x*1000,my=moon.y*2100;
    if(state.sun.altitude>-.06){
      const glow=c.createRadialGradient(sx,sy,10,sx,sy,210);glow.addColorStop(0,'#ffe3a677');glow.addColorStop(1,'#ffd98700');c.fillStyle=glow;c.fillRect(sx-210,sy-210,420,420);
      c.fillStyle=sky.twilight>.2?'#fff1b0':'#fff8d4';c.beginPath();c.arc(sx,sy,25,0,TAU);c.fill();
    }
    if(state.moon.altitude>0){
      c.globalAlpha=.25+.75*(1-sky.day);
      const glow=c.createRadialGradient(mx,my,15,mx,my,100);glow.addColorStop(0,`rgba(222,229,245,${state.illumination.fraction*.22})`);glow.addColorStop(1,'#cadfff00');c.fillStyle=glow;c.fillRect(mx-100,my-100,200,200);
      this.moon(c,state,mx,my,22);c.globalAlpha=1;
    }
    // Stable cloud silhouettes drift a few pixels, and pass IN FRONT of both bodies.
    for(const cloud of this.clouds){
      const x=cloud.x+(motion?Math.sin(seconds*.006+cloud.y)*12:0);
      c.fillStyle=color([33,49,85],[246,242,224],sky.day,sky.twilight*.8);c.globalAlpha=.7;
      c.beginPath();c.ellipse(x,cloud.y,cloud.w,cloud.h, .13,0,TAU);c.fill();
      c.fillStyle=color([23,39,73],[185,207,223],sky.day,sky.twilight*.4);c.globalAlpha=.55;
      c.beginPath();c.ellipse(x-cloud.w*.1,cloud.y+cloud.h*.6,cloud.w*.95,cloud.h*.55,.13,0,TAU);c.fill();
    }c.globalAlpha=1;
    // Cached terrain occludes celestial discs with the actual mountain silhouette.
    c.setTransform(1,0,0,1,0,0);c.drawImage(this.terrain,0,0);this.coordinates(c);
    c.save();c.clip(this.water);
    const reflect=(p:{x:number;y:number},radius:number,altitude:number,brightness:number,fill:string)=>{
      const visibility=discVisibility(p.x,p.y,radius,altitude);
      if(visibility===0||brightness<.001)return;
      c.strokeStyle=fill;c.lineCap='round';
      for(let i=0;i<48;i++){
        const y=1400+i*15,perspective=(y-1380)/720;
        const shift=motion?Math.sin(seconds*.6+i*1.9)*(.8+perspective*5):0;
        // Project onto a horizontal water plane; shared clipping confines it to the river.
        const x=500+(p.x-.5)*(150+perspective*1250)+shift;
        const half=5+perspective*(18+50*(1-smoothstep(0,.65,altitude)));
        c.globalAlpha=brightness*visibility*(.12+.24*(1-perspective))*(.7+.3*Math.sin(i*2.4+(motion?seconds*.5:0)));
        c.lineWidth=1+perspective*3;c.beginPath();c.moveTo(x-half,y);c.lineTo(x+half,y);c.stroke();
      }
    };
    reflect(sun,25/2100,state.sun.altitude,sky.day,'#ffdf9b');
    reflect(moon,22/2100,state.moon.altitude,state.illumination.fraction*(1-sky.day),'#d3e7ff');
    c.restore();c.globalAlpha=1;
  }
}
