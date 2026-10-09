'use client';
import {Monitor,Sun,Moon,Sparkles,Check,Settings,Bus,MapPin} from 'lucide-react';
import type {CSSProperties} from 'react';
type Props={panelGlow:boolean;glowStrength:number;savePanelGlow:(value:boolean)=>void;saveGlowStrength:(value:number)=>void;showMapStops?:boolean;saveMapStops?:(value:boolean)=>void;themeColor:string;textSub:string;optionsCard:string;isDark:boolean;isWarm:boolean;appTheme:string;optionsButton:string;isOptionsExpanded:boolean;saveAppTheme:(value:string)=>void;saveThemeColor:(value:string)=>void;transparentUI:boolean;saveTransparentUI:(value:boolean)=>void;showInactive:boolean;saveInactive:(value:boolean)=>void;lightEffects:boolean;saveLightEffects:(value:boolean)=>void};
export default function OptionsContent({panelGlow,glowStrength,savePanelGlow,saveGlowStrength,themeColor, textSub, optionsCard, isDark, isWarm, appTheme, optionsButton, isOptionsExpanded, saveAppTheme, saveThemeColor, transparentUI, saveTransparentUI, showInactive, saveInactive, lightEffects, saveLightEffects,showMapStops=false,saveMapStops}:Props){return <>
               <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                     <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${themeColor}18`, color: themeColor }}><Settings className="h-[18px] w-[18px]" /></span>
                     <div>
                        <h2 id="options-title" className="text-base font-semibold tracking-tight md:text-lg">Opcje aplikacji</h2>
                        <p className={`text-[11px] ${textSub}`}>Twój wygląd, Twoje ustawienia</p>
                  </div>
                  </div>

               </div>

               <div data-options-scroll className={`flex min-h-0 w-full flex-1 flex-col gap-2 overscroll-contain relative z-0 pr-1 ${isOptionsExpanded ? "overflow-y-auto" : "overflow-hidden"}`}>
                  
                  {/* Appearance */}
                  <div data-options-appearance className={`shrink-0 rounded-2xl border p-2.5 md:p-4 ${optionsCard}`}>
                     <h3 className={`mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${isDark ? 'text-violet-200' : isWarm ? 'text-[#746a58]' : 'text-slate-500'}`}>Motyw aplikacji</h3>
                     
                     <div className="mb-2 grid grid-cols-3 gap-1.5">
                        {[
                           { id: 'system', name: 'Systemowy', icon: <Monitor className="w-4 h-4 mr-1.5" /> },
                           { id: 'light', name: 'Jasny', icon: <Sun className="w-4 h-4 mr-1.5" /> },
                           { id: 'light-warm', name: 'Piaskowy', icon: <Sun className="w-4 h-4 mr-1.5" /> },
                           { id: 'dark', name: 'Ciemny', icon: <Moon className="w-4 h-4 mr-1.5" /> },
                           { id: 'dark-oled', name: 'AMOLED', icon: <Moon className="w-4 h-4 mr-1.5" /> },
                           { id: 'dark-aurora', name: 'Aurora', icon: <Sparkles className="w-4 h-4 mr-1.5" /> }
                        ].map(mode => (
                           <button
                              key={mode.id}
                              onClick={() => saveAppTheme(mode.id)}
                              aria-pressed={appTheme === mode.id}
                              className={`relative flex h-11 items-center justify-center rounded-xl text-[11px] font-medium transition-colors border md:text-sm ${appTheme === mode.id ? '' : 'border-transparent'} ${optionsButton}`}
                              style={appTheme === mode.id ? { borderColor: `${themeColor}80`, color: themeColor, backgroundColor: `${themeColor}18` } as CSSProperties : {}}
                           >
                              {mode.icon}
                              {mode.name}
                              {appTheme === mode.id && <span className="absolute right-1 top-1 h-1 w-1 rounded-full" style={{ backgroundColor: themeColor }} />}
                           </button>
                        ))}
                     </div>

                     <div className={`flex items-center justify-between gap-1 border-t px-1 pt-2 ${isDark ? 'border-white/8' : 'border-slate-900/8'}`}>
                        <span className={`text-[11px] ${textSub}`}>Akcent</span>
                        {[
                           { name: 'Turkusowy', hex: '#00A3A2' },
                           { name: 'Niebieski', hex: '#3b82f6' },
                           { name: 'Fioletowy', hex: '#8b5cf6' },
                           { name: 'Różowy', hex: '#f43f5e' },
                           { name: 'Bursztynowy', hex: '#f59e0b' }
                        ].map(color => (
                           <button
                              key={color.name}
                              onClick={() => saveThemeColor(color.hex)}
                              aria-label={`Kolor akcentu: ${color.name}`}
                              aria-pressed={themeColor === color.hex}
                              className="flex h-11 w-9 min-[380px]:w-11 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105"
                              title={color.name}
                           >
                              <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: color.hex, boxShadow: themeColor === color.hex ? `0 0 0 2px ${isDark ? '#0d1425' : '#ffffff'}, 0 0 0 3px ${color.hex}` : undefined }}>
                                 {themeColor === color.hex && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                              </span>
                           </button>
                        ))}
                     </div>
                  </div>

                  <div data-options-extra id="additional-options" aria-hidden={!isOptionsExpanded} inert={!isOptionsExpanded} className="shrink-0">
                  <div className="flex flex-col gap-2 pb-0.5">
                     <label className={`flex cursor-pointer items-center justify-between rounded-2xl border p-3 transition-colors md:p-4 ${optionsCard}`}>
                        <div className="flex min-w-0 items-center gap-3 pr-3">
                           <Sparkles className="h-5 w-5 shrink-0" style={{ color: themeColor }} />
                           <div className="flex flex-col">
                              <span className="text-sm font-semibold">Przezroczystość</span>
                              <span className={`mt-1 text-[11px] leading-relaxed ${textSub}`}>Rozmycie tła paneli</span>
                           </div>
                        </div>
                        <div className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${transparentUI ? '' : (isDark ? 'bg-white/12' : 'bg-slate-300')}`} style={{ backgroundColor: transparentUI ? themeColor : '' }}>
                           <div className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-md transition-transform ${transparentUI ? 'translate-x-5' : ''}`}></div>
                        </div>
                        <input type="checkbox" className="sr-only" checked={transparentUI} onChange={(e) => saveTransparentUI(e.target.checked)} />
                     </label>
                     
                     <section className={`overflow-hidden rounded-2xl border ${optionsCard}`}>
                       <label className="group flex min-h-20 cursor-pointer items-center justify-between gap-3 p-3 md:p-4">
                         <div className="flex min-w-0 items-center gap-3">
                           <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{color:themeColor,backgroundColor:`${themeColor}14`}}><Sun size={20}/></span>
                           <div><span className="text-sm font-semibold">Poświata paneli</span><p className={`mt-1 text-[11px] leading-relaxed ${textSub}`}>Miękkie plamy koloru w tle paneli</p></div>
                         </div>
                         <input aria-label="Poświata paneli" role="switch" type="checkbox" className="peer sr-only" checked={panelGlow} onChange={event=>savePanelGlow(event.target.checked)}/>
                         <span aria-hidden="true" className={`relative h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 ${panelGlow?'':isDark?'bg-white/12':'bg-slate-300'}`} style={{backgroundColor:panelGlow?themeColor:undefined,outlineColor:themeColor}}><span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${panelGlow?'translate-x-5':''}`}/></span>
                       </label>
                       {panelGlow&&<div className={`border-t px-4 pb-4 pt-3 ${isDark?'border-white/8':'border-slate-900/8'}`}>
                         <label htmlFor="panel-glow-strength" className="flex items-center justify-between text-xs font-medium"><span>Siła poświaty</span><output className="ui-accent-soft rounded-lg px-2 py-1 tabular-nums">{glowStrength}%</output></label>
                         <input id="panel-glow-strength" type="range" min="0" max="100" step="5" value={glowStrength} onChange={event=>saveGlowStrength(Number(event.target.value))} className="ui-accent-focus mt-2 h-8 w-full cursor-pointer" style={{accentColor:themeColor}}/>
                         <div className={`flex justify-between text-[10px] ${textSub}`}><span>Subtelna</span><span>Wyraźna</span></div>
                         {lightEffects&&<p className={`mt-2 text-[11px] ${textSub}`}>Lżejsze efekty ograniczają siłę poświaty.</p>}
                       </div>}
                     </section>

                     <label className={`flex cursor-pointer items-center justify-between rounded-2xl border p-3 transition-colors md:p-4 ${optionsCard}`}>
                        <div className="flex min-w-0 items-center gap-3 pr-3">
                           <Bus className={`h-5 w-5 shrink-0 ${isDark ? 'text-white/90' : 'text-slate-700'}`} />
                           <div className="flex flex-col">
                              <span className="text-sm font-semibold">Autobusy bez linii</span>
                              <span className={`mt-1 text-[11px] leading-relaxed ${textSub}`}>Pokaż ostatnią pozycję pojazdów bez kursu</span>
                           </div>
                        </div>
                        <div className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${showInactive ? '' : (isDark ? 'bg-white/12' : 'bg-slate-300')}`} style={{ backgroundColor: showInactive ? themeColor : '' }}>
                           <div className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-md transition-transform ${showInactive ? 'translate-x-5' : ''}`}></div>
                        </div>
                        <input type="checkbox" className="sr-only" checked={showInactive} onChange={(e) => saveInactive(e.target.checked)} />
                     </label>

                     <label className={`flex cursor-pointer items-center justify-between rounded-2xl border p-3 md:p-4 ${optionsCard}`}>
                       <div className="flex min-w-0 items-center gap-3 pr-3"><MapPin className="h-5 w-5 shrink-0" style={{color:themeColor}}/><div><span className="text-sm font-semibold">Pokaż przystanki na mapie</span><p className={`mt-1 text-[11px] ${textSub}`}>Przybliż mapę i dotknij przystanku, aby sprawdzić odjazdy</p></div></div>
                       <div className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${showMapStops?'':isDark?'bg-white/12':'bg-slate-300'}`} style={{backgroundColor:showMapStops?themeColor:''}}><div className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-md transition-transform ${showMapStops?'translate-x-5':''}`}/></div>
                       <input aria-label="Pokaż przystanki na mapie" type="checkbox" className="sr-only" checked={showMapStops} onChange={event=>saveMapStops?.(event.target.checked)}/>
                     </label>

                     <label className={`flex cursor-pointer items-center justify-between rounded-2xl border p-3 transition-colors md:p-4 ${optionsCard}`}>
                       <div className="flex min-w-0 items-center gap-3 pr-3"><Sparkles className="h-5 w-5 shrink-0" style={{color:themeColor}}/><div><span className="text-sm font-semibold">Lżejsze efekty</span><p className={`mt-1 text-[11px] ${textSub}`}>Mniej rozmycia i cieni na słabszych telefonach</p></div></div>
                       <div className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${lightEffects ? '' : (isDark ? 'bg-white/12' : 'bg-slate-300')}`} style={{backgroundColor:lightEffects?themeColor:''}}><div className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-md transition-transform ${lightEffects?'translate-x-5':''}`}/></div>
                       <input aria-label="Lżejsze efekty" type="checkbox" checked={lightEffects} onChange={event=>saveLightEffects(event.target.checked)} className="sr-only"/>
                     </label>
                  </div>
                  </div>

               </div>
</>;}
