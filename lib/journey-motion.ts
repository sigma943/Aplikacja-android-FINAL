'use client';
import {useSyncExternalStore} from 'react';

export function journeyReducedMotion(){
 return typeof window!=='undefined'&&(window.matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.personalMotion==='reduced'||document.documentElement.dataset.personalLightEffects==='on');
}
function subscribe(update:()=>void){
 const media=window.matchMedia('(prefers-reduced-motion: reduce)'),observer=new MutationObserver(update);
 media.addEventListener('change',update);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-personal-motion','data-personal-light-effects']});
 return()=>{media.removeEventListener('change',update);observer.disconnect();};
}
/** React to changes made while this tab is open, including the app preference. */
export function useJourneyReducedMotion(){return useSyncExternalStore(subscribe,journeyReducedMotion,()=>false);}
