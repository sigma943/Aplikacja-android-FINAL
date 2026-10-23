'use client';
import {useEffect,useRef} from 'react';
import {App} from '@capacitor/app';
import {Capacitor,registerPlugin,type PluginListenerHandle} from '@capacitor/core';
import {LANDSCAPE_LOCATION_KEY,landscapeLocation,interpolateAstronomy,type AstronomyState} from '@/lib/landscape-astronomy';
import {LandscapeRenderer} from '@/lib/landscape-renderer';
import {INTERFACE_APPEARANCE_KEY,normalizeInterfaceAppearance} from '@/lib/interface-appearance';

const PowerPolicy=registerPlugin<{
  getStatus():Promise<{limited:boolean}>;
  addListener(event:'powerPolicy',callback:(state:{limited:boolean})=>void):Promise<PluginListenerHandle>;
}>('LandscapePowerPolicy');
type Preview={iso?:string;rate?:number};
type DebugWindow=Window&{__landscapePreview?:(value:Preview)=>void;__landscapeDiagnostics?:()=>unknown};

/** This component owns its draw loop. Astronomy never updates application React state. */
export default function DynamicLandscape({active}:{active:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    if(!active||!canvas.current)return;
    const element=canvas.current,root=document.documentElement;
    const renderer=new LandscapeRenderer(element),media=matchMedia('(prefers-reduced-motion: reduce)');
    const worker=new Worker(new URL('../lib/landscape.worker.ts',import.meta.url));
    let alive=true,nativeActive=true,limited=false,requestId=0;
    let samples:{a:AstronomyState;b:AstronomyState}|null=null;
    let events:Record<string,number|null>={},source='default-rzeszow';
    let drawTimer:ReturnType<typeof setTimeout>|undefined,modelTimer:ReturnType<typeof setTimeout>|undefined;
    let nextInterval=125,lastWall=Date.now(),lastMono=performance.now(),frames=0,totalMs=0,maxMs=0;
    let preview:Preview={},previewStart=0,previewMono=0;
    const previewEnabled=process.env.NODE_ENV==='development'||process.env.NEXT_PUBLIC_LANDSCAPE_PREVIEW==='true';
    const now=()=>preview.iso?previewStart+(performance.now()-previewMono)*(preview.rate??1):Date.now();
    const visible=()=>!document.hidden&&nativeActive;
    const motionAllowed=()=>{
      let reduced=false,light=false;
      try{reduced=normalizeInterfaceAppearance(JSON.parse(localStorage.getItem(INTERFACE_APPEARANCE_KEY)||'{}')).reducedMotion;light=localStorage.getItem('mks_light_effects')==='true';}catch{}
      return !limited&&!media.matches&&!reduced&&!light;
    };
    const updateModel=()=>{
      clearTimeout(modelTimer);if(!visible()||!alive)return;
      let value:unknown=null;try{value=JSON.parse(localStorage.getItem(LANDSCAPE_LOCATION_KEY)||'null');}catch{}
      const location=landscapeLocation(value);source=location.source;
      const ms=now();worker.postMessage({ms,location,id:++requestId,span:Math.max(30000,(preview.rate??1)*1000)});
      modelTimer=setTimeout(updateModel,preview.iso&&preview.rate!==1?500:15000);
    };
    const draw=()=>{
      clearTimeout(drawTimer);if(!visible()||!alive)return;
      const mono=performance.now(),wall=Date.now();
      // Date/time, DST and timezone edits are reflected without modifying timetable clocks.
      if(Math.abs((wall-lastWall)-(mono-lastMono))>5000)updateModel();
      lastWall=wall;lastMono=mono;
      if(samples){
        const start=performance.now(),state=interpolateAstronomy(samples.a,samples.b,now());
        const motion=motionAllowed();renderer.render(state,mono/1000,motion);
        const cost=performance.now()-start;frames++;totalMs+=cost;maxMs=Math.max(maxMs,cost);
        if(cost>18)nextInterval=250; // Automatically back off on slower devices.
      }
      drawTimer=setTimeout(draw,motionAllowed()?nextInterval:15000);
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
      root.style.setProperty('--landscape-surface',`rgba(9,24,40,${(.59+.07*Math.max(0,Math.sin(samples!.a.sun.altitude))).toFixed(3)})`);
      draw();
    };
    worker.onerror=()=>{element.dataset.renderError='astronomy-worker';};
    const resize=()=>{const rect=element.getBoundingClientRect();if(rect.width&&rect.height)renderer.resize(rect.width,rect.height,devicePixelRatio||1);draw();};
    const restart=()=>{clearTimeout(drawTimer);clearTimeout(modelTimer);if(visible()){updateModel();draw();}};
    const observer=new ResizeObserver(resize);observer.observe(element);
    document.addEventListener('visibilitychange',restart);
    window.addEventListener('focus',restart);window.addEventListener('pks-interface-appearance',restart);
    window.addEventListener('storage',restart);window.addEventListener('pks-landscape-location',restart);
    media.addEventListener('change',restart);
    const listeners:Promise<PluginListenerHandle>[]=[];
    if(Capacitor.isNativePlatform()){
      listeners.push(App.addListener('appStateChange',state=>{nativeActive=state.isActive;restart();}));
      listeners.push(PowerPolicy.addListener('powerPolicy',state=>{limited=state.limited;restart();}));
      void PowerPolicy.getStatus().then(state=>{if(alive){limited=state.limited;restart();}}).catch(()=>{limited=true;restart();});
    }
    const debug=window as DebugWindow;
    if(previewEnabled){
      debug.__landscapePreview=value=>{preview=value;previewStart=Date.parse(value.iso||'');previewMono=performance.now();if(value.iso&&!Number.isFinite(previewStart)){preview={};}samples=null;restart();};
      debug.__landscapeDiagnostics=()=>({frames,averageDrawMs:frames?totalMs/frames:0,maxDrawMs:maxMs,interval:motionAllowed()?nextInterval:15000,visible:visible(),source,events,samples,preview,canvasPixels:element.width*element.height});
    }
    root.dataset.landscapeTheme='on';resize();updateModel();
    return()=>{
      alive=false;clearTimeout(drawTimer);clearTimeout(modelTimer);worker.terminate();observer.disconnect();
      document.removeEventListener('visibilitychange',restart);window.removeEventListener('focus',restart);
      window.removeEventListener('pks-interface-appearance',restart);window.removeEventListener('storage',restart);window.removeEventListener('pks-landscape-location',restart);media.removeEventListener('change',restart);
      for(const listener of listeners)void listener.then(handle=>handle.remove());
      delete debug.__landscapePreview;delete debug.__landscapeDiagnostics;
      delete root.dataset.landscapeTheme;root.style.removeProperty('--landscape-surface');
    };
  },[active]);
  return active?<canvas ref={canvas} data-landscape-stage aria-hidden="true"/>:null;
}
