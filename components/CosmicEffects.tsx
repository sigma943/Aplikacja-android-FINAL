'use client';
import {useLayoutEffect,useRef} from 'react';
import {Capacitor} from '@capacitor/core';
import {App} from '@capacitor/app';
import {readAppTheme,resolveAppTheme,themeDecoration} from '@/lib/app-theme';
import {INTERFACE_APPEARANCE_KEY,normalizeInterfaceAppearance} from '@/lib/interface-appearance';
import {COSMIC_METEOR_DURATION,COSMIC_STAR_POSITIONS,cosmicMeteorScheduler,cosmicMotionAllowed} from '@/lib/cosmic-effects';

import {COSMIC_DUST,cosmicSky,COSMIC_PLANET_NAMES,COSMIC_PANEL_SELECTOR,cosmicOrb,cosmicScene,cosmicPanelScene,cosmicVisitSession} from '@/lib/cosmic-scene';

let visitSession:ReturnType<typeof cosmicVisitSession>|null=null;

/** Static artwork, slow independent twinkles and meteors clipped to space panels. */
export default function CosmicEffects(){
  const streak=useRef<HTMLSpanElement>(null),field=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const root=document.documentElement,media=matchMedia('(prefers-reduced-motion: reduce)');
    let nativeActive=true,allowed=false,animation:Animation|null=null,disposed=false;
    let region:HTMLElement|null=null,settle:ReturnType<typeof setTimeout>|null=null;
    const regionSelector='.pks-options-sheet,[data-carrier-sheet],.map-detail-shell,.transit-view,.pks-panel-scope[data-cosmic-view]';
    const session=visitSession??=cosmicVisitSession(crypto.getRandomValues(new Uint32Array(1))[0]);
    const stars:Animation[]=[],placed=new WeakMap<Element,{epoch:number;key:string}>();
    const panelKey=(node:HTMLElement)=>{
      if(node.dataset.stopCardId)return `stop:${node.dataset.stopCardId}`;
      if(node.dataset.cosmicPanel)return `${node.closest<HTMLElement>('[data-cosmic-view]')?.dataset.cosmicView||'app'}:panel:${node.dataset.cosmicPanel}`;
      if(node.classList.contains('admin-topbar'))return 'admin:topbar';
      if(node.classList.contains('pks-personal-panel'))return 'admin:sidebar';
      if(node.id)return `id:${node.id}`;
      const scope=node.parentElement?.closest<HTMLElement>('[data-cosmic-panel]')?.dataset.cosmicPanel||node.closest<HTMLElement>('[data-cosmic-view]')?.dataset.cosmicView||'app';
      const kind=[...node.classList].find(name=>/^(transit-|pks-|admin-|widget-)/.test(name))||node.tagName;
      const heading=node.querySelector('h1,h2,h3,h4,h5,legend,summary,[aria-label]');
      const label=(heading?.getAttribute('aria-label')||heading?.textContent||'').replace(/\s+/g,' ').trim();
      return `${scope}:${kind}:${label}`;
    };
    const scopedKey=(node:HTMLElement)=>({key:panelKey(node),seed:undefined as string|undefined});
    // The committed active tab is the only navigation source. Missing tabs
    // during startup/loading are ignored, and data view mutations never enter.
    const place=(node:HTMLElement)=>{
      const {key}=scopedKey(node);
      const scene=session.scene(key,nextSeed=>{
        const kind=node.hasAttribute('data-stop-card-id')?'stop-card':node.matches('[data-departure-row],[data-cosmic-surface=route-row]')?'row':node.closest('[data-cosmic-view^=admin]')?'admin':node.matches('.pks-map-search-panel,.pks-option-card')?'controls':'content';
        const value=cosmicPanelScene(nextSeed,kind);
        return value;
      });
      node.style.setProperty('--cosmos-planet',scene.showPlanet?cosmicOrb(scene):'none');
      node.style.setProperty('--cosmos-secondary-orb','none');
      node.style.setProperty('--cosmos-planet-position',`${scene.x.toFixed(1)}% ${scene.y.toFixed(1)}%`);
      node.style.setProperty('--cosmos-planet-size',`${scene.size.toFixed(1)}px`);
      node.style.setProperty('--cosmos-dust',COSMIC_DUST[scene.dust]);
      node.style.setProperty('--cosmos-dust-position',`${scene.dustX}% ${scene.dustY}%`);
      node.style.setProperty('--cosmos-star-position',`${scene.starX}px ${scene.starY}px`);
      node.style.setProperty('--cosmos-panel-sky',scene.sky);
      node.dataset.cosmicScene=key;
      node.dataset.cosmicVisit=String(session.epoch);
      placed.set(node,{epoch:session.epoch,key});
      node.dataset.cosmicPlanet=scene.showPlanet?'on':'off';
      node.dataset.cosmicPlanetName=scene.sun?'sun':COSMIC_PLANET_NAMES[scene.planet];
    };
    const discover=(node:Element)=>{
      const panels=[...(node.matches(COSMIC_PANEL_SELECTOR)?[node]:[]),...node.querySelectorAll(COSMIC_PANEL_SELECTOR)];
      for(const panel of panels){
        if(!(panel instanceof HTMLElement)||panel.hasAttribute('data-cosmic-owned'))continue;
        const previous=placed.get(panel),scope=scopedKey(panel);
        const identityChanged=Boolean(previous&&(panel.dataset.stopCardId||panel.dataset.cosmicPanel)&&previous.key!==scope.key);
        if(!previous||identityChanged||previous.epoch!==session.epoch)place(panel);
      }
    };
    const measure=()=>{
      if(!region||!field.current)return;
      // The sky belongs to the whole screen, including gaps between cards.
      Object.assign(field.current.style,{inset:'0',width:'100%',height:'100%',borderRadius:'0'});
    };
    const findRegion=()=>{
      for(const selector of regionSelector.split(','))for(const node of document.querySelectorAll<HTMLElement>(selector)){
        if(node.closest('[aria-hidden="true"],[inert]'))continue;
        const rect=node.getBoundingClientRect();
        if(rect.width>100&&rect.height>80&&rect.right>0&&rect.left<innerWidth&&rect.bottom>0&&rect.top<innerHeight&&getComputedStyle(node).visibility!=='hidden')return node;
      }
      return null;
    };
    const observer=new MutationObserver(records=>{
      let regionsChanged=false;
      const added:Element[]=[];
      for(const record of records){
        if(record.type==='attributes'){
          if(record.attributeName==='data-active-tab'||record.attributeName==='aria-hidden'||record.attributeName==='data-cosmic-view'||record.attributeName==='data-cosmic-seed'||(record.attributeName==='aria-current'&&record.target instanceof Element&&record.target.hasAttribute('data-nav-item')))regionsChanged=true;
          if(['data-stop-card-id','data-cosmic-panel','data-cosmic-surface'].includes(record.attributeName||'')&&record.target instanceof Element)added.push(record.target);
        }
        for(const node of [...record.addedNodes,...record.removedNodes])if(node instanceof Element){
          if(node.matches(regionSelector)||node.querySelector(regionSelector))regionsChanged=true;
          if(node.isConnected)added.push(node);
        }
      }
      // Resolve the final visible view before decorating any newly mounted panels.
      // A loading render and its completed render must share the same visit.
      if(regionsChanged)update();
      else if(root.dataset.cosmicTheme==='on')for(const node of added)discover(node);
    });
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-active-tab','aria-hidden','aria-current','data-stop-card-id','data-cosmic-panel','data-cosmic-surface','data-cosmic-view','data-cosmic-seed']});
    const stopStars=()=>{for(const star of stars)star.cancel();stars.length=0;};
    const scheduler=cosmicMeteorScheduler(()=>allowed,()=>{
      if(document.querySelector('.pks-loading-screen')||!streak.current?.animate)return;
      measure();
      streak.current.style.left=(55+Math.random()*35)+'%';streak.current.style.top=(8+Math.random()*48)+'%';
      animation?.cancel();
      animation=streak.current.animate([
        {opacity:0,transform:'translate3d(0,0,0) rotate(-35deg)'},
        {opacity:.65,transform:'translate3d(-18px,13px,0) rotate(-35deg)',offset:.16},
        {opacity:.45,transform:'translate3d(-105px,74px,0) rotate(-35deg)',offset:.72},
        {opacity:0,transform:'translate3d(-150px,105px,0) rotate(-35deg)'},
      ],{duration:COSMIC_METEOR_DURATION,easing:'linear'});
    },{set:(fn,ms)=>setTimeout(fn,ms),clear:id=>clearTimeout(id)});
    const update=()=>{
      if(disposed)return;
      let reduced=media.matches,light=false;
      try{light=localStorage.getItem('mks_light_effects')==='true';reduced ||= normalizeInterfaceAppearance(JSON.parse(localStorage.getItem(INTERFACE_APPEARANCE_KEY)||'{}')).reducedMotion;}catch{}
      // React's committed tab is independent of navigation remounts and previews.
      const tab=document.querySelector<HTMLElement>('.pks-theme-root[data-active-tab]')?.dataset.activeTab;
      const nextRegion=findRegion();
      session.sync(tab,tab==='options');
      const theme=resolveAppTheme(readAppTheme());
      root.dataset.cosmicTheme=theme==='dark-cosmos'?'on':'off';
      if(theme==='dark-cosmos'){
        const canvas=session.scene('canvas:primary',seed=>({...cosmicScene(seed),sky:cosmicSky(seed)}));
        root.style.setProperty('--cosmos-canvas-dust',COSMIC_DUST[canvas.dust]);
        root.style.setProperty('--theme-decoration',themeDecoration(theme));root.style.setProperty('--cosmos-sky',canvas.sky);discover(document.body);}else {root.style.removeProperty('--theme-decoration');root.style.removeProperty('--cosmos-sky');root.style.removeProperty('--cosmos-canvas-orb');root.style.removeProperty('--cosmos-canvas-dust');}
      const changed=nextRegion!==region;region=nextRegion;measure();
      const nextAllowed=cosmicMotionAllowed({theme,hidden:document.hidden,nativeActive,reducedMotion:reduced,lightEffects:light,hasRegion:Boolean(region)});
      if(nextAllowed!==allowed||changed){
        allowed=nextAllowed;animation?.cancel();animation=null;stopStars();scheduler.refresh();
      }
      if(changed){if(settle!==null)clearTimeout(settle);settle=setTimeout(()=>{settle=null;measure();},600);}
      root.dataset.cosmicMotion=allowed?'on':'off';
    };
    for(const event of ['storage','focus','pks-interface-appearance','pks-profile-applied'])window.addEventListener(event,update);
    window.addEventListener('resize',measure);document.addEventListener('scroll',measure,true);document.addEventListener('pointerup',measure);
    document.addEventListener('visibilitychange',update);media.addEventListener('change',update);update();
    const native=Capacitor.isNativePlatform()?App.addListener('appStateChange',state=>{nativeActive=state.isActive;update();}):null;
    native?.catch(()=>{});
    return ()=>{
      disposed=true;if(settle!==null)clearTimeout(settle);scheduler.stop();animation?.cancel();stopStars();observer.disconnect();
      for(const event of ['storage','focus','pks-interface-appearance','pks-profile-applied'])window.removeEventListener(event,update);
      window.removeEventListener('resize',measure);document.removeEventListener('scroll',measure,true);document.removeEventListener('pointerup',measure);
      document.removeEventListener('visibilitychange',update);media.removeEventListener('change',update);
      native?.then(handle=>handle.remove()).catch(()=>{});
      delete root.dataset.cosmicTheme;delete root.dataset.cosmicMotion;root.style.removeProperty('--theme-decoration');root.style.removeProperty('--cosmos-sky');root.style.removeProperty('--cosmos-canvas-orb');root.style.removeProperty('--cosmos-canvas-dust');
    };
  },[]);
  return <div ref={field} data-cosmic-effects aria-hidden="true">{COSMIC_STAR_POSITIONS.map((_,i)=><span key={i} data-cosmic-star/>)}<span ref={streak} data-cosmic-meteor/></div>;
}
