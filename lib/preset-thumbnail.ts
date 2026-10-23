import type {InterfacePreset} from './interface-presets';

/** A self-contained image keeps preset colours outside sibling CSS gradient layers. */
export function presetThumbnailSource(preset: InterfacePreset, compact = false): string {
  const pad=compact?7:9, height=80+pad*2;
  const safe=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]!));
  const background=safe(preset.preview.background),surface=safe(preset.preview.surface),text=safe(preset.preview.text),accent=safe(preset.accent);
  const rect=(x:string|number,y:number,width:string|number,h:number,r:number,fill:string,opacity=1)=>`<rect style="x:${typeof x==='number'?x+'px':x};width:${typeof width==='number'?width+'px':width}" y="${y}" height="${h}" rx="${r}" fill="${fill}" opacity="${opacity}"/>`;
  const row=(y:number)=>rect(pad,y,`calc(100% - ${pad*2}px)`,25,6,surface)+rect(pad+6,y+6,13,13,4,accent,.85)+rect(pad+25,y+11,`calc(100% - ${pad*2+49}px)`,3,2,text,.3)+rect(`calc(100% - ${pad+18}px)`,y+10.5,12,4,2,accent);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${height}"><defs><clipPath id="bounds"><rect width="100%" height="100%" rx="10"/></clipPath><radialGradient id="glow" cx="100%" cy="0%" r="113.137%"><stop stop-color="${accent}" stop-opacity=".24"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs><g clip-path="url(#bounds)"><rect width="100%" height="100%" fill="${background}"/>${preset.glow?'<rect width="100%" height="100%" fill="url(#glow)"/>':''}${rect(pad,pad,26,6,3,accent)}<circle style="cx:calc(100% - ${pad+9}px)" cy="${pad+3}" r="2" fill="${accent}" opacity=".5"/><circle style="cx:calc(100% - ${pad+2}px)" cy="${pad+3}" r="2" fill="${accent}" opacity=".5"/>${row(pad+12)}${row(pad+43)}${rect(`calc(16.666667% + ${(pad*2-17)/3}px)`,pad+76,20,4,3,accent)}${rect('calc(50% + 3px)',pad+76,7,4,3,text,.25)}${rect(`calc(83.333333% + ${-(pad*2+4)/3}px)`,pad+76,7,4,3,text,.25)}</g></svg>`;
  return 'data:image/svg+xml,'+encodeURIComponent(svg);
}
