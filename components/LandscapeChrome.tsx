'use client';
import {useEffect} from 'react';
/** Only the filter has a sky window. Other panels keep the milk material. */
export default function LandscapeChrome({variant}:{variant:'filter'|'navigation'|'panel'}){
 useEffect(()=>{if(variant==='filter')window.dispatchEvent(new Event('pks-landscape-window'));},[variant]);
 return variant==='filter'?<span data-landscape-chrome="filter" aria-hidden="true"><canvas data-landscape-window="filter"/></span>:null;
}
