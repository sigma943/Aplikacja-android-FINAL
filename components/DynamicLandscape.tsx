'use client';
import {useEffect,useRef} from 'react';
import {App} from '@capacitor/app';
import {Capacitor,registerPlugin,type PluginListenerHandle} from '@capacitor/core';
import {LANDSCAPE_LOCATION_KEY,landscapeLocation,interpolateAstronomy,type AstronomyState} from '@/lib/landscape-astronomy';
import {landscapePalette,isLandscapeDay} from '@/lib/landscape-palette';
import {LandscapeRenderer} from '@/lib/landscape-renderer';
import {INTERFACE_APPEARANCE_KEY,normalizeInterfaceAppearance} from '@/lib/interface-appearance';
import {landscapeMotionPolicy,landscapeFrameBudget} from '@/lib/landscape-motion';

const PowerPolicy=registerPlugin<{
  getStatus():Promise<{limited:boolean;critical?:boolean}>;
  addListener(event:'powerPolicy',callback:(state:{limited:boolean;critical?:boolean})=>void):Promise<PluginListenerHandle>;
}>('LandscapePowerPolicy');
type Preview={iso?:string;rate?:number};
type DebugWindow=Window&{__landscapePreview?:(value:Preview)=>void;__landscapeDiagnostics?:()=>unknown;__landscapeTestPower?:(limited:boolean,critical?:boolean)=>void};

