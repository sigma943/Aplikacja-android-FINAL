'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {Check,ChevronDown,ExternalLink,Link as LinkIcon,LoaderCircle,Search,Type} from 'lucide-react';
import {INTERFACE_FONTS,interfaceFontStack,interfaceGoogleFont,parseGoogleFontLink,loadInterfaceGoogleFont} from '@/lib/interface-fonts';
import {useAppBack} from '@/lib/use-app-back';
export default function FontPicker({value,onChange}:{value:{fontFamily:string;customFontUrl:string};onChange:(fontFamily:string,customFontUrl:string)=>void}){
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[url,setUrl]=useState(value.customFontUrl),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),search=useRef<HTMLInputElement>(null),request=useRef(0),latest=useRef(onChange),id=useId();latest.current=onChange;
  const family=interfaceGoogleFont(value),name=value.fontFamily==='custom'?family:INTERFACE_FONTS.find(font=>font.id===value.fontFamily)?.name||'Systemowy';
  useAppBack(open,()=>{setOpen(false);return true;},110);
  useEffect(()=>()=>{request.current++;},[]);
  useEffect(()=>{setUrl(value.customFontUrl);},[value.customFontUrl]);
  useEffect(()=>{
    if(!family){setStatus('');return;}let active=true;setStatus('Pobieranie czcionki…');
    loadInterfaceGoogleFont(family).then(()=>{if(active)setStatus('');},()=>{if(active)setStatus('Brak połączenia z Google Fonts. Używamy czytelnej czcionki zastępczej.');});
    return()=>{active=false;};
  },[family]);
  useEffect(()=>{
    if(!open)return;search.current?.focus();
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key,true);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key,true);};
  },[open]);
  const add=async()=>{
    const parsed=parseGoogleFontLink(url);if(!parsed){setStatus('Wklej link do jednej czcionki z fonts.google.com lub fonts.googleapis.com.');return;}
    const token=++request.current;setBusy(true);setStatus('Pobieranie czcionki…');
    try{await loadInterfaceGoogleFont(parsed.family);if(token!==request.current)return;latest.current('custom',parsed.url);setStatus('');}
    catch(error){if(token===request.current)setStatus((error as Error).message);}
    finally{if(token===request.current)setBusy(false);}
  };
  return <div ref={root} className="personal-font-picker">
    <span className="block text-xs font-medium">Krój pisma</span>
    <button ref={trigger} type="button" aria-label="Wybierz krój pisma" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(old=>!old)} className="personal-font-trigger ui-accent-focus"><Type size={18}/><span className="flex-1 text-left">{name}</span><ChevronDown size={18} className={open?'rotate-180':''}/></button>
    {open&&<div id={id} className="personal-font-list"><label className="personal-font-search"><Search size={16}/><input ref={search} aria-label="Szukaj czcionki" placeholder="Szukaj czcionki…" value={query} onChange={event=>setQuery(event.target.value)}/></label><div role="group" aria-label="Dostępne czcionki">{INTERFACE_FONTS.filter(font=>(font.name+' '+font.kind).toLowerCase().includes(query.toLowerCase())).map(font=><button key={font.id} type="button" aria-pressed={value.fontFamily===font.id} onClick={()=>{request.current++;setBusy(false);onChange(font.id,value.customFontUrl);setOpen(false);setQuery('');trigger.current?.focus();}} className={value.fontFamily===font.id?'ui-accent-soft':''}><span className="flex-1 text-left"><strong>{font.name}</strong><small>{font.kind}</small></span>{value.fontFamily===font.id&&<Check size={17}/>}</button>)}{!INTERFACE_FONTS.some(font=>(font.name+' '+font.kind).toLowerCase().includes(query.toLowerCase()))&&<p className="p-3 text-xs opacity-60">Brak pasujących czcionek.</p>}</div></div>}
    <div className="personal-font-sample" style={{fontFamily:interfaceFontStack(value)}}><span>Podgląd pisma</span><p>Zażółć gęślą jaźń</p><small>PKS Live · Odjazd 14:35 · 0123456789</small></div>
    <label className="personal-font-link"><span><LinkIcon size={15}/>Własna czcionka z Google Fonts</span><input type="url" aria-label="Link do Google Fonts" placeholder="https://fonts.google.com/specimen/…" autoCapitalize="none" autoComplete="off" spellCheck={false} value={url} onChange={event=>{setUrl(event.target.value);setStatus('');}}/></label>
    <div className="flex flex-wrap items-center justify-between gap-3"><a href="https://fonts.google.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs opacity-70">Przeglądaj czcionki<ExternalLink size={13}/></a><button type="button" onClick={add} disabled={busy||!url.trim()} className="personal-choice ui-accent-soft inline-flex items-center gap-2">{busy?<LoaderCircle size={16} className="animate-spin"/>:<Check size={16}/>}Zastosuj z linku</button></div>
    <p role="status" className="text-[11px] leading-relaxed opacity-65">{status||'Czcionki Google pobierają się przy pierwszym użyciu. Bez internetu pozostaje czcionka zastępcza.'}</p>
  </div>;
}
