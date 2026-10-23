'use client';
import {useEffect,useState} from 'react';
/** Notify the app only when solar day/night changes, never on an animation frame. */
export function useLandscapeDay(active:boolean){
  const [day,setDay]=useState(false);
  useEffect(()=>{
    if(!active)return;
    const update=()=>setDay(document.documentElement.dataset.landscapePeriod==='day');
    update();window.addEventListener('pks-landscape-period',update);
    return()=>window.removeEventListener('pks-landscape-period',update);
  },[active]);
  return active&&day;
}
