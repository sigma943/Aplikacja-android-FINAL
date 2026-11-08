'use client';
import {useEffect,useLayoutEffect,useRef} from 'react';
import {App} from '@capacitor/app';
import {Capacitor,registerPlugin,type PluginListenerHandle} from '@capacitor/core';
import {DEFAULT_LANDSCAPE_LOCATION,astronomyAt,interpolateAstronomy,type AstronomyState} from '@/lib/landscape-astronomy';
import {landscapeOptics,landscapeViewport,type LandscapeViewport} from '@/lib/landscape-optics';
import {landscapePalette,isLandscapeDay} from '@/lib/landscape-palette';
import {WATER_QUALITY,type WaterQuality} from '@/lib/landscape-water-gpu';
import {cloudCoverage} from '@/lib/landscape-clouds';
import {LandscapeRenderer} from '@/lib/landscape-renderer';
import {INTERFACE_APPEARANCE_KEY,normalizeInterfaceAppearance} from '@/lib/interface-appearance';
import {landscapeMotionPolicy,landscapeFrameBudget,landscapeDrawInterval} from '@/lib/landscape-motion';
import {LANDSCAPE_SETTINGS_EVENT,readLandscapeSettings} from '@/lib/landscape-settings';
import {godRaysOpacity,godRaysProfile,paintGodRays} from '@/lib/landscape-god-rays';
import {GLASS_QUALITY,LandscapeGlass,type GlassPanel} from '@/lib/landscape-glass';

const PowerPolicy=registerPlugin<{
  getStatus():Promise<{limited:boolean;critical?:boolean}>;
  addListener(event:'powerPolicy',callback:(state:{limited:boolean;critical?:boolean})=>void):Promise<PluginListenerHandle>;
}>('LandscapePowerPolicy');
type Preview={iso?:string;rate?:number;quality?:WaterQuality;seconds?:number};
type DebugWindow=Window&{__landscapeCapture?:()=>HTMLCanvasElement;__landscapeRecording?:(active:boolean)=>HTMLCanvasElement|null;__landscapePreview?:(value:Preview)=>void;__landscapeDiagnostics?:()=>unknown;__landscapeTestPower?:(limited:boolean,critical?:boolean)=>void};

