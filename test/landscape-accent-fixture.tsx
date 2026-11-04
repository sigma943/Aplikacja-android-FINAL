import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import InterfacePersonalization from '@/components/InterfacePersonalization';
import {MapHeader,BottomNavigation} from '@/components/ApplicationChrome';
import {activeInterfaceAccent,applyInterfaceAppearance,DEFAULT_INTERFACE_APPEARANCE,INTERFACE_APPEARANCE_KEY,normalizeInterfaceAppearance} from '@/lib/interface-appearance';
import {uiAccentVariables} from '@/lib/ui-accent';
import {useLandscapeDay} from '@/lib/use-landscape-day';
import {landscapePalette} from '@/lib/landscape-palette';
const q=new URLSearchParams(location.search),root=document.documentElement;
root.dataset.landscapePeriod=q.get('period')||'day';
function Fixture(){
 const [theme,setTheme]=useState('dark-mountains'),[general,setGeneral]=useState(localStorage.getItem('mks_theme')||'#ff8000');
 const [value,setValue]=useState(()=>normalizeInterfaceAppearance(JSON.parse(localStorage.getItem(INTERFACE_APPEARANCE_KEY)||'{}')));
 const day=useLandscapeDay(theme==='dark-mountains'),dark=theme==='dark-mountains'?!day:theme.startsWith('dark'),active=activeInterfaceAccent(value,theme,general,day);
 useEffect(()=>{const clean=applyInterfaceAppearance(root,{...value,reducedMotion:true},dark,general,false,theme);for(const [k,v]of Object.entries(uiAccentVariables(active,dark)))root.style.setProperty(k,v);root.dataset.landscapeTheme=theme==='dark-mountains'?'on':'off';if(theme==='dark-mountains')for(const [k,v]of Object.entries(landscapePalette({sun:{altitude:day?.5:-.5}} as any,64,day,value,general)))root.style.setProperty(k,v);return clean;},[value,theme,general,day,dark,active]);
 const save=(next:typeof value)=>{const normalized=normalizeInterfaceAppearance(next);setValue(normalized);localStorage.setItem(INTERFACE_APPEARANCE_KEY,JSON.stringify(normalized));window.dispatchEvent(new Event('pks-interface-appearance'));};
 const saveGeneral=(color:string)=>{setGeneral(color);localStorage.setItem('mks_theme',color);};
 const noop=()=>{},chrome={mapGlassPanel:'pks-map-search-panel',mapGlassInput:'',textSub:'',bottomGlassShell:'pks-navigation'};
 return <div className={'pks-theme-root '+(theme==='light-warm'?'theme-warm':'')} data-ui-theme={theme} style={uiAccentVariables(active,dark) as React.CSSProperties}>
  <div data-test-controls>{['dark-mountains','light','light-warm','light-pink','light-sky','dark','dark-oled','dark-forest','dark-cosmos'].map(t=><button key={t} data-test-theme={t} onClick={()=>setTheme(t)}>{t}</button>)}{['day','night'].map(period=><button key={period} data-test-period={period} onClick={()=>{root.dataset.landscapePeriod=period;window.dispatchEvent(new Event('pks-landscape-period'));}}>{period}</button>)}<output data-active-accent={active} data-general-accent={general} data-day={String(day)}>{active}</output></div>
  <div className="pks-options-sheet" style={{maxWidth:600,margin:'auto'}}><InterfacePersonalization chrome={chrome} value={value} onChange={save} dark={dark} theme={theme} accent={general} setTheme={setTheme} setAccent={saveGeneral} glass setGlass={noop} glow={false} setGlow={noop} glowStrength={40} setGlowStrength={noop} lightEffects={false}/></div>
  <div data-test-chrome><MapHeader {...chrome} themeColor={active} transparentUI={false} isDark={dark} isManualRefreshing={false} showAlertDot={false} isOffline={false} filterRoute="" setFilterRoute={noop} handleManualRefresh={noop} closeMapPanelsForSearch={noop}/><BottomNavigation activeTab="map" className="pks-navigation h-20" themeColor={active} onMap={noop} onStops={noop} onOptions={noop}/></div>
 </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
