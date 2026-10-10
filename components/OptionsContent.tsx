'use client';
import {useState} from 'react';
import {Settings,Bus,MapPin,Palette,Sparkles} from 'lucide-react';
import InterfacePersonalization from './InterfacePersonalization';
import type {InterfaceAppearance} from '@/lib/interface-appearance';
export type PreviewChrome={mapGlassPanel:string;mapGlassInput:string;textSub:string;bottomGlassShell:string};
type Props={canOpenAdminEmbed?:boolean;chrome:PreviewChrome;appearance:InterfaceAppearance;saveAppearance:(value:InterfaceAppearance)=>void;onOpenPersonalization:()=>void;panelGlow:boolean;glowStrength:number;savePanelGlow:(value:boolean)=>void;saveGlowStrength:(value:number)=>void;showMapStops?:boolean;saveMapStops?:(value:boolean)=>void;themeColor:string;textSub:string;optionsCard:string;isDark:boolean;isWarm:boolean;appTheme:string;optionsButton:string;isOptionsExpanded:boolean;saveAppTheme:(value:string)=>void;saveThemeColor:(value:string)=>void;transparentUI:boolean;saveTransparentUI:(value:boolean)=>void;showInactive:boolean;saveInactive:(value:boolean)=>void;lightEffects:boolean;saveLightEffects:(value:boolean)=>void};
export default function OptionsContent(p:Props){
 const [tab,setTab]=useState<'general'|'personalization'>('general');
 const open=(next:'general'|'personalization')=>{setTab(next);if(next==='personalization')p.onOpenPersonalization();};
 return <>
  <div className="mb-3 flex shrink-0 items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl ui-accent-soft"><Settings size={18}/></span><div><h2 id="options-title" className="text-base font-semibold md:text-lg">Opcje aplikacji</h2><p className={`text-[11px] ${p.textSub}`}>Twój wygląd, Twoje ustawienia</p></div></div>
  <div role="tablist" aria-label="Zakładki opcji" className="personal-tabs" onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'general':event.key==='End'?'personalization':tab==='general'?'personalization':'general';open(next);event.currentTarget.querySelector<HTMLButtonElement>(next==='general'?'#options-general-tab':'#options-personal-tab')?.focus();}}>
   <button role="tab" type="button" id="options-general-tab" tabIndex={tab==='general'?0:-1} aria-controls="options-general-panel" aria-selected={tab==='general'} onClick={()=>open('general')}><Settings size={15}/>Ogólne</button>
   <button role="tab" type="button" id="options-personal-tab" tabIndex={tab==='personalization'?0:-1} aria-controls="options-personal-panel" aria-selected={tab==='personalization'} onClick={()=>open('personalization')}><Palette size={15}/>Personalizacja</button>
  </div>
  {tab==='personalization'?<div role="tabpanel" id="options-personal-panel" aria-labelledby="options-personal-tab" data-options-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain"><div data-options-content><InterfacePersonalization canOpenAdminEmbed={p.canOpenAdminEmbed} chrome={p.chrome} value={p.appearance} onChange={p.saveAppearance} dark={p.isDark} theme={p.appTheme} accent={p.themeColor} setTheme={p.saveAppTheme} setAccent={p.saveThemeColor} glass={p.transparentUI} setGlass={p.saveTransparentUI} glow={p.panelGlow} setGlow={p.savePanelGlow} glowStrength={p.glowStrength} setGlowStrength={p.saveGlowStrength} lightEffects={p.lightEffects}/></div></div>:
  <div role="tabpanel" id="options-general-panel" aria-labelledby="options-general-tab" data-options-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
   <div data-options-content><p data-options-appearance className={`mb-3 px-1 text-xs leading-relaxed ${p.textSub}`}>Ustawienia działania aplikacji. Wygląd zmienisz w zakładce „Personalizacja”.</p>
   <div data-options-extra id="additional-options" className="grid gap-2">
    {[
     {label:'Autobusy bez linii',description:'Pokaż ostatnią pozycję pojazdów bez kursu',icon:<Bus size={20}/>,checked:p.showInactive,change:p.saveInactive},
     {label:'Pokaż przystanki na mapie',description:'Przybliż mapę i dotknij przystanku, aby sprawdzić odjazdy',icon:<MapPin size={20}/>,checked:p.showMapStops||false,change:(on:boolean)=>p.saveMapStops?.(on)},
     {label:'Lżejsze efekty',description:'Mniej rozmycia i cieni na słabszych telefonach',icon:<Sparkles size={20}/>,checked:p.lightEffects,change:p.saveLightEffects},
    ].map(option=><label key={option.label} className={`personal-toggle rounded-2xl border p-3 ${p.optionsCard}`}><span className="flex min-w-0 items-center gap-3"><span className="shrink-0 ui-accent-text">{option.icon}</span><span><span className="block text-sm font-semibold">{option.label}</span><span className={`mt-1 block text-[11px] leading-relaxed ${p.textSub}`}>{option.description}</span></span></span><input type="checkbox" role="switch" aria-label={option.label} checked={option.checked} onChange={event=>option.change(event.target.checked)}/></label>)}
   </div></div>
  </div>}
 </>;
}
