import {skyState,smoothstep,type AstronomyState} from './landscape-astronomy';
/** One continuous solar palette shared by the map, glass and neutral typography. */
export function landscapePalette(state:AstronomyState){
  const day=smoothstep(.08,.94,skyState(state).day);
  const rgb=(night:number[],light:number[])=>night.map((v,i)=>Math.round(v+(light[i]-v)*day)).join(',');
  return {
    '--landscape-surface':`rgba(${rgb([9,24,40],[239,249,251])},${(.62+day*.04).toFixed(3)})`,
    '--landscape-ink':`rgb(${rgb([244,248,252],[20,45,57])})`,
    '--landscape-muted':`rgb(${rgb([207,225,237],[59,83,95])})`,
    '--landscape-accent':`rgb(${rgb([166,226,203],[15,101,91])})`,
    '--landscape-edge':`rgba(${rgb([208,233,237],[53,99,111])},.24)`,
    '--landscape-field':`rgba(${rgb([7,23,40],[248,253,255])},.36)`,
    '--landscape-chrome-light':`rgba(${rgb([174,220,234],[255,246,213])},.30)`,
    '--landscape-map-filter':`invert(${((1-day)*100).toFixed(3)}%) hue-rotate(${((1-day)*180).toFixed(3)}deg) brightness(${(.95+day*.05).toFixed(3)}) contrast(${(.9+day*.1).toFixed(3)})`,
  };
}
