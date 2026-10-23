import {useId} from 'react';

/** Decorative chrome only: map tiles and all controls remain fully interactive. */
export default function LandscapeChrome({variant}:{variant:'filter'|'navigation'}){
  const id=useId();
  return <svg data-landscape-chrome={variant} viewBox={variant==='navigation'?'0 30 420 90':'0 0 420 120'} preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs><linearGradient id={id} x2="0" y2="1"><stop stopColor="currentColor" stopOpacity=".03"/><stop offset="1" stopColor="currentColor" stopOpacity=".32"/></linearGradient></defs>
    <path fill={`url(#${id})`} d="M0 111 39 77 58 94 106 43 143 88 174 65 213 99 266 51 301 85 329 65 370 101 420 73V120H0Z"/>
    <path d="m82 69 24-26 17 22-14-7-5 10-6-7Zm166 1 18-19 15 19-14-8-7 10" fill="currentColor" opacity=".32"/>
    <path data-landscape-chrome-cloud d="M245 28h32m48 13h48M40 33h40" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".35"/>
    <path d="M0 117q74-35 141-13t114-1q44-14 90 0t75-4" fill="none" stroke="currentColor" opacity=".4"/>
    <path data-landscape-chrome-water d="M209 97q-28 8 6 13t-17 10m31-7h12m-38-8h13" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".7"/>
    <g fill="currentColor" opacity=".36"><path d="m37 120 9-25 9 25Zm19 0 7-19 7 19Zm289 0 9-25 9 25Zm19 0 6-17 6 17Z"/></g>
  </svg>;
}
