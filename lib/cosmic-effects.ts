export const COSMIC_METEOR_INTERVAL=8000;
export const COSMIC_METEOR_DURATION=780;
export const COSMIC_METEOR_MIN_INTERVAL=3000;
export const COSMIC_METEOR_MAX_INTERVAL=20000;
export function cosmicMeteorDelay(random:()=>number=Math.random){
  return Math.round(COSMIC_METEOR_MIN_INTERVAL+Math.max(0,Math.min(1,random()))*(COSMIC_METEOR_MAX_INTERVAL-COSMIC_METEOR_MIN_INTERVAL));
}
export const COSMIC_TWINKLE_INTERVAL=9000;
export const COSMIC_STAR_POSITIONS=[[16,18],[77,31],[39,54],[87,76],[23,86],[61,12],[55,70],[8,43],[91,48],[45,24],[69,88],[30,65],[82,9],[12,72],[57,39],[40,92]] as const;
export function cosmicMotionAllowed(value:{theme:string;hidden:boolean;nativeActive:boolean;reducedMotion:boolean;lightEffects:boolean;hasRegion?:boolean}){
  return value.theme==='dark-cosmos'&&!value.hidden&&value.nativeActive&&!value.reducedMotion&&!value.lightEffects&&value.hasRegion!==false;
}
/** One timeout per meteor; no render loop or timers while the app is inactive. */
export function cosmicMeteorScheduler(allowed:()=>boolean,run:()=>void,clock:{set:(fn:()=>void,ms:number)=>ReturnType<typeof setTimeout>;clear:(id:ReturnType<typeof setTimeout>)=>void},interval:number|(()=>number)=()=>cosmicMeteorDelay()){
  let timer:ReturnType<typeof setTimeout>|null=null,stopped=false;
  const cancel=()=>{if(timer!==null)clock.clear(timer);timer=null;};
  const schedule=()=>{timer=clock.set(tick,typeof interval==='function'?interval():interval);};
  const tick=()=>{timer=null;if(stopped||!allowed())return;run();if(!stopped&&allowed())schedule();};
  return {refresh(){if(stopped||!allowed()){cancel();return;}if(timer===null)schedule();},stop(){stopped=true;cancel();}};
}


export const COSMIC_PARALLAX_KEY='mks_cosmic_parallax';
export function cosmicParallaxOffset(x:number,y:number){
  const clamp=(n:number)=>Number.isFinite(n)?Math.max(-1,Math.min(1,n)):0;
  return {x:clamp(x)*7,y:clamp(y)*5};
}
/** Rare accents share the existing meteor clock, without extra wakeups. */
export function cosmicAccentEvent(random:()=>number=Math.random){
  const value=random();return value<.08?'nova':value<.22?'fragment':'meteor';
}
