'use client';
import {UIDisclosure} from './UITransitions';
import ColorPicker from './ColorPicker';
import FontPicker from './FontPicker';
import {useState,type ReactNode,type CSSProperties} from 'react';
import {Palette,Shapes,Layers,Sun,Type,Navigation,SlidersHorizontal,Compass,RotateCcw,Check} from 'lucide-react';
import {DEFAULT_INTERFACE_APPEARANCE,activeInterfaceAccent,type InterfaceAppearance} from '@/lib/interface-appearance';
import {INTERFACE_PRESETS,matchesInterfacePreset,type InterfacePreset} from '@/lib/interface-presets';
import {SCHEDULE_KEY,readSchedule} from '@/lib/personalization-profiles';
import PresetThumbnail from './PresetThumbnail';
import PersonalizationTools from './PersonalizationTools';
import InterfacePreview from './InterfacePreview';
import CosmicThemeOptions from './CosmicThemeOptions';
import LandscapeThemeOptions from './LandscapeThemeOptions';
import LandscapeAccentOptions from './LandscapeAccentOptions';
import PersonalizationGroup from './PersonalizationGroup';
import type {PreviewChrome} from './OptionsContent';

type Props={journeysAllowed?:boolean;canOpenAdminEmbed?:boolean;chrome:PreviewChrome;value:InterfaceAppearance;onChange:(value:InterfaceAppearance)=>void;dark:boolean;theme:string;accent:string;setTheme:(theme:string)=>void;setAccent:(color:string)=>void;glass:boolean;setGlass:(on:boolean)=>void;glow:boolean;setGlow:(on:boolean)=>void;glowStrength:number;setGlowStrength:(n:number)=>void;lightEffects:boolean};
type NumericKey={ [K in keyof InterfaceAppearance]:InterfaceAppearance[K] extends number?K:never }[keyof InterfaceAppearance];
const presetSurfaces:Record<string,string>={'dark-cosmos':'#101522','dark-oled':'#1c2833','dark-forest':'#194333','dark':'#263747','light-warm':'#fffaf0','light-pink':'#ffb8db','light-sky':'#aedbfa','light':'#ffffff'};
const accents=[['Turkus','#00a3a2'],['Niebieski','#3b82f6'],['Fiolet','#8b5cf6'],['Róż','#f43f5e'],['Bursztyn','#f59e0b'],['Zieleń','#22c55e'],['Grafit','#64748b'],['Błękit','#06b6d4']];

