'use client';
import {useEffect} from 'react';
import {Capacitor} from '@capacitor/core';
import {appBackStack} from '@/lib/app-back';

export default function AppBackBridge() {
  useEffect(() => {
    let cancelled = false;
    if(Capacitor.isNativePlatform()) {
      const listener = import('@capacitor/app').then(({App}) => {
        if(cancelled)return null;
        return App.addListener('backButton',() => {
          if(cancelled)return;
          if(!appBackStack.dispatch())void App.exitApp();
        });
      });
      return () => {cancelled=true;void listener.then(handle=>handle?.remove()).catch(()=>{});};
    }
    // Keep one history guard, rather than adding a new entry on each GPS update.
    let armed = Boolean(history.state?.pksBackGuard), ignoredPops = 0;
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => {
      if(cancelled)return;
      if(appBackStack.canGoBack && !armed && !ignoredPops) {
        history.pushState({...history.state,pksBackGuard:true},''); armed=true;
      } else if(!appBackStack.canGoBack && armed) {
        armed=false;ignoredPops++;history.back();
      }
    };
    const schedule = () => {clearTimeout(timer);timer=setTimeout(sync,0);};
    const pop = () => {
      armed=false;
      if(ignoredPops)ignoredPops--;
      else appBackStack.dispatch();
      schedule();
    };
    const unsubscribe=appBackStack.subscribe(schedule);
    window.addEventListener('popstate',pop);schedule();
    return () => {cancelled=true;clearTimeout(timer);unsubscribe();window.removeEventListener('popstate',pop);};
  },[]);
  return null;
}
