import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export default function ListExpansionButton({ children, onClick, className = '' }: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pks-personal-card ui-accent-focus flex w-full min-w-0 shrink-0 cursor-pointer items-center justify-center gap-3 rounded-2xl border border-white/5 bg-[#111623] px-3 py-5 text-center text-xs font-black uppercase tracking-widest shadow-inner transition-all hover:border-white/10 hover:bg-white/[0.02] active:scale-[0.98] sm:text-sm ${className}`}
    >
      <span>{children}</span>
      <ChevronDown size={18} className="shrink-0 translate-y-0.5" aria-hidden="true" />
    </button>
  );
}
