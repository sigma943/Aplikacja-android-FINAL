'use client';
import {useState,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';

/** Closed controls mount on first use, then stay mounted to preserve edits. */
export default function PersonalizationGroup({id,title,subtitle,icon,children,forceOpen=false}:{id:string;title:string;subtitle:string;icon:ReactNode;children:ReactNode;forceOpen?:boolean}){
  const [opened,setOpened]=useState(false);
  return <details data-personal-group={id} className="personal-group group" open={forceOpen||undefined}
    onToggle={event=>{if(event.target===event.currentTarget&&event.currentTarget.open)setOpened(true);}}>
    <summary><span className="personal-group-icon">{icon}</span><span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span><span className="mt-1 block text-[11px] opacity-60">{subtitle}</span></span><ChevronDown size={17} className="shrink-0 transition-transform group-open:rotate-180"/></summary>
    {(opened||forceOpen)&&<div className="personal-group-body">{children}</div>}
  </details>;
}
