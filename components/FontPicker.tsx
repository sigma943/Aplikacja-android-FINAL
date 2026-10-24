'use client';
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {AlertCircle,Check,CheckCircle2,ChevronDown,ExternalLink,Link as LinkIcon,LoaderCircle,Search,Type} from 'lucide-react';
import {INTERFACE_FONTS,interfaceFontStack,interfaceGoogleFont,parseGoogleFontInput,loadInterfaceGoogleFont} from '@/lib/interface-fonts';
import {useDialogFocus} from '@/lib/use-dialog-focus';
import {useAppBack} from '@/lib/use-app-back';
type Feedback={kind:'error'|'success'|'loading';text:string}|null;
export default function FontPicker({value,onChange}:{value:{fontFamily:string;customFontUrl:string};onChange:(fontFamily:string,customFontUrl:string)=>void}){
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[url,setUrl]=useState(value.customFontUrl),[feedback,setFeedback]=useState<Feedback>(null),[fontStatus,setFontStatus]=useState<Feedback>(null),[busy,setBusy]=useState(false),[familyChoice,setFamilyChoice]=useState('');
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),search=useRef<HTMLInputElement>(null),request=useRef(0),latest=useRef(onChange),appliedUrl=useRef(''),id=useId();latest.current=onChange;
  const candidates=useMemo(()=>parseGoogleFontInput(url),[url]);
  const candidate=candidates.length===1?candidates[0]:candidates.find(font=>font.family===familyChoice);
  const family=interfaceGoogleFont(value),name=value.fontFamily==='custom'?family:INTERFACE_FONTS.find(font=>font.id===value.fontFamily)?.name||'Systemowy';
  useAppBack(open,()=>{setOpen(false);return true;},110);
  useDialogFocus(root,open,()=>setOpen(false));
  useEffect(()=>()=>{request.current++;},[]);
  useEffect(()=>{
    if(appliedUrl.current===value.customFontUrl){appliedUrl.current='';return;}
    request.current++;setBusy(false);setUrl(value.customFontUrl);setFamilyChoice('');setFeedback(null);
  },[value.customFontUrl]);
  useEffect(()=>{
    if(!family){setFontStatus(null);return;}let active=true;
    const load=()=>{setFontStatus({kind:'loading',text:'Pobieranie czcionki…'});void loadInterfaceGoogleFont(family).then(()=>{if(active)setFontStatus(null);},()=>{if(active)setFontStatus({kind:'error',text:'Nie wczytano czcionki. Użyto systemowej.'});});};
    load();window.addEventListener('online',load);
    return()=>{active=false;window.removeEventListener('online',load);};
  },[family]);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener('pointerdown',outside);
    return()=>{document.removeEventListener('pointerdown',outside);};
  },[open]);
  const edit=(text:string)=>{request.current++;setBusy(false);setUrl(text);setFamilyChoice('');setFeedback(null);};
  const add=async()=>{
    if(!candidates.length){setFeedback({kind:'error',text:'Nieprawidłowy link lub kod Google Fonts.'});return;}
    if(!candidate){setFeedback({kind:'error',text:'Wybierz jedną z czcionek poniżej.'});return;}
    const token=++request.current;setBusy(true);setFeedback({kind:'loading',text:'Pobieranie czcionki…'});
    try{
      await loadInterfaceGoogleFont(candidate.family);if(token!==request.current)return;
      appliedUrl.current=candidate.url;latest.current('custom',candidate.url);
      setFeedback({kind:'success',text:`Zastosowano: ${candidate.family}.`});
    }catch(error){
      const allowed=['Brak połączenia z internetem.','Przekroczono czas pobierania.','Nie znaleziono czcionki.','Nie udało się pobrać czcionki.','Nie udało się wczytać czcionki.'];
      if(token===request.current)setFeedback({kind:'error',text:error instanceof Error&&allowed.includes(error.message)?error.message:'Nie udało się wczytać czcionki.'});
    }finally{if(token===request.current)setBusy(false);}
  };
  return <div ref={root} className="personal-font-picker">
    <span className="block text-xs font-medium">Krój pisma</span>
    <button ref={trigger} type="button" aria-label="Wybierz krój pisma" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(old=>!old)} className="personal-font-trigger ui-accent-focus"><Type size={18}/><span className="flex-1 text-left">{name}</span><ChevronDown size={18} className={open?'rotate-180':''}/></button>
    {open&&<div id={id} className="personal-font-list"><label className="personal-font-search"><Search size={16}/><input ref={search} aria-label="Szukaj czcionki" placeholder="Szukaj czcionki…" value={query} onChange={event=>setQuery(event.target.value)}/></label><div role="group" aria-label="Dostępne czcionki">{INTERFACE_FONTS.filter(font=>(font.name+' '+font.kind).toLowerCase().includes(query.toLowerCase())).map(font=><button key={font.id} type="button" aria-pressed={value.fontFamily===font.id} onClick={()=>{request.current++;setBusy(false);setFeedback(null);onChange(font.id,value.customFontUrl);setOpen(false);setQuery('');trigger.current?.focus();}} className={value.fontFamily===font.id?'ui-accent-soft':''}><span className="flex-1 text-left"><strong>{font.name}</strong><small>{font.kind}</small></span>{value.fontFamily===font.id&&<Check size={17}/>}</button>)}{!INTERFACE_FONTS.some(font=>(font.name+' '+font.kind).toLowerCase().includes(query.toLowerCase()))&&<p className="p-3 text-xs opacity-60">Brak pasujących czcionek.</p>}</div></div>}
    <div className="personal-font-sample" style={{fontFamily:interfaceFontStack(value)}}><span>Podgląd pisma</span><p>Przykładowy tekst</p><small>PKS Live · Odjazd 14:35 · 0123456789</small></div>
    {fontStatus&&<p role="status" className="font-import-feedback" data-kind={fontStatus.kind}>{fontStatus.text}</p>}
    <label className="personal-font-link"><span><LinkIcon size={15}/>Własna czcionka z Google Fonts</span><textarea rows={3} aria-label="Link do Google Fonts" aria-invalid={feedback?.kind==='error'} aria-describedby={id+'-feedback'} placeholder="Wklej link, kod <link> lub @import…" autoCapitalize="none" autoComplete="off" spellCheck={false} value={url} onChange={event=>edit(event.target.value)} onBlur={()=>{if(url.trim()&&!candidates.length)setFeedback({kind:'error',text:'Nieprawidłowy link lub kod Google Fonts.'});}}/></label>
    <div id={id+'-feedback'} data-font-import-feedback>{feedback&&<p role={feedback.kind==='error'?'alert':'status'} className="font-import-feedback" data-kind={feedback.kind}>{feedback.kind==='error'?<AlertCircle size={15}/>:feedback.kind==='success'?<CheckCircle2 size={15}/>:<LoaderCircle size={15} className="animate-spin"/>}<span>{feedback.text}</span></p>}</div>
    {candidates.length>1&&<fieldset className="personal-font-candidates"><legend>Znalezione czcionki: {candidates.length}. Wybierz jedną:</legend><div className="flex flex-wrap gap-2">{candidates.map(font=><button type="button" key={font.family} aria-pressed={familyChoice===font.family} className={`personal-choice ${familyChoice===font.family?'ui-accent-soft':''}`} onClick={()=>{request.current++;setBusy(false);setFamilyChoice(font.family);setFeedback(null);}}>{font.family}</button>)}</div></fieldset>}
    <div className="flex flex-wrap items-center justify-between gap-3"><a href="https://fonts.google.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs opacity-70">Przeglądaj czcionki<ExternalLink size={13}/></a><button type="button" onClick={add} disabled={busy||!url.trim()} className="personal-choice ui-accent-soft inline-flex items-center gap-2">{busy?<LoaderCircle size={16} className="animate-spin"/>:<Check size={16}/>}Zastosuj z linku</button></div>
    <p className="text-[11px] leading-relaxed opacity-65">Możesz wkleić cały kod z Google Fonts. Czcionki pobierają się przy pierwszym użyciu.</p>
  </div>;
}
