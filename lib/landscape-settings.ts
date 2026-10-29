export const LANDSCAPE_SETTINGS_KEY='pks_horyzont_settings_v1';
export const LANDSCAPE_SETTINGS_EVENT='pks-horyzont-settings';
export type LandscapeSettings={quality:'high'|'medium'|'low';bloom:number;reflections:number;rays:number;waveSpeed:number;exposure:number};
export const DEFAULT_LANDSCAPE_SETTINGS:LandscapeSettings={quality:'high',bloom:100,reflections:100,rays:100,waveSpeed:100,exposure:100};
export function normalizeLandscapeSettings(value:unknown):LandscapeSettings{
 const v=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const number=(key:keyof LandscapeSettings,min:number,max:number)=>typeof v[key]==='number'&&Number.isFinite(v[key])?Math.max(min,Math.min(max,v[key] as number)):DEFAULT_LANDSCAPE_SETTINGS[key] as number;
 return {quality:v.quality==='medium'||v.quality==='low'?v.quality:'high',bloom:number('bloom',0,200),reflections:number('reflections',0,200),rays:number('rays',0,200),waveSpeed:number('waveSpeed',0,200),exposure:number('exposure',50,150)};
}
export function readLandscapeSettings():LandscapeSettings{
 try{return normalizeLandscapeSettings(JSON.parse(localStorage.getItem(LANDSCAPE_SETTINGS_KEY)||'null'));}catch{return {...DEFAULT_LANDSCAPE_SETTINGS};}
}
export function saveLandscapeSettings(settings:LandscapeSettings){
 const value=normalizeLandscapeSettings(settings);localStorage.setItem(LANDSCAPE_SETTINGS_KEY,JSON.stringify(value));window.dispatchEvent(new Event(LANDSCAPE_SETTINGS_EVENT));return value;
}
