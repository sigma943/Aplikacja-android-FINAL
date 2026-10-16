"use client";
import AppBackBridge from './AppBackBridge';
import CosmicEffects from './CosmicEffects';
import {readAppTheme,resolveAppTheme} from '@/lib/app-theme';
import { MotionConfig } from 'motion/react';
import {useEffect,useState,type ReactNode} from 'react';
import {INTERFACE_APPEARANCE_KEY,normalizeInterfaceAppearance,applyInterfaceAppearance} from '@/lib/interface-appearance';

import {panelGlowStrength,panelGlowVariables} from '@/lib/panel-glow';

import {applyScheduledProfile} from '@/lib/personalization-profiles';

export default function UIMotionProvider({children}: {children: ReactNode}) {
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{
    const root=document.documentElement,media=window.matchMedia('(prefers-color-scheme: dark)');
    let cleanupAppearance:undefined|(()=>void);
    let glowKeys:string[]=[];
    let appliedKey='';
    const update=()=>{
      const switched=applyScheduledProfile();
      let value=normalizeInterfaceAppearance(null);
      try{value=normalizeInterfaceAppearance(JSON.parse(localStorage.getItem(INTERFACE_APPEARANCE_KEY)||'{}'));}catch{/* Use defaults for damaged saved settings. */}
      const theme=resolveAppTheme(readAppTheme(),media.matches);
      const dark=theme.startsWith('dark'),lightEffects=localStorage.getItem('mks_light_effects')==='true';
      const accent=localStorage.getItem('mks_theme')||'#00a3a2';
      const key=JSON.stringify([value,dark,accent,lightEffects,theme,localStorage.getItem('mks_panel_glow'),localStorage.getItem('mks_panel_glow_strength')]);
      if(key===appliedKey){if(switched)window.dispatchEvent(new Event('pks-profile-applied'));return;}
      appliedKey=key;
      cleanupAppearance?.();
      cleanupAppearance=applyInterfaceAppearance(root,value,dark,accent,lightEffects,theme);
      const strength=panelGlowStrength(localStorage.getItem('mks_panel_glow_strength'));
      root.dataset.panelGlow=localStorage.getItem('mks_panel_glow')==='true'&&strength>0?'on':'off';
      const variables=panelGlowVariables(value.glowColor,strength,dark,lightEffects,{style:value.glowStyle,spread:value.glowSpread,placement:value.glowPlacement});
      glowKeys=Object.keys(variables);
      for(const [key,next]of Object.entries(variables))root.style.setProperty(key,next);
      setReduced(value.reducedMotion);
      if(switched)window.dispatchEvent(new Event('pks-profile-applied'));
    };
    update();
    window.addEventListener('pks-interface-appearance',update);
    window.addEventListener('storage',update);
    window.addEventListener('focus',update);
    document.addEventListener('visibilitychange',update);
    const timer=window.setInterval(update,30000);
    media.addEventListener('change',update);
    return ()=>{
      window.removeEventListener('pks-interface-appearance',update);window.removeEventListener('storage',update);media.removeEventListener('change',update);
      window.clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);
      cleanupAppearance?.();delete root.dataset.panelGlow;for(const key of glowKeys)root.style.removeProperty(key);
    };
  },[]);
  return <MotionConfig reducedMotion={reduced?'always':'user'} transition={{duration: .24, ease: [.22, 1, .36, 1]}}><AppBackBridge />{children}<CosmicEffects/></MotionConfig>;
}
