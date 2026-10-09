import {normalizeUiAccent} from './ui-accent';

export function panelGlowStrength(value: unknown): number {
  if (value === null || value === undefined || value === '') return 40;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 40;
}

export function panelGlowVariables(accent: string, strength: number, dark: boolean, lightEffects: boolean) {
  const color = normalizeUiAccent(accent);
  const amount = Math.min(panelGlowStrength(strength), lightEffects ? 25 : 100) / 100;
  return {'--panel-glow-image': softPanelBackground(color,amount,dark)};
}

export function softPanelBackground(accent: string, amount: number, dark: boolean) {
  const color=normalizeUiAccent(accent);
  const tint=(opacity:number)=>color+Math.round(opacity*255).toString(16).padStart(2,'0');
  return `radial-gradient(ellipse 95% 65% at -8% 6%,rgba(10,15,20,${amount*(dark?.22:.28)}),transparent 75%),radial-gradient(ellipse 90% 85% at 108% 100%,rgba(2,6,12,${amount*(dark?.38:.18)}),transparent 80%),radial-gradient(ellipse 65% 55% at 92% 2%,${tint(amount*(dark?.1:.07))},transparent 80%)`;
}
