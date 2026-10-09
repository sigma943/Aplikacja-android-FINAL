import {normalizeUiAccent} from './ui-accent';

export function panelGlowStrength(value: unknown): number {
  if (value === null || value === undefined || value === '') return 40;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 40;
}

export type SoftBackgroundOptions={style:'graphite'|'accent'|'mixed';spread:number;placement:'corners'|'center'|'diagonal'};
export function panelGlowVariables(accent: string, strength: number, dark: boolean, lightEffects: boolean,options?:SoftBackgroundOptions) {
  const color = normalizeUiAccent(accent);
  const amount = Math.min(panelGlowStrength(strength), lightEffects ? 25 : 100) / 100;
  return {'--panel-glow-image': softPanelBackground(color,amount,dark,options)};
}

export function softPanelBackground(accent: string, amount: number, dark: boolean,options?:SoftBackgroundOptions) {
  const color=normalizeUiAccent(accent);
  const tint=(opacity:number)=>color+Math.round(opacity*255).toString(16).padStart(2,'0');
  if(options){
    const spread=Math.max(40,Math.min(100,options.spread));
    const a=options.placement==='center'?'45% 35%':options.placement==='diagonal'?'15% 85%':'16% 8%';
    const b=options.placement==='center'?'70% 80%':options.placement==='diagonal'?'85% 10%':'92% 95%';
    const neutral=(alpha:number)=>`rgba(5,12,20,${alpha})`;
    const first=options.style==='accent'?tint(amount*(dark?.3:.14)):neutral(amount*(dark?.4:.18));
    const second=options.style==='graphite'?neutral(amount*(dark?.32:.14)):tint(amount*(dark?.2:.1));
    return `radial-gradient(ellipse ${spread}% ${spread+15}% at ${a},${first} 0%,transparent 88%),radial-gradient(ellipse ${spread+15}% ${spread}% at ${b},${second} 0%,transparent 90%)`;
  }

  return `radial-gradient(ellipse 95% 65% at -8% 6%,rgba(10,15,20,${amount*(dark?.22:.28)}),transparent 75%),radial-gradient(ellipse 90% 85% at 108% 100%,rgba(2,6,12,${amount*(dark?.38:.18)}),transparent 80%),radial-gradient(ellipse 65% 55% at 92% 2%,${tint(amount*(dark?.1:.07))},transparent 80%)`;
}