/** This component owns its draw loop. Astronomy never updates application React state. */
export default function DynamicLandscape({active,glass=true}:{active:boolean;glass?:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    if(!active||!canvas.current)return;
    const element=canvas.current,root=document.documentElement;
    const renderer=new LandscapeRenderer(element),media=matchMedia('(prefers-reduced-motion: reduce)');
    const worker=new Worker(new URL('../lib/landscape.worker.ts',import.meta.url));
    let alive=true,nativeActive=true,limited=false,critical=false,requestId=0;
    let samples:{a:AstronomyState;b:AstronomyState}|null=null;
    let events:Record<string,number|null>={},source='default-rzeszow';
    let drawTimer:ReturnType<typeof setTimeout>|undefined,modelTimer:ReturnType<typeof setTimeout>|undefined;
    let slow=false,frameCost=0,lastWall=Date.now(),lastMono=performance.now(),frames=0,totalMs=0,maxMs=0;
    let preview:Preview={},previewStart=0,previewMono=0;
    const previewEnabled=process.env.NODE_ENV==='development'||process.env.NEXT_PUBLIC_LANDSCAPE_PREVIEW==='true';
    const now=()=>preview.iso?previewStart+(performance.now()-previewMono)*(preview.rate??1):Date.now();
    const visible=()=>!document.hidden&&nativeActive;
    const policy=()=>{
      let reduced=false,light=false;
      try{reduced=normalizeInterfaceAppearance(JSON.parse(localStorage.getItem(INTERFACE_APPEARANCE_KEY)||'{}')).reducedMotion;light=localStorage.getItem('mks_light_effects')==='true';}catch{}
      return landscapeMotionPolicy({hidden:document.hidden,nativeActive,reduced:media.matches||reduced,light,limited,critical,slow});
    };
    const updatePalette=(state:AstronomyState)=>{
      let opacity=64;
      try{opacity=normalizeInterfaceAppearance(JSON.parse(localStorage.getItem(INTERFACE_APPEARANCE_KEY)||'{}')).glassOpacity;}catch{}
      for(const [key,value] of Object.entries(landscapePalette(state,glass?opacity:100)))root.style.setProperty(key,value);
    };
    const updateModel=()=>{
      clearTimeout(modelTimer);if(!visible()||!alive)return;
      let value:unknown=null;try{value=JSON.parse(localStorage.getItem(LANDSCAPE_LOCATION_KEY)||'null');}catch{}
      const location=landscapeLocation(value);source=location.source;
      const ms=now();worker.postMessage({ms,location,id:++requestId,span:Math.max(30000,(preview.rate??1)*1000)});
      modelTimer=setTimeout(updateModel,preview.iso&&preview.rate!==1?500:15000);
    };
    let lastWindows=0;
    const paintWindows=(mono:number)=>{
      if(mono-lastWindows<100)return;lastWindows=mono;
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
        const top=kind==='filter'?.07:kind==='navigation'?.51:.42;
        context.drawImage(element,(element.width-sw)/2,Math.min(element.height-sh,element.height*top),sw,sh,0,0,width,height);
        target.dataset.sceneReady=element.dataset.assetsReady==='true'?'true':'false';
      }
    };
    const refreshWindows=()=>{lastWindows=0;paintWindows(performance.now()+100);};
    window.addEventListener('pks-landscape-window',refreshWindows);
    const draw=()=>{
      clearTimeout(drawTimer);if(!visible()||!alive)return;
      const mono=performance.now(),wall=Date.now(),motionPolicy=policy();
      element.dataset.motion=motionPolicy.reason;root.dataset.landscapeMotion=motionPolicy.animate?'on':'off';
      // Date/time, DST and timezone edits are reflected without modifying timetable clocks.
      if(Math.abs((wall-lastWall)-(mono-lastMono))>5000)updateModel();
      lastWall=wall;lastMono=mono;
      if(samples){
        const start=performance.now(),state=interpolateAstronomy(samples.a,samples.b,now());
        renderer.render(state,mono/1000,motionPolicy.animate);
        paintWindows(mono);
        const cost=performance.now()-start;frames++;totalMs+=cost;maxMs=Math.max(maxMs,cost);
        if(frames>10){frameCost=landscapeFrameBudget(frameCost,cost);if(frameCost>28)slow=true;else if(frameCost<18)slow=false;}
      }
      drawTimer=setTimeout(draw,Math.max(16,policy().interval-(performance.now()-mono)));
    };
    const image=(name:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{
      const value=new Image();value.onload=()=>resolve(value);value.onerror=()=>reject(new Error(name));value.src='/themes/mountains/'+name;
    });
    void Promise.all([image('terrain.webp'),image('clouds.webp'),image('water-mask.png')]).then(([terrain,clouds,water])=>{
      if(!alive)return;
      const mask=document.createElement('canvas');mask.width=850;mask.height=1850;
      const context=mask.getContext('2d',{willReadFrequently:true})!;context.drawImage(clouds,0,0,850,1850);
      const rgba=context.getImageData(0,0,850,1850).data,alpha=new Uint8ClampedArray(850*1850);
      for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];
      renderer.setAssets({terrain,clouds,water,cloudAlpha:alpha});element.dataset.assetsReady='true';draw();
    }).catch(()=>{if(alive)element.dataset.renderError='landscape-assets';});
    worker.onmessage=event=>{
      if(!alive||event.data.id!==requestId)return;
      samples=event.data;events=event.data.events;
      updatePalette(samples!.a);
      const period=isLandscapeDay(samples!.a)?'day':'night';
      if(root.dataset.landscapePeriod!==period){root.dataset.landscapePeriod=period;window.dispatchEvent(new Event('pks-landscape-period'));}
      draw();
    };
    worker.onerror=()=>{element.dataset.renderError='astronomy-worker';};
    const resize=()=>{const rect=element.getBoundingClientRect();if(rect.width&&rect.height)renderer.resize(rect.width,rect.height,devicePixelRatio||1);draw();};
    const restart=()=>{if(samples)updatePalette(samples.a);clearTimeout(drawTimer);clearTimeout(modelTimer);root.dataset.landscapeMotion=visible()&&policy().animate?'on':'off';if(visible()){updateModel();draw();}};
    const observer=new ResizeObserver(resize);observer.observe(element);
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
      debug.__landscapePreview=value=>{preview=value;previewStart=Date.parse(value.iso||'');previewMono=performance.now();if(value.iso&&!Number.isFinite(previewStart)){preview={};}samples=null;restart();};
      debug.__landscapeTestPower=(next,isCritical=false)=>{limited=next;critical=isCritical;restart();};
      debug.__landscapeDiagnostics=()=>({frames,averageDrawMs:frames?totalMs/frames:0,maxDrawMs:maxMs,interval:policy().interval,motion:policy().reason,visible:visible(),source,events,samples,preview,canvasPixels:element.width*element.height});
    }
    root.dataset.landscapeTheme='on';resize();updateModel();
    return()=>{
      window.removeEventListener('pks-landscape-window',refreshWindows);
      alive=false;clearTimeout(drawTimer);clearTimeout(modelTimer);worker.terminate();observer.disconnect();
      document.removeEventListener('visibilitychange',restart);window.removeEventListener('focus',restart);
      window.removeEventListener('pks-interface-appearance',restart);window.removeEventListener('storage',restart);window.removeEventListener('pks-landscape-location',restart);media.removeEventListener('change',restart);
      for(const listener of listeners)void listener.then(handle=>handle.remove());
      delete debug.__landscapePreview;delete debug.__landscapeDiagnostics;
      delete debug.__landscapeTestPower;delete root.dataset.landscapeMotion;
      delete root.dataset.landscapeTheme;delete root.dataset.landscapePeriod;for(const key of ['surface','ink','muted','accent','edge','field','chrome-light','map-filter','panel-scrim','panel-row','nav-top','nav-bottom','text-shadow','label-bg'].map(key=>'--landscape-'+key))root.style.removeProperty(key);
    };
  },[active,glass]);
  return active?<canvas ref={canvas} data-landscape-stage aria-hidden="true"/>:null;
}
