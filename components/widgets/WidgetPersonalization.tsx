'use client';
import {ChevronDown,RotateCcw,SlidersHorizontal} from 'lucide-react';
import {useState} from 'react';
import {DEFAULT_WIDGET_APPEARANCE,WIDGET_ACCENTS,type WidgetAppearance} from '@/lib/widget-appearance';

export default function WidgetPersonalization({value,onChange,dark}:{value:WidgetAppearance;onChange:(value:WidgetAppearance)=>void;dark:boolean}) {
  const [expanded,setExpanded]=useState(false);
  const set=<K extends keyof WidgetAppearance>(key:K,next:WidgetAppearance[K])=>onChange({...value,[key]:next});
  const choice=(active:boolean)=>`ui-accent-focus rounded-xl border px-3 py-2.5 text-xs transition-colors ${active?'ui-accent-soft border-[var(--pks-accent)]':dark?'border-white/10 bg-white/[.035]':'border-slate-200 bg-slate-50'}`;
  const select=(key:'surface'|'density'|'textSize'|'lineColors',label:string,options:{value:string;label:string}[])=><fieldset><legend className="mb-2 text-xs font-semibold">{label}</legend><div className="flex flex-wrap gap-2">{options.map(option=><button type="button" key={option.value} aria-pressed={value[key]===option.value} onClick={()=>set(key,option.value as WidgetAppearance[typeof key])} className={choice(value[key]===option.value)}>{option.label}</button>)}</div></fieldset>;
  return <section className={`overflow-hidden rounded-2xl border ${dark?'border-white/10':'border-slate-200'}`}>
    <button type="button" aria-expanded={expanded} aria-controls="widget-personalization-options" onClick={()=>setExpanded(old=>!old)} className="ui-accent-focus flex w-full items-center gap-3 p-4 text-left">
      <span className="ui-accent-soft rounded-xl p-2"><SlidersHorizontal size={18}/></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Więcej opcji personalizacji</span><span className="mt-1 block text-xs opacity-60">Przezroczystość, kolory i szczegóły wyglądu</span></span><ChevronDown size={18} className={`shrink-0 transition-transform ${expanded?'rotate-180':''}`}/>
    </button>
    {expanded&&<div id="widget-personalization-options" className="space-y-5 border-t border-current/10 p-4">
      <div><label htmlFor="widget-transparency" className="flex justify-between text-xs font-semibold"><span>Przezroczystość tła</span><output>{value.transparency}%</output></label><input id="widget-transparency" type="range" min="0" max="100" step="5" value={value.transparency} onChange={event=>set('transparency',Number(event.target.value))} className="ui-accent-focus mt-3 w-full" style={{accentColor:value.accentColor}}/><div className="flex justify-between text-[10px] opacity-50"><span>Pełne tło</span><span>Bez tła</span></div><p className="mt-2 text-[11px] leading-relaxed opacity-60">Zmienia się tylko tło. Tekst i godziny pozostają nieprzezroczyste.</p></div>
      <fieldset><legend className="mb-3 text-xs font-semibold">Kolor akcentu</legend><div className="grid grid-cols-4 gap-2">{WIDGET_ACCENTS.map(accent=><button type="button" key={accent.color} aria-label={`Akcent: ${accent.name}`} aria-pressed={value.accentColor===accent.color} onClick={()=>set('accentColor',accent.color)} className={`${choice(value.accentColor===accent.color)} flex flex-col items-center gap-2 px-1`}><span className="h-6 w-6 rounded-full border border-black/10" style={{background:accent.color}}/><span className="text-[10px]">{accent.name}</span></button>)}</div><label htmlFor="widget-custom-accent" className="mt-3 flex items-center gap-3 rounded-xl border border-current/10 p-3"><input id="widget-custom-accent" aria-label="Własny kolor akcentu" type="color" value={value.accentColor} onChange={event=>set('accentColor',event.target.value)} className="h-8 w-9 shrink-0 cursor-pointer bg-transparent"/><span className="flex-1 text-xs">Własny kolor</span><span className="text-[10px] font-mono opacity-60">{value.accentColor.toUpperCase()}</span></label></fieldset>
      {select('surface','Kolor tła',[{value:'tinted',label:'Zabarwione akcentem'},{value:'neutral',label:'Neutralne'}])}
      <div><label htmlFor="widget-radius" className="flex justify-between text-xs font-semibold"><span>Zaokrąglenie rogów</span><output>{value.cornerRadius} dp</output></label><input id="widget-radius" type="range" min="0" max="32" step="2" value={value.cornerRadius} onChange={event=>set('cornerRadius',Number(event.target.value))} className="ui-accent-focus mt-3 w-full" style={{accentColor:value.accentColor}}/></div>
      {select('density','Odstępy między odjazdami',[{value:'comfortable',label:'Wygodne'},{value:'compact',label:'Kompaktowe'}])}
      {select('textSize','Wielkość tekstu',[{value:'small',label:'Mniejszy'},{value:'normal',label:'Standardowy'},{value:'large',label:'Większy'}])}
      {select('lineColors','Kolory numerów linii',[{value:'carrier',label:'Według przewoźnika'},{value:'accent',label:'Kolor akcentu'}])}
      <div className="space-y-1">{([
        ['highlightNext','Wyróżnij najbliższy odjazd'],['showDirections','Pokazuj kierunki'],
        ['showDelay','Pokazuj opóźnienie w minutach'],['showSeparators','Oddzielaj odjazdy linią'],
        ['showStatus','Pokazuj godzinę aktualizacji'],
      ] as const).map(([key,label])=><label key={key} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 border-b border-current/5 py-2 text-xs"><span>{label}</span><input type="checkbox" checked={value[key]} onChange={event=>set(key,event.target.checked)} style={{accentColor:value.accentColor}}/></label>)}<p className="pt-2 text-[11px] leading-relaxed opacity-60">Ostrzeżenie o nieaktualnych danych pozostaje widoczne. Mały widżet dopasowuje zawartość do dostępnego miejsca.</p></div>
      <button type="button" onClick={()=>onChange({...DEFAULT_WIDGET_APPEARANCE})} className="ui-accent-focus flex items-center gap-2 rounded-lg py-2 text-xs opacity-65"><RotateCcw size={14}/>Przywróć domyślny wygląd</button>
    </div>}
  </section>;
}
