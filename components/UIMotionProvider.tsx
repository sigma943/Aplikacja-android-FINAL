"use client";
import AppBackBridge from './AppBackBridge';
import { MotionConfig } from 'motion/react';
import {useEffect,useState,type ReactNode} from 'react';
import {INTERFACE_APPEARANCE_KEY,normalizeInterfaceAppearance} from '@/lib/interface-appearance';

export default function UIMotionProvider({children}: {children: ReactNode}) {
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{const update=()=>{try{setReduced(normalizeInterfaceAppearance(JSON.parse(localStorage.getItem(INTERFACE_APPEARANCE_KEY)||'{}')).reducedMotion);}catch{setReduced(false);}};update();window.addEventListener('pks-interface-appearance',update);return()=>window.removeEventListener('pks-interface-appearance',update);},[]);
  return <MotionConfig reducedMotion={reduced?'always':'user'} transition={{duration: .24, ease: [.22, 1, .36, 1]}}><AppBackBridge />{children}</MotionConfig>;
}
