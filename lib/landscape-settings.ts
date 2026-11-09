export const LANDSCAPE_SETTINGS_KEY='pks_horyzont_settings_v1';
export const LANDSCAPE_SETTINGS_EVENT='pks-horyzont-settings';
export type GlassQuality='eco'|'balanced'|'ultra';
export type LandscapeSettings={quality:'high'|'medium'|'low';glassQuality:GlassQuality;filterBackground:'sky'|'solid';bloom:number;reflections:number;rays:number;waveSpeed:number;exposure:number;godRays:boolean};
export const DEFAULT_LANDSCAPE_SETTINGS:LandscapeSettings={quality:'high',glassQuality:'balanced',filterBackground:'sky',bloom:100,reflections:100,rays:100,waveSpeed:100,exposure:100,godRays:true};
export function normalizeLandscapeSettings(value:unknown):LandscapeSettings{
 const v=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const number=(key:keyof LandscapeSettings,min:number,max:number)=>typeof v[key]==='number'&&Number.isFinite(v[key])?Math.max(min,Math.min(max,v[key] as number)):DEFAULT_LANDSCAPE_SETTINGS[key] as number;
 return {quality:v.quality==='medium'||v.quality==='low'?v.quality:'high',glassQuality:v.glassQuality==='eco'||v.glassQuality==='ultra'?v.glassQuality:DEFAULT_LANDSCAPE_SETTINGS.glassQuality,filterBackground:v.filterBackground==='solid'?'solid':'sky',bloom:number('bloom',0,200),reflections:number('reflections',0,200),rays:number('rays',0,200),waveSpeed:number('waveSpeed',0,200),exposure:number('exposure',50,150),godRays:typeof v.godRays==='boolean'?v.godRays:DEFAULT_LANDSCAPE_SETTINGS.godRays};
}
export function readLandscapeSettings():LandscapeSettings{
 try{return normalizeLandscapeSettings(JSON.parse(localStorage.getItem(LANDSCAPE_SETTINGS_KEY)||'null'));}catch{return {...DEFAULT_LANDSCAPE_SETTINGS};}
}
export function saveLandscapeSettings(settings:LandscapeSettings){
 const value=normalizeLandscapeSettings(settings);localStorage.setItem(LANDSCAPE_SETTINGS_KEY,JSON.stringify(value));window.dispatchEvent(new Event(LANDSCAPE_SETTINGS_EVENT));return value;
}
