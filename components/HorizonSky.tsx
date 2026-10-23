'use client';
import {useRef} from 'react';
import {useDynamicTheme} from '@/lib/use-dynamic-theme';
import {HORIZON_STARS} from '@/lib/horizon-sky';

export default function HorizonSky(){
  const ref=useRef<HTMLDivElement>(null);useDynamicTheme(ref);
  return <div ref={ref} data-horizon-sky aria-hidden="true"><SkyContents/></div>;
}
/** Small map windows share the same controller, clock and astronomical state. */
export function HorizonWindow(){return <div data-horizon-window aria-hidden="true"><SkyContents/></div>;}
function SkyContents(){return <>
    <div data-horizon-gradient/><div data-horizon-gradient/>
    <div data-horizon-stars><svg viewBox="0 0 1000 1000" preserveAspectRatio="none">{HORIZON_STARS.map((s,i)=><circle key={i} cx={s.x*10} cy={s.y*10} r={s.radius} fill="#f3f5ff" opacity={s.opacity}/>)}</svg></div>
    <div data-horizon-atmosphere>
      <div data-horizon-sun><span/></div>
      <div data-horizon-moon><svg viewBox="-28 -28 56 56"><g data-horizon-moon-disc><circle r="24" fill="#162033"/><path data-horizon-moon-lit fill="#f4ecd5"/><g fill="#8b8b84" opacity=".18"><circle cx="-8" cy="-7" r="5"/><circle cx="9" cy="7" r="7"/><circle cx="3" cy="-14" r="3"/></g></g></svg></div>
    </div>
    <div data-horizon-land/>
  </>;
}
