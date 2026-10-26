'use client';
import type {ReactNode} from 'react';
import AnimatedDetails from '../AnimatedDetails';
export default function AnimatedStopDetails({summary,children}:{summary:ReactNode;children:ReactNode}){
 return <AnimatedDetails className="connections-stop-details" summary={summary} contentClassName="connections-stop-content">{children}</AnimatedDetails>;
}
