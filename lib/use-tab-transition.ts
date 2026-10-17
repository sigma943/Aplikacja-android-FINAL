'use client';
import {useEffect,useRef} from 'react';

/** Fade a separate colour veil: glass content keeps its original backdrop/compositing root. */
export function useTabTransition(tab:string,enabled:boolean) {
  const root=useRef<HTMLDivElement>(null),previous=useRef(tab);
  useEffect(()=>{
    const changed=previous.current!==tab;
    previous.current=tab;
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    if(!changed||!enabled||media.matches||document.hidden||!root.current?.animate)return;
    const animation=root.current.animate([{opacity:.55},{opacity:0}],{duration:180,easing:'cubic-bezier(.22,1,.36,1)'});
    const stopOnReduce=()=>{if(media.matches)animation.cancel();};
    media.addEventListener('change',stopOnReduce);
    return()=>{media.removeEventListener('change',stopOnReduce);animation.cancel();};
  },[tab,enabled]);
  return root;
}
