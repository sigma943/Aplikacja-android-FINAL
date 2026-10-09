import {normalizeUiAccent} from './ui-accent';

export function panelGlowStrength(value: unknown): number {
  if (value === null || value === undefined || value === '') return 40;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 40;
}

export function panelGlowVariables(accent: string, strength: number, dark: boolean, lightEffects: boolean) {
  const color = normalizeUiAccent(accent);
  const amount = Math.min(panelGlowStrength(strength), lightEffects ? 25 : 100) / 100;
  const tint = (opacity: number) => color + Math.round(opacity * 255).toString(16).padStart(2, '0');
  return {
    '--panel-glow-edge': tint(amount * (dark ? .5 : .3)),
    '--panel-glow-inner': tint(amount * (dark ? .16 : .09)),
    '--panel-glow-outer': tint(amount * (dark ? .2 : .12)),
    '--panel-glow-radius': `${8 + amount * 16}px`,
  };
}