/** This component owns its draw loop. Astronomy never updates application React state. */
export default function DynamicLandscape({active,glass=true,sceneCovered=false}:{active:boolean;glass?:boolean;sceneCovered?:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null);
  const raysCanvas=useRef<HTMLCanvasElement>(null);
  const covered=useRef(sceneCovered),refreshScene=useRef<(()=>void)|null>(null);
  useEffect(()=>{covered.current=sceneCovered;refreshScene.current?.();},[sceneCovered]);
  useLayoutEffect(()=>{
    if(!active||!canvas.current)return;
    const element=canvas.current,root=document.documentElement;
    const container=element.parentElement!;
    const renderer=new LandscapeRenderer(element,true),media=matchMedia('(prefers-reduced-motion: reduce)');
    const worker=new Worker(new URL('../lib/landscape.worker.ts',import.meta.url));
    let lastGlass=0,lastRays=-Infinity;
    let lastOptics=-Infinity,lastProfile=-Infinity;
    let optics:LandscapeGlass|undefined;
    let rayProfile=[0],rayTexture=new Uint8Array(1);
    const scenery=document.createElement('canvas'),rayField=document.createElement('canvas');
    let glassPanels:GlassPanel[]=[];
    let alive=true,sceneVisible=true,nativeActive=true,limited=false,critical=false,requestId=0;
    let solarDay:boolean|undefined;
    let samples:{a:AstronomyState;b:AstronomyState}|null=null;
    let events:Record<string,number|null>={},source='default-rzeszow';
    let frameRequest=0,nextFrame=0;
    let drawTimer:ReturnType<typeof setTimeout>|undefined,modelTimer:ReturnType<typeof setTimeout>|undefined;
    let frameCost=0,lastWall=Date.now(),lastMono=performance.now(),frames=0,totalMs=0,maxMs=0;
    let preview:Preview={},previewStart=0,previewMono=0;
    let recordingCanvas:HTMLCanvasElement|null=null,recordingContext:CanvasRenderingContext2D|null=null;
    const previewEnabled=process.env.NODE_ENV==='development'||process.env.NEXT_PUBLIC_LANDSCAPE_PREVIEW==='true';
    const now=()=>preview.iso?previewStart+(performance.now()-previewMono)*(preview.rate??1):Date.now();
    const visible=()=>!document.hidden&&nativeActive&&sceneVisible;
    let reduced=false,light=false,appearance=normalizeInterfaceAppearance(null),accent='#00a3a2',settings=readLandscapeSettings();
    const readPreferences=()=>{
      settings=readLandscapeSettings();root.dataset.landscapeFilterBackground=settings.filterBackground;renderer.setEffects({bloom:settings.bloom/100,reflections:settings.reflections/100,rays:settings.rays/100,waveSpeed:settings.waveSpeed/100,exposure:settings.exposure/100});
      reduced=false;light=false;appearance=normalizeInterfaceAppearance(null);accent='#00a3a2';
      try{appearance=normalizeInterfaceAppearance(JSON.parse(localStorage.getItem(INTERFACE_APPEARANCE_KEY)||'{}'));reduced=appearance.reducedMotion;accent=localStorage.getItem('mks_theme')||accent;light=localStorage.getItem('mks_light_effects')==='true';}catch{}
    };readPreferences();
    const policy=()=>landscapeMotionPolicy({hidden:document.hidden,nativeActive,reduced:media.matches||reduced,light,limited,critical,slow:false});
    let paletteKeys:string[]=[];
    const paletteValues=new Map<string,string>();
    const updatePalette=(state:AstronomyState)=>{
      const transparent=glass&&!light;
      const material=transparent?'on':'off';if(root.dataset.landscapeGlass!==material)root.dataset.landscapeGlass=material;
      const opacity=transparent?appearance.glassOpacity:100;
      const palette={...landscapePalette(state,opacity,solarDay,appearance,accent),...landscapeOptics(state,opacity,transparent)};
      paletteKeys=Object.keys(palette);
      for(const [key,value] of Object.entries(palette))if(paletteValues.get(key)!==value){root.style.setProperty(key,value);paletteValues.set(key,value);}
    };
    const updateModel=()=>{
      clearTimeout(modelTimer);if(!visible()||!alive)return;
      const location=DEFAULT_LANDSCAPE_LOCATION;source=location.source;
      const ms=now();worker.postMessage({ms,location,id:++requestId,span:Math.max(30000,(preview.rate??1)*1000)});
      modelTimer=setTimeout(updateModel,preview.iso&&preview.rate!==1?500:15000);
    };
    let fpsStart=performance.now(),fpsFrames=0,actualFps=0;
    const paintFilter=()=>{
      if(settings.filterBackground==='solid')return;
      for(const target of document.querySelectorAll<HTMLCanvasElement>('[data-landscape-window="filter"]')){
        const rect=target.getBoundingClientRect();if(!rect.width||!rect.height)continue;
        const width=Math.ceil(Math.min(600,rect.width)),height=Math.ceil(rect.height*width/rect.width);
        if(target.width!==width||target.height!==height){target.width=width;target.height=height;}
        const context=target.getContext('2d',{alpha:false});if(!context)continue;
        renderer.copyFilterSky(context,width,height,solarDay??true);
        target.dataset.sceneReady=element.dataset.assetsReady==='true'?'true':'false';
      }
    };
    const refreshFilter=()=>paintFilter();
    window.addEventListener('pks-landscape-window',refreshFilter);
    const hideGlass=()=>{
      for(const panel of glassPanels){panel.canvas.hidden=true;panel.canvas.width=panel.canvas.height=1;}
      glassPanels=[];
    };
    const releaseGlass=()=>{
      hideGlass();optics?.dispose();optics=undefined;scenery.width=scenery.height=1;
    };
    const panelBox=(panel:HTMLElement,frame:DOMRect)=>{
      const box=panel.getBoundingClientRect();
      if(!box.width||!box.height||panel.closest('[hidden],[inert],[data-navigation-preview]')||
        box.bottom<=frame.top||box.top>=frame.bottom||box.right<=frame.left||box.left>=frame.right)return null;
      const radius=parseFloat(getComputedStyle(panel).borderTopLeftRadius)||0;
      return {x:box.left-frame.left,y:box.top-frame.top,width:box.width,height:box.height,radius:Math.min(radius,box.width/2,box.height/2)};
    };
    const paintLight=(mono:number,animated:boolean)=>{
      const target=raysCanvas.current,lighting=renderer.lighting,origin=renderer.sunScreen();
      if(!target||!lighting||!origin)return;
      const opacity=settings.godRays&&!light&&!critical?godRaysOpacity(lighting.sun.altitude,lighting.sun.intensity,settings.rays/100):0;
      const hasRays=opacity>=.008;
      const useOptics=glass&&!light&&!critical&&appearance.glassOpacity<100;
      const quality=settings.glassQuality,mode=GLASS_QUALITY[quality];
      const opticalFrame=useOptics&&mono-lastOptics>=mode.interval-.5;
      const raysFrame=hasRays&&mono-lastRays>=250;
      const hadGlass=glassPanels.length>0;
      if(!hasRays)target.hidden=true;
      if(!opticalFrame&&!raysFrame)return;
      const frame=element.getBoundingClientRect();
      if(!frame.width||!frame.height)return;
      if(hasRays&&mono-lastProfile>=(useOptics&&animated?Math.max(32,mode.interval):250)){
        lastProfile=mono;
        rayProfile=godRaysProfile(origin,frame.width/frame.height,(x,y)=>renderer.sunRayTransmission(x,y));
        rayTexture=Uint8Array.from(rayProfile,value=>Math.round(value*255));
      }
      if(opticalFrame){
        lastOptics=mono;
        const panels:GlassPanel[]=[];
        for(const canvas of container.querySelectorAll<HTMLCanvasElement>('[data-horyzont-glass]')){
          const kind=canvas.dataset.horyzontGlass;
          if(kind==='filter'&&settings.filterBackground==='sky')continue;
          const box=panelBox(canvas.parentElement!,frame);
          if(!box)continue;
          panels.push({...box,canvas,bevel:kind==='navigation'?12:kind==='filter'?9:8});
        }
        for(const panel of glassPanels)if(!panels.some(next=>next.canvas===panel.canvas)){
          panel.canvas.hidden=true;panel.canvas.width=panel.canvas.height=1;
        }
        glassPanels=[];
        if(panels.length){
          optics??=new LandscapeGlass();
          if(optics.available){
            const scale=element.width/frame.width*mode.scale;
            let scene:HTMLCanvasElement|null=null;
            if(!covered.current&&element.dataset.assetsReady==='true'){
              const width=Math.max(1,Math.round(element.width*mode.scale)),height=Math.max(1,Math.round(element.height*mode.scale));
              if(scenery.width!==width)scenery.width=width;
              if(scenery.height!==height)scenery.height=height;
              const context=scenery.getContext('2d',{alpha:false});
              if(context){renderer.copyWindow(context,0,0,element.width,element.height,width,height,true);scene=scenery;}
            }
            const reflectionGain=settings.reflections<=100?settings.reflections/100:1+3*(settings.reflections/100-1)**2;
            const strength=Math.min(1,(100-appearance.glassOpacity)/28);
            if(optics.draw({width:frame.width,height:frame.height,scale,quality,panels,scene,profile:rayTexture,origin,lighting,
              sunlight:Math.min(1,lighting.sun.intensity*reflectionGain),rays:hasRays?opacity:0,strength})){
              glassPanels=panels.filter(panel=>!panel.canvas.hidden);
            }else for(const panel of panels)panel.canvas.hidden=true;
          }else for(const panel of panels)panel.canvas.hidden=true;
        }
      }
      if(!hasRays||(!raysFrame&&!hadGlass&&!glassPanels.length))return;
      const size=Math.min(1,480/Math.max(element.width,element.height));
      const width=Math.max(1,Math.round(element.width*size)),height=Math.max(1,Math.round(element.height*size));
      if(raysFrame||rayField.width!==width||rayField.height!==height){
        lastRays=mono;
        if(rayField.width!==width)rayField.width=width;
        if(rayField.height!==height)rayField.height=height;
        const context=rayField.getContext('2d')!;
        context.clearRect(0,0,width,height);context.save();
        paintGodRays(context,width,height,{...origin,color:lighting.sun.color},opacity,rayProfile);
        context.restore();
      }
      if(target.width!==width)target.width=width;
      if(target.height!==height)target.height=height;
      const context=target.getContext('2d')!;
      target.hidden=false;context.clearRect(0,0,width,height);context.save();
      const sx=width/frame.width,sy=height/frame.height;
      if(covered.current){
        // On the map, transmit light through the chrome without tinting map tiles.
        context.beginPath();
        for(const panel of container.querySelectorAll<HTMLElement>('.pks-map-search-panel,.pks-navigation,.map-detail-shell,[data-map-control]')){
          const box=panelBox(panel,frame);
          if(box)context.roundRect(box.x*sx,box.y*sy,box.width*sx,box.height*sy,box.radius*sx);
        }
        context.clip();
      }
      context.drawImage(rayField,0,0);
      // The local lenses already transmit the beam beneath their labels.
      context.globalCompositeOperation='destination-out';
      for(const panel of glassPanels){
        context.save();
        const scroll=panel.canvas.closest('.transit-view')?.getBoundingClientRect();
        if(scroll){context.beginPath();context.rect((scroll.x-frame.x)*sx,(scroll.y-frame.y)*sy,scroll.width*sx,scroll.height*sy);context.clip();}
        context.beginPath();context.roundRect(panel.x*sx,panel.y*sy,panel.width*sx,panel.height*sy,panel.radius*sx);context.fill();
        context.restore();
      }
      context.restore();
    };
    const draw=()=>{
      clearTimeout(drawTimer);cancelAnimationFrame(frameRequest);if(!visible()||!alive)return;
      const mono=performance.now(),wall=Date.now(),motionPolicy=policy();
      element.dataset.motion=motionPolicy.reason;root.dataset.landscapeMotion=motionPolicy.animate?'on':'off';
      // Date/time, DST and timezone edits are reflected without modifying timetable clocks.
      if(Math.abs((wall-lastWall)-(mono-lastMono))>5000)updateModel();
      lastWall=wall;lastMono=mono;
      if(samples){
        const start=performance.now(),state=interpolateAstronomy(samples.a,samples.b,now());
        // Quality-first profile: timing spikes never silently erase HDR or detail.
        renderer.quality=preview.quality??(motionPolicy.reason==='light-effects'?'low':settings.quality);
        const sceneSeconds=preview.seconds===undefined?mono/1000:preview.seconds+(mono-previewMono)/1000;
        renderer.render(state,sceneSeconds,motionPolicy.animate,!covered.current||!!recordingCanvas);
        if(mono-lastGlass>=250&&renderer.lighting){
          lastGlass=mono;updatePalette(state);
        }
        paintFilter();
        paintLight(mono,motionPolicy.animate);
        if(recordingCanvas&&recordingContext){
          if(recordingCanvas.width!==element.width||recordingCanvas.height!==element.height){recordingCanvas.width=element.width;recordingCanvas.height=element.height;}
          renderer.copyWindow(recordingContext,0,0,element.width,element.height,element.width,element.height,true);
        }
        const cost=performance.now()-start;frames++;fpsFrames++;if(mono-fpsStart>=1000){
          const observedFrames=fpsFrames;actualFps=observedFrames*1000/(mono-fpsStart);fpsFrames=0;fpsStart=mono;
        }totalMs+=cost;maxMs=Math.max(maxMs,cost);
        frameCost=landscapeFrameBudget(frameCost,cost);
      }
      const next=policy();
      const interval=landscapeDrawInterval(next.reason,next.interval,WATER_QUALITY[renderer.quality].fps,covered.current&&!recordingCanvas);
      if(next.animate){
        const due=nextFrame||mono;
        nextFrame=due+Math.max(1,Math.floor((mono-due)/interval)+1)*interval;
        frameRequest=requestAnimationFrame(tick);
      }else drawTimer=setTimeout(draw,next.animate?interval:next.interval);
    };
    const tick=(mono:number)=>{
      frameRequest=0;if(!visible()||!alive)return;
      if(mono+.5>=nextFrame)draw();else frameRequest=requestAnimationFrame(tick);
    };
    const image=(name:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{
      const value=new Image();value.onload=()=>resolve(value);value.onerror=()=>reject(new Error(name));value.src='/themes/mountains/'+name+'?v=photographic-camera-2';
    });
    void Promise.all([image('terrain.webp'),image('clouds.webp'),image('water-mask.png'),image('water-uv.png').catch(()=>undefined),image('water-perspective.png').catch(()=>undefined),image('moon.webp').catch(()=>undefined),image('scene-depth.png').catch(()=>undefined),image('terrain-normal.png').catch(()=>undefined)]).then(([terrain,clouds,water,geometry,perspective,moon,sceneDepth,terrainNormal])=>{
      if(!alive)return;
      const mask=document.createElement('canvas');mask.width=850;mask.height=1850;
      const context=mask.getContext('2d',{willReadFrequently:true})!;context.drawImage(clouds,0,0,850,1850);
      const pixels=context.getImageData(0,0,850,1850),rgba=pixels.data,alpha=new Uint8ClampedArray(850*1850);
      for(let i=0;i<alpha.length;i++){
        const channel=i*4+3;
        alpha[i]=rgba[channel]=Math.round(255*cloudCoverage(rgba[channel]/255,(i%850)/850,Math.floor(i/850)/1850));
      }
      context.putImageData(pixels,0,0);
      renderer.setAssets({terrain,clouds:mask,water,geometry,perspective,moon,sceneDepth,terrainNormal,cloudAlpha:alpha});element.dataset.assetsReady='true';draw();
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
        if(raysCanvas.current)raysCanvas.current.style.height=element.style.height;
        lastRays=lastOptics=lastProfile=-Infinity;
      }
      draw();
    };
    const restart=()=>{readPreferences();lastRays=lastOptics=lastProfile=-Infinity;cancelAnimationFrame(frameRequest);nextFrame=0;fpsStart=performance.now();fpsFrames=0;if(samples)updatePalette(samples.a);clearTimeout(drawTimer);clearTimeout(modelTimer);root.dataset.landscapeMotion=visible()&&policy().animate?'on':'off';if(light||critical||!glass||appearance.glassOpacity>=100)releaseGlass();if(visible()){lastGlass=0;updateModel();draw();}else renderer.suspend();};
    refreshScene.current=restart;
    const intersection=new IntersectionObserver(entries=>{const next=entries.some(entry=>entry.isIntersecting);if(next!==sceneVisible){sceneVisible=next;restart();}});intersection.observe(element);
    const observer=new ResizeObserver(resize);observer.observe(element.parentElement!);
    window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
    document.addEventListener('focusin',resize);
    document.addEventListener('visibilitychange',restart);
    window.addEventListener(LANDSCAPE_SETTINGS_EVENT,restart);window.addEventListener('focus',restart);window.addEventListener('pks-interface-appearance',restart);
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
      debug.__landscapeRecording=active=>{
        if(recordingCanvas){recordingCanvas.width=recordingCanvas.height=1;}recordingCanvas=null;recordingContext=null;
        if(active){recordingCanvas=document.createElement('canvas');recordingCanvas.width=element.width;recordingCanvas.height=element.height;recordingContext=recordingCanvas.getContext('2d');if(recordingContext)renderer.copyWindow(recordingContext,0,0,element.width,element.height,element.width,element.height);}
        return recordingCanvas;
      };
      debug.__landscapeCapture=()=>{const target=document.createElement('canvas');target.width=element.width;target.height=element.height;renderer.copyWindow(target.getContext('2d')!,0,0,element.width,element.height,target.width,target.height);return target;};
      debug.__landscapePreview=value=>{preview=value;previewStart=Date.parse(value.iso||'');previewMono=performance.now();if(value.iso&&!Number.isFinite(previewStart)){preview={};}samples=null;restart();};
      debug.__landscapeTestPower=(next,isCritical=false)=>{limited=next;critical=isCritical;restart();};
      debug.__landscapeDiagnostics=()=>({frames,actualFps,averageDrawMs:frames?totalMs/frames:0,maxDrawMs:maxMs,smoothedDrawMs:frameCost,interval:landscapeDrawInterval(policy().reason,policy().interval,WATER_QUALITY[renderer.quality].fps,covered.current&&!recordingCanvas),motion:policy().reason,sceneCovered:covered.current,visible:visible(),source,events,samples,preview,viewport,canvasPixels:element.width*element.height,renderer:renderer.diagnostics()});
    }
    // Paint the correct material before enabling its CSS. The worker may take
    // several frames to start; it refines the scene after this initial sample.
    const initialMs=now();
    const initialState=astronomyAt(initialMs,DEFAULT_LANDSCAPE_LOCATION);
    samples={a:initialState,b:astronomyAt(initialMs+30000,DEFAULT_LANDSCAPE_LOCATION)};
    solarDay=isLandscapeDay(initialState);
    updatePalette(initialState);
    root.dataset.landscapePeriod=solarDay?'day':'night';
    root.dataset.landscapeTheme='on';
    window.dispatchEvent(new Event('pks-landscape-period'));
    resize();updateModel();
    return()=>{
      refreshScene.current=null;
      window.removeEventListener('pks-landscape-window',refreshFilter);
      alive=false;cancelAnimationFrame(frameRequest);releaseGlass();renderer.dispose();clearTimeout(drawTimer);clearTimeout(modelTimer);worker.terminate();observer.disconnect();intersection.disconnect();window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);document.removeEventListener('focusin',resize);
      document.removeEventListener('visibilitychange',restart);window.removeEventListener(LANDSCAPE_SETTINGS_EVENT,restart);window.removeEventListener('focus',restart);
      window.removeEventListener('pks-interface-appearance',restart);window.removeEventListener('storage',restart);window.removeEventListener('pks-landscape-location',restart);media.removeEventListener('change',restart);
      for(const listener of listeners)void listener.then(handle=>handle.remove());
      if(recordingCanvas)recordingCanvas.width=recordingCanvas.height=1;recordingCanvas=null;recordingContext=null;
      delete debug.__landscapeRecording;delete debug.__landscapeCapture;delete debug.__landscapePreview;delete debug.__landscapeDiagnostics;
      delete debug.__landscapeTestPower;delete root.dataset.landscapeMotion;
      delete root.dataset.landscapeFilterBackground;delete root.dataset.landscapeTheme;delete root.dataset.landscapePeriod;delete root.dataset.landscapeGlass;for(const key of paletteKeys)root.style.removeProperty(key);
    };
  },[active,glass]);
  return active?<><canvas ref={canvas} data-landscape-stage aria-hidden="true"/><canvas ref={raysCanvas} data-landscape-god-rays hidden aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-[5001] w-full"/></>:null;
}
