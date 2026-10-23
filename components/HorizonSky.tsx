'use client';
import {useRef} from 'react';
import {useDynamicTheme} from '@/lib/use-dynamic-theme';
import {HORIZON_STARS} from '@/lib/horizon-sky';
import HorizonLandscape from './HorizonLandscape';

export default function HorizonSky(){
  const ref=useRef<HTMLDivElement>(null);useDynamicTheme(ref);
  return <div ref={ref} data-horizon-sky aria-hidden="true"><SkyContents/></div>;
}
/** Small map windows share the same controller, clock and astronomical state. */
export function HorizonWindow({canvas=false}:{canvas?:boolean}){return <div data-horizon-window data-horizon-canvas={canvas?'true':undefined} aria-hidden="true"><SkyContents/></div>;}
function SkyContents(){return <>
    <div data-horizon-gradient/><div data-horizon-gradient/>
    <div data-horizon-stars><svg viewBox="0 0 1000 1000" preserveAspectRatio="none">{HORIZON_STARS.map((s,i)=><circle key={i} cx={s.x*10} cy={s.y*10} r={s.radius} fill="#f3f5ff" stroke="#f3f5ff" strokeWidth={s.radius>1?1:.5} vectorEffect="non-scaling-stroke" opacity={s.opacity}/>)}</svg></div>
    <div data-horizon-atmosphere>
      <div data-horizon-sun><span/></div>
      <div data-horizon-moon><svg viewBox="-28 -28 56 56"><g data-horizon-moon-disc><circle r="24" fill="#182044"/><path data-horizon-moon-lit fill="#fff0d2"/></g></svg></div>
    </div>
    <HorizonLandscape/>
  </>;
}
