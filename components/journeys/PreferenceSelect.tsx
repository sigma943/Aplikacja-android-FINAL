'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {Check,ChevronDown} from 'lucide-react';
import {useAppBack} from '@/lib/use-app-back';
type Choice={value:string;label:string;description?:string};
export default function PreferenceSelect({label,value,choices,onChange,active}:{label:string;value:string;choices:Choice[];onChange:(value:string)=>void;active:boolean}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),id=useId();
 const close=()=>{setOpen(false);trigger.current?.focus({preventScroll:true});};
 useAppBack(active&&open,()=>{close();return true;},80);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
  document.addEventListener('pointerdown',outside);
  root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({preventScroll:true});
  return()=>document.removeEventListener('pointerdown',outside);
 },[open]);
 return <div ref={root} className="connections-choice" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false);}}>
  <span id={id+'-label'} className="connections-choice-label">{label}</span>
  <button ref={trigger} type="button" className="connections-choice-trigger" aria-labelledby={id+'-label '+id+'-value'} aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(v=>!v)} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);}}}><span id={id+'-value'}>{choices.find(c=>c.value===value)?.label}</span><ChevronDown size={16}/></button>
  {open&&<div id={id} className="connections-choice-menu" role="menu" aria-labelledby={id+'-label'} onKeyDown={e=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
   const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button')),index=buttons.indexOf(document.activeElement as HTMLButtonElement);
   const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:e.key==='ArrowDown'?(index+1)%buttons.length:e.key==='ArrowUp'?(index-1+buttons.length)%buttons.length:null;
   if(next!==null){e.preventDefault();buttons[next]?.focus();}
  }}>{choices.map(choice=><button key={choice.value} type="button" role="menuitemradio" aria-checked={value===choice.value} onClick={()=>{onChange(choice.value);close();}}><span>{choice.label}{choice.description&&<small>{choice.description}</small>}</span>{value===choice.value&&<Check size={17}/>}</button>)}</div>}
 </div>;
}
