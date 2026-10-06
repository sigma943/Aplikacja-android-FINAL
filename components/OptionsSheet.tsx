'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react';

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
  const gesture = useRef<{id: number; y: number; height: number; moved: boolean} | null>(null);
  const skipClick = useRef(false);
  const height = useMotionValue(320);
  const reduceMotion = useReducedMotion();
  const [limits, setLimits] = useState({ compact: 320, full: 500 });
  const animation = useRef<ReturnType<typeof animate> | null>(null);
  const settle = (target: number) => {
    animation.current?.stop();
    animation.current = animate(height, target, reduceMotion ? {duration: 0} : {type: 'spring', stiffness: 380, damping: 36});
  };

  useEffect(() => {
    const root = sheet.current;
    const appearance = root?.querySelector<HTMLElement>('[data-options-appearance]');
    const scroll = root?.querySelector<HTMLElement>('[data-options-scroll]');
    if (!root || !appearance || !scroll) return;
    const measure = () => {
      const prefix = scroll.getBoundingClientRect().top - root.getBoundingClientRect().top;
      const padding = parseFloat(getComputedStyle(root).paddingBottom) || 12;
      const compact = Math.min(prefix + appearance.offsetHeight + padding, innerHeight * 0.55);
      const full = Math.max(compact, Math.min(prefix + scroll.scrollHeight + padding, innerHeight * 0.8));
      setLimits(previous => Math.abs(previous.compact - compact) < 1 && Math.abs(previous.full - full) < 1 ? previous : {compact, full});
    };
    const observer = new ResizeObserver(measure);
    observer.observe(appearance);
    const extra = root.querySelector<HTMLElement>('[data-options-extra]');
    if (extra) observer.observe(extra);
    window.addEventListener('resize', measure);
    measure();
    return () => {observer.disconnect();window.removeEventListener('resize', measure);};
  }, []);

  useEffect(() => {
    if (!gesture.current) settle(expanded ? limits.full : limits.compact);
    if (!expanded) sheet.current?.querySelector('[data-options-scroll]')?.scrollTo(0, 0);
    return () => {animation.current?.stop();};
  }, [expanded, limits, reduceMotion]);

  return (
    <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} transition={{duration: 0.15}}
      className={overlayClassName} onClick={event => {if (event.target === event.currentTarget) onClose();}}>
      <motion.div ref={sheet} role="dialog" aria-modal="true" aria-labelledby="options-title" data-options-sheet data-expanded={expanded}
        initial={{y: '100%', opacity: 0}} animate={{y: 0, opacity: 1}} exit={{y: '100%', opacity: 0}}
        transition={{type: 'spring', stiffness: 380, damping: 36}} className={className} style={{height}}
        onClick={event => event.stopPropagation()}>
        <button type="button" aria-label={expanded ? 'Zwiń opcje' : 'Rozwiń opcje'} aria-expanded={expanded} aria-controls="additional-options"
          className="-mt-1 mb-1 flex h-6 w-full shrink-0 touch-none cursor-grab items-center justify-center active:cursor-grabbing"
          onPointerDown={event => {
            if (event.button !== 0) return;
            animation.current?.stop();skipClick.current = false;
            gesture.current = {id: event.pointerId, y: event.clientY, height: height.get(), moved: false};
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => {
            const start = gesture.current;
            if (!start || start.id !== event.pointerId) return;
            const dy = event.clientY - start.y;
            if (Math.abs(dy) > 5) start.moved = true;
            if (start.moved) height.set(Math.max(limits.compact, Math.min(limits.full, start.height - dy)));
          }}
          onPointerUp={event => {
            const start = gesture.current;
            if (!start || start.id !== event.pointerId) return;
            gesture.current = null;
            if (!start.moved) return;
            skipClick.current = true;
            const dy = event.clientY - start.y;
            const next = Math.abs(dy) > 24 ? dy < 0 : height.get() > (limits.compact + limits.full) / 2;
            settle(next ? limits.full : limits.compact);onExpandedChange(next);
          }}
          onPointerCancel={() => {gesture.current = null;skipClick.current = true;settle(expanded ? limits.full : limits.compact);}}
          onClick={() => {if (skipClick.current) {skipClick.current = false;return;} onExpandedChange(!expanded);}}>
          <span className="h-1 w-9 rounded-full bg-slate-400/50" />
        </button>
        {children}
      </motion.div>
    </motion.div>
  );
}
