'use client';
import {useEffect,useRef} from 'react';
import {App} from '@capacitor/app';
import {Capacitor,registerPlugin,type PluginListenerHandle} from '@capacitor/core';
import {LANDSCAPE_LOCATION_KEY,landscapeLocation,interpolateAstronomy,type AstronomyState} from '@/lib/landscape-astronomy';
import {landscapeOptics,landscapeViewport,type LandscapeViewport} from '@/lib/landscape-optics';
import {landscapePalette,isLandscapeDay} from '@/lib/landscape-palette';
import {WATER_QUALITY,type WaterQuality} from '@/lib/landscape-water-gpu';
import {LandscapeRenderer} from '@/lib/landscape-renderer';
import {INTERFACE_APPEARANCE_KEY,normalizeInterfaceAppearance} from '@/lib/interface-appearance';
import {landscapeMotionPolicy,landscapeFrameBudget} from '@/lib/landscape-motion';

const PowerPolicy=registerPlugin<{
  getStatus():Promise<{limited:boolean;critical?:boolean}>;
  addListener(event:'powerPolicy',callback:(state:{limited:boolean;critical?:boolean})=>void):Promise<PluginListenerHandle>;
}>('LandscapePowerPolicy');
type Preview={iso?:string;rate?:number};
type DebugWindow=Window&{__landscapeCapture?:()=>HTMLCanvasElement;__landscapePreview?:(value:Preview)=>void;__landscapeDiagnostics?:()=>unknown;__landscapeTestPower?:(limited:boolean,critical?:boolean)=>void};

