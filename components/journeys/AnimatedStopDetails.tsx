'use client';
import {useEffect,useRef,type ReactNode} from 'react';

export default function AnimatedStopDetails({summary,children}:{summary:ReactNode;children:ReactNode}){
 const details=useRef<HTMLDetailsElement>(null),content=useRef<HTMLDivElement>(null),animation=useRef<Animation|null>(null),desired=useRef(false);
 useEffect(()=>()=>animation.current?.cancel(),[]);
 function toggle(){
  const node=details.current,body=content.current;if(!node||!body)return;
  const height=node.open?body.getBoundingClientRect().height:0;
  desired.current=!desired.current;animation.current?.cancel();
  const open=desired.current;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){node.open=open;return;}
  node.open=true;
  const next=body.animate([{height:height+'px',opacity:height?1:0},{height:(open?body.scrollHeight:0)+'px',opacity:open?1:0}],{duration:260,easing:'cubic-bezier(.22,1,.36,1)'});
  animation.current=next;
  next.onfinish=()=>{node.open=open;animation.current=null;};
 }
 return <details ref={details} className="connections-stop-details"><summary onClick={e=>{e.preventDefault();toggle();}}>{summary}</summary><div ref={content} className="connections-stop-content">{children}</div></details>;
}