export default function InterfacePersonalization(p:Props){
  const {value:v,dark}=p,[query,setQuery]=useState('');
  const frostEnabled=v.glassBlurEnabled;
  const search=query.trim().toLocaleLowerCase('pl');
  const matches=(text:string)=>!search||text.toLocaleLowerCase('pl').includes(search);
  const cosmicVisible=p.theme==='dark-cosmos'&&matches('Głębia kosmosu Paralaksa kosmosu Ruch warstw przy przechyleniu telefonu mgławice planety kursor');
  const landscapeVisible=p.theme==='dark-mountains'&&matches('Horyzont jakość światło woda poświata odbicia promienie prędkość fal jasność panel filtrowania mapa niebo jednolity kolor');
  let matchedGroups=(cosmicVisible?1:0)+(landscapeVisible?1:0);
  const set=<K extends keyof InterfaceAppearance>(key:K,next:InterfaceAppearance[K])=>p.onChange({...v,[key]:next});
  const selected=(active:boolean)=>`personal-choice ui-accent-focus ${active?'ui-accent-soft':'bg-current/[.035] border-current/10'}`;
  const slider=(key:NumericKey,label:string,min:number,max:number,step:number,unit='')=><label className="personal-slider"><span className="flex items-center justify-between gap-3"><span>{label}</span><output>{v[key]}{unit}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={v[key]} onChange={e=>set(key,Number(e.target.value))}/></label>;
  const toggle=(label:string,on:boolean,change:(value:boolean)=>void,description?:string)=><label className="personal-toggle"><span><span className="block font-medium">{label}</span>{description&&<span className="mt-1 block text-[11px] opacity-60">{description}</span>}</span><input aria-label={label} type="checkbox" role="switch" checked={on} onChange={e=>change(e.target.checked)}/></label>;
  const choices=<K extends keyof InterfaceAppearance>(key:K,label:string,options:[InterfaceAppearance[K],string][]) => <fieldset className="personal-field"><legend>{label}</legend><div className="personal-choices">{options.map(([next,name])=><button key={String(next)} type="button" aria-pressed={v[key]===next} onClick={()=>set(key,next)} className={selected(v[key]===next)}>{name}</button>)}</div></fieldset>;
  const group=(id:string,title:string,subtitle:string,icon:ReactNode,children:ReactNode,keywords:string,open=false)=>{
    if(!matches(`${title} ${subtitle} ${keywords}`))return null;
    matchedGroups++;
    return <PersonalizationGroup key={id} id={id} title={title} subtitle={subtitle} icon={icon} forceOpen={Boolean(search)||open}>{children}</PersonalizationGroup>;
  };
  const reset=()=>{localStorage.setItem(SCHEDULE_KEY,JSON.stringify({...readSchedule(),enabled:false}));window.dispatchEvent(new Event('pks-profiles-changed'));p.onChange({...DEFAULT_INTERFACE_APPEARANCE});p.setTheme('dark-oled');p.setAccent('#00A3A2');p.setGlass(true);p.setGlow(false);p.setGlowStrength(40);};
  const preset=(next:InterfacePreset)=>{
    try{p.onChange({...next.appearance,statusBarOverlay:v.statusBarOverlay});p.setTheme(next.theme);p.setAccent(next.accent);p.setGlass(next.glass);p.setGlow(next.glow);p.setGlowStrength(next.glowStrength);}catch{p.setTheme('system');}
  };
  const colorPicker=(label:string,color:string,onChange:(value:string)=>void,customLabel:string,inputLabel:string,prefix:string)=><>
    <fieldset className="personal-field"><legend>{label}</legend><div className="grid grid-cols-4 gap-2">{accents.map(([name,next])=><button type="button" key={name} aria-label={`${prefix}: ${({'Turkus':'Turkusowy','Fiolet':'Fioletowy','Róż':'Różowy','Bursztyn':'Bursztynowy'} as Record<string,string>)[name]||name}`} aria-pressed={color.toLowerCase()===next} onClick={()=>onChange(next)} className={`${selected(color.toLowerCase()===next)} flex flex-col items-center gap-2`}><span className="flex h-6 w-6 items-center justify-center rounded-full" style={{background:next}}>{color.toLowerCase()===next&&<Check size={14} style={{color:name==='Bursztyn'?'#172536':'white'}}/>}</span><span className="text-[10px]">{name}</span></button>)}</div></fieldset>
    <ColorPicker label={customLabel} ariaLabel={inputLabel} value={color} onChange={onChange} dark={dark}/>
  </>;
  return <div data-personalization-panel className="personal-editor">
    <InterfacePreview journeysAllowed={p.journeysAllowed} canOpenAdminEmbed={p.canOpenAdminEmbed} navOrder={v.navOrder} chrome={p.chrome} accent={activeInterfaceAccent(v,p.theme,p.accent,!dark)} glass={p.glass} dark={dark}/>
    <div data-theme-presets className="personal-presets"><span className="text-xs font-semibold">Gotowe zestawy</span><div className="personal-presets-grid">{INTERFACE_PRESETS.map(next=>{
      const active=matchesInterfacePreset(next,{appearance:v,theme:p.theme,accent:p.accent,glass:p.glass,glow:p.glow,glowStrength:p.glowStrength});
      return <button type="button" key={next.name} aria-label={`Zestaw: ${next.name}`} aria-pressed={active} onClick={()=>preset(next)} className="personal-preset ui-accent-focus" style={{backgroundColor:presetSurfaces[p.theme]||(dark?'#1c2833':'#ffffff'),color:dark?'#f3f1ff':'#172536',colorScheme:dark?'dark':'light'} as CSSProperties}>
        <PresetThumbnail name={next.name}/>
        <span className="personal-preset-name"><span>{next.name}</span>{active&&<Check size={14} aria-hidden="true"/>}</span>
        <span className="personal-preset-description" title={next.theme==='dark-mountains'?'Bez zapisanej lokalizacji sceneria korzysta z Rzeszowa.':undefined}>{next.description}</span>
      </button>;
    })}</div></div>
    <label className="personal-search"><SlidersHorizontal size={16}/><input aria-label="Szukaj ustawień personalizacji" placeholder="Znajdź ustawienie…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button type="button" onClick={()=>setQuery('')} aria-label="Wyczyść wyszukiwanie personalizacji">×</button>}</label>
    {group('colors','Motyw i kolory','Motywy, paleta i własny akcent',<Palette size={19}/>,<>
      <div className="grid grid-cols-3 gap-2">{[['system','Systemowy'],['light','Jasny'],['light-warm','Piaskowy'],['dark','Ciemny'],['dark-oled','AMOLED'],['dark-cosmos','Kosmos'],['light-pink','Różowy'],['dark-forest','Leśny'],['light-sky','Niebo']].map(([key,name])=><button type="button" key={key} aria-pressed={p.theme===key} className={selected(p.theme===key)} onClick={()=>{if(key==='dark-forest'||key==='light-sky'||key==='dark-cosmos'){preset(INTERFACE_PRESETS.find(next=>next.theme===key)!);return;}p.setTheme(key);if(key==='light-pink')p.setAccent('#c02674');}}>{name}</button>)}</div>
      {colorPicker('Kolor akcentu',p.accent,p.setAccent,'Własny kolor akcentu','Własny akcent interfejsu','Kolor akcentu')}
      {choices('surfaceTint','Zabarwienie paneli',[['original','Według motywu'],['accent','Akcent'],['warm','Ciepłe'],['custom','Własne']])}
      <UIDisclosure open={v.surfaceTint==='custom'}><ColorPicker label="Kolor tła paneli" value={v.panelColor} onChange={color=>set('panelColor',color)} dark={dark}/></UIDisclosure>
      {v.surfaceTint!=='original'&&slider('panelTintStrength','Siła zabarwienia paneli',5,55,5,'%')}
      {choices('cardStyle','Styl kart',[['original','Standardowy'],['soft','Barwione'],['outlined','Wyraźna ramka'],['flat','Bez ramek']])}
      {choices('buttonStyle','Styl przycisków',[['original','Standardowy'],['solid','Wypełnione'],['outline','Obrys']])}
      {toggle('Tło pod paskiem powiadomień',v.statusBarOverlay,on=>set('statusBarOverlay',on),'Pokazuje tło bieżącego widoku pod godziną i ikonami systemu, również po otwarciu opcji.')}
      {p.theme==='dark-mountains'&&<LandscapeAccentOptions value={v} onChange={p.onChange} accent={p.accent} dark={dark}/>}
    </>,'akcent własny kolor jasny ciemny amoled aurora pasek powiadomień godzina mapa ekran horyzont dzień noc')}
    {cosmicVisible&&<CosmicThemeOptions searchOpen={Boolean(search)} disabled={p.lightEffects||v.reducedMotion}/>}
    {landscapeVisible&&<LandscapeThemeOptions searchOpen={Boolean(search)}/>}
    {group('texture','Wzór tła','Subtelna faktura na wszystkich panelach',<Layers size={19}/>,<>{choices('panelPattern','Faktura paneli',[['none','Gładkie'],['grid','Siatka'],['dots','Kropki'],['diagonal','Ukośne linie']])}{v.panelPattern!=='none'&&slider('patternStrength','Widoczność faktury',5,30,1,'%')}</>,'wzór faktura siatka kropki ukośne linie tło')}
    {group('shapes' ,'Kształty i głębia','Rogi, obramowania i cienie',<Shapes size={19}/>,<>{slider('panelRadius','Zaokrąglenie paneli',0,36,2,' px')}{slider('cardRadius','Zaokrąglenie kart',0,30,2,' px')}{slider('controlRadius','Zaokrąglenie przycisków',0,24,2,' px')}{slider('borderStrength','Widoczność obramowań',0,40,2,'%')}{slider('shadowStrength','Siła cieni',0,100,5,'%')}</>,'zaokrąglenie paneli kart przycisków widoczność obramowań siła cieni')}
    {group('glass','Szkło i przezroczystość','Przezroczyste lub pełne panele',<Layers size={19}/>,<>{toggle('Efekt szkła',p.glass,p.setGlass,'Przezroczyste panele z ochroną czytelności')}<UIDisclosure open={p.glass}><div className="grid gap-5">{slider('glassOpacity','Krycie tła paneli',20,100,5,'%')}{toggle('Rozmycie tła paneli',frostEnabled,on=>p.onChange({...v,glassBlurEnabled:on}),'Wyłącz, aby zachować ostre tło. Tekst nadal chroni ciemniejsza warstwa szkła.')}<UIDisclosure open={frostEnabled}>{slider('glassBlur','Rozmycie szkła',0,p.lightEffects?6:28,2,' px')}</UIDisclosure></div></UIDisclosure>{p.lightEffects&&<p className="personal-note">Lżejsze efekty są włączone. Szkło, rozmycie i animowane dekoracje są wyłączone; płynne przejścia interfejsu pozostają aktywne.</p>}</>,'efekt szkła krycie tła rozmycie przezroczystość')}
    {group('glow','Miękka poświata','Kolor, siła i rozmieszczenie',<Sun size={19}/>,<>
      {toggle('Miękka poświata paneli',p.glow,p.setGlow)}
      <UIDisclosure open={p.glow}><div className="grid gap-5">
      <label className="personal-slider"><span className="flex items-center justify-between"><span>Siła poświaty</span><output>{p.glowStrength}%</output></span><input aria-label="Siła miękkiej poświaty" type="range" min="0" max="100" step="5" value={p.glowStrength} onChange={e=>p.setGlowStrength(Number(e.target.value))}/></label>
      {choices('glowStyle','Kolory plam',[['graphite','Grafit'],['accent','Kolorowe'],['mixed','Grafit + kolor']])}
      {v.glowStyle!=='graphite'&&colorPicker('Kolor poświaty',v.glowColor,color=>set('glowColor',color),'Własny kolor poświaty','Kolor miękkiej poświaty','Kolor poświaty')}
      {slider('glowSpread','Rozproszenie plam',40,100,5,'%')}{choices('glowPlacement','Rozmieszczenie',[['corners','W rogach'],['center','Centralnie'],['diagonal','Po przekątnej']])}
      </div></UIDisclosure>
    </>,'miękka poświata siła kolor grafit plamy rozproszenie rozmieszczenie')}
    {group('text','Tekst i czytelność','Rozmiar, krój i wyróżnienie tytułów',<Type size={19}/>,<>{slider('textScale','Wielkość tekstu interfejsu',90,120,5,'%')}<FontPicker value={v} onChange={(fontFamily,customFontUrl)=>p.onChange({...v,fontFamily,customFontUrl})}/>{slider('titleWeight','Grubość nagłówków',500,800,100)}{choices('textContrast','Kontrast tekstu',[['standard','Standardowy'],['strong','Mocniejszy']])}</>,'wielkość tekstu interfejsu krój pisma czcionka czcionki google fonts link grubość nagłówków litery cyfry kontrast mocniejszy')}
    {group('nav','Nawigacja i ikony','Etykiety, ikony i aktywna zakładka',<Navigation size={19}/>,<>{choices('chromeStyle','Dolne menu i panele',[['modern','Zaokrąglone'],['classic','Klasyczne']])}<p className="text-xs opacity-75">Wybór zmienia też panele autobusu i przystanku we wszystkich motywach.</p>{choices('navLayout','Układ nawigacji',[['stacked','Podpis pod ikoną'],['inline','Podpis obok ikony']])}{slider('iconSize','Rozmiar ikon nawigacji',18,30,2,' px')}{slider('iconStroke','Grubość ikon',1,3,.25)}{toggle('Podpisy pod ikonami',v.navLabels,on=>set('navLabels',on))}{choices('navIndicator','Aktywna zakładka',[['line','Linia'],['pill','Miękkie tło'],['halo','Poświata ikony'],['block','Pełny akcent'],['none','Sam kolor']])}</>,'dolne menu nowe klasyczne stare panele autobus przystanek rozmiar ikon nawigacji grubość podpisy aktywna zakładka widoczność układ obok poświata pełny akcent')}
    {group('comfort','Układ i komfort','Odstępy i animacje',<SlidersHorizontal size={19}/>,<>{choices('density','Odstępy w kartach',[['compact','Mniejsze'],['comfortable','Standardowe'],['spacious','Większe']])}{toggle('Ogranicz animacje',v.reducedMotion,on=>set('reducedMotion',on))}</>,'odstępy karty animacje ruch wyróżnienie lżejsze efekty')}
    {group('daily','Nawigacja i profile','Zestawy, nawigacja, mapa i harmonogram',<Compass size={19}/>,<PersonalizationTools journeysAllowed={p.journeysAllowed} canOpenAdminEmbed={p.canOpenAdminEmbed} value={v} onChange={p.onChange} theme={p.theme} accent={p.accent} glass={p.glass} glow={p.glow} glowStrength={p.glowStrength}/>,'własne zestawy profile ekran startowy admin kolejność zakładek odjazdy proste szczegółowe znaczniki mapa dzień noc harmonogram godziny')}
    {search&&matchedGroups===0&&<p role="status" className="personal-note text-center py-6">Brak pasujących wyników wyszukiwania</p>}
    <button type="button" onClick={reset} className="personal-reset ui-accent-focus"><RotateCcw size={16}/>Przywróć domyślny wygląd</button>
    <p className="personal-note text-center">Ustawienia zapisują się automatycznie na tym urządzeniu.</p>
  </div>;
}
