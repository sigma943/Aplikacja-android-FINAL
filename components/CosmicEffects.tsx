'use client';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {Capacitor} from '@capacitor/core';
import {App} from '@capacitor/app';
import {readAppTheme,resolveAppTheme,themeDecoration} from '@/lib/app-theme';
import {INTERFACE_APPEARANCE_KEY,normalizeInterfaceAppearance} from '@/lib/interface-appearance';
import {COSMIC_METEOR_DURATION,COSMIC_COMET_DURATION,cosmicCometDelay,COSMIC_TWINKLE_INTERVAL,COSMIC_STAR_POSITIONS,cosmicMeteorScheduler,cosmicMotionAllowed,COSMIC_PARALLAX_KEY,cosmicParallaxOffset,cosmicAccentEvent} from '@/lib/cosmic-effects';

import {cosmicBackdropStyle,cosmicScreenSession,COSMIC_PLANET_NAMES,cosmicBackdrop} from '@/lib/cosmic-scene';

let visitSession:ReturnType<typeof cosmicScreenSession>|null=null;

/** One visit-scoped sky, with all motion behind the glass and its text. */
export default function CosmicEffects(){
  const [host,setHost]=useState<HTMLElement|null>(null);
  const [scene,setScene]=useState<ReturnType<typeof cosmicBackdrop>|null>(null);
  const stage=useRef<HTMLDivElement>(null),transition=useRef<HTMLDivElement>(null),nova=useRef<HTMLSpanElement>(null);
  const streak=useRef<HTMLSpanElement>(null),field=useRef<HTMLDivElement>(null),comet=useRef<HTMLSpanElement>(null);
  useEffect(()=>{
    const root=document.documentElement,media=matchMedia('(prefers-reduced-motion: reduce)');
    let backdropEpoch=-1;
    const stars:Animation[]=[],accents:Animation[]=[];
    let fading:Animation|null=null,parallax=false,lastTilt=0,origin:{beta:number;gamma:number}|null=null;
    let nativeActive=true,allowed=false,animation:Animation|null=null,cometAnimation:Animation|null=null,disposed=false;
    let region:HTMLElement|null=null,settle:ReturnType<typeof setTimeout>|null=null;
    const regionSelector='.pks-options-sheet,[data-carrier-sheet],.map-detail-shell,.transit-view,.pks-panel-scope[data-cosmic-view]';
    const session=visitSession??=cosmicScreenSession(crypto.getRandomValues(new Uint32Array(1))[0]);
    const write=(key:string,value:string)=>{if(root.style.getPropertyValue(key)!==value)root.style.setProperty(key,value);};
    const measure=()=>{
      write('--cosmos-viewport-width',`${innerWidth}px`);
      write('--cosmos-viewport-height',`${innerHeight}px`);
      if(!field.current)return;
      // The sky belongs to the whole screen, including gaps between cards.
      if(field.current.style.inset!=='0px')Object.assign(field.current.style,{inset:'0',width:'100%',height:'100%',borderRadius:'0'});
    };
    const findRegion=()=>{
      for(const selector of regionSelector.split(','))for(const node of document.querySelectorAll<HTMLElement>(selector)){
        if(node.closest('[aria-hidden="true"],[inert]'))continue;
        const rect=node.getBoundingClientRect();
        if(rect.width>100&&rect.height>80&&rect.right>0&&rect.left<innerWidth&&rect.bottom>0&&rect.top<innerHeight&&getComputedStyle(node).visibility!=='hidden')return node;
      }
      return null;
    };
    const observer=new MutationObserver(records=>{
      if(resolveAppTheme(readAppTheme())!=='dark-cosmos'&&root.dataset.cosmicTheme!=='on')return;
      let regionsChanged=false;
      for(const record of records){
        if(record.type==='attributes'){
          if(record.attributeName==='aria-hidden'||record.attributeName==='data-cosmic-tab')regionsChanged=true;
        }
        for(const node of [...record.addedNodes,...record.removedNodes])if(node instanceof Element){
          if(node.matches(regionSelector)||node.querySelector(regionSelector))regionsChanged=true;
        }
      }
      // Resolve the final visible view before choosing its shared background.
      // A loading render and its completed render must share the same visit.
      if(regionsChanged)update();
    });
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-hidden','data-cosmic-tab']});
    const stopStars=()=>{for(const star of stars)star.cancel();stars.length=0;};
    const startStars=()=>{
      if(stars.length||!field.current)return;
      const points=field.current.querySelectorAll<HTMLElement>('[data-cosmic-star]');
      const positions=COSMIC_STAR_POSITIONS;
      points.forEach((point,i)=>{
        point.style.left=positions[i][0]+'%';point.style.top=positions[i][1]+'%';
        const duration=COSMIC_TWINKLE_INTERVAL+Math.random()*13000;
        stars.push(point.animate([
          {opacity:0,transform:'scale(.6)'},{opacity:.8,transform:'scale(1.3)',offset:.12},{opacity:.12,offset:.21},
          {opacity:.95,transform:'scale(1)',offset:.29},{opacity:0,offset:.43},{opacity:0,offset:.7},{opacity:0,transform:'scale(.6)'},
        ],{duration,delay:-Math.random()*duration,iterations:Infinity,easing:'ease-in-out'}));
      });
    };
    const shift=(x:number,y:number)=>{
      const value=cosmicParallaxOffset(x,y);
      stage.current?.style.setProperty('--cosmos-parallax-x',`${value.x.toFixed(2)}px`);
      stage.current?.style.setProperty('--cosmos-parallax-y',`${value.y.toFixed(2)}px`);
    };
    const orient=(event:DeviceOrientationEvent)=>{
      if(event.beta===null||event.gamma===null||event.timeStamp-lastTilt<50)return;
      lastTilt=event.timeStamp;origin??={beta:event.beta,gamma:event.gamma};
      shift((event.gamma-origin.gamma)/18,(event.beta-origin.beta)/18);
    };
    const pointer=(event:PointerEvent)=>{if(event.pointerType==='mouse')shift((event.clientX/innerWidth-.5)*2,(event.clientY/innerHeight-.5)*2);};
    const setParallax=(next:boolean)=>{
      if(next===parallax)return;parallax=next;origin=null;lastTilt=0;
      if(next){window.addEventListener('deviceorientation',orient,{passive:true});window.addEventListener('pointermove',pointer,{passive:true});}
      else{window.removeEventListener('deviceorientation',orient);window.removeEventListener('pointermove',pointer);shift(0,0);}
    };
    const stopAccents=()=>{for(const accent of accents)accent.cancel();accents.length=0;};
    const blend=(previous:{image:string;size:string;position:string}|null)=>{
      fading?.cancel();const layer=transition.current;if(!layer)return;
      layer.style.backgroundImage=previous?.image||'none';layer.style.backgroundSize=previous?.size||'cover';layer.style.backgroundPosition=previous?.position||'center';
      layer.style.display='block';
      fading=layer.animate([{opacity:1},{opacity:0}],{duration:550,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});
      fading.onfinish=()=>{layer.style.display='none';};
    };
    const scheduler=cosmicMeteorScheduler(()=>allowed,()=>{
      if(document.querySelector('.pks-loading-screen')||!streak.current?.animate)return;
      stopAccents();
      const variant=cosmicAccentEvent();
      streak.current.dataset.fragment=String(variant==='fragment');
      if(variant==='fragment')streak.current.querySelectorAll<HTMLElement>('[data-cosmic-fragment]').forEach((fragment,i)=>accents.push(fragment.animate([{opacity:0,transform:'translate(0,0)'},{opacity:.45,offset:.35},{opacity:0,transform:`translate(${20+i*12}px,${9+i*7}px)`}],{duration:1000+i*120,delay:150,fill:'both'})));
      if(variant==='nova'&&nova.current){const point=COSMIC_STAR_POSITIONS[Math.floor(Math.random()*COSMIC_STAR_POSITIONS.length)];nova.current.style.left=point[0]+'%';nova.current.style.top=point[1]+'%';accents.push(nova.current.animate([{opacity:0,transform:'scale(.6)'},{opacity:.55,transform:'scale(1.2)',offset:.3},{opacity:.15,offset:.65},{opacity:0,transform:'scale(.8)'}],{duration:2400,easing:'ease-in-out'}));}
      measure();
      streak.current.style.left=(55+Math.random()*35)+'%';streak.current.style.top=(8+Math.random()*48)+'%';
      animation?.cancel();
      animation=streak.current.animate([
        {opacity:0,transform:'translate3d(0,0,0) rotate(-35deg)'},
        {opacity:.95,transform:'translate3d(-18px,13px,0) rotate(-35deg)',offset:.16},
        {opacity:.8,transform:'translate3d(-105px,74px,0) rotate(-35deg)',offset:.72},
        {opacity:0,transform:'translate3d(-150px,105px,0) rotate(-35deg)'},
      ],{duration:COSMIC_METEOR_DURATION*(.75+Math.random()*.5),easing:'linear'});
    },{set:(fn,ms)=>setTimeout(fn,ms),clear:id=>clearTimeout(id)});
    const cometScheduler=cosmicMeteorScheduler(()=>allowed,()=>{
      const point=comet.current;if(document.querySelector('.pks-loading-screen')||!point?.animate)return;
      point.style.left=(55+Math.random()*38)+'%';point.style.top=(10+Math.random()*42)+'%';
      cometAnimation?.cancel();
      cometAnimation=point.animate([
        {opacity:0,transform:'translate3d(0,0,0) rotate(-25deg)'},
        {opacity:.85,transform:'translate3d(-25px,12px,0) rotate(-25deg)',offset:.18},
        {opacity:.65,transform:'translate3d(-150px,70px,0) rotate(-25deg)',offset:.75},
        {opacity:0,transform:'translate3d(-210px,98px,0) rotate(-25deg)'},
      ],{duration:COSMIC_COMET_DURATION*(.85+Math.random()*.3),easing:'linear'});
    },{set:(fn,ms)=>setTimeout(fn,ms),clear:id=>clearTimeout(id)},()=>cosmicCometDelay());
    const update=()=>{
      if(disposed)return;
      setHost(document.querySelector<HTMLElement>('.pks-theme-root'));
      let reduced=media.matches,light=false,appearance=normalizeInterfaceAppearance(null);
      try{light=localStorage.getItem('mks_light_effects')==='true';appearance=normalizeInterfaceAppearance(JSON.parse(localStorage.getItem(INTERFACE_APPEARANCE_KEY)||'{}'));reduced ||= appearance.reducedMotion;}catch{}
      // The Home root owns this key. Overlays, admin subviews, loading and data
      // mutations cannot impersonate a navigation change (Options is an overlay).
      const tab=document.querySelector<HTMLElement>('.pks-theme-root[data-cosmic-tab]')?.dataset.cosmicTab;
      const previousTab=session.tab;
      const entered=session.enterTab(tab);
      const theme=resolveAppTheme(readAppTheme());
      const nextRegion=theme==='dark-cosmos'?findRegion():null;
      root.dataset.cosmicTheme=theme==='dark-cosmos'?'on':'off';
      try{root.dataset.cosmicGlass=localStorage.getItem('mks_transparent')==='false'?'off':'on';}catch{root.dataset.cosmicGlass='on';}
      let parallaxPreference=false;try{parallaxPreference=localStorage.getItem(COSMIC_PARALLAX_KEY)==='true';}catch{}
      write('--cosmos-clear-veil',!appearance.glassBlurEnabled||appearance.glassBlur===0?'rgba(4,8,22,.56)':'transparent');
      write('--cosmos-veil-alpha',String(appearance.glassOpacity/100*.42));
      write('--cosmos-sheen-alpha',String(appearance.borderStrength/100*.35));
      write('--cosmos-glint-alpha',root.dataset.cosmicGlass==='off'||appearance.cardStyle==='flat'?'0':String(appearance.borderStrength/300));
      if(theme==='dark-cosmos'){
        write('--theme-decoration',themeDecoration(theme));
        if(backdropEpoch!==session.epoch){
          const previous=backdropEpoch>=0&&previousTab!=='map'?{image:root.style.getPropertyValue('--cosmos-scene-image'),size:root.style.getPropertyValue('--cosmos-scene-size'),position:root.style.getPropertyValue('--cosmos-scene-position')}:null;
          const scene=session.scene;setScene(scene);
          for(const [key,value] of Object.entries(cosmicBackdropStyle(scene)))write(key,value);
          backdropEpoch=session.epoch;
          if((entered||previous===null)&&tab!=='map'&&!reduced&&!light)blend(previous);
        }
      }else root.style.removeProperty('--theme-decoration');
      const changed=nextRegion!==region;region=nextRegion;measure();
      const nextAllowed=cosmicMotionAllowed({theme,hidden:document.hidden,nativeActive,reducedMotion:reduced,lightEffects:light,hasRegion:Boolean(region),tab});
      if(nextAllowed!==allowed||changed){
        allowed=nextAllowed;animation?.cancel();animation=null;cometAnimation?.cancel();cometAnimation=null;stopStars();scheduler.refresh();cometScheduler.refresh();
      }
      if(allowed)startStars();else{stopAccents();fading?.cancel();if(transition.current)transition.current.style.display='none';}
      setParallax(allowed&&parallaxPreference&&tab!=='map');
      if(changed){if(settle!==null)clearTimeout(settle);settle=setTimeout(()=>{settle=null;measure();},600);}
      root.dataset.cosmicMotion=allowed?'on':'off';
    };
    for(const event of ['storage','focus','pks-interface-appearance','pks-profile-applied'])window.addEventListener(event,update);
    window.addEventListener('resize',measure);document.addEventListener('scroll',measure,true);document.addEventListener('pointerup',measure);
    document.addEventListener('visibilitychange',update);media.addEventListener('change',update);update();
    const native=Capacitor.isNativePlatform()?App.addListener('appStateChange',state=>{nativeActive=state.isActive;update();}):null;
    native?.catch(()=>{});
    return ()=>{
      disposed=true;if(settle!==null)clearTimeout(settle);scheduler.stop();cometScheduler.stop();animation?.cancel();cometAnimation?.cancel();stopStars();stopAccents();fading?.cancel();setParallax(false);observer.disconnect();
      for(const event of ['storage','focus','pks-interface-appearance','pks-profile-applied'])window.removeEventListener(event,update);
      window.removeEventListener('resize',measure);document.removeEventListener('scroll',measure,true);document.removeEventListener('pointerup',measure);
      document.removeEventListener('visibilitychange',update);media.removeEventListener('change',update);
      native?.then(handle=>handle.remove()).catch(()=>{});
      for(const key of [...Object.keys(cosmicBackdropStyle(session.scene)),'--cosmos-glint-alpha','--cosmos-clear-veil','--cosmos-veil-alpha','--cosmos-sheen-alpha'])root.style.removeProperty(key);
      delete root.dataset.cosmicTheme;delete root.dataset.cosmicMotion;delete root.dataset.cosmicGlass;root.style.removeProperty('--theme-decoration');for(const key of ['--cosmos-scene-image','--cosmos-scene-size','--cosmos-scene-position','--cosmos-viewport-width','--cosmos-viewport-height'])root.style.removeProperty(key);
    };
  },[host]);
  return host?createPortal(<>
    <div ref={stage} data-cosmic-stage aria-hidden="true"><div data-cosmic-nebula/><div data-cosmic-distance/><div data-cosmic-planets>{scene?.planets.map((planet,i)=>{
      const name=COSMIC_PLANET_NAMES[planet.planet],url=`/themes/kosmos/${name}.svg`;
      return <span data-cosmic-orb data-cosmic-diameter={planet.diameter.toFixed(1)} key={`${name}:${i}`} style={{width:planet.size,left:`${planet.x}%`,top:`${planet.y}%`,transform:'translate(-50%,-50%)',aspectRatio:`512 / ${name==='saturn'?170:288}`,'--orb-image':`url("${url}")`} as CSSProperties}><img src={url} alt="" width="512" height={name==='saturn'?170:288}/><i data-cosmic-terminator/></span>;
    })}</div></div>
    <div ref={field} data-cosmic-effects aria-hidden="true">{COSMIC_STAR_POSITIONS.map((_,i)=><span key={i} data-cosmic-star/>)}<span ref={streak} data-cosmic-meteor>{[0,1,2].map(i=><i key={i} data-cosmic-fragment/>)}</span><span ref={comet} data-cosmic-comet><i/></span><span ref={nova} data-cosmic-nova/></div>
    <div ref={transition} data-cosmic-transition aria-hidden="true"/>
  </>,host):null;
}
