'use client';
import {Orbit,ChevronDown} from 'lucide-react';
import {useEffect,useState} from 'react';
import {COSMIC_PARALLAX_KEY} from '@/lib/cosmic-effects';

export default function CosmicThemeOptions({disabled,searchOpen=false}:{disabled:boolean;searchOpen?:boolean}){
  const [enabled,setEnabled]=useState(false),[error,setError]=useState('');
  useEffect(()=>{const read=()=>{try{setEnabled(localStorage.getItem(COSMIC_PARALLAX_KEY)==='true');}catch{}};read();window.addEventListener('storage',read);return()=>window.removeEventListener('storage',read);},[]);
  const change=async(next:boolean)=>{
    setError('');
    if(next){
      const sensor=window.DeviceOrientationEvent as typeof DeviceOrientationEvent&{requestPermission?:()=>Promise<string>};
      if(sensor?.requestPermission){try{if(await sensor.requestPermission()!=='granted'){setError('Dostęp do czujnika nie został przyznany.');return;}}catch{setError('Czujnik przechylenia jest niedostępny.');return;}}
    }
    try{localStorage.setItem(COSMIC_PARALLAX_KEY,String(next));setEnabled(next);window.dispatchEvent(new Event('pks-interface-appearance'));}catch{setError('Nie udało się zapisać ustawienia.');}
  };
  return <details className="personal-group group" data-cosmic-settings open={searchOpen||undefined}><summary><span className="personal-group-icon"><Orbit size={19} aria-hidden="true"/></span><span className="min-w-0 flex-1"><span className="block font-semibold">Głębia kosmosu</span><span className="mt-1 block text-[11px] opacity-60">Ruch warstw przy przechyleniu telefonu</span></span><ChevronDown size={17} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180"/></summary><div className="personal-group-body"><label className="personal-toggle"><span><span className="block font-medium">Paralaksa kosmosu</span><span className="mt-1 block text-[11px] opacity-60">Delikatny ruch mgławic i planet. Na komputerze reaguje na kursor.</span></span><input type="checkbox" role="switch" aria-label="Paralaksa kosmosu" checked={enabled} disabled={disabled} onChange={event=>void change(event.target.checked)}/></label>{disabled&&<p className="personal-note">Ruch zatrzymany przez ograniczenie animacji lub lekkie efekty.</p>}{error&&<p role="status" className="personal-note">{error}</p>}</div></details>;
}
