'use client';
import {useEffect,useRef,useState,type PointerEvent} from 'react';
import {animate,useMotionValue,useReducedMotion} from 'motion/react';
export const SHEET_SPRING={type:'spring' as const,stiffness:380,damping:36};
/** Pointer capture makes the whole sheet follow the handle, with one snap policy. */
export function useSheetGesture(expanded:boolean,change:(expanded:boolean)=>void,compact:number,full:number){
  const height=useMotionValue(compact),reduce=useReducedMotion();
  const gesture=useRef<{id:number;y:number;height:number;moved:boolean}|null>(null),skip=useRef(false);
  const animation=useRef<ReturnType<typeof animate>|null>(null);
  const [dragging,setDragging]=useState(false);
  const settle=(target:number)=>{animation.current?.stop();animation.current=animate(height,target,reduce?{duration:0}:SHEET_SPRING);};
  useEffect(()=>{if(!gesture.current)settle(expanded?full:compact);return()=>animation.current?.stop();},[expanded,compact,full,reduce]);
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
  return {height,dragging,handle:{
    onPointerDown:(event:PointerEvent<HTMLElement>)=>{if(event.button!==0)return;animation.current?.stop();skip.current=false;gesture.current={id:event.pointerId,y:event.clientY,height:height.get(),moved:false};event.currentTarget.setPointerCapture(event.pointerId);},
    onPointerMove:(event:PointerEvent<HTMLElement>)=>{const start=gesture.current;if(!start||start.id!==event.pointerId)return;const dy=event.clientY-start.y;if(Math.abs(dy)>5&&!start.moved){start.moved=true;setDragging(true);}if(start.moved)height.set(Math.max(compact,Math.min(full,start.height-dy)));},
    onPointerUp:(event:PointerEvent<HTMLElement>)=>finish(event),
    onPointerCancel:(event:PointerEvent<HTMLElement>)=>finish(event,true),
    onClick:()=>{if(skip.current){skip.current=false;return;}change(!expanded);},
  }};
}
