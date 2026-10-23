import {smoothstep,type AstronomyState} from './landscape-astronomy';
/** Map polarity stays at readable endpoints. Glass follows solar elevation
 * continuously; a light ink family avoids a dark/light text flip at sunset. */
export const isLandscapeDay=(state:AstronomyState)=>state.sun.altitude>-.035;
export function landscapePalette(state:AstronomyState){
  const altitude=state.sun.altitude*180/Math.PI;
  const stops=[
    {at:-12,surface:[9,24,40],ink:[244,248,252],muted:[207,225,237],accent:[166,226,203],field:[12,31,49]},
    {at:-5,surface:[35,35,65],ink:[246,237,255],muted:[215,205,237],accent:[210,192,248],field:[40,36,66]},
    {at:1,surface:[79,45,58],ink:[255,239,220],muted:[242,216,201],accent:[255,212,164],field:[84,49,62]},
    {at:9,surface:[33,65,84],ink:[239,247,252],muted:[204,226,236],accent:[177,230,221],field:[28,60,79]},
    {at:20,surface:[20,61,86],ink:[236,247,252],muted:[202,226,239],accent:[164,232,216],field:[21,54,76]},
  ];
  let index=0;while(index<stops.length-2&&altitude>stops[index+1].at)index++;
  const a=stops[index],b=stops[index+1],t=smoothstep(a.at,b.at,altitude);
  const mix=(key:'surface'|'ink'|'muted'|'accent'|'field')=>a[key].map((v,i)=>Math.round(v+(b[key][i]-v)*t)).join(',');
  const rgba=(key:'surface'|'field',alpha:number)=>`rgba(${mix(key)},${alpha})`;
  const day=isLandscapeDay(state)?1:0;
  return {
    '--landscape-surface':rgba('surface',.74),
    '--landscape-ink':`rgb(${mix('ink')})`,
    '--landscape-muted':`rgb(${mix('muted')})`,
    '--landscape-accent':`rgb(${mix('accent')})`,
    '--landscape-edge':`rgba(${mix('muted')},.24)`,
    '--landscape-field':rgba('field',.62),
    '--landscape-panel-scrim':rgba('surface',.76),
    '--landscape-panel-row':rgba('field',.78),
    '--landscape-nav-top':rgba('surface',.52),
    '--landscape-nav-bottom':rgba('field',.94),
    '--landscape-chrome-light':`rgba(${mix('accent')},.30)`,
    '--landscape-map-filter':`invert(${((1-day)*100).toFixed(3)}%) hue-rotate(${((1-day)*180).toFixed(3)}deg) brightness(${(.95+day*.05).toFixed(3)}) contrast(${(.9+day*.1).toFixed(3)})`,
  };
}
