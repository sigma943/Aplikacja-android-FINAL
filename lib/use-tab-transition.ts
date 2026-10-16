'use client';
import {useEffect,useRef} from 'react';

/** Animate the existing view without remounting maps or changing containing blocks. */
export function useTabTransition(tab:string,enabled:boolean) {
  const root=useRef<HTMLDivElement>(null),previous=useRef(tab);
  useEffect(()=>{
    const changed=previous.current!==tab;
    previous.current=tab;
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    if(!changed||!enabled||media.matches||document.hidden||!root.current?.animate)return;
    const animation=root.current.animate([{opacity:.45},{opacity:1}],{duration:180,easing:'cubic-bezier(.22,1,.36,1)'});
    const stopOnReduce=()=>{if(media.matches)animation.cancel();};
    media.addEventListener('change',stopOnReduce);
    return()=>{media.removeEventListener('change',stopOnReduce);animation.cancel();};
  },[tab,enabled]);
  return root;
}
