'use client';
import {softPanelBackground} from '@/lib/panel-glow';
import {BusFront,RefreshCw} from 'lucide-react';
import type {Departure} from '@/Panel/src/types';
import type {StopWidgetConfig} from '@/lib/stop-widget';
import {widgetAccentColor,widgetRgba,widgetSurfaceColors,type WidgetAppearance} from '@/lib/widget-appearance';

export default function WidgetPreview({name,departures,size,dark,glass,appearance}:{name:string;departures:Departure[];size:StopWidgetConfig['size'];dark:boolean;glass:boolean;appearance:WidgetAppearance}) {
  const accent=widgetAccentColor(appearance.accentColor,dark),[top,bottom]=widgetSurfaceColors(appearance,dark);
  const opacity=1-appearance.transparency/100,small=size==='small',compact=small||appearance.density==='compact';
  const baseBackground=glass?`linear-gradient(160deg,${widgetRgba(top,opacity)},${widgetRgba(bottom,opacity)})`:widgetRgba(bottom,opacity);
  const softBackground=appearance.softBackground&&opacity>0?softPanelBackground(appearance.accentColor,appearance.softBackgroundStrength/100*opacity,dark)+',':'';
  const requestedScale=appearance.textSize==='large'?2:appearance.textSize==='small'?-1:0;
  const scale=size==='small'?Math.min(requestedScale,0):requestedScale;
  const color=dark?'#f1f5f9':'#0f172a',muted=dark?'#94a3b8':'#64748b';
  return <div aria-label="Podgląd widżetu" className="relative overflow-hidden rounded-3xl p-4" style={{background:'radial-gradient(ellipse at 15% 10%,#459bb8 0%,transparent 60%),radial-gradient(ellipse at 90% 90%,#a991be 0%,transparent 60%),linear-gradient(145deg,#243b57,#577583)'}}>
    <p className="mb-3 text-[10px] font-semibold tracking-[.14em] uppercase text-white/80">Podgląd na ekranie głównym</p>
    <div data-widget-preview style={{background:softBackground+baseBackground,color,borderRadius:appearance.cornerRadius,maxWidth:size==='small'?250:undefined,border:appearance.transparency===100?'1px solid transparent':`1px solid ${widgetRgba(accent,.22)}`}} className="mx-auto p-3 shadow-xl">
      <div className="flex items-center gap-2 mb-2">
        <span style={{color:accent,background:widgetRgba(accent,.12)}} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"><BusFront size={16}/></span>
        <span className="min-w-0 flex-1 truncate font-bold" style={{fontSize:12+scale}}>{name.replace(/^Rzeszów[, ]+/i,'')}</span>
        <span style={{color:accent,background:widgetRgba(accent,.1)}} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"><RefreshCw size={15}/></span>
      </div>
      {departures.length?departures.map((departure,index)=>{
        const lineColor=appearance.lineColors==='accent'?accent:widgetAccentColor(departure.carrier?.id==='mpk'?'#f97316':departure.carrier?.id==='marcel'?'#84cc16':'#14b8a6',dark);
        const delay=departure.delayMins??0,highlight=appearance.highlightNext&&index===0;
        return <div key={departure.id} data-widget-departure className="flex items-center gap-2 px-1" style={{paddingTop:small?0:2,paddingBottom:small?2:4,minHeight:(small?(appearance.showDelay?34:26):compact?(appearance.showDelay?40:28):(appearance.showDelay?44:32))+(scale===2?6:scale===-1?-1:0),borderRadius:highlight?10:0,background:highlight?widgetRgba(accent,.08):undefined,borderBottom:appearance.showSeparators&&index<departures.length-1?`1px solid ${widgetRgba(color,.08)}`:undefined}}>
          <span style={{color:lineColor,background:widgetRgba(lineColor,.14),fontSize:(compact?11:12)+scale}} className="min-w-10 rounded-lg px-2 py-1 text-center font-bold">{departure.line}</span>
          {appearance.showDirections&&<span className="min-w-0 flex-1 truncate" style={{fontSize:(compact?11:12)+scale}}>{departure.direction}</span>}
          <span className="ml-auto flex shrink-0 flex-col items-end" style={{gap:small?2:3}}>
            <span className="font-bold tabular-nums tracking-tight" style={{color:highlight?accent:color,fontSize:(compact?14:16)+scale,lineHeight:1.15}}>{departure.time}</span>
            {appearance.showDelay&&delay!==0&&<span data-widget-delay style={{color:delay>0?(dark?'#fecdd3':'#9f1239'):(dark?'#a7f3d0':'#065f46'),background:delay>0?(dark?'#3b2832':'#fff1f2'):(dark?'#16382f':'#ecfdf5'),border:`1px solid ${delay>0?(dark?'#70434f':'#fecdd3'):(dark?'#27634d':'#bbf7d0')}`,fontSize:(small?8:9)+Math.max(scale,0),lineHeight:1.2,padding:'1px 6px',borderRadius:6}} className="font-semibold tabular-nums">{departure.delayEstimated?'szac. ':''}{delay>0?'+':''}{delay} min</span>}
          </span>
        </div>;
      }):<p className="py-3 text-xs" style={{color:muted}}>Brak najbliższych odjazdów</p>}
      {appearance.showStatus&&size!=='small'&&<p className="mt-2 text-[9px]" style={{color:muted}}>Aktualizacja {new Date().toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Warsaw'})}</p>}
    </div>
  </div>;
}
