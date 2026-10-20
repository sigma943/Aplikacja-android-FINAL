'use client';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import type {ReactNode} from 'react';

/** Real height transitions in both directions; unmount expensive maps after exit. */
export default function JourneyDisclosure({open,children}:{open:boolean;children:ReactNode}){
 const reduced=useReducedMotion();
 return <AnimatePresence initial={false}>{open&&<motion.div className="connections-disclosure" initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:reduced?0:.28,ease:[.22,1,.36,1]}}>{children}</motion.div>}</AnimatePresence>;
}
