import {COSMIC_SKY} from './cosmic-scene';
export const THEME_MODES=['system','light','light-warm','light-pink','light-sky','dark','dark-pink','dark-oled','dark-forest','dark-cosmos'] as const;
export type AppTheme=typeof THEME_MODES[number];
export function normalizeAppTheme(value:unknown):AppTheme{
  if(value==null)return 'dark-oled';
  const key=typeof value==='string'?value.trim().toLowerCase():'';
  if(['amoled','oled','dark_oled','darkoled'].includes(key))return 'dark-oled';
  if(key==='dark-pink')return 'light-pink';
  if(key==='dark-aurora')return 'dark-cosmos';
  return THEME_MODES.includes(key as AppTheme)?key as AppTheme:'system';
}
export function systemPrefersDark(){try{return typeof window!=='undefined'&&Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);}catch{return false;}}
export function resolveAppTheme(value:unknown,dark=systemPrefersDark()){
  const mode=normalizeAppTheme(value);return mode==='system'?(dark?'dark':'light'):mode;
}
export function readAppTheme():AppTheme{
  if(typeof window==='undefined')return 'dark-oled';
  try{return normalizeAppTheme(window.localStorage.getItem('mks_app_theme'));}catch{return 'system';}
}
export const THEME_SCREEN_COLORS:Record<Exclude<AppTheme,'system'>,{background:string;text:string}>={
  light:{background:'#f8fafc',text:'#020617'},'light-warm':{background:'#f2ede1',text:'#272116'},'light-pink':{background:'#ffd1e8',text:'#57153c'},
  'light-sky':{background:'#d5efff',text:'#103750'},dark:{background:'#111027',text:'#ffffff'},'dark-pink':{background:'#21121b',text:'#ffffff'},'dark-oled':{background:'#000000',text:'#ffffff'},
  'dark-cosmos':{background:'#000000',text:'#f3f1ff'},'dark-forest':{background:'#061a13',text:'#edf9f0'},
};
const svg=(body:string)=>`url("data:image/svg+xml,${encodeURIComponent(body)}")`;
export const THEME_DECORATIONS={
  'dark-cosmos':COSMIC_SKY,
  'light-pink':svg(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><defs><path id="heart" d="M0 7C-3 4-10-1-10-7C-10-14-2-17 0-10C2-17 10-14 10-7C10-1 3 4 0 7Z"/></defs><g fill="#9d2863" fill-opacity=".14" stroke="#b83e7d" stroke-opacity=".12" stroke-width="1"><use href="#heart" transform="translate(228 32) rotate(12) scale(1.35)"/><use href="#heart" transform="translate(52 139) rotate(-16)"/><use href="#heart" transform="translate(170 162) rotate(8) scale(.65)"/></g></svg>`),
  'dark-forest':svg(`<svg xmlns="http://www.w3.org/2000/svg" width="280" height="180" viewBox="0 0 280 180"><g fill="#8bdfa5" fill-opacity=".10"><path d="M230 9c-24 0-40 14-40 36 23 0 40-13 40-36Z"/><path d="M246 27c0 22 14 36 33 36 0-21-13-36-33-36Z"/><path d="M35 130c-20 0-33 12-33 30 19 0 33-11 33-30Z"/></g><g fill="none" stroke="#b1ecc1" stroke-opacity=".10" stroke-width="1.2"><path d="m190 48 40-39m16 18 33 36M2 162l33-32"/></g></svg>`),
  'light-sky':svg(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><g fill="#ffffff" fill-opacity=".55"><path d="M213 38c-8 0-14-5-14-12 0-7 6-12 13-12 3-9 11-13 20-10 7 2 11 7 12 13 10-3 19 4 19 12 0 5-5 9-11 9Z"/><path d="M38 151c-7 0-12-4-12-10s5-10 11-10c3-7 10-11 18-8 6 2 9 6 10 12 8-3 16 3 16 10 0 4-4 6-9 6Z"/></g></svg>`),
};
export function themeDecoration(mode:string){return THEME_DECORATIONS[mode as keyof typeof THEME_DECORATIONS]||'none';}
// Runs before React to avoid an incorrect flash, including blocked storage.
export const INITIAL_THEME_SCRIPT=`!function(){var t='dark-oled',d=false;try{var saved=localStorage.getItem('mks_app_theme');t=saved==null?'dark-oled':saved}catch(e){t='system'}try{d=matchMedia('(prefers-color-scheme: dark)').matches}catch(e){}t=String(t).trim().toLowerCase();if(['amoled','oled','dark_oled','darkoled'].includes(t))t='dark-oled';if(t==='dark-pink')t='light-pink';if(t==='dark-aurora')t='dark-cosmos';var colors=${JSON.stringify(THEME_SCREEN_COLORS)};if(t==='system'||!Object.prototype.hasOwnProperty.call(colors,t))t=d?'dark':'light';var c=colors[t],r=document.documentElement;r.style.setProperty('--pks-initial-bg',c.background);r.style.setProperty('--pks-loading-text',c.text);r.style.backgroundColor=c.background;r.style.color=c.text;r.dataset.pksTheme=t}();`;
