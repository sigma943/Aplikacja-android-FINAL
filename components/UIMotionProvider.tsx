"use client";
import AppBackBridge from './AppBackBridge';
import { MotionConfig } from 'motion/react';
import {useEffect,useState,type ReactNode} from 'react';
import {INTERFACE_APPEARANCE_KEY,normalizeInterfaceAppearance,applyInterfaceAppearance} from '@/lib/interface-appearance';

import {panelGlowStrength,panelGlowVariables} from '@/lib/panel-glow';

export default function UIMotionProvider({children}: {children: ReactNode}) {
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{
    const root=document.documentElement,media=window.matchMedia('(prefers-color-scheme: dark)');
    let cleanupAppearance:undefined|(()=>void);
    let glowKeys:string[]=[];
    const update=()=>{
      let value=normalizeInterfaceAppearance(null);
      try{value=normalizeInterfaceAppearance(JSON.parse(localStorage.getItem(INTERFACE_APPEARANCE_KEY)||'{}'));}catch{/* Use defaults for damaged saved settings. */}
      const saved=(localStorage.getItem('mks_app_theme')||'dark-oled').trim().toLowerCase();
      const theme=saved==='system'?(media.matches?'dark':'light'):['amoled','oled','dark_oled','darkoled'].includes(saved)?'dark-oled':saved;
      const dark=theme.startsWith('dark'),lightEffects=localStorage.getItem('mks_light_effects')==='true';
      cleanupAppearance?.();
      cleanupAppearance=applyInterfaceAppearance(root,value,dark,localStorage.getItem('mks_theme')||'#00a3a2',lightEffects,theme);
      const strength=panelGlowStrength(localStorage.getItem('mks_panel_glow_strength'));
      root.dataset.panelGlow=localStorage.getItem('mks_panel_glow')==='true'&&strength>0?'on':'off';
      const variables=panelGlowVariables(value.glowColor,strength,dark,lightEffects,{style:value.glowStyle,spread:value.glowSpread,placement:value.glowPlacement});
      glowKeys=Object.keys(variables);
      for(const [key,next]of Object.entries(variables))root.style.setProperty(key,next);
      setReduced(value.reducedMotion);
    };
    update();
    window.addEventListener('pks-interface-appearance',update);
    window.addEventListener('storage',update);
    media.addEventListener('change',update);
    return ()=>{
      window.removeEventListener('pks-interface-appearance',update);window.removeEventListener('storage',update);media.removeEventListener('change',update);
      cleanupAppearance?.();delete root.dataset.panelGlow;for(const key of glowKeys)root.style.removeProperty(key);
    };
  },[]);
  return <MotionConfig reducedMotion={reduced?'always':'user'} transition={{duration: .24, ease: [.22, 1, .36, 1]}}><AppBackBridge />{children}</MotionConfig>;
}
