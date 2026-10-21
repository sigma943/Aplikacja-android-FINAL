"use client";
import {interfaceGoogleFont,loadInterfaceGoogleFont} from '@/lib/interface-fonts';
import {useForegroundRefresh} from '@/lib/use-foreground-refresh';
import {usePathname} from 'next/navigation';
import AppBackBridge from './AppBackBridge';
import CosmicEffects from './CosmicEffects';
import {readAppTheme,resolveAppTheme} from '@/lib/app-theme';
import { MotionConfig,MotionGlobalConfig } from 'motion/react';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {INTERFACE_APPEARANCE_KEY,normalizeInterfaceAppearance,applyInterfaceAppearance} from '@/lib/interface-appearance';

import {panelGlowStrength,panelGlowVariables} from '@/lib/panel-glow';

import {applyScheduledProfile} from '@/lib/personalization-profiles';

export default function UIMotionProvider({children}: {children: ReactNode}) {
  const pathname=usePathname();
  return pathname?.startsWith('/widget-data') ? <>{children}</> : <InteractiveMotionProvider>{children}</InteractiveMotionProvider>;
}

function InteractiveMotionProvider({children}: {children: ReactNode}) {
  const [reduced,setReduced]=useState(false);
  const updateRef=useRef<(()=>void)|null>(null);
  useForegroundRefresh('scheduled-appearance',async()=>{updateRef.current?.();},30000,true,30000,false);
  useEffect(()=>{
    const root=document.documentElement,media=window.matchMedia('(prefers-color-scheme: dark)');
    let cleanupAppearance:undefined|(()=>void);
    let glowKeys:string[]=[];
    let appliedKey='';const previousSkip=MotionGlobalConfig.skipAnimations;
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
      void loadInterfaceGoogleFont(interfaceGoogleFont(value)).catch(()=>{/* The system font keeps the interface usable offline. */});
      const strength=panelGlowStrength(localStorage.getItem('mks_panel_glow_strength'));
      root.dataset.panelGlow=!lightEffects&&localStorage.getItem('mks_panel_glow')==='true'&&strength>0?'on':'off';
      const variables=panelGlowVariables(value.glowColor,strength,dark,lightEffects,{style:value.glowStyle,spread:value.glowSpread,placement:value.glowPlacement});
      glowKeys=Object.keys(variables);
      for(const [key,next]of Object.entries(variables))root.style.setProperty(key,next);
      MotionGlobalConfig.skipAnimations=value.reducedMotion||lightEffects;
      setReduced(value.reducedMotion||lightEffects);
      if(switched)window.dispatchEvent(new Event('pks-profile-applied'));
    };
    update();
    window.addEventListener('pks-interface-appearance',update);
    window.addEventListener('storage',update);
    window.addEventListener('focus',update);
    updateRef.current=update;
    media.addEventListener('change',update);
    return ()=>{
      window.removeEventListener('pks-interface-appearance',update);window.removeEventListener('storage',update);media.removeEventListener('change',update);
      updateRef.current=null;window.removeEventListener('focus',update);
      MotionGlobalConfig.skipAnimations=previousSkip;cleanupAppearance?.();delete root.dataset.panelGlow;for(const key of glowKeys)root.style.removeProperty(key);
    };
  },[]);
  return <MotionConfig reducedMotion={reduced?'always':'user'} transition={{duration: .24, ease: [.22, 1, .36, 1]}}><AppBackBridge />{children}<CosmicEffects/></MotionConfig>;
}
