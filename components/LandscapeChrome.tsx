'use client';
import {useEffect} from 'react';
/** Windows reuse the single scene renderer: no extra workers or draw loops. */
export default function LandscapeChrome({variant}:{variant:'filter'|'navigation'|'panel'}){
  useEffect(()=>{window.dispatchEvent(new Event('pks-landscape-window'));},[]);
  return <span data-landscape-chrome={variant} aria-hidden="true"><canvas data-landscape-window={variant}/></span>;
}
