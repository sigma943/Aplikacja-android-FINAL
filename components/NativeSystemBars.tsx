'use client';
import {useLayoutEffect} from 'react';
import {Capacitor,registerPlugin} from '@capacitor/core';
type Insets={top:number;bottom:number;left:number;right:number};
const bars=registerPlugin<{getInsets:()=>Promise<Insets>;setStyle:(options:{darkIcons:boolean})=>Promise<void>}>('SystemBars');
export default function NativeSystemBars(){
 useLayoutEffect(()=>{
  if(Capacitor.getPlatform()!=='android')return;
  let active=true;
  let previous:boolean|undefined;
  const updateIcons=()=>{
   const root=document.documentElement;
   const explicit=root.dataset.systemBarIcons;
   const darkIcons=explicit?explicit==='dark':(root.dataset.pksTheme==='dark-mountains'
    ?root.dataset.landscapePeriod==='day':!root.dataset.pksTheme?.startsWith('dark'));
   if(darkIcons===previous)return;previous=darkIcons;
   void bars.setStyle({darkIcons}).catch(()=>{previous=undefined;});
  };
  const theme=new MutationObserver(updateIcons);
  theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-system-bar-icons','data-pks-theme','data-landscape-period']});
  updateIcons();
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
  return()=>{active=false;theme.disconnect();window.removeEventListener('pks-insets',change);};
 },[]);
 return null;
}
