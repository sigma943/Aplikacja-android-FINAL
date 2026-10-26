'use client';
import {UIDisclosure} from '../UITransitions';
import type {ReactNode} from 'react';
/** Release expensive maps after the finite exit transition. */
export default function JourneyDisclosure({open,children}:{open:boolean;children:ReactNode}){
 return <UIDisclosure open={open} className="connections-disclosure">{children}</UIDisclosure>;
}
