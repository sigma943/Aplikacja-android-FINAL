export const COSMIC_METEOR_INTERVAL=8000;
export const COSMIC_METEOR_DURATION=780;
export const COSMIC_TWINKLE_INTERVAL=9000;
export const COSMIC_STAR_POSITIONS=[[16,18],[77,31],[39,54],[87,76],[23,86],[61,12],[55,70],[8,43],[91,48],[45,24],[69,88],[30,65],[82,9],[12,72],[57,39],[40,92]] as const;
export function cosmicMotionAllowed(value:{theme:string;hidden:boolean;nativeActive:boolean;reducedMotion:boolean;lightEffects:boolean;hasRegion?:boolean}){
  return value.theme==='dark-cosmos'&&!value.hidden&&value.nativeActive&&!value.reducedMotion&&!value.lightEffects&&value.hasRegion!==false;
}
/** One timeout per meteor; no render loop or timers while the app is inactive. */
export function cosmicMeteorScheduler(allowed:()=>boolean,run:()=>void,clock:{set:(fn:()=>void,ms:number)=>ReturnType<typeof setTimeout>;clear:(id:ReturnType<typeof setTimeout>)=>void},interval=COSMIC_METEOR_INTERVAL){
  let timer:ReturnType<typeof setTimeout>|null=null,stopped=false;
  const cancel=()=>{if(timer!==null)clock.clear(timer);timer=null;};
  const tick=()=>{timer=null;if(stopped||!allowed())return;run();timer=clock.set(tick,interval);};
  return {refresh(){cancel();if(!stopped&&allowed())timer=clock.set(tick,interval);},stop(){stopped=true;cancel();}};
}
