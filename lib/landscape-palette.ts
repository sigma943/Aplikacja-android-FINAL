import {smoothstep,type AstronomyState} from './landscape-astronomy';
/** The same solar elevation drives light daytime glass, warm dusk and night.
 * Map polarity stays at readable endpoints; material colours vary continuously. */
export const isLandscapeDay=(state:AstronomyState)=>state.sun.altitude>-.035;
export function landscapePalette(state:AstronomyState){
  const altitude=state.sun.altitude*180/Math.PI;
  const stops=[
    {at:-12,surface:[9,24,40],ink:[244,248,252],muted:[207,225,237],accent:[166,226,203],field:[12,31,49]},
    {at:-6,surface:[46,40,67],ink:[246,237,255],muted:[215,205,237],accent:[210,192,248],field:[40,36,66]},
    {at:-2,surface:[167,116,115],ink:[255,239,220],muted:[242,216,201],accent:[255,212,164],field:[177,126,120]},
    {at:3,surface:[238,190,148],ink:[35,26,32],muted:[69,47,45],accent:[106,58,40],field:[248,211,174]},
    {at:12,surface:[239,249,251],ink:[20,45,57],muted:[59,83,95],accent:[15,101,91],field:[248,253,255]},
  ];
  let index=0;while(index<stops.length-2&&altitude>stops[index+1].at)index++;
  const a=stops[index],b=stops[index+1],t=smoothstep(a.at,b.at,altitude);
  const mix=(key:'surface'|'ink'|'muted'|'accent'|'field')=>a[key].map((v,i)=>Math.round(v+(b[key][i]-v)*t)).join(',');
  const rgba=(key:'surface'|'field',alpha:number)=>`rgba(${mix(key)},${alpha})`;
  const linear=(v:number)=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
  const surface=mix('surface').split(',').map(Number);
  const luminance=surface.reduce((sum,v,i)=>sum+linear(v)*[.2126,.7152,.0722][i],0);
  // Around the ink crossover, make the glass solid so moving bright clouds or
  // dark forest cannot erase contrast. Away from dusk the artwork shows through.
  const opacity=1-.22*smoothstep(.25,.5,luminance)-.22*(1-smoothstep(.06,.13,luminance));
  const lightInk=luminance<.179;
  const tint=lightInk?1-smoothstep(.04,.13,luminance):smoothstep(.25,.55,luminance);
  const tone=(night:number[],day:number[])=>{
    const base=lightInk?[255,255,255]:[0,0,0],end=lightInk?night:day;
    return base.map((v,i)=>Math.round(v+(end[i]-v)*tint)).join(',');
  };
  const coverage=Math.min(smoothstep(.06,.13,luminance),1-smoothstep(.25,.5,luminance));
  const field=mix('field').split(',').map((v,i)=>Math.round(Number(v)+(surface[i]-Number(v))*coverage)).join(',');
  const alpha=(base:number)=>Number((base+(1-base)*coverage).toFixed(3));
  const day=isLandscapeDay(state)?1:0;
  return {
    '--landscape-surface':rgba('surface',Number(opacity.toFixed(3))),
    '--landscape-ink':`rgb(${tone([244,248,252],[20,45,57])})`,
    '--landscape-muted':`rgb(${tone([207,225,237],[59,83,95])})`,
    '--landscape-accent':`rgb(${tone(mix('accent').split(',').map(Number),[15,101,91])})`,
    '--landscape-edge':`rgba(${mix('muted')},.24)`,
    '--landscape-field':`rgba(${field},${alpha(.62)})`,
    '--landscape-panel-scrim':rgba('surface',Number(Math.max(.76,opacity).toFixed(3))),
    '--landscape-panel-row':`rgba(${field},${alpha(.78)})`,
    '--landscape-nav-top':rgba('surface',Number(Math.max(.6,opacity-.12).toFixed(3))),
    '--landscape-nav-bottom':`rgba(${field},${alpha(.94)})`,
    '--landscape-chrome-light':`rgba(${mix('accent')},.30)`,
    '--landscape-map-filter':`invert(${((1-day)*100).toFixed(3)}%) hue-rotate(${((1-day)*180).toFixed(3)}deg) brightness(${(.95+day*.05).toFixed(3)}) contrast(${(.9+day*.1).toFixed(3)})`,
  };
}
