export function landscapeMotionPolicy(value:{hidden:boolean;nativeActive:boolean;reduced:boolean;light:boolean;limited:boolean;critical:boolean;slow:boolean}){
  const reason=value.hidden||!value.nativeActive?'hidden':value.critical?'thermal':value.reduced?'reduced-motion':value.light?'light-effects':value.limited?'power-saving':'active';
  return {reason,animate:reason==='active'||reason==='power-saving'||reason==='light-effects',interval:reason==='hidden'?0:reason==='power-saving'?1000/15:reason==='light-effects'?1000/12:reason==='active'?(value.slow?125:67):15000};
}

/** Ignore texture decoding/warmup and isolated expensive relights. Recover when
 * normal frames become cheap again, rather than permanently selecting 4 fps. */
export function landscapeFrameBudget(previous:number,cost:number){return previous===0?cost:previous*.9+cost*.1;}
