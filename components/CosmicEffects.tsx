'use client';
import {useEffect,useRef} from 'react';
import {Capacitor} from '@capacitor/core';
import {App} from '@capacitor/app';
import {readAppTheme,resolveAppTheme,themeDecoration} from '@/lib/app-theme';
import {INTERFACE_APPEARANCE_KEY,normalizeInterfaceAppearance} from '@/lib/interface-appearance';
import {COSMIC_METEOR_DURATION,COSMIC_TWINKLE_INTERVAL,cosmicMeteorScheduler,cosmicMotionAllowed} from '@/lib/cosmic-effects';

import {COSMIC_DUST,COSMIC_PLANETS,COSMIC_PANEL_SELECTOR,cosmicScene,cosmicListScene} from '@/lib/cosmic-scene';

/** Individually placed static scenes; only three tiny stars and one meteor animate. */
export default function CosmicEffects(){
  const streak=useRef<HTMLSpanElement>(null),field=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const root=document.documentElement,media=matchMedia('(prefers-reduced-motion: reduce)');
    let nativeActive=true,allowed=false,cycle=0,animation:Animation|null=null,disposed=false;
    let seed=crypto.getRandomValues(new Uint32Array(1))[0],sceneIndex=0;
    const sequences=new WeakMap<Element,{previous?:ReturnType<typeof cosmicScene>;gap:number}>();
    const stars:Animation[]=[],placed=new WeakSet<Element>();
    const place=(node:HTMLElement)=>{
      const card=node.classList.contains('transit-stop-card'),group=node.parentElement;
      const sequence=card&&group?(sequences.get(group)||{gap:2}):undefined;
      const nextSeed=(seed+Math.imul(++sceneIndex,2654435761))>>>0;
      const scene=sequence?cosmicListScene(nextSeed,sequence.previous,sequence.gap):cosmicScene(nextSeed);
      if(sequence&&group){
        if(scene.showPlanet){sequence.previous=scene;sequence.gap=0;}else sequence.gap++;
        sequences.set(group,sequence);
      }
      node.style.setProperty('--cosmos-planet',scene.showPlanet?COSMIC_PLANETS[scene.planet]:'none');
      node.style.setProperty('--cosmos-planet-position',`${scene.x.toFixed(1)}% ${scene.y.toFixed(1)}%`);
      node.style.setProperty('--cosmos-planet-size',`${scene.size.toFixed(1)}px`);
      node.style.setProperty('--cosmos-dust',COSMIC_DUST[scene.dust]);
      node.style.setProperty('--cosmos-dust-position',`${scene.dustX}px ${scene.dustY}px`);
      node.dataset.cosmicScene=String(sceneIndex);
      node.dataset.cosmicPlanet=scene.showPlanet?'on':'off';
    };
    const discover=(node:Element)=>{
      const panels=[...(node.matches(COSMIC_PANEL_SELECTOR)?[node]:[]),...node.querySelectorAll(COSMIC_PANEL_SELECTOR)];
      for(const panel of panels){if(!(panel instanceof HTMLElement))continue;if(!placed.has(panel)){placed.add(panel);place(panel);}}
    };
    const observer=new MutationObserver(records=>{if(root.dataset.cosmicTheme==='on')for(const record of records)for(const node of record.addedNodes)if(node instanceof Element)discover(node);});
    observer.observe(document.body,{childList:true,subtree:true});
    const stopStars=()=>{for(const star of stars)star.cancel();stars.length=0;};
    const scheduler=cosmicMeteorScheduler(()=>allowed,()=>{
      if(document.querySelector('.pks-loading-screen')||!streak.current?.animate)return;
      stopStars();
      const points=field.current?.querySelectorAll<HTMLElement>('[data-cosmic-star]');
      if(points)for(let n=0;n<3;n++){
        const point=points[(cycle*3+n)%points.length];
        point.style.left=(8+Math.random()*84)+'%';point.style.top=(8+Math.random()*82)+'%';
        stars.push(point.animate([{opacity:0},{opacity:.75,offset:.45},{opacity:.2,offset:.8},{opacity:0}],{duration:1600+n*160,easing:'ease-in-out'}));
      }
      ++cycle;
      if(cycle%2!==0)return;
      const left=42+Math.random()*50,top=10+Math.random()*64;
      streak.current.style.left=left+'%';streak.current.style.top=top+'%';
      animation?.cancel();
      animation=streak.current.animate([
        {opacity:0,transform:'translate3d(0,0,0) rotate(-35deg)'},
        {opacity:.65,transform:'translate3d(-18px,13px,0) rotate(-35deg)',offset:.16},
        {opacity:.45,transform:'translate3d(-105px,74px,0) rotate(-35deg)',offset:.72},
        {opacity:0,transform:'translate3d(-150px,105px,0) rotate(-35deg)'},
      ],{duration:COSMIC_METEOR_DURATION,easing:'linear'});
    },{set:(fn,ms)=>setTimeout(fn,ms),clear:id=>clearTimeout(id)},COSMIC_TWINKLE_INTERVAL);
    const update=()=>{
      if(disposed)return;
      let reduced=media.matches,light=false;
      try{light=localStorage.getItem('mks_light_effects')==='true';reduced ||= normalizeInterfaceAppearance(JSON.parse(localStorage.getItem(INTERFACE_APPEARANCE_KEY)||'{}')).reducedMotion;}catch{}
      const theme=resolveAppTheme(readAppTheme());
      root.dataset.cosmicTheme=theme==='dark-cosmos'?'on':'off';
      if(theme==='dark-cosmos'){root.style.setProperty('--theme-decoration',themeDecoration(theme));discover(document.body);}else {root.style.removeProperty('--theme-decoration');}
      allowed=cosmicMotionAllowed({theme,hidden:document.hidden,nativeActive,reducedMotion:reduced,lightEffects:light});
      root.dataset.cosmicMotion=allowed?'on':'off';
      animation?.cancel();animation=null;stopStars();scheduler.refresh();
    };
    for(const event of ['storage','focus','pks-interface-appearance','pks-profile-applied'])window.addEventListener(event,update);
    document.addEventListener('visibilitychange',update);media.addEventListener('change',update);update();
    const native=Capacitor.isNativePlatform()?App.addListener('appStateChange',state=>{nativeActive=state.isActive;update();}):null;
    native?.catch(()=>{});
    return ()=>{
      disposed=true;scheduler.stop();animation?.cancel();stopStars();observer.disconnect();
      for(const event of ['storage','focus','pks-interface-appearance','pks-profile-applied'])window.removeEventListener(event,update);
      document.removeEventListener('visibilitychange',update);media.removeEventListener('change',update);
      native?.then(handle=>handle.remove()).catch(()=>{});
      delete root.dataset.cosmicTheme;delete root.dataset.cosmicMotion;root.style.removeProperty('--theme-decoration');
    };
  },[]);
  return <div ref={field} data-cosmic-effects aria-hidden="true">{Array.from({length:9},(_,i)=><span key={i} data-cosmic-star/>)}<span ref={streak} data-cosmic-meteor/></div>;
}
