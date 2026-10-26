'use client';
import {useLayoutEffect,useRef,useState,type ComponentPropsWithoutRef,type ReactNode} from 'react';
import {useJourneyReducedMotion as useInterfaceReducedMotion} from '@/lib/journey-motion';
type Props=Omit<ComponentPropsWithoutRef<'details'>,'children'|'open'|'onToggle'> & {summary:ReactNode;children:ReactNode;forceOpen?:boolean;contentClassName?:string};
/** Preserve native keyboard/find-in-page behaviour and lazily retain form edits.
 * Keep details open through collapse, then hide its body after the last frame. */
export default function AnimatedDetails({summary,children,forceOpen=false,contentClassName,...props}:Props){
 const [manual,setManual]=useState(false),[mounted,setMounted]=useState(forceOpen);
 const expanded=forceOpen||manual,reduced=useInterfaceReducedMotion();
 const root=useRef<HTMLDetailsElement>(null),body=useRef<HTMLDivElement>(null),animation=useRef<Animation|null>(null),interrupted=useRef<{height:number;opacity:number}|null>(null);
 useLayoutEffect(()=>{
  const node=root.current,content=body.current;if(!node||!content)return;
  const height=interrupted.current?.height??(node.open?content.getBoundingClientRect().height:0);
  const opacity=interrupted.current?.opacity??(height?1:0);interrupted.current=null;
  animation.current?.cancel();animation.current=null;
  if(expanded){node.open=true;setMounted(true);}
  if(reduced||!content.animate||!node.open){node.open=expanded;return;}
  const next=content.animate([{height:height+'px',opacity},{height:(expanded?content.scrollHeight:0)+'px',opacity:expanded?1:0}],{duration:260,easing:'cubic-bezier(.22,1,.36,1)'});
  animation.current=next;
  next.onfinish=()=>{node.open=expanded;animation.current=null;next.cancel();};
  return()=>{if(animation.current){interrupted.current={height:content.getBoundingClientRect().height,opacity:Number(getComputedStyle(content).opacity)};}next.cancel();animation.current=null;};
 },[expanded,reduced]);
 return <details {...props} ref={root} data-ui-details data-ui-expanded={expanded} onToggle={event=>{if(event.target===event.currentTarget&&!animation.current&&event.currentTarget.open!==expanded)setManual(event.currentTarget.open);}}>
  <summary aria-expanded={expanded} onClick={event=>{event.preventDefault();setManual(!expanded);}}>{summary}</summary>
  <div ref={body} data-ui-transition="details" inert={!expanded} aria-hidden={!expanded} style={{overflow:'clip'}}>{(mounted||expanded)&&<div className={contentClassName}>{children}</div>}</div>
 </details>;
}
