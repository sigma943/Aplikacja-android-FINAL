'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {useSheetGesture,SHEET_SPRING} from '@/lib/use-sheet-gesture';
import {useDialogFocus} from '@/lib/use-dialog-focus';

type Props = {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onClose: () => void;
  className: string;
  overlayClassName: string;
  children: ReactNode;
};

export default function OptionsSheet({ expanded, onExpandedChange, onClose, className, overlayClassName, children }: Props) {
  const sheet = useRef<HTMLDivElement>(null);
  const [limits, setLimits] = useState({ compact: 320, full: 500 });
  const drag=useSheetGesture(expanded,onExpandedChange,limits.compact,limits.full);
  useDialogFocus(sheet,true,onClose);

  useEffect(() => {
    const root = sheet.current;
    if (!root) return;
    let appearance:HTMLElement|null=null,scroll:HTMLElement|null=null;
    const measure = () => {
      if(!appearance||!scroll)return;
      const prefix = scroll.getBoundingClientRect().top - root.getBoundingClientRect().top;
      const padding = parseFloat(getComputedStyle(root).paddingBottom) || 12;
      const compact = Math.min(prefix + appearance.offsetHeight + padding, innerHeight * 0.55);
      const full = Math.max(compact, Math.min(prefix + scroll.scrollHeight + padding, innerHeight * 0.8));
      setLimits(previous => Math.abs(previous.compact - compact) < 1 && Math.abs(previous.full - full) < 1 ? previous : {compact, full});
    };
    const observer = new ResizeObserver(measure);
    const connect = () => {
      const next=root.querySelector<HTMLElement>('[data-options-appearance]');
      const nextScroll=root.querySelector<HTMLElement>('[data-options-scroll]');
      if(next!==appearance||nextScroll!==scroll){
        observer.disconnect();appearance=next;scroll=nextScroll;
        if(appearance)observer.observe(appearance);
        const extra=root.querySelector<HTMLElement>('[data-options-extra]');
        if(extra)observer.observe(extra);
      }
      measure();
    };
    const mutation=new MutationObserver(connect);
    mutation.observe(root,{childList:true,subtree:true});
    window.addEventListener('resize', measure);
    connect();
    return () => {observer.disconnect();mutation.disconnect();window.removeEventListener('resize', measure);};
  }, []);

  useEffect(()=>{if(!expanded)sheet.current?.querySelector('[data-options-scroll]')?.scrollTo(0,0);},[expanded]);

  return (
    <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} transition={{duration: 0.15}}
      className={overlayClassName} onClick={event => {if (event.target === event.currentTarget) onClose();}}>
      <motion.div ref={sheet} role="dialog" aria-modal="true" aria-labelledby="options-title" data-options-sheet data-expanded={expanded}
        initial={{y: '100%', opacity: 0}} animate={{y: 0, opacity: 1}} exit={{y: '100%', opacity: 0}}
        transition={SHEET_SPRING} className={className} style={{height:drag.height}}
        onClick={event => event.stopPropagation()}>
        <button type="button" aria-label={expanded ? 'Zwiń opcje' : 'Rozwiń opcje'} aria-expanded={expanded} aria-controls="additional-options"
          className="-mt-1 mb-1 flex h-6 w-full shrink-0 touch-none cursor-grab items-center justify-center active:cursor-grabbing"
          {...drag.handle}>
          <span className="h-1 w-9 rounded-full bg-slate-400/50" />
        </button>
        {children}
      </motion.div>
    </motion.div>
  );
}
