import {smoothstep,type AstronomyState} from './landscape-astronomy';
/** Switch foreground, surface and map polarity together. A one-degree dead band
 * avoids flicker after tiny astronomy/location corrections near the horizon. */
export function isLandscapeDay(state:AstronomyState,previous?:boolean){
  const degrees=state.sun.altitude*180/Math.PI;
  return degrees>(previous===undefined?-2:previous?-2.5:-1.5);
}
/** Interpolate temperature within a readable material family, never between
 * white and black. Otherwise twilight produces grey glass with unrelated ink. */
export function landscapePalette(state:AstronomyState,glassOpacity=64,day=isLandscapeDay(state)){
  const warmth=1-smoothstep(-6,12,state.sun.altitude*180/Math.PI);
  const blend=(cool:number[],warm:number[])=>cool.map((v,i)=>Math.round(v+(warm[i]-v)*warmth)).join(',');
  const surface=day?blend([242,248,252],[250,239,224]):blend([9,24,40],[24,27,43]);
  const field=day?'255,253,248':'29,44,62';
  const opacity=Math.max(0,Math.min(100,glassOpacity))/100;
  // Readability layers are independent of decorative glass opacity. This keeps
  // controls safe even at 20% glass over black terrain or a white map tile.
  const protective=Math.max(.88,opacity);
  return {
    '--landscape-surface':`rgba(${surface},${opacity})`,
    '--landscape-ink':day?'rgb(11,27,38)':'rgb(244,248,252)',
    '--landscape-muted':day?'rgb(27,46,60)':'rgb(212,229,240)',
    '--landscape-accent':day?'rgb(7,75,66)':'rgb(166,226,203)',
    '--landscape-edge':day?'rgba(43,79,99,.18)':'rgba(208,233,237,.18)',
    '--landscape-field':`rgba(${field},.24)`,
    '--landscape-panel-scrim':`rgba(${surface},${protective})`,
    '--landscape-panel-row':`rgba(${field},${opacity*.32})`,
    '--landscape-nav-top':`rgba(${surface},${Math.max(.94,opacity)})`,
    '--landscape-nav-bottom':`rgba(${surface},${Math.max(.96,opacity)})`,
    '--landscape-view-veil':`rgba(${surface},.88)`,
    '--landscape-chrome-light':day?'rgba(255,248,224,.24)':'rgba(174,220,234,.24)',
    '--landscape-text-shadow':'none',
    '--landscape-map-filter':day?'invert(0.000%) hue-rotate(0.000deg) brightness(1.000) contrast(1.000)':'invert(100.000%) hue-rotate(180.000deg) brightness(0.950) contrast(0.900)',
  };
}
