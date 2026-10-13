'use client';
import {useEffect,useRef} from 'react';
import {Capacitor} from '@capacitor/core';
import {App} from '@capacitor/app';
import {readAppTheme,resolveAppTheme,themeDecoration} from '@/lib/app-theme';
import {INTERFACE_APPEARANCE_KEY,normalizeInterfaceAppearance} from '@/lib/interface-appearance';
import {COSMIC_METEOR_DURATION,COSMIC_TWINKLE_INTERVAL,COSMIC_STAR_POSITIONS,cosmicMeteorScheduler,cosmicMotionAllowed} from '@/lib/cosmic-effects';

import {COSMIC_DUST,COSMIC_SKY,COSMIC_SUN,COSMIC_PLANET_NAMES,COSMIC_PANEL_SELECTOR,cosmicKeySeed,cosmicOrb,cosmicScene,cosmicListScene,cosmicVisitSession} from '@/lib/cosmic-scene';

let visitSession:ReturnType<typeof cosmicVisitSession>|null=null;

/** Static artwork, slow independent twinkles and meteors clipped to space panels. */
export default function CosmicEffects(){
  const streak=useRef<HTMLSpanElement>(null),field=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const root=document.documentElement,media=matchMedia('(prefers-reduced-motion: reduce)');
    let nativeActive=true,allowed=false,animation:Animation|null=null,disposed=false;
    let region:HTMLElement|null=null,settle:ReturnType<typeof setTimeout>|null=null;
    const regionSelector='.pks-options-sheet,[data-carrier-sheet],.map-detail-shell,.transit-view,.pks-panel-scope[data-cosmic-view]';
    const session=visitSession??=cosmicVisitSession(crypto.getRandomValues(new Uint32Array(1))[0]);
    let sequences=new WeakMap<Element,{previous?:ReturnType<typeof cosmicScene>;gap:number}>();
    const stars:Animation[]=[],placed=new WeakMap<Element,{epoch:number;key:string}>();
    const panelKey=(node:HTMLElement)=>{
      if(node.dataset.stopCardId)return `stop:${node.dataset.stopCardId}`;
      if(node.dataset.cosmicPanel)return `panel:${node.dataset.cosmicPanel}`;
      if(node.id)return `id:${node.id}`;
      const path:string[]=[];
      for(let element:Element|null=node;element&&element!==document.body;element=element.parentElement){
        if(element.id){path.unshift(`#${element.id}`);break;}
        const index=element.parentElement?[...element.parentElement.children].indexOf(element):0;
        path.unshift(`${element.tagName}:${index}`);
      }
      return path.join('/');
    };
    const scopedKey=(node:HTMLElement)=>{
      const seed=node.closest<HTMLElement>('[data-cosmic-seed]')?.dataset.cosmicSeed;
      return {seed,key:(seed?`scope:${seed}:`:'')+panelKey(node)};
    };
    const place=(node:HTMLElement)=>{
      const card=node.classList.contains('transit-stop-card'),group=node.parentElement;
      const sequence=card&&group?(sequences.get(group)||{gap:2}):undefined;
      const {key,seed}=scopedKey(node);
      const scene=session.scene(key,nextSeed=>{
        if(seed)nextSeed=cosmicKeySeed(Number(seed),panelKey(node));
        const value=sequence?cosmicListScene(nextSeed,sequence.previous,sequence.gap):cosmicScene(nextSeed);
        if(node.classList.contains('pks-map-search-panel'))value.showPlanet=false;
        return value;
      });
      if(sequence&&group){
        if(scene.showPlanet){sequence.previous=scene;sequence.gap=0;}else sequence.gap++;
        sequences.set(group,sequence);
      }
      node.style.setProperty('--cosmos-planet',scene.showPlanet?cosmicOrb(scene):'none');
      node.style.setProperty('--cosmos-planet-position',`${scene.x.toFixed(1)}% ${scene.y.toFixed(1)}%`);
      node.style.setProperty('--cosmos-planet-size',`${scene.size.toFixed(1)}px`);
      node.style.setProperty('--cosmos-dust',COSMIC_DUST[scene.dust]);
      node.style.setProperty('--cosmos-dust-position',`${scene.dustX}% ${scene.dustY}%`);
      node.dataset.cosmicScene=key;
      node.dataset.cosmicVisit=seed||String(session.epoch);
      placed.set(node,{epoch:session.epoch,key});
      node.dataset.cosmicPlanet=scene.showPlanet?'on':'off';
      node.dataset.cosmicPlanetName=scene.sun?'sun':COSMIC_PLANET_NAMES[scene.planet];
    };
    const discover=(node:Element)=>{
      const panels=[...(node.matches(COSMIC_PANEL_SELECTOR)?[node]:[]),...node.querySelectorAll(COSMIC_PANEL_SELECTOR)];
      for(const panel of panels){
        if(!(panel instanceof HTMLElement)||panel.hasAttribute('data-cosmic-owned'))continue;
        const previous=placed.get(panel),scope=scopedKey(panel);
        const identityChanged=Boolean(previous&&((panel.dataset.stopCardId||panel.dataset.cosmicPanel)?previous.key!==scope.key:scope.seed?!previous.key.startsWith(`scope:${scope.seed}:`):previous.key.startsWith('scope:')));
        if(!previous||identityChanged||(!scope.seed&&previous.epoch!==session.epoch))place(panel);
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
          if(record.attributeName==='aria-hidden'||record.attributeName==='data-cosmic-view'||record.attributeName==='data-cosmic-seed'||(record.attributeName==='aria-current'&&record.target instanceof Element&&record.target.hasAttribute('data-nav-item')))regionsChanged=true;
          if(record.attributeName==='data-stop-card-id'&&record.target instanceof Element)added.push(record.target);
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
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-hidden','aria-current','data-stop-card-id','data-cosmic-view','data-cosmic-seed']});
    const stopStars=()=>{for(const star of stars)star.cancel();stars.length=0;};
    const startStars=()=>{
      if(stars.length||!field.current)return;
      const points=field.current.querySelectorAll<HTMLElement>('[data-cosmic-star]');
      const positions=COSMIC_STAR_POSITIONS;
      points.forEach((point,i)=>{
        point.style.left=positions[i][0]+'%';point.style.top=positions[i][1]+'%';
        const duration=COSMIC_TWINKLE_INTERVAL+i*500;
        stars.push(point.animate([{opacity:.04},{opacity:.38,offset:.5},{opacity:.04}],{duration,delay:-i*1370,iterations:Infinity,easing:'ease-in-out'}));
      });
    };
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
      const active=[...document.querySelectorAll<HTMLElement>('.pks-navigation [data-nav-item][aria-current="page"]')].find(node=>!node.closest('.personal-preview-scene'));
      const tab=active?.dataset.navItem||session.tab?.split(':',1)[0]||'root';
      const nextRegion=findRegion();
      const logical=[...document.querySelectorAll<HTMLElement>('[data-cosmic-view]')].find(node=>!node.closest('[aria-hidden="true"],[inert],.personal-preview-scene'));
      // Loading, entrance animations and panel dimensions cannot start a visit.
      const overlay=[['.pks-options-sheet','options'],['[data-carrier-sheet]','carriers']].find(([selector])=>nextRegion?.matches(selector))?.[1];
      const view=overlay||logical?.dataset.cosmicView||(nextRegion?.matches('.map-detail-shell')?'map-detail':'tab');
      if(session.enter(`${tab}:${view}`))sequences=new WeakMap();
      const theme=resolveAppTheme(readAppTheme());
      root.dataset.cosmicTheme=theme==='dark-cosmos'?'on':'off';
      if(theme==='dark-cosmos'){root.style.setProperty('--theme-decoration',themeDecoration(theme));root.style.setProperty('--cosmos-sky',COSMIC_SKY);const backdrop=session.scene('screen-sky',cosmicScene);root.style.setProperty('--cosmos-ambient-orb',backdrop.sun?COSMIC_SUN:'none');discover(document.body);}else {root.style.removeProperty('--theme-decoration');root.style.removeProperty('--cosmos-sky');root.style.removeProperty('--cosmos-ambient-orb');}
      const changed=nextRegion!==region;region=nextRegion;measure();
      const nextAllowed=cosmicMotionAllowed({theme,hidden:document.hidden,nativeActive,reducedMotion:reduced,lightEffects:light,hasRegion:Boolean(region)});
      if(nextAllowed!==allowed||changed){
        allowed=nextAllowed;animation?.cancel();animation=null;stopStars();scheduler.refresh();
      }
      if(allowed)startStars();
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
      delete root.dataset.cosmicTheme;delete root.dataset.cosmicMotion;root.style.removeProperty('--theme-decoration');root.style.removeProperty('--cosmos-sky');root.style.removeProperty('--cosmos-ambient-orb');
    };
  },[]);
  return <div ref={field} data-cosmic-effects aria-hidden="true">{COSMIC_STAR_POSITIONS.map((_,i)=><span key={i} data-cosmic-star/>)}<span ref={streak} data-cosmic-meteor/></div>;
}
