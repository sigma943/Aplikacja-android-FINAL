import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import OptionsContent from '../components/OptionsContent';
import OptionsSheet from '../components/OptionsSheet';
import UIMotionProvider from '../components/UIMotionProvider';
import {INTERFACE_APPEARANCE_KEY,normalizeInterfaceAppearance} from '../lib/interface-appearance';
localStorage.setItem('mks_app_theme','dark-cosmos');
localStorage.setItem('mks_light_effects','false');
localStorage.setItem(INTERFACE_APPEARANCE_KEY,JSON.stringify({reducedMotion:false}));
function Fixture(){
 const [appearance,setAppearance]=useState(()=>normalizeInterfaceAppearance(null)),[light,setLight]=useState(false),[expanded,setExpanded]=useState(true),[theme,setTheme]=useState('dark-cosmos'),[accent,setAccent]=useState('#00a3a2'),[glass,setGlass]=useState(true),[glow,setGlow]=useState(false),[strength,setStrength]=useState(40),[show,setShow]=useState(true);
 const saveAppearance=(value:typeof appearance)=>{setAppearance(value);localStorage.setItem(INTERFACE_APPEARANCE_KEY,JSON.stringify(value));window.dispatchEvent(new Event('pks-interface-appearance'));};
 const saveLight=(next:boolean)=>{setLight(next);localStorage.setItem('mks_light_effects',String(next));window.dispatchEvent(new Event('pks-interface-appearance'));};
 const saveTheme=(next:string)=>{setTheme(next);localStorage.setItem('mks_app_theme',next);window.dispatchEvent(new Event('pks-interface-appearance'));};
 return <div className="pks-theme-root" data-ui-theme={theme} style={{position:'fixed',inset:0,background:'#101827',color:'white'}}>
  <nav style={{position:'absolute',top:0,zIndex:20001}}><button data-test-light onClick={()=>saveLight(!light)}>Lekkie</button><button data-test-reduce onClick={()=>saveAppearance({...appearance,reducedMotion:!appearance.reducedMotion})}>Ogranicz</button><button data-test-show onClick={()=>setShow(true)}>Opcje</button>{['dark-cosmos','dark-mountains','light-sky'].map(id=><button key={id} data-test-theme={id} onClick={()=>saveTheme(id)}>{id}</button>)}</nav>
  {show&&<OptionsSheet expanded={expanded} onExpandedChange={setExpanded} onClose={()=>setShow(false)} className="pks-options-sheet flex w-full flex-col rounded-3xl border p-4" overlayClassName="absolute inset-0 flex items-end p-3">
   <OptionsContent chrome={{mapGlassPanel:'pks-map-surface pks-glass',mapGlassInput:'',textSub:'',bottomGlassShell:'pks-navigation'}} appearance={appearance} saveAppearance={saveAppearance} onOpenPersonalization={()=>setExpanded(true)} panelGlow={glow} glowStrength={strength} savePanelGlow={setGlow} saveGlowStrength={setStrength} themeColor={accent} textSub="" optionsCard="pks-option-card" isDark={!theme.startsWith('light')} isWarm={false} appTheme={theme} optionsButton="" isOptionsExpanded={expanded} saveAppTheme={saveTheme} saveThemeColor={setAccent} transparentUI={glass} saveTransparentUI={setGlass} showInactive={false} saveInactive={()=>{}} lightEffects={light} saveLightEffects={saveLight}/>
  </OptionsSheet>}
 </div>;
}
createRoot(document.getElementById('root')!).render(<UIMotionProvider><Fixture/></UIMotionProvider>);
