import {skyState,type AstronomyState} from './landscape-astronomy';
/** Solar materials share a polarity switch, eased by CSS. Keeping inverse maps
 * near 50% for an entire twilight would erase roads and label contrast. */
export const isLandscapeDay=(state:AstronomyState)=>state.sun.altitude>-.035;
export function landscapePalette(state:AstronomyState){
  const day=isLandscapeDay(state)?1:0,twilight=skyState(state).twilight;
  const rgb=(night:number[],light:number[])=>night.map((v,i)=>Math.round(v+(light[i]-v)*day)).join(',');
  const surface=(day?[239+12*twilight,249-9*twilight,251-27*twilight]:[9+6*twilight,24,40-4*twilight]).map(Math.round).join(',');
  return {
    '--landscape-surface':`rgba(${surface},${(.62+day*.04).toFixed(3)})`,
    '--landscape-ink':`rgb(${rgb([244,248,252],[20,45,57])})`,
    '--landscape-muted':`rgb(${rgb([207,225,237],[59,83,95])})`,
    '--landscape-accent':`rgb(${rgb([166,226,203],[15,101,91])})`,
    '--landscape-edge':`rgba(${rgb([208,233,237],[53,99,111])},.24)`,
    '--landscape-field':`rgba(${rgb([7,23,40],[248,253,255])},.36)`,
    '--landscape-chrome-light':`rgba(${rgb([174,220,234],[255,246,213])},.30)`,
    '--landscape-map-filter':`invert(${((1-day)*100).toFixed(3)}%) hue-rotate(${((1-day)*180).toFixed(3)}deg) brightness(${(.95+day*.05).toFixed(3)}) contrast(${(.9+day*.1).toFixed(3)})`,
  };
}
