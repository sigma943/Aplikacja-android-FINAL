'use client';
import {useState,type ReactNode} from 'react';
import {Palette,Shapes,Layers,Sun,Type,Navigation,SlidersHorizontal,RotateCcw,Check,ChevronDown,Bus,MapPin,List,RefreshCw} from 'lucide-react';
import {DEFAULT_INTERFACE_APPEARANCE,type InterfaceAppearance} from '@/lib/interface-appearance';
import InterfacePreview from './InterfacePreview';
import type {PreviewChrome} from './OptionsContent';

type Props={chrome:PreviewChrome;value:InterfaceAppearance;onChange:(value:InterfaceAppearance)=>void;dark:boolean;theme:string;accent:string;setTheme:(theme:string)=>void;setAccent:(color:string)=>void;glass:boolean;setGlass:(on:boolean)=>void;glow:boolean;setGlow:(on:boolean)=>void;glowStrength:number;setGlowStrength:(n:number)=>void;lightEffects:boolean};
type NumericKey={ [K in keyof InterfaceAppearance]:InterfaceAppearance[K] extends number?K:never }[keyof InterfaceAppearance];
const accents=[['Turkus','#00a3a2'],['Niebieski','#3b82f6'],['Fiolet','#8b5cf6'],['Róż','#f43f5e'],['Bursztyn','#f59e0b'],['Zieleń','#22c55e'],['Grafit','#64748b'],['Błękit','#06b6d4']];

