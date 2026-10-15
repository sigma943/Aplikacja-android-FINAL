'use client';
import {useEffect,useRef} from 'react';
import {Capacitor} from '@capacitor/core';
import {App} from '@capacitor/app';
import {cosmicMeteorScheduler,cosmicCometDelay} from '@/lib/cosmic-effects';
import {INTERFACE_APPEARANCE_KEY,normalizeInterfaceAppearance} from '@/lib/interface-appearance';

/** All artwork and motion is clipped by this local layer, never portalled over streets. */
export default function CosmicFilterEffects(){
 const field=useRef<HTMLDivElement>(null),meteor=useRef<HTMLSpanElement>(null),comet=useRef<HTMLSpanElement>(null);
 useEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  let active=false,nativeActive=true;const animations=new Map<string,Animation>();
  const fly=(kind:'meteor'|'comet')=>{
   const node=(kind==='meteor'?meteor:comet).current;if(!node)return;
   animations.get(kind)?.cancel();
   node.style.left=(55+Math.random()*40)+'%';node.style.top=(12+Math.random()*30)+'%';
   animations.set(kind,node.animate([{opacity:0,transform:'translate(0,0) rotate(-25deg)'},{opacity:kind==='meteor'?.85:.7,offset:.18},{opacity:0,transform:`translate(-${kind==='meteor'?140:220}px,${kind==='meteor'?65:102}px) rotate(-25deg)`}],{duration:kind==='meteor'?780:2100,easing:'linear',fill:'both'}));
  };
  const clock={set:(fn:()=>void,ms:number)=>setTimeout(fn,ms),clear:(id:ReturnType<typeof setTimeout>)=>clearTimeout(id)};
  const meteors=cosmicMeteorScheduler(()=>active,()=>fly('meteor'),clock);
  const comets=cosmicMeteorScheduler(()=>active,()=>fly('comet'),clock,()=>cosmicCometDelay());
  const refresh=()=>{
   let reduced=media.matches,light=false;
   try{reduced ||= normalizeInterfaceAppearance(JSON.parse(localStorage.getItem(INTERFACE_APPEARANCE_KEY)||'{}')).reducedMotion;light=localStorage.getItem('mks_light_effects')==='true';}catch{}
   active=document.documentElement.dataset.cosmicTheme==='on'&&!document.hidden&&nativeActive&&!reduced&&!light&&!field.current?.parentElement?.closest('[inert],[aria-hidden="true"]');
   if(field.current)field.current.dataset.active=String(active);
   if(!active){for(const animation of animations.values())animation.cancel();animations.clear();}
   meteors.refresh();comets.refresh();
  };
  const observer=new MutationObserver(refresh);
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-cosmic-theme']});
  observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['aria-hidden','inert']});
  const events=['storage','focus','pks-interface-appearance','pks-profile-applied'];
  for(const event of events)window.addEventListener(event,refresh);
  document.addEventListener('visibilitychange',refresh);media.addEventListener('change',refresh);refresh();
  const native=Capacitor.isNativePlatform()?App.addListener('appStateChange',state=>{nativeActive=state.isActive;refresh();}):null;
  native?.catch(()=>{});
  return()=>{meteors.stop();comets.stop();for(const animation of animations.values())animation.cancel();observer.disconnect();for(const event of events)window.removeEventListener(event,refresh);document.removeEventListener('visibilitychange',refresh);media.removeEventListener('change',refresh);native?.then(handle=>handle.remove()).catch(()=>{});};
 },[]);
 return <div ref={field} data-filter-cosmos aria-hidden="true"><span ref={meteor} data-filter-meteor/><span ref={comet} data-filter-comet/></div>;
}
