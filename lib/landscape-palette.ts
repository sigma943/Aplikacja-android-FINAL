import {smoothstep,type AstronomyState} from './landscape-astronomy';
/** Glass remains translucent throughout the solar cycle. Low saturation keeps
 * dawn/dusk light in the artwork instead of painting a solid coloured panel. */
export const isLandscapeDay=(state:AstronomyState)=>state.sun.altitude>-.035;
export function landscapePalette(state:AstronomyState,glassOpacity=64){
  const altitude=state.sun.altitude*180/Math.PI;
  const stops=[
    {at:-12,surface:[9,24,40],field:[15,32,48]},
    {at:-6,surface:[33,44,65],field:[39,50,70]},
    {at:-2,surface:[128,132,140],field:[142,147,155]},
    {at:3,surface:[230,224,214],field:[242,236,226]},
    {at:12,surface:[235,245,250],field:[248,253,255]},
  ];
  let index=0;while(index<stops.length-2&&altitude>stops[index+1].at)index++;
  const a=stops[index],b=stops[index+1],t=smoothstep(a.at,b.at,altitude);
  const mix=(key:'surface'|'field')=>a[key].map((v,i)=>Math.round(v+(b[key][i]-v)*t)).join(',');
  const rgba=(key:'surface'|'field',alpha:number)=>`rgba(${mix(key)},${alpha})`;
  const day=isLandscapeDay(state)?1:0;
  const opacity=Math.max(0,Math.min(100,glassOpacity))/100;
  return {
    '--landscape-surface':rgba('surface',opacity),
    '--landscape-ink':day?'rgb(11,27,38)':'rgb(244,248,252)',
    '--landscape-muted':day?'rgb(27,46,60)':'rgb(212,229,240)',
    '--landscape-accent':day?'rgb(7,75,66)':'rgb(166,226,203)',
    '--landscape-edge':day?'rgba(43,79,99,.22)':'rgba(208,233,237,.24)',
    '--landscape-field':rgba('field',.24),
    '--landscape-panel-scrim':rgba('surface',opacity),
    '--landscape-panel-row':rgba('field',opacity*.32),
    '--landscape-nav-top':rgba('surface',opacity),
    '--landscape-nav-bottom':rgba('field',opacity),
    '--landscape-chrome-light':day?'rgba(255,248,224,.24)':'rgba(174,220,234,.24)',
    '--landscape-text-shadow':'none',
    '--landscape-label-bg':day?'#f3f9fc':'#102333',
    '--landscape-map-filter':`invert(${((1-day)*100).toFixed(3)}%) hue-rotate(${((1-day)*180).toFixed(3)}deg) brightness(${(.95+day*.05).toFixed(3)}) contrast(${(.9+day*.1).toFixed(3)})`,
  };
}
