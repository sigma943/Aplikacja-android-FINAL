import {journeyReducedMotion} from '@/lib/journey-motion';
/** Follow the tapped header while the preceding card collapses. Native scroll
 * anchoring cannot handle two simultaneous height changes reliably on Android. */
export function anchorJourneyHeader(view:HTMLElement,header:HTMLElement,initial=header.getBoundingClientRect().top-view.getBoundingClientRect().top){
 const target=Math.min(Math.max(12,initial),24),reduced=journeyReducedMotion();
 const start=performance.now();let frame=0,stopped=false;
 const stop=()=>{stopped=true;cancelAnimationFrame(frame);view.removeEventListener('wheel',stop);view.removeEventListener('touchstart',stop);view.removeEventListener('keydown',stop);};
 const follow=()=>{
  if(stopped||!header.isConnected){stop();return;}
  const progress=reduced?1:Math.min(1,(performance.now()-start)/280),ease=1-Math.pow(1-progress,3);
  const wanted=initial+(target-initial)*ease;
  view.scrollTop+=header.getBoundingClientRect().top-view.getBoundingClientRect().top-wanted;
  if(performance.now()-start<380)frame=requestAnimationFrame(follow);else stop();
 };
 view.addEventListener('wheel',stop,{passive:true});view.addEventListener('touchstart',stop,{passive:true});view.addEventListener('keydown',stop);
 follow();return stop;
}