export default function InterfacePersonalization(p:Props){
  const {value:v,dark}=p,[query,setQuery]=useState('');
  const set=<K extends keyof InterfaceAppearance>(key:K,next:InterfaceAppearance[K])=>p.onChange({...v,[key]:next});
  const selected=(active:boolean)=>`personal-choice ui-accent-focus ${active?'ui-accent-soft':'bg-current/[.035] border-current/10'}`;
  const slider=(key:NumericKey,label:string,min:number,max:number,step:number,unit='')=><label className="personal-slider"><span className="flex items-center justify-between gap-3"><span>{label}</span><output>{v[key]}{unit}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={v[key]} onChange={e=>set(key,Number(e.target.value))}/></label>;
  const toggle=(label:string,on:boolean,change:(value:boolean)=>void,description?:string)=><label className="personal-toggle"><span><span className="block font-medium">{label}</span>{description&&<span className="mt-1 block text-[11px] opacity-60">{description}</span>}</span><input aria-label={label} type="checkbox" role="switch" checked={on} onChange={e=>change(e.target.checked)}/></label>;
  const choices=<K extends keyof InterfaceAppearance>(key:K,label:string,options:[InterfaceAppearance[K],string][]) => <fieldset className="personal-field"><legend>{label}</legend><div className="personal-choices">{options.map(([next,name])=><button key={String(next)} type="button" aria-pressed={v[key]===next} onClick={()=>set(key,next)} className={selected(v[key]===next)}>{name}</button>)}</div></fieldset>;
  const group=(id:string,title:string,subtitle:string,icon:ReactNode,children:ReactNode,keywords:string,open=false)=>{
    if(query&&!`${title} ${subtitle} ${keywords}`.toLocaleLowerCase('pl').includes(query.toLocaleLowerCase('pl')))return null;
    return <details key={id} className="personal-group group" open={query?true:open||undefined}><summary><span className="personal-group-icon">{icon}</span><span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span><span className="mt-1 block text-[11px] opacity-60">{subtitle}</span></span><ChevronDown size={17} className="shrink-0 transition-transform group-open:rotate-180"/></summary><div className="personal-group-body">{children}</div></details>;
  };
  const reset=()=>{p.onChange({...DEFAULT_INTERFACE_APPEARANCE});p.setTheme('dark-oled');p.setAccent('#00A3A2');p.setGlass(true);p.setGlow(false);p.setGlowStrength(40);};
  const preset=(name:string)=>{
    const base={...DEFAULT_INTERFACE_APPEARANCE};
    if(name==='Spokojny'){p.onChange({...base,panelRadius:28,cardRadius:24,shadowStrength:15,surfaceTint:'accent',panelTintStrength:25,cardStyle:'soft',buttonStyle:'outline',glowStyle:'graphite',glowSpread:90});p.setTheme('light-warm');p.setAccent('#00A3A2');p.setGlass(true);p.setGlow(true);p.setGlowStrength(35);}
    if(name==='Nocny'){p.onChange({...base,glassOpacity:78,borderStrength:8,surfaceTint:'accent',panelTintStrength:15,glowStyle:'mixed',glowColor:'#8b5cf6',shadowStrength:10});p.setTheme('dark-oled');p.setAccent('#8b5cf6');p.setGlass(true);p.setGlow(true);p.setGlowStrength(50);}
    if(name==='Czytelny'){p.onChange({...base,textScale:115,titleWeight:800,iconSize:28,iconStroke:2.5,density:'spacious',borderStrength:20,reducedMotion:true});p.setTheme('light');p.setAccent('#00A3A2');p.setGlass(false);p.setGlow(false);}
    if(name==='Minimalny'){p.onChange({...base,panelRadius:16,cardRadius:12,controlRadius:8,shadowStrength:0,navIndicator:'pill',density:'compact'});p.setTheme('dark');p.setAccent('#64748b');p.setGlass(false);p.setGlow(false);}
  };
  return <div data-personalization-panel className="personal-editor">
    <InterfacePreview chrome={p.chrome} accent={p.accent} glass={p.glass} dark={dark}/>
    <div className="personal-presets"><span className="text-xs font-semibold">Gotowe zestawy</span><div className="grid grid-cols-2 gap-2 mt-2">{['Spokojny','Nocny','Czytelny','Minimalny'].map(name=><button type="button" key={name} onClick={()=>preset(name)} className={selected(false)}>{name}</button>)}</div></div>
    <label className="personal-search"><SlidersHorizontal size={16}/><input aria-label="Szukaj ustawień personalizacji" placeholder="Znajdź ustawienie…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button type="button" onClick={()=>setQuery('')} aria-label="Wyczyść wyszukiwanie personalizacji">×</button>}</label>
    {group('colors','Motyw i kolory','Motywy, paleta i własny akcent',<Palette size={19}/>,<>
      <div className="grid grid-cols-3 gap-2">{[['system','Systemowy'],['light','Jasny'],['light-warm','Piaskowy'],['dark','Ciemny'],['dark-oled','AMOLED'],['dark-aurora','Aurora']].map(([key,name])=><button type="button" key={key} aria-pressed={p.theme===key} className={selected(p.theme===key)} onClick={()=>p.setTheme(key)}>{name}</button>)}</div>
      <fieldset className="personal-field"><legend>Kolor akcentu</legend><div className="grid grid-cols-4 gap-2">{accents.map(([name,color])=><button type="button" key={name} aria-label={`Kolor akcentu: ${({'Turkus':'Turkusowy','Fiolet':'Fioletowy','Róż':'Różowy','Bursztyn':'Bursztynowy'} as Record<string,string>)[name]||name}`} aria-pressed={p.accent.toLowerCase()===color} onClick={()=>p.setAccent(color)} className={`${selected(p.accent.toLowerCase()===color)} flex flex-col items-center gap-2`}><span className="flex h-6 w-6 items-center justify-center rounded-full" style={{background:color}}>{p.accent.toLowerCase()===color&&<Check size={14} className="text-white"/>}</span><span className="text-[10px]">{name}</span></button>)}</div></fieldset>
      <label className="personal-color"><span>Własny kolor akcentu</span><span className="ml-auto font-mono text-[10px] opacity-60">{p.accent.toUpperCase()}</span><input aria-label="Własny akcent interfejsu" type="color" value={p.accent} onChange={e=>p.setAccent(e.target.value)}/></label>
      {choices('surfaceTint','Zabarwienie paneli',[['original','Według motywu'],['accent','Akcent'],['warm','Ciepłe'],['custom','Własne']])}
      {v.surfaceTint==='custom'&&<label className="personal-color"><span>Kolor tła paneli</span><input aria-label="Kolor tła paneli" type="color" value={v.panelColor} onChange={e=>set('panelColor',e.target.value)}/></label>}
      {v.surfaceTint!=='original'&&slider('panelTintStrength','Siła zabarwienia paneli',5,55,5,'%')}
      {choices('cardStyle','Styl kart',[['original','Standardowy'],['soft','Barwione'],['outlined','Wyraźna ramka'],['flat','Bez ramek']])}
      {choices('buttonStyle','Styl przycisków',[['original','Standardowy'],['solid','Wypełnione'],['outline','Obrys']])}
    </>,'akcent własny kolor jasny ciemny amoled aurora',true)}
    {group('shapes','Kształty i głębia','Rogi, obramowania i cienie',<Shapes size={19}/>,<>{slider('panelRadius','Zaokrąglenie paneli',0,36,2,' px')}{slider('cardRadius','Zaokrąglenie kart',0,30,2,' px')}{slider('controlRadius','Zaokrąglenie przycisków',0,24,2,' px')}{slider('borderStrength','Widoczność obramowań',0,40,2,'%')}{slider('shadowStrength','Siła cieni',0,100,5,'%')}</>,'zaokrąglenie paneli kart przycisków widoczność obramowań siła cieni')}
    {group('glass','Szkło i przezroczystość','Przezroczyste lub pełne panele',<Layers size={19}/>,<>{toggle('Efekt szkła',p.glass,p.setGlass,'Przezroczyste panele z rozmytym tłem')}{p.glass&&<>{slider('glassOpacity','Krycie tła paneli',20,100,5,'%')}{slider('glassBlur','Rozmycie szkła',0,p.lightEffects?6:28,2,' px')}</>}<p className="personal-note">{p.lightEffects?'Tryb lżejszych efektów ogranicza rozmycie do 6 px. Wyłączysz go w zakładce Ogólne.':'Szkło zmienia tło paneli. Tekst i godziny pozostają wyraźne.'}</p></>,'efekt szkła krycie tła rozmycie przezroczystość')}
    {group('glow','Miękka poświata','Rozmyte plamy bez świecącej obwódki',<Sun size={19}/>,<>
      {toggle('Miękka poświata paneli',p.glow,p.setGlow)}
      {p.glow&&<>
      <label className="personal-slider"><span className="flex items-center justify-between"><span>Siła poświaty</span><output>{p.glowStrength}%</output></span><input aria-label="Siła miękkiej poświaty" type="range" min="0" max="100" step="5" value={p.glowStrength} onChange={e=>p.setGlowStrength(Number(e.target.value))}/></label>
      {choices('glowStyle','Kolory plam',[['graphite','Grafit'],['accent','Kolorowe'],['mixed','Grafit + kolor']])}
      {v.glowStyle!=='graphite'&&<label className="personal-color"><span>Kolor poświaty</span><input aria-label="Kolor miękkiej poświaty" type="color" value={v.glowColor} onChange={e=>set('glowColor',e.target.value)}/></label>}
      {slider('glowSpread','Rozproszenie plam',40,100,5,'%')}{choices('glowPlacement','Rozmieszczenie',[['corners','W rogach'],['center','Centralnie'],['diagonal','Po przekątnej']])}
      </>}
    </>,'miękka poświata siła kolor grafit plamy rozproszenie rozmieszczenie')}
    {group('text','Tekst i czytelność','Rozmiar, krój i wyróżnienie tytułów',<Type size={19}/>,<>{slider('textScale','Wielkość tekstu interfejsu',90,120,5,'%')}{choices('fontFamily','Krój pisma',[['system','Systemowy'],['sans','Klasyczny'],['mono','Monospace']])}{slider('titleWeight','Grubość nagłówków',500,800,100)}</>,'wielkość tekstu interfejsu krój pisma grubość nagłówków litery cyfry')}
    {group('nav','Nawigacja i ikony','Etykiety, ikony i aktywna zakładka',<Navigation size={19}/>,<>{slider('iconSize','Rozmiar ikon nawigacji',18,30,2,' px')}{slider('iconStroke','Grubość ikon',1,3,.25)}{toggle('Podpisy pod ikonami',v.navLabels,on=>set('navLabels',on))}{choices('navIndicator','Aktywna zakładka',[['line','Linia'],['pill','Miękkie tło'],['none','Sam kolor']])}</>,'rozmiar ikon nawigacji grubość podpisy aktywna zakładka widoczność')}
    {group('comfort','Układ i komfort','Odstępy i spokojniejsze przejścia',<SlidersHorizontal size={19}/>,<>{choices('density','Odstępy w kartach',[['compact','Mniejsze'],['comfortable','Standardowe'],['spacious','Większe']])}{toggle('Ogranicz animacje',v.reducedMotion,on=>set('reducedMotion',on),'Spokojniejsze przejścia i otwieranie paneli')}</>,'odstępy karty animacje ruch wyróżnienie lżejsze efekty')}
    <button type="button" onClick={reset} className="personal-reset ui-accent-focus"><RotateCcw size={16}/>Przywróć domyślny wygląd</button>
    <p className="personal-note text-center">Ustawienia zapisują się automatycznie na tym urządzeniu.</p>
  </div>;
}