/** This component owns its draw loop. Astronomy never updates application React state. */
export default function DynamicLandscape({active,glass=true}:{active:boolean;glass?:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    if(!active||!canvas.current)return;
    const element=canvas.current,root=document.documentElement;
    const renderer=new LandscapeRenderer(element,true),media=matchMedia('(prefers-reduced-motion: reduce)');
    const worker=new Worker(new URL('../lib/landscape.worker.ts',import.meta.url));
    let quality:WaterQuality=(navigator.hardwareConcurrency||4)<=4?'medium':'high',badFrames=0,lastQualityChange=0,lastGlass=0;
    let alive=true,sceneVisible=true,nativeActive=true,limited=false,critical=false,requestId=0;
    let solarDay:boolean|undefined;
    let samples:{a:AstronomyState;b:AstronomyState}|null=null;
    let events:Record<string,number|null>={},source='default-rzeszow';
    let frameRequest=0,nextFrame=0;
    let drawTimer:ReturnType<typeof setTimeout>|undefined,modelTimer:ReturnType<typeof setTimeout>|undefined;
    let slow=false,frameCost=0,lastWall=Date.now(),lastMono=performance.now(),frames=0,totalMs=0,maxMs=0;
    let preview:Preview={},previewStart=0,previewMono=0;
    const previewEnabled=process.env.NODE_ENV==='development'||process.env.NEXT_PUBLIC_LANDSCAPE_PREVIEW==='true';
    const now=()=>preview.iso?previewStart+(performance.now()-previewMono)*(preview.rate??1):Date.now();
    const visible=()=>!document.hidden&&nativeActive&&sceneVisible;
    let reduced=false,light=false;
    const readPreferences=()=>{
      reduced=false;light=false;
      try{reduced=normalizeInterfaceAppearance(JSON.parse(localStorage.getItem(INTERFACE_APPEARANCE_KEY)||'{}')).reducedMotion;light=localStorage.getItem('mks_light_effects')==='true';}catch{}
    };readPreferences();
    const policy=()=>landscapeMotionPolicy({hidden:document.hidden,nativeActive,reduced:media.matches||reduced,light,limited,critical,slow});
    let paletteKeys:string[]=[];
    const updatePalette=(state:AstronomyState)=>{
      let appearance=normalizeInterfaceAppearance(null),accent='#00a3a2',light=false;
      try{appearance=normalizeInterfaceAppearance(JSON.parse(localStorage.getItem(INTERFACE_APPEARANCE_KEY)||'{}'));accent=localStorage.getItem('mks_theme')||accent;light=localStorage.getItem('mks_light_effects')==='true';}catch{}
      const transparent=glass&&!light;
      root.dataset.landscapeGlass=transparent?'on':'off';
      const opacity=transparent?appearance.glassOpacity:100;
      const palette={...landscapePalette(state,opacity,solarDay,appearance,accent),...landscapeOptics(state,opacity,transparent)};
      paletteKeys=Object.keys(palette);
      for(const [key,value] of Object.entries(palette))root.style.setProperty(key,value);
    };
    const updateModel=()=>{
      clearTimeout(modelTimer);if(!visible()||!alive)return;
      let value:unknown=null;try{value=JSON.parse(localStorage.getItem(LANDSCAPE_LOCATION_KEY)||'null');}catch{}
      const location=landscapeLocation(value);source=location.source;
      const ms=now();worker.postMessage({ms,location,id:++requestId,span:Math.max(30000,(preview.rate??1)*1000)});
      modelTimer=setTimeout(updateModel,preview.iso&&preview.rate!==1?500:15000);
    };
    let lastWindows=0,lastDraw=performance.now(),fpsStart=performance.now(),fpsFrames=0,actualFps=0;
    const paintWindows=(mono:number)=>{
      if(mono-lastWindows<250)return;lastWindows=mono;
      // Read layout before resizing any bitmap. Small copies preserve the same
      // sky/water and solar lighting without another animated scene per sheet.
      const windows=Array.from(document.querySelectorAll<HTMLCanvasElement>('[data-landscape-window]')).map(target=>({target,rect:target.getBoundingClientRect()}));
      for(const {target,rect} of windows){
        if(!rect.width||!rect.height)continue;
        const width=Math.ceil(Math.min(rect.width,600)),height=Math.ceil(rect.height*width/rect.width);
        if(target.width!==width||target.height!==height){target.width=width;target.height=height;}
        const context=target.getContext('2d',{alpha:false});if(!context)continue;
        const kind=target.dataset.landscapeWindow;
        const sw=Math.min(element.width,element.height*width/height),sh=sw*height/width;
        const top=kind==='filter'?.07:kind==='navigation'?.20:.34;
        renderer.copyWindow(context,(element.width-sw)/2,Math.min(element.height-sh,element.height*top),sw,sh,width,height);
        target.dataset.sceneReady=element.dataset.assetsReady==='true'?'true':'false';
      }
    };
    const refreshWindows=()=>{lastWindows=0;paintWindows(performance.now()+250);};
    window.addEventListener('pks-landscape-window',refreshWindows);
    const draw=()=>{
      clearTimeout(drawTimer);cancelAnimationFrame(frameRequest);if(!visible()||!alive)return;
      const mono=performance.now(),wall=Date.now(),motionPolicy=policy();
      element.dataset.motion=motionPolicy.reason;root.dataset.landscapeMotion=motionPolicy.animate?'on':'off';
      // Date/time, DST and timezone edits are reflected without modifying timetable clocks.
      if(Math.abs((wall-lastWall)-(mono-lastMono))>5000)updateModel();
      lastWall=wall;lastMono=mono;
      if(samples){
        const start=performance.now(),state=interpolateAstronomy(samples.a,samples.b,now());
        renderer.quality=limited||slow||motionPolicy.reason==='light-effects'?'low':quality;
        renderer.render(state,mono/1000,motionPolicy.animate);
        if(mono-lastGlass>=250&&renderer.lighting){
          lastGlass=mono;updatePalette(state);
        }
        paintWindows(mono);
        const cost=performance.now()-start;frames++;fpsFrames++;if(mono-fpsStart>=1000){actualFps=fpsFrames*1000/(mono-fpsStart);fpsFrames=0;fpsStart=mono;}totalMs+=cost;maxMs=Math.max(maxMs,cost);
        if(frames>10&&motionPolicy.reason==='active'){
          frameCost=landscapeFrameBudget(frameCost,cost);
          const budget=1000/WATER_QUALITY[renderer.quality].fps;
          // Include late timer delivery: asynchronous GPU pressure may not show in JS draw cost.
          badFrames=cost>budget*.8||renderer.getGpuMs()>budget*.8||mono-lastDraw>budget*1.65?badFrames+1:Math.max(0,badFrames-1);
          if(badFrames>=18&&mono-lastQualityChange>5000){quality=quality==='high'?'medium':'low';lastQualityChange=mono;badFrames=0;}
          slow=quality==='low';
        }
      }
      lastDraw=mono;
      const next=policy();
      const interval=next.reason==='active'?1000/WATER_QUALITY[renderer.quality].fps:next.interval;
      if(next.animate){
        const due=nextFrame||mono;
        nextFrame=due+Math.max(1,Math.floor((mono-due)/interval)+1)*interval;
        frameRequest=requestAnimationFrame(tick);
      }else drawTimer=setTimeout(draw,next.interval);
    };
    const tick=(mono:number)=>{
      frameRequest=0;if(!visible()||!alive)return;
      if(mono+.5>=nextFrame)draw();else frameRequest=requestAnimationFrame(tick);
    };
    const image=(name:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{
      const value=new Image();value.onload=()=>resolve(value);value.onerror=()=>reject(new Error(name));value.src='/themes/mountains/'+name;
    });
    void Promise.all([image('terrain.webp'),image('clouds.webp'),image('water-mask.png'),image('water-uv.png').catch(()=>undefined),image('water-perspective.png').catch(()=>undefined)]).then(([terrain,clouds,water,geometry,perspective])=>{
      if(!alive)return;
      const mask=document.createElement('canvas');mask.width=850;mask.height=1850;
      const context=mask.getContext('2d',{willReadFrequently:true})!;context.drawImage(clouds,0,0,850,1850);
      const rgba=context.getImageData(0,0,850,1850).data,alpha=new Uint8ClampedArray(850*1850);
      for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];
      renderer.setAssets({terrain,clouds,water,geometry,perspective,cloudAlpha:alpha});element.dataset.assetsReady='true';draw();
    }).catch(()=>{if(alive)element.dataset.renderError='landscape-assets';});
    worker.onmessage=event=>{
      if(!alive||event.data.id!==requestId)return;
      samples=event.data;events=event.data.events;
      solarDay=isLandscapeDay(samples!.a,solarDay);
      updatePalette(samples!.a);
      const period=solarDay?'day':'night';
      if(root.dataset.landscapePeriod!==period){root.dataset.landscapePeriod=period;window.dispatchEvent(new Event('pks-landscape-period'));}
      draw();
    };
    worker.onerror=()=>{element.dataset.renderError='astronomy-worker';};
    let viewport:LandscapeViewport|undefined;
    const resize=()=>{
      const rect=element.parentElement!.getBoundingClientRect();
      const editing=document.activeElement?.matches('input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]),textarea,[contenteditable="true"]')??false;
      const height=editing||viewport?.keyboard?Math.min(rect.height,window.visualViewport?.height||rect.height):rect.height;
      if(rect.width&&height){
        const next=landscapeViewport(viewport,{width:rect.width,height},editing);
        if(!viewport||next.width!==viewport.width||next.height!==viewport.height)renderer.resize(next.width,next.height,devicePixelRatio||1);
        viewport=next;element.style.height=next.height+'px';element.dataset.keyboard=String(next.keyboard);
      }
      draw();
    };
    const restart=()=>{readPreferences();cancelAnimationFrame(frameRequest);nextFrame=0;fpsStart=performance.now();fpsFrames=0;if(samples)updatePalette(samples.a);clearTimeout(drawTimer);clearTimeout(modelTimer);root.dataset.landscapeMotion=visible()&&policy().animate?'on':'off';if(visible()){lastDraw=performance.now();lastGlass=0;updateModel();draw();}else renderer.suspend();};
    const intersection=new IntersectionObserver(entries=>{const next=entries.some(entry=>entry.isIntersecting);if(next!==sceneVisible){sceneVisible=next;restart();}});intersection.observe(element);
    const observer=new ResizeObserver(resize);observer.observe(element.parentElement!);
    window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
    document.addEventListener('focusin',resize);
    document.addEventListener('visibilitychange',restart);
    window.addEventListener('focus',restart);window.addEventListener('pks-interface-appearance',restart);
    window.addEventListener('storage',restart);window.addEventListener('pks-landscape-location',restart);
    media.addEventListener('change',restart);
    const listeners:Promise<PluginListenerHandle>[]=[];
    if(Capacitor.isNativePlatform()){
      listeners.push(App.addListener('appStateChange',state=>{nativeActive=state.isActive;restart();}));
      listeners.push(PowerPolicy.addListener('powerPolicy',state=>{limited=state.limited;critical=!!state.critical;restart();}).catch(()=>({remove:async()=>{}})));
      // An unavailable native bridge selects a conservative LIVE mode, not a
      // permanently frozen world. Confirmed severe thermal status can still pause.
      void PowerPolicy.getStatus().then(state=>{if(alive){limited=state.limited;critical=!!state.critical;restart();}}).catch(()=>{if(alive){limited=true;restart();}});
    }
    const debug=window as DebugWindow;
    if(previewEnabled){
      debug.__landscapeCapture=()=>{const target=document.createElement('canvas');target.width=element.width;target.height=element.height;renderer.copyWindow(target.getContext('2d')!,0,0,element.width,element.height,target.width,target.height);return target;};
      debug.__landscapePreview=value=>{preview=value;previewStart=Date.parse(value.iso||'');previewMono=performance.now();if(value.iso&&!Number.isFinite(previewStart)){preview={};}samples=null;restart();};
      debug.__landscapeTestPower=(next,isCritical=false)=>{limited=next;critical=isCritical;restart();};
      debug.__landscapeDiagnostics=()=>({frames,actualFps,averageDrawMs:frames?totalMs/frames:0,maxDrawMs:maxMs,smoothedDrawMs:frameCost,interval:policy().reason==='active'?1000/WATER_QUALITY[renderer.quality].fps:policy().interval,motion:policy().reason,visible:visible(),source,events,samples,preview,viewport,canvasPixels:element.width*element.height,renderer:renderer.diagnostics()});
    }
    root.dataset.landscapeTheme='on';resize();updateModel();
    return()=>{
      window.removeEventListener('pks-landscape-window',refreshWindows);
      alive=false;cancelAnimationFrame(frameRequest);renderer.dispose();clearTimeout(drawTimer);clearTimeout(modelTimer);worker.terminate();observer.disconnect();intersection.disconnect();window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);document.removeEventListener('focusin',resize);
      document.removeEventListener('visibilitychange',restart);window.removeEventListener('focus',restart);
      window.removeEventListener('pks-interface-appearance',restart);window.removeEventListener('storage',restart);window.removeEventListener('pks-landscape-location',restart);media.removeEventListener('change',restart);
      for(const listener of listeners)void listener.then(handle=>handle.remove());
      delete debug.__landscapeCapture;delete debug.__landscapePreview;delete debug.__landscapeDiagnostics;
      delete debug.__landscapeTestPower;delete root.dataset.landscapeMotion;
      delete root.dataset.landscapeTheme;delete root.dataset.landscapePeriod;delete root.dataset.landscapeGlass;for(const key of paletteKeys)root.style.removeProperty(key);
    };
  },[active,glass]);
  return active?<canvas ref={canvas} data-landscape-stage aria-hidden="true"/>:null;
}
