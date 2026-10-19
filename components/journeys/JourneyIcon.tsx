'use client';
import {useId} from 'react';

/** Two map pins joined by a dotted route; inherits the active navigation color. */
export default function JourneyIcon({className='',size}:{className?:string;size?:number}){
 const gradient='journey-pins-'+useId().replace(/:/g,'');
 return <svg className={className} width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" data-journey-tab-icon>
  <defs><linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1"><stop stopColor="color-mix(in srgb,currentColor 65%,#fff)"/><stop offset=".6" stopColor="currentColor"/><stop offset="1" stopColor="currentColor"/></linearGradient></defs>
  <path d="M11 41c6 5 12 2 14-5s5-9 10-10" stroke="var(--ui-text, currentColor)" strokeWidth="3" strokeLinecap="round" strokeDasharray="3 5" opacity=".65"/>
  <path d="M10 18a8 8 0 0 0-8 8c0 5.7 8 14 8 14s8-8.3 8-14a8 8 0 0 0-8-8Zm0 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7ZM37 2a9 9 0 0 0-9 9c0 6.2 9 15 9 15s9-8.8 9-15a9 9 0 0 0-9-9Zm0 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" fill={`url(#${gradient})`} fillRule="evenodd"/>
 </svg>;
}
