'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Bus, Check, X } from 'lucide-react';
import type { TransportProviderId } from '@/lib/pks-client';

export type TransportOption = {
  id: TransportProviderId;
  label: string;
  color: string;
  enabled: boolean;
  type: 'bus' | 'train';
  iconVariant: 'mpk_rzeszow' | 'default_bus';
};

type TransportSelectorPanelProps = {
  open: boolean;
  options: TransportOption[];
  selectedIds: TransportProviderId[];
  onClose: () => void;
  onToggle: (providerId: TransportProviderId) => void;
  onApply: () => void;
  isDark: boolean;
};

function MpkRzeszowIcon() {
  return (
    <svg viewBox="0 0 96 96" fill="none" aria-hidden="true" className="h-10 w-10 drop-shadow-[0_8px_18px_rgba(255,122,0,0.28)]">
      <path d="M12 58H4c-2.2 0-4 1.8-4 4v13c0 2.2 1.8 4 4 4h8V58Z" fill="#0F172A" />
      <path d="M84 58h8c2.2 0 4 1.8 4 4v13c0 2.2-1.8 4-4 4h-8V58Z" fill="#0F172A" />
      <rect x="10" y="6" width="76" height="84" rx="22" fill="#FF7A00" stroke="white" strokeWidth="6" />
      <rect x="22" y="39" width="52" height="19" rx="6" fill="#0B1220" />
      <circle cx="30" cy="75" r="6" fill="white" />
      <circle cx="66" cy="75" r="6" fill="white" />
    </svg>
  );
}

function BusProviderIcon({ color }: { color: string }) {
  return (
    <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/5">
      <div className="absolute inset-0 rounded-2xl opacity-20" style={{ backgroundColor: color }} />
      <Bus className="relative h-5 w-5" style={{ color }} />
    </div>
  );
}

function TransportCardIcon({ option }: { option: TransportOption }) {
  if (option.iconVariant === 'mpk_rzeszow') return <MpkRzeszowIcon />;
  return <BusProviderIcon color={option.color} />;
}

export default function TransportSelectorPanel({
  open,
  options,
  selectedIds,
  onClose,
  onToggle,
  onApply,
  isDark,
}: TransportSelectorPanelProps) {
  const selectedSet = new Set(selectedIds);
  const selectedCount = selectedIds.length;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[120] flex items-end justify-center bg-black/45 p-2 pb-[calc(76px+env(safe-area-inset-bottom))] backdrop-blur-sm md:items-center md:p-8"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 22, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            onClick={(event) => event.stopPropagation()}
            className={`max-h-[calc(100dvh-96px-env(safe-area-inset-bottom))] w-full max-w-xl overflow-hidden rounded-[28px] border shadow-[0_28px_90px_rgba(0,0,0,0.45)] md:max-h-[min(720px,calc(100dvh-64px))] ${
              isDark ? 'border-white/10 bg-[#071017]/95 text-white' : 'border-slate-200 bg-white/95 text-slate-950'
            }`}
          >
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 md:px-6">
              <h2 className="text-xl font-black tracking-tight md:text-2xl">Wybierz transport</h2>
              <button
                type="button"
                onClick={onClose}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors ${
                  isDark ? 'bg-white/8 text-slate-300 hover:bg-white/12' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                aria-label="Zamknij panel transportu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3 p-4 md:grid-cols-2 md:gap-4 md:p-6">
              {options.map((option) => {
                const isSelected = selectedSet.has(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={!option.enabled}
                    onClick={() => option.enabled && onToggle(option.id)}
                    className={`group relative flex min-h-[92px] items-center gap-4 rounded-[22px] border px-4 py-4 text-left transition-all ${
                      option.enabled
                        ? isSelected
                          ? 'border-white/10 bg-white/[0.06] shadow-[0_20px_40px_rgba(0,0,0,0.18)]'
                          : isDark
                            ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                            : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                        : isDark
                          ? 'cursor-not-allowed border-white/8 bg-white/[0.02] opacity-50'
                          : 'cursor-not-allowed border-slate-200 bg-slate-100 opacity-60'
                    }`}
                  >
                    <div className="shrink-0">
                      <TransportCardIcon option={option} />
                    </div>
                    <div className="min-w-0 flex-1 text-[15px] font-black leading-tight">{option.label}</div>
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-black transition-all ${
                        isSelected
                          ? 'border-white text-white shadow-[0_0_0_4px_rgba(255,255,255,0.08)]'
                          : isDark
                            ? 'border-white/14 text-slate-500'
                            : 'border-slate-300 text-slate-400'
                      }`}
                      style={isSelected ? { backgroundColor: option.color } : undefined}
                    >
                      {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end border-t border-white/10 px-4 py-4 md:px-6">
              <button
                type="button"
                onClick={onApply}
                className="inline-flex h-12 w-full min-w-44 items-center justify-center rounded-2xl bg-[#0fa4af] px-6 text-sm font-black text-white shadow-[0_16px_36px_rgba(15,164,175,0.35)] transition-transform hover:scale-[1.01] active:scale-[0.99] md:w-auto md:rounded-full"
              >
                Zastosuj ({selectedCount})
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
