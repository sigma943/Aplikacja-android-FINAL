import {solarMilkMaterial} from './solar-milk';
import {DEFAULT_INTERFACE_APPEARANCE,type InterfaceAppearance} from './interface-appearance';
import {normalizeUiAccent,uiAccentVariables} from './ui-accent';
import {type AstronomyState} from './landscape-astronomy';
/** Switch foreground, surface and map polarity together. A one-degree dead band
 * avoids flicker after tiny astronomy/location corrections near the horizon. */
export function isLandscapeDay(state:AstronomyState,previous?:boolean){
  const degrees=state.sun.altitude*180/Math.PI;
  return degrees>(previous===undefined?-2:previous?-2.5:-1.5);
}
/** Interpolate temperature within a readable material family, never between
 * white and black. Otherwise twilight produces grey glass with unrelated ink. */
export function landscapePalette(state:AstronomyState,glassOpacity=64,day=isLandscapeDay(state),appearance:InterfaceAppearance=DEFAULT_INTERFACE_APPEARANCE,accent='#00a3a2'){
  let surface=solarMilkMaterial(state.sun.altitude*180/Math.PI,day).surface;
  if(appearance.surfaceTint!=='original'){
    const hex=normalizeUiAccent(appearance.surfaceTint==='custom'?appearance.panelColor:appearance.surfaceTint==='accent'?accent:'#d2c2a4');
    const target=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)),amount=appearance.panelTintStrength/100;
    surface=surface.split(',').map((v,i)=>Math.round(Number(v)*(1-amount)+target[i]*amount)).join(',');
  }
  const field=day?'255,253,248':'29,44,62';
  const opacity=Math.max(0,Math.min(100,glassOpacity))/100;
  // One fill per panel. The opacity control must not be defeated by a second
  // scrim or a full-screen veil. Scenery outside panels remains unmodified.
  const protective=opacity;
  return {
    '--landscape-surface':`rgba(${surface},${opacity})`,
    '--landscape-material-opacity':String(opacity),
    '--landscape-ink':day?'rgb(11,27,38)':'rgb(244,248,252)',
    '--landscape-muted':day?'rgb(27,46,60)':'rgb(212,229,240)',
    '--landscape-accent':uiAccentVariables(accent,!day)['--pks-accent-text'],
    '--landscape-edge':`rgba(${day?'43,79,99':'208,233,237'},${appearance.borderStrength/100})`,
    '--landscape-field':`rgba(${field},.24)`,
    '--landscape-panel-scrim':`rgba(${surface},${protective})`,
    '--landscape-panel-row':`rgba(${field},${opacity*.32})`,
    '--landscape-nav-top':`rgba(${surface},${opacity})`,
    '--landscape-nav-bottom':`rgba(${surface},${opacity})`,
    '--landscape-nav-glass':`rgba(12,24,31,${opacity})`,
    '--landscape-solid':`rgb(${surface})`,
    '--landscape-color-scheme':day?'light':'dark',
    '--landscape-chrome-light':day?'rgba(255,248,224,.24)':'rgba(174,220,234,.24)',
    '--landscape-text-shadow':'none',
    '--landscape-map-filter':day?'invert(0.000%) hue-rotate(0.000deg) brightness(1.000) contrast(1.000)':'invert(100.000%) hue-rotate(180.000deg) brightness(0.950) contrast(0.900)',
  };
}
