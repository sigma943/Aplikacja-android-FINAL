import {useAppBack} from '@/lib/use-app-back';
import {AdminDateField} from './AdminDateField';
import {BAN_DURATIONS,banExpiryForDuration,banDateTimeInput,type BanDuration} from '@/lib/admin/ban-details';
import {readBanImage,banImageAddress} from '@/lib/ban-image';
import {AdminModalPortal} from './AdminModalPortal';
import { X, Lock, ChevronDown, Check, Upload, Image as ImageIcon, EyeOff } from 'lucide-react';
import { Device } from '../types';
import React, { useState, useRef, useEffect, ChangeEvent } from 'react';
import { motion } from 'motion/react';

interface BanModalProps {
  device: Device;
  onClose: () => void;
  onConfirm: (device: Device, reason: string, expiryDate: string, gifUrl: string, silent: boolean) => boolean | void | Promise<boolean | void>;
}

export function BanModal({ device, onClose, onConfirm }: BanModalProps) {
  const editing=device.status==='Zablokowany';
  const previous=editing?device.banDetails:undefined;
  const [gifUrl, setGifUrl] = useState(previous?.gifUrl||'');
  const [includeImage, setIncludeImage] = useState(Boolean(previous?.gifUrl&&!previous?.silent));
  const [silentBan, setSilentBan] = useState(Boolean(previous?.silent));
  const [imageError, setImageError] = useState('');
  const [imageLoading,setImageLoading]=useState(false);
  const [imageAddress,setImageAddress]=useState('');
  const imageGeneration=useRef(0);
  const [reason, setReason] = useState(previous?.reason||'');
  const [duration,setDuration]=useState<BanDuration>(editing?'custom':'day');
  const [durationOpen,setDurationOpen]=useState(false);
  const durationRef=useRef<HTMLDivElement>(null);
  const durationButtonRef=useRef<HTMLButtonElement>(null);
  useAppBack(durationOpen,()=>{setDurationOpen(false);return true;},110);
  useEffect(()=>{
    if(!durationOpen)return;
    const outside=(event:PointerEvent)=>{if(!durationRef.current?.contains(event.target as Node))setDurationOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();setDurationOpen(false);durationButtonRef.current?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true);};
  },[durationOpen]);
  const [expiryDate, setExpiryDate] = useState(banDateTimeInput(previous?.expiresAt||banExpiryForDuration('day')));
  const [formError,setFormError]=useState('');
  const [saving,setSaving]=useState(false);
  const [isPermanent, setIsPermanent] = useState(editing&&!previous?.expiresAt);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file=e.target.files?.[0];
    e.target.value='';
    if(!file)return;
    const generation=++imageGeneration.current;
    setImageLoading(true);setImageError('');setGifUrl('');setImageAddress('');
    try{const image=await readBanImage(file);if(generation===imageGeneration.current)setGifUrl(image);}
    catch(error){if(generation===imageGeneration.current)setImageError(error instanceof Error?error.message:'Nie udało się odczytać obrazka.');}
    finally{if(generation===imageGeneration.current)setImageLoading(false);}
  };

  const changeImageAddress=(address:string)=>{
    imageGeneration.current++;setImageLoading(false);setImageAddress(address);setImageError('');
    try{setGifUrl(banImageAddress(address));}catch(error){setGifUrl('');setImageError((error as Error).message);}
  };

  const togglePermanent = () => {
    setIsPermanent((prev) => {
      const next = !prev;
      setDurationOpen(false);
      setFormError('');
      return next;
    });
  };

  const handleBan = async () => {
    if(saving)return;
    setFormError('');
    if (!silentBan && includeImage && (imageLoading || (imageError && gifUrl!==previous?.gifUrl))) return;
    if (!silentBan && includeImage && !gifUrl) {
      setImageError('Dodaj obrazek albo wyłącz tę opcję.');
      return;
    }
    const expiry=isPermanent?'':duration==='custom'?(previous?.expiresAt&&expiryDate===banDateTimeInput(previous.expiresAt)?previous.expiresAt:expiryDate):banExpiryForDuration(duration);
    if(!isPermanent&&(!expiry||!Number.isFinite(new Date(expiry).getTime())||new Date(expiry).getTime()<=Date.now())){setFormError('Wybierz datę i godzinę zakończenia w przyszłości.');return;}
    setSaving(true);
    try{const result=await onConfirm(device,reason,expiry,!silentBan&&includeImage?gifUrl:'',silentBan);if(result!==false)onClose();}
    catch(error){setFormError(error instanceof Error?error.message:'Nie udało się zapisać blokady. Spróbuj ponownie.');}
    finally{setSaving(false);}
  };

  return (
    <AdminModalPortal>
    <div role="dialog" aria-modal="true" aria-label={editing?'Edytuj blokadę':'Zablokuj urządzenie'} className="admin-modal-overlay bg-[#020408]/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="pks-personal-card relative flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-white/10 border-t-white/20 bg-[#0F131D] shadow-2xl"
      >
        <div className="shrink-0 px-4 sm:px-6 py-4 flex items-center justify-between border-b border-white/5">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">{editing?'Edytuj blokadę':'Zablokuj urządzenie'}</h2>
            <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">Konfiguracja blokady dla tego urządzenia</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-slate-500 hover:text-white transition-all p-2 rounded-xl hover:bg-white/5 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <div ref={durationRef} className="relative">
            <span id="ban-duration-label" className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Czas blokady</span>
            <button
              ref={durationButtonRef}
              type="button"
              data-ban-duration-toggle
              aria-labelledby="ban-duration-label ban-duration-value"
              aria-expanded={durationOpen}
              aria-controls="ban-duration-options"
              disabled={isPermanent}
              onClick={()=>setDurationOpen(open=>!open)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#111623] px-4 py-3.5 text-left text-sm font-semibold text-slate-300 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span id="ban-duration-value">{BAN_DURATIONS.find(([id])=>id===duration)?.[1]}</span>
              <ChevronDown size={18} className={`shrink-0 transition-transform ${durationOpen?'rotate-180':''}`} />
            </button>
            {durationOpen&&(
              <div id="ban-duration-options" className="pks-personal-card absolute left-0 right-0 top-full z-30 mt-2 flex flex-col gap-1 rounded-2xl border border-white/10 bg-[#111623] p-1.5 shadow-2xl" data-ban-durations>
                {BAN_DURATIONS.map(([id,label])=><button
                  key={id} type="button" data-ban-duration={id} aria-pressed={duration===id}
                  onClick={()=>{setDuration(id);setDurationOpen(false);setFormError('');durationButtonRef.current?.focus();}}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-colors ${duration===id?'ui-accent-soft':'text-slate-400 hover:bg-white/5'}`}
                >{label}{duration===id&&<Check size={16} className="shrink-0" />}</button>)}
              </div>
            )}
          </div>
          {!isPermanent&&duration==='custom'&&(
            <div className="rounded-2xl border border-white/5 bg-black/10 p-3" data-ban-custom-date>
              <label htmlFor="ban-date" className="mb-2 block px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Data i godzina zakończenia</label>
              <AdminDateField
                type="datetime-local"
                aria-label="Data i godzina zakończenia blokady"
                value={expiryDate}
                onChange={(e)=>{setExpiryDate(e.target.value);setFormError('');}}
                className="w-full cursor-pointer rounded-xl border border-white/10 bg-[#151B28] px-4 py-3 text-sm text-white transition-colors focus:outline-none focus:border-rose-500/50"
                id="ban-date"
              />
            </div>
          )}

          <button
            type="button"
            onClick={togglePermanent}
            className={[
              'w-full rounded-2xl border px-4 py-4 text-left transition-all cursor-pointer',
              isPermanent
                ? 'border-rose-500/40 bg-rose-500/12 shadow-[0_0_24px_rgba(244,63,94,0.12)]'
                : 'border-white/10 bg-[#151B28] hover:bg-[#1a2232]'
            ].join(' ')}
          >
            <div className="flex items-start gap-3">
              <div className={[
                'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border',
                isPermanent ? 'border-rose-400/40 bg-rose-500/15 text-rose-300' : 'border-white/10 bg-white/5 text-slate-400'
              ].join(' ')}>
                <Lock size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 pr-2">
                    <p className="text-sm font-semibold text-white">Ban permanentny</p>
                    <p className="mt-1 text-xs text-slate-400">Blokada bez daty wygaśnięcia. Na ekranie bana pokażemy: Nigdy.</p>
                  </div>
                  <div className={[
                    'mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full border px-1 transition-all',
                    isPermanent ? 'border-rose-400/50 bg-rose-500/25' : 'border-white/10 bg-white/5'
                  ].join(' ')}>
                    <div className={[
                      'h-[18px] w-[18px] rounded-full bg-white transition-all',
                      isPermanent ? 'translate-x-[18px]' : 'translate-x-0'
                    ].join(' ')} />
                  </div>
                </div>
              </div>
            </div>
          </button>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-widest px-1">Powód blokady <span className="text-slate-600 font-normal">(opcjonalnie)</span></label>
            <input
              type="text"
              aria-label="Powód blokady"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-[#151B28] border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-rose-500/50 transition-colors"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setSilentBan((prev) => {
                const next = !prev;
                if (next) {
                  setIncludeImage(false);
                  setGifUrl('');
                  setImageError('');
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }
                return next;
              });
            }}
            className={[
              'w-full rounded-2xl border px-4 py-4 text-left transition-all cursor-pointer',
              silentBan
                ? 'border-amber-500/40 bg-amber-500/12 shadow-[0_0_24px_rgba(245,158,11,0.12)]'
                : 'border-white/10 bg-[#151B28] hover:bg-[#1a2232]'
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className={[
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border',
                  silentBan ? 'border-amber-400/40 bg-amber-500/15 text-amber-300' : 'border-white/10 bg-white/5 text-slate-400'
                ].join(' ')}>
                  <EyeOff size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Cichy ban</p>
                  <p className="mt-1 text-xs text-slate-400">Zamiast komunikatu o banie pokaże neutralny błąd aplikacji.</p>
                </div>
              </div>
              <div className={[
                'flex h-6 w-11 shrink-0 items-center rounded-full border px-1 transition-all',
                silentBan ? 'border-amber-400/50 bg-amber-500/25' : 'border-white/10 bg-white/5'
              ].join(' ')}>
                <div className={[
                  'h-[18px] w-[18px] rounded-full bg-white transition-all',
                  silentBan ? 'translate-x-[18px]' : 'translate-x-0'
                ].join(' ')} />
              </div>
            </div>
          </button>

          <button
            type="button"
            disabled={silentBan}
            onClick={() => {
              setIncludeImage((prev) => {
                const next = !prev;
                if (!next) {
                  imageGeneration.current++;setImageLoading(false);setImageAddress('');
                  setGifUrl('');
                  setImageError('');
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }
                return next;
              });
            }}
            className={[
              'w-full rounded-2xl border px-4 py-4 text-left transition-all',
              silentBan
                ? 'border-white/5 bg-[#151B28] opacity-45 cursor-not-allowed grayscale-[0.4]'
                : includeImage
                ? 'border-sky-500/40 bg-sky-500/12 shadow-[0_0_24px_rgba(14,165,233,0.12)]'
                : 'border-white/10 bg-[#151B28] hover:bg-[#1a2232] cursor-pointer'
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className={[
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border',
                  includeImage && !silentBan ? 'border-sky-400/40 bg-sky-500/15 text-sky-300' : 'border-white/10 bg-white/5 text-slate-400'
                ].join(' ')}>
                  <ImageIcon size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Dodaj obrazek</p>
                  <p className="mt-1 text-xs text-slate-400">Po włączeniu obrazek jest wymagany.</p>
                </div>
              </div>
              <div className={[
                'flex h-6 w-11 shrink-0 items-center rounded-full border px-1 transition-all',
                includeImage && !silentBan ? 'border-sky-400/50 bg-sky-500/25' : 'border-white/10 bg-white/5'
              ].join(' ')}>
                <div className={[
                  'h-[18px] w-[18px] rounded-full bg-white transition-all',
                  includeImage && !silentBan ? 'translate-x-[18px]' : 'translate-x-0'
                ].join(' ')} />
              </div>
            </div>
          </button>

          {includeImage && !silentBan && (
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-widest px-1">Obrazek blokady (GIF, JPG, PNG i inne)</label>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 bg-[#151B28] hover:bg-[#1c2435] border border-white/10 rounded-xl py-3 px-4 text-sm text-slate-300 transition-all group cursor-pointer"
                >
                  <Upload size={16} className="group-hover:text-white" />
                  <span>{gifUrl ? 'Zmień obrazek' : 'Wybierz obrazek lub GIF'}</span>
                </button>
                <label className="mt-3 block text-xs text-slate-400">Lub bezpośredni adres obrazka (dla większych plików)
                  <input type="url" value={imageAddress} onChange={event=>changeImageAddress(event.target.value)} placeholder="https://…" className="mt-1 w-full rounded-xl border border-white/10 bg-[#111623] p-3 text-sm text-slate-200" />
                </label>
                {imageLoading && <p className="mt-2 text-xs text-slate-400">Wczytywanie obrazka…</p>}
                {imageError && <p className="mt-2 px-1 text-xs font-semibold text-rose-300">{imageError}</p>}
              </div>

              {gifUrl && (
                <div className="relative group">
                  <div className="w-full h-40 rounded-2xl border border-white/5 overflow-hidden bg-black/40 flex items-center justify-center">
                    <img src={gifUrl} alt="Podgląd obrazka blokady" onError={()=>setImageError('Nie można wyświetlić obrazka. Sprawdź format pliku lub adres.')} onLoad={()=>setImageError('')} className="w-full h-full object-contain" />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 rounded-b-2xl bg-gradient-to-t from-black/80 to-transparent px-3 py-2 text-[10px] font-medium text-white/70">
                    Podgląd obrazka blokady
                  </div>
                </div>
              )}
            </div>
          )}

          {formError&&<p role="alert" className="rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm text-rose-200">{formError}</p>}
          <button
            type="button"
            disabled={saving||imageLoading}
            onClick={handleBan}
            className="w-full flex items-center justify-center gap-3 bg-rose-500 hover:bg-rose-600 text-white py-4 rounded-2xl font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_30px_rgba(244,63,94,0.3)] cursor-pointer"
          >
            <Lock size={18} />
            {saving?'Zapisywanie…':editing?'ZAPISZ ZMIANY BLOKADY':'ZABLOKUJ URZĄDZENIE'}
          </button>
        </div>
      </motion.div>
    </div>
    </AdminModalPortal>
  );
}
