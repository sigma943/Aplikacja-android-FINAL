'use client';
import {useCallback,useLayoutEffect,useRef,useState,type PointerEvent} from 'react';
import {useJourneyReducedMotion} from './journey-motion';
import {animate,useMotionValue} from 'motion/react';
export const SHEET_SPRING={type:'spring' as const,stiffness:380,damping:36};
/** Pointer capture makes the whole sheet follow the handle, with one snap policy. */
export function useSheetGesture(expanded:boolean,change:(expanded:boolean)=>void,compact:number,full:number,settledHeight=false,animateResize=false){
  const height=useMotionValue(expanded?full:compact),reduce=useJourneyReducedMotion();
  const gesture=useRef<{id:number;y:number;height:number;moved:boolean}|null>(null),skip=useRef(false);
  const animation=useRef<ReturnType<typeof animate>|null>(null);
  const [dragging,setDragging]=useState(false);
  const settle=useCallback((target:number)=>{animation.current?.stop();if(settledHeight||reduce){height.set(target);return;}animation.current=animate(height,target,SHEET_SPRING);},[height,settledHeight,reduce]);
  const syncHeight=useCallback(()=>{animation.current?.stop();height.set(expanded?full:compact);},[expanded,full,compact,height]);
  const previousSize=useRef({compact,full});
  useLayoutEffect(()=>{
    const resized=previousSize.current.compact!==compact||previousSize.current.full!==full;
    previousSize.current={compact,full};
    if(!gesture.current){if(resized&&!animateResize){animation.current?.stop();height.set(expanded?full:compact);}else settle(expanded?full:compact);}
    return()=>animation.current?.stop();
  },[expanded,compact,full,reduce,settledHeight,animateResize,height,settle]);
  const finish=(event:PointerEvent<HTMLElement>,cancel=false)=>{
    const start=gesture.current;if(!start||start.id!==event.pointerId)return;
    gesture.current=null;setDragging(false);
    if(cancel){skip.current=true;settle(expanded?full:compact);return;}
    if(!start.moved)return;
    skip.current=true;
    const dy=event.clientY-start.y;
    const next=Math.abs(dy)>24?dy<0:height.get()>(compact+full)/2;
    settle(next?full:compact);change(next);
  };
  return {height,dragging,syncHeight,handle:{
    onPointerDown:(event:PointerEvent<HTMLElement>)=>{if(event.button!==0)return;animation.current?.stop();skip.current=false;gesture.current={id:event.pointerId,y:event.clientY,height:height.get(),moved:false};event.currentTarget.setPointerCapture(event.pointerId);},
    onPointerMove:(event:PointerEvent<HTMLElement>)=>{const start=gesture.current;if(!start||start.id!==event.pointerId)return;const dy=event.clientY-start.y;if(Math.abs(dy)>5&&!start.moved){start.moved=true;setDragging(true);}if(start.moved)height.set(Math.max(compact,Math.min(full,start.height-dy)));},
    onPointerUp:(event:PointerEvent<HTMLElement>)=>finish(event),
    onPointerCancel:(event:PointerEvent<HTMLElement>)=>finish(event,true),
    onClick:()=>{if(skip.current){skip.current=false;return;}change(!expanded);},
  }};
}
