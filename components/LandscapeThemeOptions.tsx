'use client';
import {useEffect,useState} from 'react';
import {Mountain,ChevronDown,RotateCcw} from 'lucide-react';
import AnimatedDetails from './AnimatedDetails';
import {DEFAULT_LANDSCAPE_SETTINGS,LANDSCAPE_SETTINGS_EVENT,readLandscapeSettings,saveLandscapeSettings,type LandscapeSettings} from '@/lib/landscape-settings';
export default function LandscapeThemeOptions({searchOpen=false}:{searchOpen?:boolean}){
 const [settings,setSettings]=useState({...DEFAULT_LANDSCAPE_SETTINGS}),[error,setError]=useState('');
 useEffect(()=>{const read=()=>setSettings(readLandscapeSettings());read();window.addEventListener('storage',read);window.addEventListener(LANDSCAPE_SETTINGS_EVENT,read);return()=>{window.removeEventListener('storage',read);window.removeEventListener(LANDSCAPE_SETTINGS_EVENT,read);};},[]);
 const change=(next:LandscapeSettings)=>{try{setSettings(saveLandscapeSettings(next));setError('');}catch{setError('Nie udało się zapisać ustawień Horyzontu.');}};
 const slider=(key:Exclude<keyof LandscapeSettings,'quality'>,label:string,min=0,max=200)=><label className="personal-slider"><span className="flex items-center justify-between gap-3"><span>{label}</span><output>{settings[key]}%</output></span><input aria-label={label} type="range" min={min} max={max} step={5} value={settings[key]} onChange={e=>change({...settings,[key]:Number(e.target.value)})}/></label>;
 return <AnimatedDetails className="personal-group group" data-landscape-settings forceOpen={searchOpen} contentClassName="personal-group-body" summary={<><span className="personal-group-icon"><Mountain size={19}/></span><span className="min-w-0 flex-1"><span className="block font-semibold">Horyzont — jakość i światło</span><span className="mt-1 block text-[11px] opacity-60">Woda, poświata i rozchodzące się promienie</span></span><ChevronDown size={17} className="ui-disclosure-chevron"/></>}>
  <fieldset className="personal-field"><legend>Jakość Horyzontu</legend><div className="personal-choices">{([['high','Wysoka · do 60 FPS'],['medium','Średnia · do 30 FPS'],['low','Niska · do 15 FPS']] as const).map(([quality,label])=><button type="button" key={quality} aria-pressed={settings.quality===quality} className={'personal-choice ui-accent-focus '+(settings.quality===quality?'ui-accent-soft':'')} onClick={()=>change({...settings,quality})}>{label}</button>)}</div></fieldset>
  {slider('bloom','Siła poświaty wody')}{slider('reflections','Siła odbić światła')}{slider('rays','Rozchodzenie się promieni')}{slider('waveSpeed','Prędkość fal')}{slider('exposure','Jasność wody',50,150)}
  <p className="personal-note">Zmiany widać od razu. 100% to naturalne światło. Powyżej 100% poświata, odbicia i promienie narastają mocniej — 200% daje czterokrotną energię. 0% wyłącza wybrany efekt. Ograniczenie animacji i ochrona termiczna nadal obowiązują.</p>
  <button type="button" className="personal-reset" onClick={()=>change({...DEFAULT_LANDSCAPE_SETTINGS})}><RotateCcw size={16}/>Przywróć ustawienia Horyzontu</button>{error&&<p role="status">{error}</p>}
 </AnimatedDetails>;
}
