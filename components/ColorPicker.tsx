'use client';
import {useEffect,useId,useRef,useState,type PointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {Palette,X,Check,RotateCcw} from 'lucide-react';
import {useAppBack} from '@/lib/use-app-back';
import {useDialogFocus} from '@/lib/use-dialog-focus';
import {parseHexColor,parseRgbColor,colorRgb,hexHsv,hsvHex} from '@/lib/color-input';
const swatches=['#00a3a2','#38bdf8','#818cf8','#a855f7','#ec4899','#f43f5e','#f59e0b','#22c55e','#64748b','#ffffff','#080d1d','#000000'];
export default function ColorPicker({label,value,onChange,ariaLabel=label,dark}:{label:string;value:string;onChange:(value:string)=>void;ariaLabel?:string;dark:boolean}){
  const [open,setOpen]=useState(false),anchor=useRef<HTMLButtonElement>(null);
  return <><button ref={anchor} type="button" aria-label={ariaLabel} aria-haspopup="dialog" onClick={()=>setOpen(true)} className="personal-color color-picker-trigger ui-accent-focus">
    <Palette size={17} aria-hidden="true"/><span className="min-w-0 flex-1 text-left">{label}</span><span className="font-mono text-[11px] opacity-65">{value.toUpperCase()}</span><span className="color-picker-swatch" style={{backgroundColor:value}}/>
  </button>{open&&<ColorDialog label={label} value={value} dark={dark} anchor={anchor.current} onClose={()=>setOpen(false)} onApply={color=>{onChange(color);setOpen(false);}}/>}</>;
}
function ColorDialog({label,value,dark,anchor,onClose,onApply}:{label:string;value:string;dark:boolean;anchor:HTMLElement|null;onClose:()=>void;onApply:(hex:string)=>void}){
  const initial=parseHexColor(value)||'#00a3a2';
  const [draft,setDraft]=useState(initial),[hex,setHex]=useState(initial),[rgb,setRgb]=useState(colorRgb(initial).join(', ')),[hsv,setHsv]=useState(()=>hexHsv(initial)),[error,setError]=useState('');
  const ref=useRef<HTMLDivElement>(null),id=useId();
  const [viewport,setViewport]=useState(()=>({height:window.visualViewport?.height||window.innerHeight,top:window.visualViewport?.offsetTop||0}));
  useEffect(()=>{const update=()=>setViewport({height:window.visualViewport?.height||window.innerHeight,top:window.visualViewport?.offsetTop||0});window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);window.addEventListener('resize',update);return()=>{window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update);window.removeEventListener('resize',update);};},[]);
  useDialogFocus(ref,true,onClose);useAppBack(true,()=>{onClose();return true;},200);
  const [target]=useState(()=>anchor?.closest<HTMLElement>('.pks-theme-root')||document.body);
  useEffect(()=>{const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;};},[]);
  const update=(color:string,source?:'hex'|'rgb',raw?:string,nextHsv?:[number,number,number])=>{
    setDraft(color);setHex(source==='hex'?raw!:color);setRgb(source==='rgb'?raw!:colorRgb(color).join(', '));setHsv(nextHsv||hexHsv(color));setError('');
  };
  const plane=(event:PointerEvent<HTMLDivElement>)=>{
    if(event.type==='pointermove'&&!event.currentTarget.hasPointerCapture(event.pointerId))return;
    if(event.type==='pointerdown')event.currentTarget.setPointerCapture(event.pointerId);
    const bounds=event.currentTarget.getBoundingClientRect();
    const next:[number,number,number]=[hsv[0],Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width)),1-Math.max(0,Math.min(1,(event.clientY-bounds.top)/bounds.height))];
    update(hsvHex(...next),undefined,undefined,next);
  };
  return createPortal(<div className="color-picker-overlay" style={{height:viewport.height,top:viewport.top,bottom:'auto'}} data-color-theme={dark?'dark':'light'} onPointerDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className="color-picker-dialog">
      <header className="color-picker-header"><span className="color-picker-icon ui-accent-soft"><Palette size={22}/></span><div className="min-w-0 flex-1"><h2 id={id}>Wybierz kolor</h2><p>{label}</p></div><button type="button" aria-label="Zamknij wybór koloru" onClick={onClose}><X size={21}/></button></header>
      <div className="color-picker-content">
        <div className="color-picker-plane" role="slider" tabIndex={0} aria-label="Nasycenie i jasność" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hsv[1]*100)} aria-valuetext={`Nasycenie ${Math.round(hsv[1]*100)}%, jasność ${Math.round(hsv[2]*100)}%`} style={{backgroundColor:hsvHex(hsv[0],1,1)}} onPointerDown={plane} onPointerMove={plane} onKeyDown={event=>{
          if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();
          const next:[number,number,number]=[hsv[0],Math.max(0,Math.min(1,hsv[1]+(event.key==='ArrowRight'?.01:event.key==='ArrowLeft'?-.01:0))),Math.max(0,Math.min(1,hsv[2]+(event.key==='ArrowUp'?.01:event.key==='ArrowDown'?-.01:0)))];update(hsvHex(...next),undefined,undefined,next);
        }}><span style={{left:`${hsv[1]*100}%`,top:`${(1-hsv[2])*100}%`,backgroundColor:draft}}/></div>
        <label className="color-picker-hue-label"><span>Odcień</span><input aria-label="Odcień koloru" className="color-picker-hue" type="range" min={0} max={359} value={Math.round(hsv[0])} onChange={event=>{const next:[number,number,number]=[Number(event.target.value),hsv[1],hsv[2]];update(hsvHex(...next),undefined,undefined,next);}}/></label>
        <div className="color-picker-values"><label><span>HEX</span><input autoCapitalize="none" autoComplete="off" spellCheck={false} aria-label="Kod HEX" aria-invalid={Boolean(error)} value={hex} onChange={event=>{const raw=event.target.value;setHex(raw);const parsed=parseHexColor(raw);if(parsed)update(parsed,'hex',raw);else setError('Podaj HEX, np. #38BDF8 lub #ABC.');}}/></label><label><span>RGB</span><input inputMode="text" autoComplete="off" spellCheck={false} aria-label="Kod RGB" aria-invalid={Boolean(error)} value={rgb} onChange={event=>{const raw=event.target.value;setRgb(raw);const parsed=parseRgbColor(raw);if(parsed)update(parsed,'rgb',raw);else setError('Podaj RGB od 0 do 255, np. 56, 189, 248.');}}/></label></div>
        {error&&<p role="alert" className="color-picker-error">{error}</p>}
        <div className="color-picker-palette">{swatches.map(color=><button key={color} type="button" aria-label={`Wybierz ${color}`} aria-pressed={draft===color} style={{backgroundColor:color}} onClick={()=>update(color)}>{draft===color&&<Check size={17} style={{color:color==='#ffffff'?'#080d1d':'white',filter:'drop-shadow(0 1px 2px #0008)'}}/>}</button>)}</div>
        <div className="color-picker-preview"><div><span style={{background:initial}}/><span style={{background:draft}}/></div><span><small>Wybrany kolor</small><strong>{draft.toUpperCase()}</strong></span><button type="button" aria-label="Przywróć poprzedni kolor" onClick={()=>update(initial)}><RotateCcw size={17}/></button></div>
      </div>
      <footer><button type="button" onClick={onClose}>Anuluj</button><button type="button" className="ui-accent-solid" disabled={Boolean(error)} onClick={()=>onApply(draft)}><Check size={17}/>Zastosuj kolor</button></footer>
    </div>
  </div>,target);
}
