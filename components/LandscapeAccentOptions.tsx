'use client';
import {Sun,Moon} from 'lucide-react';
import ColorPicker from './ColorPicker';
import {UIDisclosure} from './UITransitions';
import type {InterfaceAppearance} from '@/lib/interface-appearance';

type Props={value:InterfaceAppearance;onChange:(value:InterfaceAppearance)=>void;accent:string;dark:boolean};
export default function LandscapeAccentOptions({value,onChange,accent,dark}:Props){
 const day=value.landscapeDayAccent||accent,night=value.landscapeNightAccent||accent;
 return <section data-landscape-accent-options className="border-t border-current/10 pt-4">
  <label className="personal-toggle"><span><span className="block font-medium">Osobny akcent na dzień i noc</span><span className="mt-1 block text-[11px] opacity-60">Kolory zmieniają się razem z dniem i nocą Horyzontu.</span></span>
   <input type="checkbox" role="switch" aria-label="Osobny akcent na dzień i noc" checked={value.landscapeAccentEnabled} onChange={e=>onChange({...value,landscapeAccentEnabled:e.target.checked,...(e.target.checked?{landscapeDayAccent:day,landscapeNightAccent:night}:{})})}/>
  </label>
  <UIDisclosure open={value.landscapeAccentEnabled}>
   <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
    {([{key:'landscapeDayAccent',label:'Akcent na dzień',title:'Dzień',Icon:Sun,color:day},{key:'landscapeNightAccent',label:'Akcent na noc',title:'Noc',Icon:Moon,color:night}] as const).map(({key,label,title,Icon,color})=><div key={key} className="min-w-0 rounded-2xl border border-current/10 bg-current/[.025] p-3">
     <div className="mb-3 flex items-center gap-2 font-semibold"><span className="ui-accent-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"><Icon size={19}/></span>{title}</div>
     <ColorPicker label={label} value={color} onChange={next=>onChange({...value,[key]:next})} dark={dark}/>
    </div>)}
   </div>
  </UIDisclosure>
 </section>;
}
