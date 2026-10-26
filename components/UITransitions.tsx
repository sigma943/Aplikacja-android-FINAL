'use client';
import {AnimatePresence,motion,useIsPresent,type HTMLMotionProps} from 'motion/react';
import type {ReactNode} from 'react';
import {useJourneyReducedMotion as useInterfaceReducedMotion} from '@/lib/journey-motion';
export const UI_EASE=[.22,1,.36,1] as const;
/** Finite interaction transitions stay enabled with lighter decorative effects. */
export function UITabPanel({children,...props}:HTMLMotionProps<'div'>){
 const reduced=useInterfaceReducedMotion(),present=useIsPresent();
 return <motion.div {...props} data-ui-transition="tab" inert={!present} initial={reduced?false:{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={reduced?{opacity:1,y:0}:{opacity:0,y:-5}} transition={{duration:reduced?0:.18,ease:UI_EASE}}>{children}</motion.div>;
}
type DisclosureProps={open:boolean;children:ReactNode;id?:string;className?:string;keepMounted?:boolean};
function DisclosureBody({open,children,id,className}:DisclosureProps){
 const reduced=useInterfaceReducedMotion(),present=useIsPresent();
 return <motion.div id={id} className={className} data-ui-transition="disclosure" inert={!open||!present} aria-hidden={!open||!present} style={{overflow:'clip'}} initial={reduced?false:{height:0,opacity:0}} animate={{height:open?'auto':0,opacity:open?1:0}} exit={{height:0,opacity:0}} transition={{duration:reduced?0:.26,ease:UI_EASE}}>{children}</motion.div>;
}
export function UIDisclosure(props:DisclosureProps){
 return props.keepMounted?<DisclosureBody {...props}/>:<AnimatePresence initial={false}>{props.open&&<DisclosureBody key="body" {...props}/>}</AnimatePresence>;
}
