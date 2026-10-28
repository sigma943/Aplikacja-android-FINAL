'use client';
import {useLayoutEffect} from 'react';
import {Capacitor,registerPlugin} from '@capacitor/core';
type Insets={top:number;bottom:number;left:number;right:number};
const bars=registerPlugin<{getInsets:()=>Promise<Insets>}>('SystemBars');
export default function NativeSystemBars(){
 useLayoutEffect(()=>{
  if(Capacitor.getPlatform()!=='android')return;
  let active=true;
  const apply=(insets:Insets)=>{
   if(!active)return;
   const root=document.documentElement;
   root.dataset.nativeEdge='true';
   for(const side of ['top','bottom','left','right'] as const){
    const value=insets[side];
    if(Number.isFinite(value)&&value>=0)root.style.setProperty('--native-'+side,value+'px');
   }
  };
  const change=(event:Event)=>apply((event as CustomEvent<Insets>).detail);
  window.addEventListener('pks-insets',change);
  void bars.getInsets().then(apply).catch(()=>{});
  return()=>{active=false;window.removeEventListener('pks-insets',change);};
 },[]);
 return null;
}
