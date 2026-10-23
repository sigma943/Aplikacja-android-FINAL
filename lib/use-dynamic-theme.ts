'use client';
import {useEffect,type RefObject} from 'react';
import {readAppTheme} from './app-theme';
import {horizonSnapshot,HORIZON_STEP_MS} from './horizon-sky';
import {isAppVisible,observeAppActivity} from './app-activity';
import {readHorizonLocation,rememberHorizonLocation} from './horizon-location';

export function useDynamicTheme(ref:RefObject<HTMLDivElement|null>){
  useEffect(()=>{
    const root=document.documentElement,media=matchMedia('(prefers-reduced-motion: reduce)');
    let timer:ReturnType<typeof setTimeout>|undefined,disposed=false,enabled=false,visible=false,first=true;
    let animations:Animation[]=[],locationPending=false,attemptedLocation=false,layer=0;
    const variables=new Set<string>();
    const stop=()=>{clearTimeout(timer);timer=undefined;for(const a of animations)a.cancel();animations=[];};
    const write=(key:string,value:string)=>{root.style.setProperty(key,value);variables.add(key);};
    const reduced=()=>media.matches||root.dataset.personalMotion==='reduced'||root.dataset.personalLightEffects==='on';
    const requestLocation=async(explicit=false)=>{
      if(locationPending||!enabled||!isAppVisible()||!navigator.geolocation)return;
      if(!explicit){
        if(attemptedLocation)return;attemptedLocation=true;
        if(readHorizonLocation().known&&Date.now()-readHorizonLocation().at<6*3600_000)return;
        try{if((await navigator.permissions.query({name:'geolocation'})).state!=='granted')return;}catch{return;}
      }
      if(disposed||!enabled||!isAppVisible())return;
      locationPending=true;
      navigator.geolocation.getCurrentPosition(position=>{
        locationPending=false;if(disposed||!enabled)return;
        rememberHorizonLocation(position.coords.latitude,position.coords.longitude);
      },()=>{locationPending=false;
        document.querySelectorAll('[data-horizon-location-label]').forEach(n=>{n.textContent='Lokalizacja niedostępna — używam zapisanej lokalizacji lub Rzeszowa.';});
      },{enableHighAccuracy:false,maximumAge:6*3600_000,timeout:8000});
    };
    const tick=()=>{
      stop();if(disposed||!enabled||!isAppVisible()||!ref.current)return;
      const location=readHorizonLocation(),now=Date.now();
      const current=horizonSnapshot(now,location.lat,location.lon),next=horizonSnapshot(now+HORIZON_STEP_MS,location.lat,location.lon);
      const duration=reduced()?0:HORIZON_STEP_MS;
      const scenes=[ref.current,...document.querySelectorAll<HTMLDivElement>('[data-horizon-window]')];
      for(const stage of scenes){
      stage.style.visibility='visible';
      const mainMap=stage===ref.current&&document.querySelector('.pks-theme-root')?.getAttribute('data-cosmic-tab')==='map'&&!document.querySelector('.pks-options-sheet');
      const bounds=stage.getBoundingClientRect();
      const animate=duration&&!mainMap&&bounds.width>0&&bounds.height>0&&bounds.bottom>0&&bounds.top<innerHeight&&bounds.right>0&&bounds.left<innerWidth&&getComputedStyle(stage).visibility!=='hidden';
      stage.dataset.moving=duration?'on':'off';
      const layers=stage.querySelectorAll<HTMLElement>('[data-horizon-gradient]');
      const gradient=(s:typeof current)=>`linear-gradient(180deg,${s.top} 0%,${s.top} 27%,${s.middle} 62%,${s.bottom} 80%,${s.bottom} 100%)`;
      // Two static gradients crossfade on the compositor; no full-screen
      // animated gradient, blur, canvas loop, React state or per-frame JS.
      layers[layer].style.background=gradient(current);layers[layer].style.opacity='1';
      const incoming=layers[1-layer];incoming.style.background=gradient(next);incoming.style.opacity='0';
      incoming.style.zIndex='1';layers[layer].style.zIndex='0';
      if(animate&&gradient(current)!==gradient(next))animations.push(incoming.animate([{opacity:0},{opacity:1}],{duration,fill:'forwards'}));
      const move=(selector:string,a:{x:number;y:number;opacity:number},b:typeof a)=>{
        const node=stage.querySelector<HTMLElement>(selector)!;
        const transform=(p:typeof a)=>`translate(${(p.x/100*stage.clientWidth).toFixed(2)}px,${(p.y/100*stage.clientHeight).toFixed(2)}px) translate(-50%,-50%)`;
        node.style.transform=transform(a);node.style.opacity=String(a.opacity);
        if(animate&&(a.opacity>0||b.opacity>0))animations.push(node.animate([{transform:transform(a),opacity:a.opacity},{transform:transform(b),opacity:b.opacity}],{duration,fill:'forwards'}));
      };
      move('[data-horizon-sun]',current.sun,next.sun);move('[data-horizon-moon]',current.moon,next.moon);
      stage.querySelector('[data-horizon-moon-lit]')!.setAttribute('d',current.moon.path);
      stage.querySelector('[data-horizon-moon-disc]')!.setAttribute('transform',`rotate(${current.moon.rotation})`);
      const stars=stage.querySelector<HTMLElement>('[data-horizon-stars]')!;stars.style.opacity=String(current.stars);
      if(animate&&current.stars!==next.stars)animations.push(stars.animate([{opacity:current.stars},{opacity:next.stars}],{duration,fill:'forwards'}));
      stage.dataset.solarAltitude=current.altitude.toFixed(3);stage.dataset.moonFraction=current.moon.fraction.toFixed(4);
      stage.style.setProperty('--horizon-ridge-far',current.ridgeFar);stage.style.setProperty('--horizon-ridge-mid',current.ridgeMid);stage.style.setProperty('--horizon-ridge-near',current.ridgeNear);
      stage.style.setProperty('--horizon-town-opacity',String(current.night));
      stage.style.visibility='visible';
      }
      write('--horizon-surface',current.surface);write('--horizon-raised',current.raised);write('--horizon-accent',current.accent);
      write('--horizon-canvas',current.top);
      root.style.setProperty('--pks-initial-bg',current.top);
      document.querySelectorAll('[data-horizon-location-label]').forEach(n=>{n.textContent=location.known?'Niebo dla Twojej przybliżonej lokalizacji.':'Niebo dla Rzeszowa. Możesz użyć swojej lokalizacji.';});
      first=false;layer=1-layer;timer=setTimeout(tick,HORIZON_STEP_MS);
    };
    const update=()=>{
      const nextEnabled=readAppTheme()==='dark-horizon',nextVisible=isAppVisible();
      const changed=nextEnabled!==enabled||nextVisible!==visible;
      enabled=nextEnabled;visible=nextVisible;
      root.dataset.horizonTheme=enabled?'on':'off';
      if(enabled&&visible){if(changed||first)tick();void requestLocation();}
      else{stop();first=true;if(ref.current)ref.current.style.visibility='hidden';}
    };
    const refresh=()=>{first=true;update();};
    const locationRequest=()=>{void requestLocation(true);};
    const stopActivity=observeAppActivity(update);
    const sceneChanged=new MutationObserver(records=>{
      if(records.some(record=>record.type==='attributes'||[...record.addedNodes,...record.removedNodes].some(node=>node instanceof Element&&(node.matches('[data-horizon-window],.pks-options-sheet')||node.querySelector('[data-horizon-window],.pks-options-sheet')))))refresh();
    });
    sceneChanged.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-cosmic-tab']});
    for(const event of ['pks-interface-appearance','pks-profile-applied','storage','focus'])window.addEventListener(event,refresh);
    window.addEventListener('pks-horizon-location',refresh);window.addEventListener('pks-horizon-location-request',locationRequest);
    window.addEventListener('resize',refresh);media.addEventListener('change',refresh);update();
    return()=>{disposed=true;stop();stopActivity();sceneChanged.disconnect();delete root.dataset.horizonTheme;
      for(const key of variables)root.style.removeProperty(key);
      for(const event of ['pks-interface-appearance','pks-profile-applied','storage','focus'])window.removeEventListener(event,refresh);
      window.removeEventListener('pks-horizon-location',refresh);window.removeEventListener('pks-horizon-location-request',locationRequest);
      window.removeEventListener('resize',refresh);media.removeEventListener('change',refresh);
    };
  },[ref]);
}
