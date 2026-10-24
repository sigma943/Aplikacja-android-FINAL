'use client';
/** Navigational map motion is useful even when decorative effects are disabled. */
export function mapReducedMotion(){
 return typeof window!=='undefined'&&(window.matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.personalMapMotion==='reduced');
}
