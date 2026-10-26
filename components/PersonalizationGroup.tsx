'use client';
import type {ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
import AnimatedDetails from './AnimatedDetails';
export default function PersonalizationGroup({id,title,subtitle,icon,children,forceOpen=false}:{id:string;title:string;subtitle:string;icon:ReactNode;children:ReactNode;forceOpen?:boolean}){
 return <AnimatedDetails data-personal-group={id} className="personal-group group" forceOpen={forceOpen} contentClassName="personal-group-body" summary={<><span className="personal-group-icon">{icon}</span><span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span><span className="mt-1 block text-[11px] opacity-60">{subtitle}</span></span><ChevronDown size={17} className="shrink-0 ui-disclosure-chevron"/></>}>{children}</AnimatedDetails>;
}
